/**
 * "Comprobar enlaces": before a notice goes out, do its links open? A button that leads nowhere (an expired Discord invite, a page that was
 * moved) is the kind of mistake nobody sees until players complain.
 *
 * ok: true   it opens
 * ok: false  it certainly does not (the page is gone, the site does not exist, the invitation expired, the address is not https)
 * ok: null   it could not be told (the site refuses automatic visits, or took too long): the link may be fine
 */
const CHECKER = 'Mozilla/5.0 (compatible; EmpiPublisher link check)'
const DISCORD_INVITE = /^(?:discord\.gg|(?:www\.)?discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})(?:[/?#].*)?$/i

function classify(status) {
    if ((status >= 200 && status < 400) || status === 416) return { ok: true }
    if (status === 404 || status === 410) return { ok: false, note: `la página no existe (${status})` }
    if (status === 401 || status === 403 || status === 429 || status === 999) return { ok: null, note: `la web no deja comprobarlo desde aquí (${status}); el enlace puede estar bien` }
    if (status >= 500) return { ok: false, note: `la web da un error (${status})` }
    return { ok: false, note: `responde ${status}` }
}

async function checkLink(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    let parsed
    try { parsed = new URL(String(url).trim()) } catch { return { url, ok: false, note: 'no es un enlace válido' } }
    if (parsed.protocol !== 'https:') return { url, ok: false, note: 'no empieza por https://' }

    // an invitation page answers "200" even when the invitation is dead: ask Discord's own API about the code
    const invite = DISCORD_INVITE.exec(`${parsed.host}${parsed.pathname}`)
    const target = invite ? `https://discord.com/api/v10/invites/${invite[1]}` : parsed.toString()
    try {
        const response = await fetchImpl(target, { redirect: 'follow', headers: { 'User-Agent': CHECKER, Range: 'bytes=0-0' }, signal: AbortSignal.timeout(timeoutMs) })
        try { await response.body?.cancel() } catch { /* nothing to read */ }
        if (invite && response.status === 404) return { url, ok: false, note: 'la invitación de Discord ya no existe o caducó' }
        return { url, ...classify(response.status) }
    } catch (err) {
        if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) return { url, ok: null, note: 'tardó demasiado en responder' }
        const code = err && err.cause && err.cause.code
        return { url, ok: false, note: code === 'ENOTFOUND' ? 'esa dirección no existe' : 'no se pudo conectar con esa web' }
    }
}

/** Every link in `items` ([{ where, url }]), a few at a time. Returns the same items with `ok` and `note`. */
async function checkLinks(items, options = {}) {
    const out = new Array(items.length)
    let next = 0
    const worker = async () => {
        while (next < items.length) {
            const at = next++
            out[at] = { where: items[at].where, ...(await checkLink(items[at].url, options)) }
        }
    }
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker))
    return out
}

module.exports = { checkLink, checkLinks, classify }
