/**
 * Skins for the offline player, from a NameMC skin id.
 *
 * NameMC gives every skin an id (namemc.com/skin/96cab59a8709ce31) and serves the picture itself, without any protection, at
 * s.namemc.com/i/<id>.png. Its pages, search and API are behind a bot challenge, so nothing here searches NameMC: the player pastes
 * the id or the link (or it is picked up from the clipboard) and this fetches that one picture. Everything is checked before it is used:
 * it must be a PNG, 64x64 or 64x32, and small.
 *
 * What the game needs to show it is done elsewhere (skinserver.js, lib/injector below).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const sharp = require('sharp')

const ID = /^[0-9a-f]{16}$/
const LINK = /(?:^|\/\/)(?:[a-z0-9-]+\.)*namemc\.com\/(?:skin\/|i\/)([0-9a-f]{16})(?![0-9a-f])/i
const MAX_BYTES = 64 * 1024   // a skin is a few KB; anything bigger is not a skin

const imageBase = () => (process.env.EMPI_ENGINE_TEST === '1' && process.env.EMPI_SKIN_BASE) || 'https://s.namemc.com'

/** What the player typed or pasted -> { id } or { reason }. No network. */
function parseSkinInput(text) {
    const raw = String(text ?? '').trim()
    if (!raw) return { reason: 'Pega el id de la skin o su enlace de NameMC.' }
    if (ID.test(raw.toLowerCase())) return { id: raw.toLowerCase() }
    const link = LINK.exec(raw)
    if (link) return { id: link[1].toLowerCase() }
    return { reason: 'No parece un id ni un enlace de NameMC. El id son 16 letras y números, como 96cab59a8709ce31, o el enlace namemc.com/skin/…' }
}

const skinsDir = (launcherDir) => path.join(launcherDir, 'skins')
const paths = (launcherDir, id) => ({ png: path.join(skinsDir(launcherDir), `${id}.png`), front: path.join(skinsDir(launcherDir), `${id}-front.png`), head: path.join(skinsDir(launcherDir), `${id}-head.png`) })

/** Checks that a buffer is a real skin picture. Returns { width, height } or throws with a sentence for the player. */
async function validateSkin(buffer) {
    if (buffer.length > MAX_BYTES) throw new Error('Ese archivo pesa demasiado para ser una skin.')
    let meta
    try { meta = await sharp(buffer).metadata() } catch { throw new Error('Eso no es una imagen PNG.') }
    if (meta.format !== 'png') throw new Error('Eso no es una imagen PNG.')
    if (meta.width !== 64 || (meta.height !== 64 && meta.height !== 32)) throw new Error(`La imagen mide ${meta.width}×${meta.height}; una skin mide 64×64 o 64×32.`)
    return { width: meta.width, height: meta.height }
}

/**
 * Alex-style ("slim") skins have 3-pixel arms: the fourth column of the right arm (x = 47, y = 20..31) is left transparent.
 * The same test every skin tool uses, since the picture itself does not say which model it was made for. 64x32 skins are always classic.
 */
async function detectModel(buffer, height) {
    if (height !== 64) return 'default'
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (let y = 20; y < 32; y++) if (data[(y * info.width + 47) * info.channels + 3] !== 0) return 'default'
    return 'slim'
}

/** Front view (96x192) and head (64x64) drawn from the skin, for the launcher to show. Nearest-neighbour: pixels stay pixels. */
async function render(file, model, height, out) {
    const slim = model === 'slim'
    const legacy = height === 32
    const armW = slim ? 3 : 4
    const cut = (x, y, w, h, flop = false) => { let part = sharp(file).ensureAlpha().extract({ left: x, top: y, width: w, height: h }); if (flop) part = part.flop(); return part.toBuffer() }

    const layers = []
    const put = async (input, left, top) => layers.push({ input: await input, left, top })
    // base layers first, then the overlays, so overlays land on top
    await put(cut(8, 8, 8, 8), 4, 0)                                            // head
    await put(cut(20, 20, 8, 12), 4, 8)                                         // body
    await put(cut(44, 20, armW, 12), 4 - armW, 8)                               // right arm (left in the picture)
    await put(legacy ? cut(44, 20, armW, 12, true) : cut(36, 52, armW, 12), 12, 8)   // left arm
    await put(cut(4, 20, 4, 12), 4, 20)                                         // right leg
    await put(legacy ? cut(4, 20, 4, 12, true) : cut(20, 52, 4, 12), 8, 20)    // left leg
    await put(cut(40, 8, 8, 8), 4, 0)                                           // hat
    if (!legacy) {
        await put(cut(20, 36, 8, 12), 4, 8)                                     // jacket
        await put(cut(44, 36, armW, 12), 4 - armW, 8)                           // right sleeve
        await put(cut(52, 52, armW, 12), 12, 8)                                 // left sleeve
        await put(cut(4, 36, 4, 12), 4, 20)                                     // right pants
        await put(cut(4, 52, 4, 12), 8, 20)                                     // left pants
    }
    const blank = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    // sharp resizes BEFORE it composites, so the sprite is put together first and only then enlarged (pixels stay pixels)
    const enlarge = (sprite, width, height, file) => sharp(sprite).resize(width, height, { kernel: 'nearest' }).png().toFile(file)
    await enlarge(await blank(16, 32).composite(layers).png().toBuffer(), 96, 192, out.front)
    await enlarge(await blank(8, 8).composite([{ input: layers[0].input, left: 0, top: 0 }, { input: layers[6].input, left: 0, top: 0 }]).png().toBuffer(), 64, 64, out.head)
}

