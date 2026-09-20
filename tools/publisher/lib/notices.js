/**
 * Avisos: what the Publisher keeps about notices, maintenance, schedule and the minimum launcher version, and how it becomes
 * EmpiPacks/avisos.json. The file has its own publish step ("Publicar avisos"): it goes out whether or not a modpack or a launcher release
 * did, and a modpack compiled but not yet sent is never dragged along with it (only avisos.json and avisos/ are committed).
 *
 * Kept here, private (never in the EmpiPacks repository): the editor's pieces of each page, drafts, the allow list with player names.
 * Published: avisos.json and one image per notice (the page the author built, drawn by the editor in the browser).
 *
 * The launcher applies its own rules to whatever it reads (engine/src/lib/notices.js). This one runs the very same function on what it is
 * about to publish, and refuses when the launcher would silently drop something (a link that is not https, an id it does not accept...).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const git = require('./git')
const links = require('./links')
const nebula = require('./nebula')
const { HOME, loadState, saveState } = require('./config')

const launcherRules = require('../../../engine/src/lib/notices.js')

const FOLDER = path.join(HOME, '.empilauncher-publisher-avisos')
const FILE = path.join(FOLDER, 'avisos.json')
const IMAGES = path.join(FOLDER, 'images')
const MAX_IMAGE = 1.6 * 1024 * 1024
const MAX_EDITOR = 300 * 1024
const SEVERITIES = launcherRules.SEVERITIES

function readState() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return { notices: [], modpacks: {}, launcher: {} } }
}
function writeState(state) {
    fs.mkdirSync(FOLDER, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2))
}
const imagePath = (id, ext) => path.join(IMAGES, `${id}.${ext}`)
const findImage = (id) => ['webp', 'png'].map((ext) => imagePath(id, ext)).find((file) => fs.existsSync(file)) || null
const newId = () => `n${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
const iso = (value) => { if (!value) return null; const ms = Date.parse(value); if (!Number.isFinite(ms)) throw new Error(`No entiendo la fecha "${value}".`); return new Date(ms).toISOString() }
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)

/** Everything the tab shows: the notices, the modpack settings, the launcher's, and which modpacks exist (for "Dónde se ve"). */
function describe(config) {
    const state = readState()
    let packs = []
    try { packs = nebula.listPacks(config).map((p) => ({ id: p.id, name: p.name || p.id, active: p.active !== false, profileOf: p.profileOf || null })) } catch { /* no Nebula folder yet: the tab still works */ }
    const last = loadState().avisosPublished || null
    return {
        notices: state.notices.map((n) => ({ ...n, hasImage: !!findImage(n.id) })),
        modpacks: state.modpacks || {},
        launcher: state.launcher || {},
        packs,
        published: last ? { at: last.at, pending: last.hash !== stateHash(state) } : { at: null, pending: state.notices.some((n) => n.published) || Object.keys(state.modpacks || {}).length > 0 || !!(state.launcher && (state.launcher.minVersion || state.launcher.novedades)) }
    }
}

function cleanTargets(value, known) {
    const list = (Array.isArray(value) ? value : ['*']).map((t) => String(t)).filter((t) => t === '*' || known.has(t))
    return list.length ? [...new Set(list)] : ['*']
}

/** Creates or updates a notice (its data and the pieces of its page). The image comes separately (saveImage). */
function saveNotice(config, id, body) {
    const state = readState()
    const known = new Set(describe(config).packs.map((p) => p.id))
    let notice = id ? state.notices.find((n) => n.id === id) : null
    if (id && !notice) throw new Error('Ese aviso no existe.')
    if (!notice) { notice = { id: newId(), createdAt: new Date().toISOString() }; state.notices.unshift(notice) }

    const title = text(body.title, 90)
    if (!title) throw new Error('El aviso necesita un título corto (sale en el aviso de arranque y en la lista).')
    const severity = SEVERITIES.includes(body.severity) ? body.severity : 'info'
    const editor = body.editor && typeof body.editor === 'object' ? body.editor : notice.editor || null
    if (editor && JSON.stringify(editor).length > MAX_EDITOR) throw new Error('La página es demasiado grande.')
    const button = body.button && body.button.label && body.button.url ? { label: text(body.button.label, 40), url: String(body.button.url).trim() } : null
    if (button && !launcherRules.link(button.url)) throw new Error('El botón necesita un enlace que empiece por https://')

    Object.assign(notice, {
        title, severity, targets: cleanTargets(body.targets, known), summary: text(body.summary, 400),
        startsAt: iso(body.startsAt), expiresAt: iso(body.expiresAt), button, editor, published: body.published === true, updatedAt: new Date().toISOString()
    })
    if (notice.startsAt && notice.expiresAt && Date.parse(notice.startsAt) >= Date.parse(notice.expiresAt)) throw new Error('El aviso tiene que empezar a verse antes de caducar.')
    if (notice.published && !notice.firstPublishedAt) notice.firstPublishedAt = new Date().toISOString()
    writeState(state)
    return { ...notice, hasImage: !!findImage(notice.id) }
}

