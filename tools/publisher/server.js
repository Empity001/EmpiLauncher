const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { exec } = require('child_process')

const config = require('./lib/config')
const nebula = require('./lib/nebula')
const packs = require('./lib/packs')
const launcher = require('./lib/launcher')
const versions = require('./lib/versions')
const protection = require('./lib/protection')
const profiles = require('./lib/profiles')
const appearance = require('./lib/appearance')
const gh = require('./lib/gh')
const { capture, runInJob, killTree } = require('./lib/exec')

const PORT = Number(process.env.PUBLISHER_PORT) || 4848
const HOST = '127.0.0.1'
const PUBLIC_DIR = path.join(__dirname, 'public')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`])

// ------------------------------------------------------------------ jobs
// One long task at a time (nebula, git and electron-builder don't like company). Its output is
// kept as a list of events so a reloaded page can pick the log back up.

const jobs = new Map()
let activeJob = null
const MAX_EVENTS = 4000

class HttpError extends Error {
    constructor(status, message) {
        super(message)
        this.status = status
    }
}

function jobSummary(job) {
    return job && { id: job.id, title: job.title, done: job.done, error: job.error, startedAt: job.startedAt }
}

function startJob(title, task) {
    if (activeJob && !activeJob.done) throw new HttpError(409, `Ya hay una tarea en marcha: ${activeJob.title}`)

    const job = {
        id: crypto.randomUUID(), title, startedAt: Date.now(), events: [], done: false, error: null, result: null,
        listeners: new Set(), store: { children: new Set(), cancelled: false }
    }
    jobs.set(job.id, job)
    activeJob = job

    const emit = (event) => {
        job.events.push(event)
        if (job.events.length > MAX_EVENTS) job.events.shift()
        for (const res of job.listeners) res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    const log = (text) => { for (const line of String(text).split(/\r?\n/)) emit({ line }) }
    const step = (name) => emit({ step: name })
    const finish = (extra) => {
        job.done = true
        Object.assign(job, extra)
        emit({ done: true, error: job.error, result: job.result })
        for (const res of job.listeners) res.end()
        job.listeners.clear()
    }

    runInJob(job.store, () => task(log, step))
        .then((result) => finish({ result: result ?? null }))
        .catch((err) => finish({ error: job.store.cancelled ? 'Cancelado.' : err.message }))

    return job
}

function cancelJob(job) {
    job.store.cancelled = true
    for (const child of job.store.children) killTree(child)
}

// ------------------------------------------------------------------ presence
// The tool exists only while its page is open: once the tab closes (and nothing is running) it exits,
// so it never sits in the background eating memory.

const presence = new Set()
let idleTimer = null

function scheduleExit(delayMs) {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
        if (presence.size === 0 && !(activeJob && !activeJob.done)) process.exit(0)
        scheduleExit(20000)
    }, delayMs)
}

setInterval(() => { for (const res of presence) res.write(': ping\n\n') }, 15000).unref()

// ------------------------------------------------------------------ helpers

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
}

async function readJson(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8')
    return text ? JSON.parse(text) : {}
}

async function health() {
    const current = config.load()
    const env = nebula.env(current)
    const [git, ghOk] = await Promise.all([
        capture('git', ['--version']).then(() => true, () => false),
        gh.authStatus()
    ])
    return {
        git,
        gh: ghOk,
        java: !!env.JAVA_EXECUTABLE && fs.existsSync(env.JAVA_EXECUTABLE),
        nebula: fs.existsSync(path.join(current.nebulaProjectPath, 'node_modules')),
        packsRepo: fs.existsSync(path.join(current.empiPacksRepoPath, '.git')),
        launcherRepo: fs.existsSync(path.join(current.launcherRepoPath, 'package.json'))
    }
}

// ------------------------------------------------------------------ routes

const routes = []
const route = (method, pattern, handler) => {
    const keys = []
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)' })}$`)
    routes.push({ method, regex, keys, handler })
}

route('GET', '/api/health', () => health())
route('GET', '/api/config', () => config.load())
route('POST', '/api/config', async ({ req }) => {
    const merged = { ...config.load(), ...(await readJson(req)) }
    config.save(merged)
    return merged
})

route('GET', '/api/status', () => ({ job: jobSummary(activeJob && !activeJob.done ? activeJob : null), packs: packs.status(config.load()) }))

