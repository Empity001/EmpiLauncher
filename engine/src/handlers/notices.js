/**
 * Avisos, mantenimiento, agenda y versión mínima (see lib/notices.js for the file and the rules).
 *
 *   notices.refresh  asks EmpiPacks for avisos.json (a short, conditional request) and returns the view; without a network it returns what was last read
 *   notices.get      the view from what is remembered, no network
 *   notices.mark     {id, state: 'read'|'later'|'closed'|'unread'}   what the player did with a notice; remembered on this PC
 *
 * A closed notice is not thrown away: it moves to the archive ("ya leídos"), with its page squeezed into a small WebP (75 % of the width,
 * quality 40: about a third of the size, the text still reads) and the full-size page deleted. It stays even if the author later removes
 * the notice from avisos.json. Nothing removes it: it is the player's proof that the notice reached them ("no me apareció", "no lo leí"),
 * so there is no method for it and the window has no button. The only ways out are an EDITED notice (a new one again: the old copy goes) and
 * ARCHIVE_MAX of them (a limit against a runaway, far above what anyone reaches: the oldest go first). The archive is in the view as `archive`.
 *
 * The view: { online, fetchedAt, serverNow, launcher: {minVersion, blocked, message, novedades}, notices: [...], archive: [...], modpacks: { <id>: {access, novedades} } }
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
const ARCHIVE = 'notices-archive'
const ARCHIVE_MAX = 500
const ARCHIVE_WIDTH = 675, ARCHIVE_QUALITY = 40
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

function register(handlers, state) {
    const dir = () => ensureCore(state).ConfigManager.getLauncherDirectory()
    const mem = { loaded: false, doc: null, etag: null, serverAt: null, perfAt: null, live: false, online: false, fetchedAt: null, marks: {}, archive: [] }

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
            mem.archive = (Array.isArray(saved.archive) ? saved.archive : []).map(cleanArchived).filter(Boolean)
        } catch { /* nothing remembered yet */ }
    }
    function save() {
        fs.mkdirSync(dir(), { recursive: true })
        fs.writeFileSync(path.join(dir(), FILE), JSON.stringify({ doc: mem.doc, etag: mem.etag, serverAt: mem.serverAt, fetchedAt: mem.fetchedAt, marks: mem.marks, archive: mem.archive }, null, 2))
    }

    const revOf = (notice) => notice.pageHash || notice.title
    const isClosed = (notice) => { const mark = mem.marks[notice.id]; return !!mark && mark.state === 'closed' && mark.rev === revOf(notice) }
    const archiveFile = (name) => path.join(dir(), ARCHIVE, name)
    // Windows refuses to delete a file another process has open (the window showing it, an antivirus): that must never stop a refresh.
    // What could not go now is nobody's any more, and the next pass sweeps it.
    const discard = (file) => { try { fs.rmSync(file, { force: true }) } catch (err) { state.log.debug(`${file} could not be deleted now; it goes at the next pass.`, err) } }
    const dropArchiveFile = (entry) => { if (entry && entry.image) discard(archiveFile(entry.image)) }
    const sharpLib = () => {
        if (!state.sharp) {
            state.sharp = require('sharp')
            state.sharp.cache(false)       // the UI keeps what it shows; the engine keeps nothing
            state.sharp.concurrency(1)
        }
        return state.sharp
    }

    /** What is remembered of a closed notice (a saved entry is checked like everything that comes from a file). */
    function cleanArchived(raw) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.id) || typeof raw.title !== 'string') return null
        const image = typeof raw.image === 'string' && /^[A-Za-z0-9_-]{1,140}\.webp$/.test(raw.image) ? raw.image : null
        return {
            id: raw.id, rev: String(raw.rev || ''), title: raw.title.slice(0, 120), severity: ['info', 'important', 'critical'].includes(raw.severity) ? raw.severity : 'info',
            general: raw.general === true, targets: Array.isArray(raw.targets) ? raw.targets.filter((t) => typeof t === 'string').slice(0, 20) : [],
            summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 400) : '', button: raw.button && N.link(raw.button.url) ? { label: String(raw.button.label || '').slice(0, 40), url: raw.button.url } : null,
            publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : null, closedAt: typeof raw.closedAt === 'string' ? raw.closedAt : null, image
        }
    }

    /** The page as it is kept once the notice is closed: same picture, much smaller (it is rarely opened again, and opening it may take a moment). */
    async function squeeze(source, target) {
        try {
            await sharpLib()(source).resize({ width: ARCHIVE_WIDTH, withoutEnlargement: true }).webp({ quality: ARCHIVE_QUALITY, effort: 6, smartSubsample: true }).toFile(target)
        } catch (err) {
            state.log.debug('The page could not be squeezed; it is kept as it is.', err)
            fs.copyFileSync(source, target)
        }
    }

    async function archiveNotice(notice) {
        const source = imageFile(notice)
        const previous = mem.archive.find((a) => a.id === notice.id)
        let image = null
        if (source && fs.existsSync(source)) {
            fs.mkdirSync(path.join(dir(), ARCHIVE), { recursive: true })
            image = `${notice.id}-${Date.now().toString(36)}.webp`   // never the name of a file the window may still have open
            await squeeze(source, archiveFile(image))
        }
        const entry = {
            id: notice.id, rev: revOf(notice), title: notice.title, severity: notice.severity, general: N.isGeneral(notice), targets: notice.targets, summary: notice.summary || '',
            button: notice.button || null, publishedAt: notice.publishedAt || null, closedAt: new Date().toISOString(), image
        }
        if (previous && previous.image && previous.image !== image) dropArchiveFile(previous)
        mem.archive = [entry, ...mem.archive.filter((a) => a.id !== notice.id)]
        if (source) discard(source)   // the full-size page is not needed any more
        trimArchive()
    }

    /** The oldest go first past the limit; a notice the author edited is a new one, so its old copy goes; files nobody refers to go. */
    function trimArchive() {
        const keep = []
        for (const entry of mem.archive) {
            const live = mem.doc && mem.doc.notices.find((n) => n.id === entry.id)
            if (live && revOf(live) !== entry.rev) { dropArchiveFile(entry); continue }
            keep.push(entry)
        }
        keep.sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))
        for (const extra of keep.splice(ARCHIVE_MAX)) dropArchiveFile(extra)
        mem.archive = keep
        try {
            const used = new Set(keep.map((a) => a.image).filter(Boolean))
            for (const name of fs.readdirSync(path.join(dir(), ARCHIVE))) if (!used.has(name)) discard(archiveFile(name))
        } catch { /* no archive folder yet */ }
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
            if (!target || isClosed(notice)) continue   // a closed notice keeps only its small archived page
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
            for (const name of fs.readdirSync(path.join(dir(), IMAGES))) if (!wanted.has(name)) discard(path.join(dir(), IMAGES, name))
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
            trimArchive()
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
            const image = isClosed(n) ? null : imageFile(n)
            return {
                id: n.id, title: n.title, severity: n.severity, general: N.isGeneral(n), targets: n.targets, summary: n.summary,
                button: n.button || null, publishedAt: N.shownAt(n), expiresAt: n.expiresAt,
                image: image && fs.existsSync(image) ? image : null,
                state: mark && mark.rev === revOf(n) ? mark.state : 'unread'
            }
        })
        const archive = mem.archive.map((a) => ({ ...a, image: a.image && fs.existsSync(archiveFile(a.image)) ? archiveFile(a.image) : null }))
        const modpacks = {}
        for (const [id, entry] of Object.entries(mem.doc ? mem.doc.modpacks : {})) modpacks[id] = { access: accessFor(id), novedades: entry.novedades || null }
        const gate = accessFor('')
        return {
            online: mem.online, fetchedAt: mem.fetchedAt, serverNow: new Date(now).toISOString(),
            launcher: { minVersion: mem.doc ? mem.doc.launcher.minVersion || null : null, blocked: gate.state === 'launcher', message: gate.state === 'launcher' ? gate.message : null, novedades: mem.doc ? mem.doc.launcher.novedades || null : null },
            notices, archive, modpacks
        }
    }

    handlers.set('notices.get', async () => view())
    handlers.set('notices.refresh', async () => { await refresh(); return view() })
    handlers.set('notices.mark', async ({ id, state: value } = {}) => {
        load()
        if (!['read', 'later', 'closed', 'unread'].includes(value)) throw new EngineError('bad_state', `not a state: ${value}`)
        const notice = mem.doc && mem.doc.notices.find((n) => n.id === id)
        if (!notice) throw new EngineError('no_notice', `no such notice: ${id}`)
        mem.marks[id] = { state: value, rev: revOf(notice) }
        for (const known of Object.keys(mem.marks)) if (!mem.doc.notices.some((n) => n.id === known)) delete mem.marks[known]   // forget the ones that are gone
        if (value === 'closed') await archiveNotice(notice)
        save()
        return view()
    })

    // The rest of the engine asks this before it starts anything (game.start): a sentence when playing is not allowed, null when it is.
    state.notices = { gateFor: (serverId) => { load(); return N.blockingMessage(accessFor(serverId)) }, access: (serverId) => { load(); return accessFor(serverId) } }
}

module.exports = { register }