/**
 * Makes sure a skin is in the launcher's cache (downloading it if it is not) and its previews exist.
 * @returns {{ id, model, height, png, front, head }}
 */
async function fetchSkin(launcherDir, id) {
    if (!ID.test(id)) throw new Error('Ese id de skin no es válido.')
    const where = paths(launcherDir, id)
    fs.mkdirSync(skinsDir(launcherDir), { recursive: true })

    let buffer = fs.existsSync(where.png) ? fs.readFileSync(where.png) : null
    if (buffer) { try { await validateSkin(buffer) } catch { buffer = null } }   // a damaged cache file is fetched again
    if (!buffer) {
        let response
        try {
            response = await fetch(`${imageBase()}/i/${id}.png`, { headers: { 'User-Agent': 'EmpiLauncher' }, signal: AbortSignal.timeout(12000) })
        } catch {
            throw new Error('No se pudo descargar la skin. Comprueba tu conexión a internet (se necesita una vez).')
        }
        if (response.status === 404) throw new Error('NameMC no tiene una skin con ese id.')
        if (!response.ok) throw new Error(`NameMC no respondió bien (HTTP ${response.status}).`)
        const declared = Number(response.headers.get('content-length'))
        if (declared > MAX_BYTES) throw new Error('Ese archivo pesa demasiado para ser una skin.')
        const chunks = []
        let size = 0
        for await (const chunk of response.body) {
            size += chunk.length
            if (size > MAX_BYTES) throw new Error('Ese archivo pesa demasiado para ser una skin.')
            chunks.push(chunk)
        }
        buffer = Buffer.concat(chunks)
        await validateSkin(buffer)
        fs.writeFileSync(`${where.png}.part`, buffer)
        fs.renameSync(`${where.png}.part`, where.png)
    }

    const { height } = await validateSkin(buffer)
    const model = await detectModel(buffer, height)
    if (!fs.existsSync(where.front) || !fs.existsSync(where.head)) await render(where.png, model, height, where)
    return { id, model, height, ...where }
}

/** Where the previews of an already cached skin are, if they are (used to show the current skin without any network). */
function cached(launcherDir, id) {
    const where = paths(launcherDir, id)
    return fs.existsSync(where.png) ? where : null
}

// ---- the component that lets the game show it (authlib-injector) ---------------------------------------------------------
// A small Java agent (350 KB, AGPL-3.0) that redirects the game's skin lookups to a server of ours. It is downloaded the first time a
// skin is chosen, not shipped, and only that exact file is accepted: its sha256 is pinned here (it matches the one GitHub lists for the release).
const INJECTOR = {
    version: '1.2.8',
    sha256: '9c7f4343e6c82034958ffb48c14a2cb0c85928be7283103ce17da00c6d5a7b10',
    url: 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.8/authlib-injector-1.2.8.jar'
}

async function ensureInjector(launcherDir) {
    const testing = process.env.EMPI_ENGINE_TEST === '1'
    const expected = (testing && process.env.EMPI_INJECTOR_SHA256) || INJECTOR.sha256
    const url = (testing && process.env.EMPI_INJECTOR_URL) || INJECTOR.url
    const file = path.join(launcherDir, 'tools', `authlib-injector-${INJECTOR.version}.jar`)
    const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
    if (fs.existsSync(file) && sha(fs.readFileSync(file)) === expected) return file

    let buffer
    try {
        const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'EmpiLauncher' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        buffer = Buffer.from(await response.arrayBuffer())
    } catch (err) {
        throw new Error(`No se pudo descargar el componente que muestra las skins (${err.message}). Se necesita internet una vez.`)
    }
    if (buffer.length > 2 * 1024 * 1024 || sha(buffer) !== expected) throw new Error('El componente de skins descargado no es el esperado; no se usa.')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(`${file}.part`, buffer)
    fs.renameSync(`${file}.part`, file)
    return file
}

module.exports = { parseSkinInput, validateSkin, detectModel, fetchSkin, cached, ensureInjector, paths, INJECTOR }
