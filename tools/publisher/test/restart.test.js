// node --test tools/publisher/test/*.test.js
// Opening the Publisher while an OLDER copy of it is still open (its page stays reachable, so it looks new, but it runs the code it started
// with) must replace that copy instead of showing it. Real processes on a spare port, with a throwaway home so no real settings are read.
const test = require('node:test')
const assert = require('node:assert')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')

const PORT = 4953
const SERVER = path.join(__dirname, '..', 'server.js')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-restart-'))
const children = []

function start(build) {
    const child = spawn(process.execPath, [SERVER, '--no-open'], { env: { ...process.env, PUBLISHER_PORT: String(PORT), PUBLISHER_BUILD: build, EMPI_PUBLISHER_HOME: home }, stdio: 'ignore' })
    children.push(child)
    child.exited = new Promise((resolve) => child.once('exit', resolve))
    return child
}

function call(method, url) {
    return new Promise((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port: PORT, path: url, method, headers: { Host: `localhost:${PORT}` }, timeout: 1500 }, (res) => {
            let body = ''
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }) } catch { resolve({ status: res.statusCode, body: null }) } })
        })
        request.on('timeout', () => request.destroy(new Error('timeout')))
        request.on('error', reject)
        request.end()
    })
}

async function untilBuild(build, ms = 8000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
        try { const answer = await call('GET', '/api/build'); if (answer.body && answer.body.build === build) return true } catch { /* not up yet */ }
        await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return false
}

const alive = (child) => child.exitCode === null && child.signalCode === null
const within = (promise, ms) => Promise.race([promise.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), ms))])

test.after(() => {
    for (const child of children) { try { child.kill() } catch { /* gone */ } }
    fs.rmSync(home, { recursive: true, force: true })
})

test('a newer copy asks the older one that is open to leave, and takes its place', async () => {
    const older = start('100')
    assert.ok(await untilBuild('100'), 'the first copy came up')
    const newer = start('200')
    assert.ok(await within(older.exited, 8000), 'the older copy left')
    assert.ok(await untilBuild('200'), 'the newer copy is now the one answering')
    assert.ok(alive(newer))
})

test('a copy with the same code does not disturb the one that is open: it just goes away', async () => {
    const same = start('200')
    assert.ok(await within(same.exited, 8000), 'the second copy of the same code left')
    assert.ok(await untilBuild('200'), 'the first is still there')
})

test('an older Publisher that cannot be asked to leave (from before this existed) is left alone, and the new one goes away', async () => {
    await call('POST', '/api/quit').catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 800))
    // stand-in for an old Publisher: it has the port and answers "not found" to everything it does not know
    const old = http.createServer((req, res) => { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"No encontrado"}') })
    await new Promise((resolve) => old.listen(PORT, '127.0.0.1', resolve))
    try {
        const newer = start('300')
        assert.ok(await within(newer.exited, 8000), 'the new one gave up')
        const still = await call('GET', '/api/build')
        assert.strictEqual(still.status, 404, 'the old one is untouched')
    } finally {
        await new Promise((resolve) => old.close(resolve))
    }
})
