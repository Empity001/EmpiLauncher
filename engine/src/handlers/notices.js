/**
 * Avisos, mantenimiento, agenda y versión mínima (see lib/notices.js for the file and the rules).
 *
 *   notices.refresh  asks EmpiPacks for avisos.json (a short, conditional request) and returns the view; without a network it returns what was last read
 *   notices.get      the view from what is remembered, no network
 *   notices.mark     {id, state: 'read'|'later'|'closed'|'unread'}   what the player did with a notice; remembered on this PC
 *
 * The view: { online, fetchedAt, serverNow, launcher: {minVersion, blocked, message, novedades}, notices: [...], modpacks: { <id>: {access, novedades} } }
 *
 * Time comes from the server's clock (the Date header of the answer) plus the time that passed on a clock that only runs forward, so
 * moving the PC's clock changes nothing. Without a network it stays frozen at the last time it was read: whatever blocked playing then
 * keeps blocking until the next successful read.
 */
const fs = require('fs')
const path = require('path')
const { performance } = require('perf_hooks')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')
const N = require('../lib/notices')
const offline = require('../lib/offline')

const FILE = 'native-notices.json'
const IMAGES = 'notices-cache'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

function register(handlers, state) {
    const dir = () => ensureCore(state).ConfigManager.getLauncherDirectory()
    const mem = { loaded: false, doc: null, etag: null, serverAt: null, perfAt: null, live: false, online: false, fetchedAt: null, marks: {} }

    function load() {
        if (mem.loaded) return
        mem.loaded = true
        try {
            const saved = JSON.parse(fs.readFileSync(path.join(dir(), FILE), 'utf8'))
            mem.doc = N.sanitize(saved.doc)
            mem.etag = typeof saved.etag === 'string' ? saved.etag : null
            mem.serverAt = Number.isFinite(saved.serverAt) ? saved.serverAt : null
            mem.fetchedAt = typeof saved.fetchedAt === 'string' ? saved.fetchedAt : null
            mem.marks = saved.marks && typeof saved.marks === 'object' ? saved.marks : {}
        } catch { /* nothing remembered yet */ }
    }
    function save() {
        fs.mkdirSync(dir(), { recursive: true })
        fs.writeFileSync(path.join(dir(), FILE), JSON.stringify({ doc: mem.doc, etag: mem.etag, serverAt: mem.serverAt, fetchedAt: mem.fetchedAt, marks: mem.marks }, null, 2))
    }

    /** "Now", by the server's clock. Frozen at the last successful read whenever the last try failed. */
    const nowMs = () => (mem.serverAt == null ? Date.now() : mem.live && mem.online ? mem.serverAt + (performance.now() - mem.perfAt) : mem.serverAt)
    const appVersion = () => { try { return require('electron').app.getVersion() } catch { return null } }
    function who() {
        const account = offline.currentAccount(ensureCore(state).ConfigManager)
        return account ? { uuid: account.uuid, type: account.type } : { uuid: null, type: null }
    }
    const accessFor = (serverId) => N.accessOf(mem.doc, serverId, { nowMs: nowMs(), ...who(), appVersion: appVersion() })

    function url() {
        if (process.env.EMPI_ENGINE_TEST === '1' && process.env.EMPI_NOTICES_URL) return process.env.EMPI_NOTICES_URL
        const { DistroAPI, REMOTE_DISTRO_URL } = ensureCore(state)
        const remote = String(DistroAPI['remoteUrl'] || REMOTE_DISTRO_URL).replace(/\?.*$/, '')
        return remote.replace(/[^/]*$/, 'avisos.json')
    }

    const imageFile = (notice) => {
        if (!notice.page) return null
        const ext = path.extname(notice.page)
        return path.join(dir(), IMAGES, `${notice.id}-${(notice.pageHash || 'x').slice(0, 12)}${ext}`)
    }

    async function syncImages(base) {
        const wanted = new Set()
        for (const notice of mem.doc ? mem.doc.notices : []) {
            const target = imageFile(notice)
            if (!target) continue
            wanted.add(path.basename(target))
            if (fs.existsSync(target)) continue
            try {
                const response = await fetch(new URL(notice.page, base), { headers: { 'User-Agent': 'EmpiLauncher' }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
                if (!response.ok) continue
                const bytes = Buffer.from(await response.arrayBuffer())
                if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) continue
                fs.mkdirSync(path.dirname(target), { recursive: true })
                fs.writeFileSync(target, bytes)
            } catch (err) { state.log.debug(`The page of notice ${notice.id} could not be downloaded.`, err) }
        }
        try {   // pages of notices that are gone do not stay on disk
            for (const name of fs.readdirSync(path.join(dir(), IMAGES))) if (!wanted.has(name)) fs.rmSync(path.join(dir(), IMAGES, name), { force: true })
        } catch { /* no cache folder yet */ }
    }

    async function refresh() {
        load()
        const address = url()
        try {
            const headers = { 'User-Agent': 'EmpiLauncher' }
            if (mem.etag && mem.doc) headers['If-None-Match'] = mem.etag
            const response = await fetch(`${address}${address.includes('?') ? '&' : '?'}_empi=${Date.now()}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(7000) })
            const dateHeader = response.headers.get('date')
            const serverAt = dateHeader && Number.isFinite(Date.parse(dateHeader)) ? Date.parse(dateHeader) : Date.now()
            if (response.status === 404) { mem.doc = null; mem.etag = null }   // no file: no notices, nothing blocked
            else if (response.status !== 304) {
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const doc = N.sanitize(await response.json())
                if (doc) { mem.doc = doc; mem.etag = response.headers.get('etag') || null }
                else state.log.warn('avisos.json is not a version this launcher understands: keeping what was read before.')
            }
            mem.online = true; mem.live = true; mem.serverAt = serverAt; mem.perfAt = performance.now(); mem.fetchedAt = new Date().toISOString()
            await syncImages(address)
            save()
        } catch (err) {
            state.log.debug('avisos.json could not be read.', err)
            mem.online = false
        }
    }

    function view() {
        load()
        const now = nowMs()
        const notices = N.activeNotices(mem.doc, now).map((n) => {
            const mark = mem.marks[n.id]
            const image = imageFile(n)
            return {
                id: n.id, title: n.title, severity: n.severity, general: N.isGeneral(n), targets: n.targets, summary: n.summary,
                button: n.button || null, publishedAt: n.publishedAt, expiresAt: n.expiresAt,
                image: image && fs.existsSync(image) ? image : null,
                state: mark && mark.rev === (n.pageHash || n.title) ? mark.state : 'unread'
            }
        })
        const modpacks = {}
        for (const [id, entry] of Object.entries(mem.doc ? mem.doc.modpacks : {})) modpacks[id] = { access: accessFor(id), novedades: entry.novedades || null }
        const gate = accessFor('')
        return {
            online: mem.online, fetchedAt: mem.fetchedAt, serverNow: new Date(now).toISOString(),
            launcher: { minVersion: mem.doc ? mem.doc.launcher.minVersion || null : null, blocked: gate.state === 'launcher', message: gate.state === 'launcher' ? gate.message : null, novedades: mem.doc ? mem.doc.launcher.novedades || null : null },
            notices, modpacks
        }
    }

    handlers.set('notices.get', async () => view())
    handlers.set('notices.refresh', async () => { await refresh(); return view() })
    handlers.set('notices.mark', async ({ id, state: value } = {}) => {
        load()
        if (!['read', 'later', 'closed', 'unread'].includes(value)) throw new EngineError('bad_state', `not a state: ${value}`)
        const notice = mem.doc && mem.doc.notices.find((n) => n.id === id)
        if (!notice) throw new EngineError('no_notice', `no such notice: ${id}`)
        mem.marks[id] = { state: value, rev: notice.pageHash || notice.title }
        for (const known of Object.keys(mem.marks)) if (!mem.doc.notices.some((n) => n.id === known)) delete mem.marks[known]   // forget the ones that are gone
        save()
        return view()
    })

    // The rest of the engine asks this before it starts anything (game.start): a sentence when playing is not allowed, null when it is.
    state.notices = { gateFor: (serverId) => { load(); return N.blockingMessage(accessFor(serverId)) }, access: (serverId) => { load(); return accessFor(serverId) } }
}

module.exports = { register }