function deleteNotice(id) {
    const state = readState()
    const before = state.notices.length
    state.notices = state.notices.filter((n) => n.id !== id)
    if (state.notices.length === before) throw new Error('Ese aviso no existe.')
    for (const ext of ['webp', 'png']) fs.rmSync(imagePath(id, ext), { force: true })
    fs.rmSync(path.join(FOLDER, 'assets', id), { recursive: true, force: true })
    writeState(state)
    return { ok: true }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
/** The page, as drawn by the editor: WebP or PNG, small. Anything else is refused: it goes into a public repository. */
async function saveImage(id, stream) {
    const state = readState()
    const notice = state.notices.find((n) => n.id === id)
    if (!notice) throw new Error('Guarda primero el aviso.')
    const chunks = []
    let size = 0
    for await (const chunk of stream) {
        size += chunk.length
        if (size > MAX_IMAGE) throw new Error(`La imagen de la página pesa demasiado (más de ${(MAX_IMAGE / 1048576).toFixed(1)} MB). Usa menos imágenes o más pequeñas.`)
        chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    const webp = bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP'
    const png = bytes.length > 8 && bytes.subarray(0, 4).equals(PNG_MAGIC)
    if (!webp && !png) throw new Error('La página tiene que ser una imagen WebP o PNG.')
    fs.mkdirSync(IMAGES, { recursive: true })
    for (const ext of ['webp', 'png']) fs.rmSync(imagePath(id, ext), { force: true })
    fs.writeFileSync(imagePath(id, webp ? 'webp' : 'png'), bytes)
    notice.pageHash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10)
    notice.updatedAt = new Date().toISOString()
    writeState(state)
    return { pageHash: notice.pageHash, bytes: bytes.length }
}

const ASSET = /^[a-f0-9]{10}\.(webp|png|jpg)$/
const MAX_ASSET = 2 * 1024 * 1024
/** A picture placed inside a page. The editor shrinks it first; here it is checked and kept, named by its content. */
async function saveAsset(id, stream) {
    if (!readState().notices.some((n) => n.id === id)) throw new Error('Guarda primero el aviso.')
    const chunks = []
    let size = 0
    for await (const chunk of stream) {
        size += chunk.length
        if (size > MAX_ASSET) throw new Error('Esa imagen pesa demasiado (más de 2 MB).')
        chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    const ext = bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp'
        : bytes.length > 8 && bytes.subarray(0, 4).equals(PNG_MAGIC) ? 'png'
        : bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpg' : null
    if (!ext) throw new Error('Solo WebP, PNG o JPG.')
    const name = `${crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10)}.${ext}`
    fs.mkdirSync(path.join(FOLDER, 'assets', id), { recursive: true })
    fs.writeFileSync(path.join(FOLDER, 'assets', id, name), bytes)
    return { name }
}
function assetOf(id, name) {
    if (!ASSET.test(name) || !/^[A-Za-z0-9_-]{1,48}$/.test(id)) throw new Error('Imagen no válida.')
    const file = path.join(FOLDER, 'assets', id, name)
    if (!fs.existsSync(file)) throw new Error('Esa imagen no existe.')
    return { file, type: name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' }
}

function imageOf(id) {
    const file = findImage(id)
    if (!file) throw new Error('Ese aviso todavía no tiene imagen.')
    return { file, type: file.endsWith('.png') ? 'image/png' : 'image/webp' }
}

/** Maintenance, schedule, "novedades" per modpack, and the launcher's minimum version and link. */
function saveAccess(body) {
    const state = readState()
    const modpacks = {}
    for (const [id, entry] of Object.entries(body.modpacks && typeof body.modpacks === 'object' ? body.modpacks : {})) {
        const out = {}
        const m = entry.maintenance
        if (m && m.active) out.maintenance = { active: true, message: text(m.message, 300), until: iso(m.until), allow: (Array.isArray(m.allow) ? m.allow : []).map((a) => ({ name: text(a.name, 24), uuid: launcherRules.compactUuid(a.uuid) })).filter((a) => /^[0-9a-f]{32}$/.test(a.uuid)).slice(0, 40) }
        const s = entry.schedule
        if (s && (s.from || s.until)) out.schedule = { from: iso(s.from), until: iso(s.until) }
        if (entry.novedades) { if (!launcherRules.link(entry.novedades)) throw new Error(`El enlace de novedades de ${id} tiene que empezar por https://`); out.novedades = String(entry.novedades).trim() }
        if (Object.keys(out).length) modpacks[id] = out
    }
    const launcher = {}
    if (body.launcher && body.launcher.minVersion) {
        if (!/^\d+\.\d+\.\d+$/.test(String(body.launcher.minVersion).trim())) throw new Error('La versión mínima tiene que ser como 3.5.0')
        launcher.minVersion = String(body.launcher.minVersion).trim()
    }
    if (body.launcher && body.launcher.novedades) { if (!launcherRules.link(body.launcher.novedades)) throw new Error('El enlace de novedades general tiene que empezar por https://'); launcher.novedades = String(body.launcher.novedades).trim() }
    state.modpacks = modpacks
    state.launcher = launcher
    writeState(state)
    return { modpacks, launcher }
}

/** A player's Minecraft name to the id the launcher recognises. Asked to Mojang, only when the author types a name. */
async function lookupUuid(name) {
    const clean = String(name || '').trim()
    if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) throw new Error('Un nombre de Minecraft tiene de 3 a 16 letras, números o guion bajo.')
    const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(8000) })
    if (response.status === 204 || response.status === 404) throw new Error(`No existe ninguna cuenta de Minecraft que se llame ${clean}.`)
    if (!response.ok) throw new Error(`Mojang no contestó (${response.status}). Inténtalo de nuevo.`)
    const data = await response.json()
    return { name: data.name, uuid: launcherRules.compactUuid(data.id) }
}

