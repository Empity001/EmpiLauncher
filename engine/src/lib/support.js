/**
 * "Enviar a soporte para revisión": the player presses a button, sees exactly what will go, and it reaches the author's e-mail.
 *
 * There is no server of ours in between: the report goes to one of two places the author chooses and keys in avisos.json (launcher.support).
 * Only these two are ever spoken to (the address is built here from the key: avisos.json cannot make the launcher send a report anywhere
 * else), and only when the player presses the button.
 *
 *   appsscript  https://script.google.com/macros/s/<deployment id>/exec   { subject, name, message }
 *               a ten-line Google Apps Script of the author's own that mails the report to their Gmail: free, the address stays inside the script
 *               (nobody sees it), and it accepts calls from a program (Web3Forms, for one, only allows that on its paid plan).
 *   formspree   https://formspree.io/f/<form id>                           { name, message, _subject }
 */
const MAX_BYTES = 60 * 1024

/** Long reports keep their beginning (who, what) and their end (the last lines of the log); the middle is what goes. */
function fit(text, max = MAX_BYTES) {
    if (Buffer.byteLength(text, 'utf8') <= max) return text
    const head = text.slice(0, Math.floor(max * 0.35))
    const tail = text.slice(-Math.floor(max * 0.6))
    return `${head}\n\n... (el informe era más largo; se recortó el centro para poder enviarlo) ...\n\n${tail}`
}

function request(support, { subject, name, text }) {
    const message = fit(String(text ?? ''))
    if (support.service === 'appsscript') {
        return { url: `https://script.google.com/macros/s/${support.key}/exec`, body: { subject, name, message } }
    }
    if (support.service === 'formspree') {
        return { url: `https://formspree.io/f/${support.key}`, body: { name, message, _subject: subject } }
    }
    return null
}

/**
 * @param {{service: string, key: string}} support  as sanitized by lib/notices.js
 * @param {{subject: string, name: string, text: string}} report
 * @param {{fetchImpl?: Function, timeoutMs?: number, urlOverride?: string}} [options]
 * @returns {Promise<{ok: true} | {ok: false, reason: 'no_support'|'rejected'|'offline', message: string}>}
 */
async function send(support, report, { fetchImpl = fetch, timeoutMs = 20000, urlOverride } = {}) {
    const built = support && support.service && support.key ? request(support, report) : null
    if (!built) return { ok: false, reason: 'no_support', message: 'El soporte todavía no está configurado en este launcher.' }
    try {
        const response = await fetchImpl(urlOverride || built.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'EmpiLauncher' },
            body: JSON.stringify(built.body),
            signal: AbortSignal.timeout(timeoutMs)
        })
        let answer = null
        try { answer = await response.json() } catch { /* an answer that is not JSON is judged by its status */ }
        const accepted = response.ok && (answer == null || answer.success !== false) && !(answer && Array.isArray(answer.errors) && answer.errors.length)
        if (accepted) return { ok: true }
        const why = answer && (answer.message || (Array.isArray(answer.errors) && answer.errors[0] && answer.errors[0].message)) || `HTTP ${response.status}`
        return { ok: false, reason: 'rejected', message: `El servicio de soporte no aceptó el informe (${why}). Guárdalo como archivo y mándalo por otro medio.` }
    } catch (err) {
        return { ok: false, reason: 'offline', message: 'No se pudo conectar para enviarlo. Revisa tu internet, o guárdalo como archivo y mándalo por otro medio.' }
    }
}

/** A short code the player can quote ("mi informe es EMPI-7K3Q2X") so the author finds it among the mails. */
function newCode() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'   // no 0/O, 1/I/L: it gets read aloud and retyped
    let out = ''
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
    return `EMPI-${out}`
}

module.exports = { send, request, fit, newCode, MAX_BYTES }
