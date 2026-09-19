/**
 * A skin server that lives only while the game runs, on this PC only (127.0.0.1, a free port).
 *
 * Minecraft looks skins up by UUID at Mojang's session server. authlib-injector (a Java agent, see lib/skin.js) points that lookup at
 * any server that speaks the Yggdrasil protocol, and this is the smallest one that does what an offline player needs: answer "what is
 * this profile's skin" with the picture the player chose. It follows the authlib-injector server specification
 * (https://yushijinhun.github.io/authlib-injector/en/yggdrasil-server-technical-specification.html):
 *   GET  /                                              metadata: the whitelisted texture host and the public key that signs profiles
 *   GET  /sessionserver/session/minecraft/profile/<id>  the profile with its "textures" property (signed when asked)
 *   GET  /textures/<sha256>                             the picture
 *   POST /sessionserver/session/minecraft/join          accepted (there is nothing to verify; online servers still verify by themselves)
 *   name lookups                                        the player's own name only
 * The signing key pair is made fresh for every launch and never leaves memory. Nothing else is served.
 */
const http = require('http')
const crypto = require('crypto')

/** The UUID a vanilla offline-mode server gives this name (MD5 of "OfflinePlayer:<name>", as version 3), undashed. */
function vanillaOfflineUuid(name) {
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
    hash[6] = (hash[6] & 0x0f) | 0x30
    hash[8] = (hash[8] & 0x3f) | 0x80
    return hash.toString('hex')
}

const undashed = (uuid) => String(uuid).replace(/-/g, '').toLowerCase()

/**
 * @param {{ name: string, uuid: string, png: Buffer, model?: 'default'|'slim' }} player  the offline player and the picture chosen for it
 * @returns {Promise<{ port: number, url: string, publicKey: string, close: () => Promise<void> }>}
 */
async function startSkinServer(player) {
    const { publicKey, privateKey } = await new Promise((resolve, reject) =>
        crypto.generateKeyPair('rsa', { modulusLength: 2048 }, (err, publicKey, privateKey) => (err ? reject(err) : resolve({ publicKey, privateKey }))))
    const pem = publicKey.export({ type: 'spki', format: 'pem' })
    const hash = crypto.createHash('sha256').update(player.png).digest('hex')

    // The same skin for the launcher's id and for the UUID a vanilla offline server would give this name, so the player sees it there too.
    const ids = new Map([[undashed(player.uuid), player.name], [vanillaOfflineUuid(player.name), player.name]])

    let base = ''
    const profile = (id, signed) => {
        const textures = {
            timestamp: Date.now(), profileId: id, profileName: ids.get(id),
            textures: { SKIN: { url: `${base}/textures/${hash}`, ...(player.model === 'slim' ? { metadata: { model: 'slim' } } : {}) } }
        }
        const value = Buffer.from(JSON.stringify(textures)).toString('base64')
        const property = { name: 'textures', value }
        if (signed) property.signature = crypto.sign('sha1', Buffer.from(value), privateKey).toString('base64')   // SHA1withRSA
        return { id, name: ids.get(id), properties: [property] }
    }

    const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
    const empty = (res, status) => { res.writeHead(status); res.end() }

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const route = url.pathname
        if (req.method === 'GET' && route === '/') {
            return json(res, 200, {
                meta: { serverName: 'Empi Launcher (skin local)', implementationName: 'empi-launcher', implementationVersion: '1', 'feature.no_mojang_namespace': true },
                skinDomains: ['127.0.0.1'],
                signaturePublickey: pem
            })
        }
        const lookup = /^\/sessionserver\/session\/minecraft\/profile\/([0-9a-fA-F-]{32,36})$/.exec(route)
        if (req.method === 'GET' && lookup) {
            const id = undashed(lookup[1])
            return ids.has(id) ? json(res, 200, profile(id, url.searchParams.get('unsigned') === 'false')) : empty(res, 204)
        }
        if (req.method === 'GET' && route === `/textures/${hash}`) {
            res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': player.png.length, 'Cache-Control': 'max-age=31536000, immutable' })
            return res.end(player.png)
        }
        if (req.method === 'POST' && route === '/sessionserver/session/minecraft/join') { req.resume(); return empty(res, 204) }
        if (req.method === 'GET' && route === '/sessionserver/session/minecraft/hasJoined') return empty(res, 204)
        if (req.method === 'POST' && route === '/api/profiles/minecraft') {
            const chunks = []
            req.on('data', (c) => { if (chunks.length < 64) chunks.push(c) })
            req.on('end', () => {
                let names = []
                try { names = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { /* not a list */ }
                const mine = [...ids.entries()].filter(([, name]) => Array.isArray(names) && names.some((n) => String(n).toLowerCase() === name.toLowerCase()))
                json(res, 200, mine.map(([id, name]) => ({ id, name })))
            })
            return
        }
        const byName = /^\/api\/users\/profiles\/minecraft\/([^/]+)$/.exec(route)
        if (req.method === 'GET' && byName) {
            const name = decodeURIComponent(byName[1])
            const hit = [...ids.entries()].find(([, n]) => n.toLowerCase() === name.toLowerCase())
            return hit ? json(res, 200, { id: hit[0], name: hit[1] }) : empty(res, 204)
        }
        json(res, 404, { error: 'NotFound', errorMessage: 'Not found' })
    })

    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const port = server.address().port
    base = `http://127.0.0.1:${port}`
    return {
        port, url: base, publicKey: pem,
        close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.() })
    }
}

module.exports = { startSkinServer, vanillaOfflineUuid }