const hashOf = (doc) => crypto.createHash('sha1').update(JSON.stringify({ ...doc, generatedAt: undefined })).digest('hex')
/** The same fingerprint whether the pages are named for publishing or not: what "unpublished changes" is measured with. */
const stateHash = (state) => hashOf(buildDoc(state, () => '').doc)

/** avisos.json as it would be published now, plus the files it needs. `pageFor(notice, ext)` names the page in the repository. */
function buildDoc(state, pageFor) {
    const files = []
    const notices = []
    for (const n of state.notices.filter((entry) => entry.published)) {
        const source = findImage(n.id)
        if (!source || !n.pageHash) continue
        const ext = path.extname(source).slice(1)
        const page = pageFor(n, ext)
        files.push({ from: source, page })
        notices.push({
            id: n.id, title: n.title, severity: n.severity, targets: n.targets, page, pageHash: n.pageHash, summary: n.summary,
            publishedAt: n.firstPublishedAt || n.createdAt, ...(n.startsAt ? { startsAt: n.startsAt } : {}), expiresAt: n.expiresAt || null, ...(n.button ? { button: n.button } : {})
        })
    }
    const modpacks = {}
    for (const [id, entry] of Object.entries(state.modpacks || {})) {
        modpacks[id] = {
            ...(entry.maintenance ? { maintenance: { ...entry.maintenance, allow: (entry.maintenance.allow || []).map((a) => a.uuid) } } : {}),
            ...(entry.schedule ? { schedule: entry.schedule } : {}),
            ...(entry.novedades ? { novedades: entry.novedades } : {})
        }
    }
    const doc = { version: 1, generatedAt: new Date().toISOString(), launcher: state.launcher || {}, notices, modpacks }
    return { doc, files }
}