route('GET', '/api/versions/minecraft', () => versions.minecraft())
route('GET', '/api/versions/loader', ({ query }) => versions.loader(query.get('type'), query.get('mc')))

route('GET', '/api/packs', () => nebula.listPacks(config.load()))
route('GET', '/api/packs/:id', ({ params }) => nebula.getPack(config.load(), params.id))
route('POST', '/api/packs/:id/meta', async ({ req, params }) => nebula.patchMeta(config.load(), params.id, await readJson(req)))
route('POST', '/api/packs/:id/active', async ({ req, params }) => {
    // Moving folders while Nebula, git or a build is reading them would corrupt the run.
    if (activeJob && !activeJob.done) throw new HttpError(409, `Espera a que termine la tarea en marcha: ${activeJob.title}`)
    const { active } = await readJson(req)
    return nebula.setActive(config.load(), params.id, active === true)
})
route('POST', '/api/packs/:id/mods', async ({ req, params, query }) => {
    await nebula.saveMod(config.load(), params.id, query.get('category'), query.get('name'), req)
    return { ok: true }
})
route('DELETE', '/api/packs/:id/mods', ({ params, query }) => {
    nebula.deleteMod(config.load(), params.id, query.get('category'), query.get('name'))
    return { ok: true }
})
route('POST', '/api/packs/:id/mods/move', async ({ req, params }) => {
    const { from, to, name } = await readJson(req)
    nebula.moveMod(config.load(), params.id, from, to, name)
    return { ok: true }
})
route('GET', '/api/packs/:id/files', ({ params }) => nebula.packFiles(config.load(), params.id))
route('POST', '/api/packs/:id/files', async ({ req, params, query }) => {
    await nebula.saveFile(config.load(), params.id, query.get('folder') || '', query.get('name'), req)
    return nebula.packFiles(config.load(), params.id)
})
route('DELETE', '/api/packs/:id/files', ({ params, query }) => {
    nebula.deleteFile(config.load(), params.id, query.get('folder') || '', query.get('name'))
    return nebula.packFiles(config.load(), params.id)
})
route('POST', '/api/packs/:id/icon', async ({ req, params }) => {
    await nebula.saveIcon(config.load(), params.id, req)
    return { ok: true }
})
route('POST', '/api/packs/:id/open', async ({ req, params }) => ({ folder: nebula.openFolder(config.load(), params.id, (await readJson(req)).what) }))

route('GET', '/api/packs/:id/protection', ({ params }) => protection.describe(config.load(), params.id))
route('POST', '/api/packs/:id/protection', async ({ req, params }) => protection.save(config.load(), params.id, await readJson(req)))

route('GET', '/api/packs/:id/profiles', ({ params }) => profiles.describe(config.load(), params.id))
route('POST', '/api/packs/:id/profiles', async ({ req, params }) => profiles.save(config.load(), params.id, (await readJson(req)).profiles))

route('GET', '/api/packs/:id/visuals', ({ params }) => appearance.info(config.load(), params.id))
route('POST', '/api/packs/:id/visual', ({ req, params, query }) => appearance.save(config.load(), params.id, query.get('kind'), query.get('ext'), req))
route('DELETE', '/api/packs/:id/visual', ({ params, query }) => {
    appearance.remove(config.load(), params.id, query.get('kind'))
    return appearance.info(config.load(), params.id)
})

route('POST', '/api/jobs/create-pack', async ({ req }) => {
    const body = await readJson(req)
    const job = startJob(`Crear ${body.id}`, (log, step) => nebula.createPack(config.load(), body, log, step))
    return { jobId: job.id }
})
route('POST', '/api/jobs/compile-packs', () => ({ jobId: startJob('Compilar modpacks', (log, step) => packs.compile(config.load(), {}, log, step)).id }))
route('POST', '/api/jobs/send-packs', async ({ req }) => {
    const body = await readJson(req)
    return { jobId: startJob('Enviar modpacks', (log, step) => packs.send(config.load(), body, log, step)).id }
})

route('GET', '/api/launcher', () => launcher.info(config.load()))
route('POST', '/api/jobs/compile-launcher', async ({ req }) => {
    const body = await readJson(req)
    return { jobId: startJob('Compilar el launcher', (log, step) => launcher.compile(config.load(), body, log, step)).id }
})
route('POST', '/api/jobs/send-launcher', async ({ req }) => {
    const body = await readJson(req)
    return { jobId: startJob('Enviar el launcher', (log, step) => launcher.send(config.load(), body, log, step)).id }
})

