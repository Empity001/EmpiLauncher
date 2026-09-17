const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const config = require('./lib/config')
const { publishLauncher } = require('./lib/publishLauncher')
const { publishPacks } = require('./lib/publishPacks')

const PORT = 4848
const PUBLIC_DIR = path.join(__dirname, 'public')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const jobs = new Map()

function createJob(taskFn) {
    const id = crypto.randomUUID()
    const job = { id, lines: [], done: false, error: null, listeners: new Set() }
    jobs.set(id, job)

    const log = (line) => {
        for (const text of String(line).split(/\r?\n/)) {
            job.lines.push(text)
            for (const res of job.listeners) res.write(`data: ${JSON.stringify({ line: text })}\n\n`)
        }
    }

    taskFn(log)
        .then((result) => {
            job.done = true
            job.result = result
            for (const res of job.listeners) res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`)
        })
        .catch((err) => {
            job.done = true
            job.error = err.message
            for (const res of job.listeners) res.write(`data: ${JSON.stringify({ done: true, error: err.message })}\n\n`)
        })

    return id
}

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {})
            } catch (err) {
                reject(err)
            }
        })
        req.on('error', reject)
    })
}

function serveStatic(req, res) {
    const filePath = req.url === '/' ? '/index.html' : req.url
    const resolved = path.join(PUBLIC_DIR, filePath)
    if (!resolved.startsWith(PUBLIC_DIR) || !fs.existsSync(resolved)) {
        res.writeHead(404)
        res.end('Not found')
        return
    }
    const ext = path.extname(resolved)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(resolved).pipe(res)
}

const server = http.createServer(async (req, res) => {
    try {
        if (req.url === '/api/config' && req.method === 'GET') {
            return sendJson(res, 200, config.load())
        }

        if (req.url === '/api/config' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const current = config.load()
            const merged = { ...current, ...body }
            config.save(merged)
            return sendJson(res, 200, merged)
        }

        if (req.url === '/api/jobs/launcher' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const id = createJob((log) => publishLauncher(config.load(), body, log))
            return sendJson(res, 200, { jobId: id })
        }

        if (req.url === '/api/jobs/packs' && req.method === 'POST') {
            const body = await readJsonBody(req)
            const id = createJob((log) => publishPacks(config.load(), body, log))
            return sendJson(res, 200, { jobId: id })
        }

        const streamMatch = req.url.match(/^\/api\/jobs\/([a-f0-9-]+)\/stream$/)
        if (streamMatch && req.method === 'GET') {
            const job = jobs.get(streamMatch[1])
            if (!job) return sendJson(res, 404, { error: 'Job not found' })

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive'
            })
            for (const line of job.lines) res.write(`data: ${JSON.stringify({ line })}\n\n`)
            if (job.done) {
                res.write(`data: ${JSON.stringify({ done: true, error: job.error, result: job.result })}\n\n`)
                return res.end()
            }
            job.listeners.add(res)
            req.on('close', () => job.listeners.delete(res))
            return
        }

        return serveStatic(req, res)
    } catch (err) {
        sendJson(res, 500, { error: err.message })
    }
})

server.listen(PORT, () => {
    console.log(`EmpiLauncher Publisher: http://localhost:${PORT}`)
})