/** What the launcher would keep of it: if that is less than what is here, something is wrong and it must not go out. */
function problems(doc) {
    const seen = launcherRules.sanitize(doc)
    if (!seen) return ['El launcher no entiende este archivo.']
    const out = []
    for (const n of doc.notices) {
        const kept = seen.notices.find((k) => k.id === n.id)
        if (!kept) out.push(`El aviso "${n.title}" no lo aceptaría el launcher.`)
        else {
            if (n.page && !kept.page) out.push(`La página del aviso "${n.title}" tiene un nombre que el launcher no acepta.`)
            if (n.button && !kept.button) out.push(`El botón del aviso "${n.title}" no es válido (tiene que ser https).`)
            if (n.startsAt && !kept.startsAt) out.push(`La fecha de inicio del aviso "${n.title}" no es válida.`)
        }
    }
    for (const id of Object.keys(doc.modpacks)) if (!seen.modpacks[id]) out.push(`Los ajustes de ${id} no los aceptaría el launcher.`)
    if (doc.launcher.minVersion && !seen.launcher.minVersion) out.push('La versión mínima no es válida.')
    return out
}

/** Every link that would go out (the buttons of published notices, the news links), with where each one is. */
function linksToCheck() {
    const state = readState()
    const out = []
    for (const n of state.notices.filter((entry) => entry.published)) if (n.button && n.button.url) out.push({ where: `Botón del aviso "${n.title}"`, url: n.button.url })
    for (const [id, entry] of Object.entries(state.modpacks || {})) if (entry.novedades) out.push({ where: `Novedades de ${id}`, url: entry.novedades })
    if (state.launcher && state.launcher.novedades) out.push({ where: 'Novedades generales', url: state.launcher.novedades })
    return out
}

/** "Comprobar enlaces": which of them open. Nothing is published or changed. */
async function checkLinks(options) {
    const results = await links.checkLinks(linksToCheck(), options)
    return { results, broken: results.filter((r) => r.ok === false).length, unknown: results.filter((r) => r.ok === null).length }
}

/** The local EmpiPacks checkout, cloned when it does not exist yet and brought up to date (a failure to reach GitHub is not fatal here). */
async function syncRepo(config, log) {
    const repo = config.empiPacksRepoPath
    if (!fs.existsSync(repo) || !(await git.isRepo(repo))) {
        log(`Todavía no existe ${repo}, clonando EmpiPacks...`)
        await git.clone(config.empiPacksRepoUrl, repo, log)
    }
    await git.ensureByteExact(repo)
    try { await git.pull(repo, log) } catch (err) { log(`Aviso: no pude traer lo último de GitHub (${err.message}). Sigo con lo que hay.`) }
    return repo
}

/**
 * "Deshacer la última publicación de avisos": what players see goes back to how it was before the last time avisos.json changed (a new
 * commit that restores that state: nothing is rewritten in git's history, so it can itself be undone). The drafts on this PC are not
 * touched; they stay marked as unpublished, so "Publicar avisos" puts them out again once they are right.
 */
