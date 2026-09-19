// node engine/test/update.mjs
// update.install against a local server that stands in for GitHub: it must download the installer, refuse it if its sha512 does
// not match latest.yml, refuse a name that is not a plain file, and never start anything in this test (EMPI_UPDATE_NO_RUN).
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { startEngine, check } from './harness.mjs'

const payload = crypto.randomBytes(3 * 1024 * 1024)                     // 3 MB of "installer"
const good = crypto.createHash('sha512').update(payload).digest('base64')
let published = { name: 'Empi-Launcher-setup-99.0.0.exe', sha512: good, size: payload.length }
let stall = false

const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url)
    if (url.endsWith('/latest.yml')) {
        res.end(`version: 99.0.0\nfiles:\n  - url: ${published.name}\n    sha512: ${published.sha512}\n    size: ${published.size}\npath: ${published.name}\nsha512: ${published.sha512}\nreleaseDate: '2026-09-19T00:00:00.000Z'\n`)
    } else if (url.endsWith('.exe')) {
        res.setHeader('content-length', payload.length)
        if (stall) { res.write(payload.subarray(0, 1024 * 1024)); return }   // a connection that goes quiet half way
        res.end(payload)
    } else { res.statusCode = 404; res.end() }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`

const engine = await startEngine({ label: 'update-install', env: { EMPI_UPDATE_URL: url, EMPI_ENGINE_TEST: '1', EMPI_UPDATE_NO_RUN: '1' } })
try {
    const done = await engine.call('update.install')
    check('downloads the installer and verifies its sha512', done.ok && done.result.launched === false && fs.existsSync(done.result.file) && fs.statSync(done.result.file).size === payload.length, JSON.stringify(done.result ?? done.error))
    check('the file lands under the launcher data folder, not somewhere else', done.ok && done.result.file.startsWith(path.join(engine.root, 'user', 'updates')), done.result?.file)
    check('progress events were sent', engine.events.some((e) => e.event === 'update.progress' && e.data.stage === 'ready'))
    check('no leftover .part file', done.ok && !fs.existsSync(`${done.result.file}.part`))

    published = { ...published, sha512: crypto.createHash('sha512').update('something else').digest('base64') }
    const bad = await engine.call('update.install')
    check('a wrong sha512 is refused', bad.ok === false && bad.error.code === 'bad_checksum', JSON.stringify(bad.error))
    check('and the bad file is not kept', !fs.readdirSync(path.join(engine.root, 'user', 'updates')).length)

    published = { name: '..\\..\\evil.exe', sha512: good, size: payload.length }
    const evil = await engine.call('update.install')
    check('an installer name with a path is refused', evil.ok === false && evil.error.code === 'bad_channel', JSON.stringify(evil.error))

    published = { name: 'Empi-Launcher-setup-99.0.0.exe', sha512: '', size: payload.length }
    const noHash = await engine.call('update.install')
    check('an update without a sha512 is not installed', noHash.ok === false && noHash.error.code === 'bad_channel', JSON.stringify(noHash.error))

    published = { name: 'Empi-Launcher-setup-99.0.0.exe', sha512: good, size: payload.length }
    stall = true
    const pending = engine.call('update.install')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await engine.call('update.cancel')
    const cancelled = await pending
    check('a download can be cancelled', cancelled.ok === false && cancelled.error.code === 'cancelled', JSON.stringify(cancelled.error))
    check('and leaves no file behind', !fs.readdirSync(path.join(engine.root, 'user', 'updates')).length)
    stall = false
    const again = await engine.call('update.install')
    check('after a cancel the next update works', again.ok && again.result.launched === false, JSON.stringify(again.error))

    const spawned = await engine.call('test.spawnFake', { script: 'setInterval(() => {}, 1000)' })
    if (spawned.ok) {
        const refused = await engine.call('update.install')
        check('nothing is installed while the game runs', refused.ok === false && refused.error.code === 'game_running', JSON.stringify(refused.error))
    } else check('test.spawnFake is available', false, JSON.stringify(spawned.error))
} finally {
    await engine.stop()
    server.close()
}