route('POST', '/api/jobs/:id/cancel', ({ params }) => {
    const job = jobs.get(params.id)
    if (!job) throw new HttpError(404, 'Tarea no encontrada')
    cancelJob(job)
    return { ok: true }
})

// Streams (SSE) and files bypass the JSON wrapper.
function handleStream(req, res, jobId) {
    const job = jobs.get(jobId)
    if (!job) return sendJson(res, 404, { error: 'Tarea no encontrada' })
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    for (const event of job.events) res.write(`data: ${JSON.stringify(event)}\n\n`)
    if (job.done) return res.end()
    job.listeners.add(res)
    req.on('close', () => job.listeners.delete(res))
}

function handlePresence(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
    res.write(': hello\n\n')
    presence.add(res)
    clearTimeout(idleTimer)
    req.on('close', () => {
        presence.delete(res)
        if (presence.size === 0) scheduleExit(45000)
    })
}

function serveFile(res, file, mime) {
    res.writeHead(200, { 'Content-Type': mime || MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
}

function serveStatic(res, pathname) {
    const resolved = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname)
    if (!resolved.startsWith(PUBLIC_DIR) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.writeHead(404)
        return res.end('Not found')
    }
    serveFile(res, resolved)
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`)
    try {
        // Only this machine's own page may drive the API (blocks other sites and DNS-rebinding tricks).
        if (url.pathname.startsWith('/api/')) {
            if (!ALLOWED_HOSTS.has(req.headers.host)) throw new HttpError(403, 'Host no permitido')
            if (req.method !== 'GET' && req.headers.origin && !ALLOWED_HOSTS.has(new URL(req.headers.origin).host)) {
                throw new HttpError(403, 'Origen no permitido')
            }
        }

        if (req.method === 'GET' && url.pathname === '/api/presence') return handlePresence(req, res)
        const streamMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)\/stream$/)
        if (req.method === 'GET' && streamMatch) return handleStream(req, res, streamMatch[1])
        const iconMatch = url.pathname.match(/^\/api\/packs\/([^/]+)\/icon$/)
        if (req.method === 'GET' && iconMatch) {
            const icon = nebula.iconPath(config.load(), decodeURIComponent(iconMatch[1]))
            return icon ? serveFile(res, icon) : sendJson(res, 404, { error: 'Sin icono' })
        }
        const visualMatch = url.pathname.match(/^\/api\/packs\/([^/]+)\/visual$/)
        if (req.method === 'GET' && visualMatch) {
            const found = appearance.find(config.load(), decodeURIComponent(visualMatch[1]), url.searchParams.get('kind'))
            return found ? serveFile(res, found.file, found.mime) : sendJson(res, 404, { error: 'Sin imagen' })
        }

        for (const candidate of routes) {
            if (candidate.method !== req.method) continue
            const match = url.pathname.match(candidate.regex)
            if (!match) continue
            const params = {}
            candidate.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]) })
            const result = await candidate.handler({ req, res, params, query: url.searchParams })
            return sendJson(res, 200, result ?? { ok: true })
        }

        if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return serveStatic(res, decodeURIComponent(url.pathname))
        sendJson(res, 404, { error: 'No encontrado' })
    } catch (err) {
        sendJson(res, err.status || 500, { error: err.message })
    }
})

function openBrowser() {
    if (process.argv.includes('--no-open')) return
    if (process.platform === 'win32') exec(`start "" http://localhost:${PORT}`)
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        // Already running (e.g. the old copy is still in its 45s grace after the tab closed):
        // bring its page up instead of starting a second one. The exit is delayed so the
        // browser launch, which runs in a child process, is not cut off.
        openBrowser()
        setTimeout(() => process.exit(0), 2500)
        return
    }
    throw err
})

// A crash used to vanish with its minimized window; leave the reason where Publicar.bat can show it.
process.on('uncaughtException', (err) => {
    try { fs.appendFileSync(path.join(os.homedir(), '.empilauncher-publisher.log'), `${new Date().toISOString()} ${err.stack || err}\n`) } catch { /* nothing more to do */ }
    process.exit(1)
})

server.listen(PORT, HOST, () => {
    console.log(`Empi Publisher: http://localhost:${PORT}  (se cierra solo al cerrar la pagina)`)
    scheduleExit(120000)
    openBrowser()
})