async function undoLast(config, log, step) {
    step('Actualizando el repositorio local')
    const repo = await syncRepo(config, log)

    step('Buscando la publicación anterior')
    const [last, previous] = await git.commitsTouching(repo, ['avisos.json', 'avisos'], 2)
    if (!last) throw new Error('Todavía no se ha publicado ningún aviso: no hay nada que deshacer.')
    log(`Lo último que se publicó: ${await git.describeCommit(repo, last)}`)
    log(previous ? `Se vuelve a como estaba en: ${await git.describeCommit(repo, previous)}` : 'No hay nada anterior: los avisos quedarán vacíos.')

    step('Volviendo a esa versión')
    const wanted = previous ? await git.filesAt(repo, previous, ['avisos.json', 'avisos']) : []
    fs.rmSync(path.join(repo, 'avisos'), { recursive: true, force: true })
    if (wanted.length) await git.restoreFrom(repo, previous, wanted, log)
    if (!wanted.includes('avisos.json')) fs.writeFileSync(path.join(repo, 'avisos.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), launcher: {}, notices: [], modpacks: {} }, null, 2) + '\n', 'utf8')

    step('Guardando los cambios')
    const paths = await git.knownPaths(repo, ['avisos.json', 'avisos'])
    await git.add(repo, paths, log)
    if ((await git.stagedChangesIn(repo, paths)).length === 0) throw new Error('Los avisos ya están como en la publicación anterior: no hay nada que deshacer.')
    await git.commitOnly(repo, 'Deshacer la última publicación de avisos', paths, log)

    step('Publicando en GitHub')
    await git.push(repo, log)
    // what this PC has is no longer what players see: the tab says there are changes to publish
    saveState({ avisosPublished: { at: new Date().toISOString(), hash: 'deshecho' } })
    log('Deshecho. Los jugadores lo verán en 1-2 minutos. Tus borradores siguen aquí: revisa lo que quieras y vuelve a pulsar «Publicar avisos».')
    return { undone: true }
}

async function publish(config, options, log, step) {
    step('Actualizando el repositorio local')
    const repo = await syncRepo(config, log)

    step('Preparando los avisos')
    const state = readState()
    const empty = state.notices.filter((n) => n.published && !(findImage(n.id) && n.pageHash))
    if (empty.length) throw new Error(`Estos avisos están marcados para publicar pero todavía no tienen página guardada: ${empty.map((n) => n.title).join(', ')}. Ábrelos y pulsa Guardar.`)
    const { doc, files } = buildDoc(state, (n, ext) => `avisos/${n.id}-${n.pageHash}.${ext}`)
    const bad = problems(doc)
    if (bad.length) throw new Error(`No se puede publicar todavía:\n- ${bad.join('\n- ')}`)

    const folder = path.join(repo, 'avisos')
    const keep = new Set(files.map((f) => path.basename(f.page)))
    fs.mkdirSync(folder, { recursive: true })
    for (const f of files) fs.copyFileSync(f.from, path.join(repo, f.page))
    for (const name of fs.readdirSync(folder)) if (!keep.has(name)) fs.rmSync(path.join(folder, name), { force: true })
    if (fs.existsSync(folder) && fs.readdirSync(folder).length === 0) fs.rmdirSync(folder)
    // the timestamp must not make a file that says the same thing look changed
    try { const before = JSON.parse(fs.readFileSync(path.join(repo, 'avisos.json'), 'utf8')); if (hashOf(before) === hashOf(doc)) doc.generatedAt = before.generatedAt } catch { /* first time */ }
    fs.writeFileSync(path.join(repo, 'avisos.json'), JSON.stringify(doc, null, 2) + '\n', 'utf8')
    log(`${doc.notices.length} aviso(s), ${Object.keys(doc.modpacks).length} modpack(s) con ajustes${doc.launcher.minVersion ? `, versión mínima ${doc.launcher.minVersion}` : ''}.`)

    step('Guardando los cambios')
    // only these paths: a modpack that was compiled but not sent yet stays exactly as it is
    // avisos/ only when it exists or git already has it: with no page at all there is no folder, and git refuses a path it does not know (exit 128)
    const paths = await git.knownPaths(repo, ['avisos.json', 'avisos'])
    await git.add(repo, paths, log)
    const staged = await git.stagedChangesIn(repo, paths)
    if (staged.length === 0 && (await git.unpushedCount(repo)) === 0) {
        log('No hay nada nuevo que publicar.')
        saveState({ avisosPublished: { at: new Date().toISOString(), hash: stateHash(state) } })
        return { published: false }
    }
    if (staged.length > 0) await git.commitOnly(repo, options && options.message && options.message.trim() ? options.message.trim() : 'Actualizar avisos', paths, log)

    step('Publicando en GitHub')
    await git.push(repo, log)
    saveState({ avisosPublished: { at: new Date().toISOString(), hash: stateHash(state) } })
    log('Publicado. GitHub Pages tarda 1-2 minutos en mostrar los cambios; el launcher los recoge en pocos minutos.')
    return { published: true }
}

module.exports = { checkLinks, linksToCheck, undoLast, describe, saveNotice, deleteNotice, saveImage, imageOf, saveAsset, assetOf, saveAccess, lookupUuid, buildDoc, problems, publish, readState }
