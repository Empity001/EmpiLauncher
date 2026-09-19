// node engine/test/smoke.mjs [--user-data <dir>]
// Starts the engine like the native UI will, talks to it over the named pipe, and checks the basics end to end.
import { spawn } from 'node:child_process'
import net from 'node:net'
import crypto from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startEngine } from './harness.mjs'
const startUpdateEngine = (url) => startEngine({ label: 'update', env: { EMPI_UPDATE_URL: url } })

const here = path.dirname(fileURLToPath(import.meta.url))
const main = process.env.ENGINE_MAIN || path.join(here, '..', 'src', 'main.js')
const argIndex = process.argv.indexOf('--user-data')
const userData = argIndex >= 0 ? process.argv[argIndex + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'empi-engine-'))
const dataDir = path.join(userData, 'data')   // isolated on purpose: the real game installation must never be touched by a test
const pipe = `empi-engine-test-${process.pid}`
const token = crypto.randomBytes(16).toString('hex')

const engine = spawn(process.env.ENGINE_NODE || process.execPath, [main, '--pipe', pipe, '--token', token, '--user-data', userData, '--data-dir', dataDir, '--app-version', '0.0.0-test'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } })
let stderr = ''
let stdout = ''
engine.stderr.on('data', (d) => { stderr += d })
engine.stdout.on('data', (d) => { stdout += d })
await new Promise((resolve, reject) => {
    engine.stdout.on('data', (d) => { if (String(d).includes('ENGINE_READY')) resolve() })
    engine.on('exit', (code) => reject(new Error(`engine exited early (${code})\n${stderr}`)))
    setTimeout(() => reject(new Error('engine did not become ready in 15 s')), 15000)
})

const socket = net.connect(`\\\\.\\pipe\\${pipe}`)
await new Promise((r) => socket.once('connect', r))
let buffer = ''
const waiting = new Map(); const events = []
let id = 0
socket.setEncoding('utf8')
socket.on('data', (chunk) => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
        const message = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1)
        if (message.id != null && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id) } else events.push(message)
    }
})
const call = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); socket.write(JSON.stringify({ id: n, method, params }) + '\n') })
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) process.exitCode = 1 }

const hello = await call('engine.hello', { token, client: 'smoke' })
check('hello', hello.ok && hello.result.protocol === 1, JSON.stringify(hello.result))
check('unknown method is an error, not a crash', (await call('nope.nothing')).error?.code === 'unknown_method')
const config = await call('config.get')
check('config.get', config.ok && config.result.settings && 'selectedServer' in config.result.settings, `data dir ${config.result?.commonDirectory}`)
const distro = await call('distro.load')
check('distro.load reads the real EmpiPacks index', distro.ok && distro.result.servers.length > 0, distro.ok ? `${distro.result.servers.length} modpacks in ${distro.result.tookMs} ms: ${distro.result.servers.map((s) => s.name).join(', ')}` : JSON.stringify(distro.error))
if (distro.ok) {
    const first = distro.result.servers[0]
    check('modpack fields the UI needs', first.id && first.name && first.minecraftVersion && first.version && 'visuals' in first, `${first.name} v${first.version} mc ${first.minecraftVersion} accent ${first.accent}`)
    const theme = await call('distro.theme', { id: first.id })
    check('distro.theme', theme.ok, JSON.stringify(theme.result))
}
const waitFor = async (predicate, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const hit = events.find(predicate); if (hit) return hit; await new Promise((r) => setTimeout(r, 100)) } return null }

const idle = await call('game.status')
check('game.status starts idle', idle.ok && idle.result.phase === 'idle', JSON.stringify(idle.result))
const packStatus = await call('pack.status')
check('pack.status on a clean data folder offers play', packStatus.ok && packStatus.result.action === 'play' && !packStatus.result.installed, JSON.stringify(packStatus.result))

// Play with no account saved: exercises pack check, Java discovery and the index refresh without downloading anything.
const start = await call('game.start', { mode: 'play' })
check('game.start is accepted', start.ok && start.result.started === true, JSON.stringify(start.result ?? start.error))
const ended = await waitFor((e) => e.event === 'game.failure' || e.event === 'game.needJava', 45000)
check('play without an account ends in a clear message, not a crash', ended != null && (ended.event === 'game.needJava' || ended.data.code === 'no_account'), ended ? `${ended.event} ${JSON.stringify(ended.data)}` : 'no event in 45 s')
check('phases seen', events.some((e) => e.event === 'game.state' && e.data.phase === 'launching'), events.filter((e) => e.event === 'game.state').map((e) => e.data.phase).join(' > '))
check('progress events carried text', events.some((e) => e.event === 'game.progress' && e.data.text), events.filter((e) => e.event === 'game.progress' && e.data.text).map((e) => e.data.stage).join(', '))
await new Promise((r) => setTimeout(r, 400))
const after = await call('game.status')
check('back to idle afterwards', after.ok && after.result.phase === 'idle', JSON.stringify(after.result))
const busyTwice = await call('game.stop')
check('game.stop with nothing running is harmless', busyTwice.ok && busyTwice.result.stopped === false)

// ---- Settings ----
const java = await call('settings.java')
check('settings.java gives sliders and Java requirement', java.ok && java.result.absoluteMaxGb > 0 && java.result.suggestedMajor > 0, JSON.stringify(java.result))
const raised = await call('settings.java.set', { minRAMGb: 2.5, maxRAMGb: 1.5, jvmOptions: '-XX:+UseZGC   -Dfoo=bar' })
check('settings.java.set keeps max >= min and converts units', raised.ok && raised.result.minRAMGb === 2.5 && raised.result.maxRAMGb === 2.5 && raised.result.jvmOptions.join(' ') === '-XX:+UseZGC -Dfoo=bar', JSON.stringify(raised.result))
check('config.validate rejects a bad width', (await call('config.validate', { key: 'gameWidth', value: 'abc' })).result.valid === false)
const modsList = await call('mods.list')
check('mods.list', modsList.ok && Array.isArray(modsList.result.required) && Array.isArray(modsList.result.optional), modsList.ok ? `${modsList.result.required.length} required, ${modsList.result.optional.length} optional, ${modsList.result.dropins.mods.length} drop-ins, shaders ${modsList.result.shaders.packs.length}` : JSON.stringify(modsList.error))
const firstOptional = modsList.ok ? modsList.result.optional[0] : null
if (firstOptional) {
    const flipped = await call('mods.set', { path: firstOptional.path, enabled: !firstOptional.enabled })
    const again = await call('mods.list')
    check('mods.set flips an optional mod and it persists', flipped.ok && again.result.optional[0].enabled === !firstOptional.enabled, firstOptional.name)
}
if (modsList.ok) {
    const modsDir = modsList.result.dropins.dir
    const source = path.join(userData, 'incoming'); fs.mkdirSync(source, { recursive: true })
    fs.writeFileSync(path.join(source, 'demo-mod.jar'), 'x'); fs.writeFileSync(path.join(source, 'notes.txt'), 'x')
    await call('dropins.add', { paths: [path.join(source, 'demo-mod.jar'), path.join(source, 'notes.txt')] })
    check('dropins.add moves only mod files', fs.existsSync(path.join(modsDir, 'demo-mod.jar')) && !fs.existsSync(path.join(modsDir, 'notes.txt')))
    await call('dropins.toggle', { fullName: 'demo-mod.jar', enabled: false })
    check('dropins.toggle disables by renaming', fs.existsSync(path.join(modsDir, 'demo-mod.jar.disabled')))
    const listed = await call('mods.list')
    check('disabled drop-in is listed as disabled', listed.result.dropins.mods.some((m) => m.name === 'demo-mod.jar' && m.disabled))
    const escape = await call('dropins.resolve', { fullName: '..\\..\\config.json' })
    check('dropins.resolve refuses to leave the mods folder', escape.ok === false && escape.error.code === 'bad_path', JSON.stringify(escape.error))
    const ok = await call('dropins.resolve', { fullName: 'demo-mod.jar.disabled' })
    check('dropins.resolve returns the real path', ok.ok && ok.result.path.endsWith('demo-mod.jar.disabled'))
    await call('shaders.select', { name: 'OFF' })
    check('shaders.select writes the option file', fs.existsSync(path.join(path.dirname(modsDir), 'optionsshaders.txt')))
}

// ---- updates: a local server stands in for GitHub ----
{
    const http = await import('node:http')
    const yml = (version) => `version: ${version}\nfiles:\n  - url: Empi-Launcher-setup-${version}.exe\n    sha512: abc123==\n    size: 123456\npath: Empi-Launcher-setup-${version}.exe\nsha512: abc123==\nreleaseDate: '2026-09-18T00:00:00.000Z'\n`
    let served = '99.0.0'
    const server = http.createServer((req, res) => { if (req.url.endsWith('/latest.yml') && served) { res.end(yml(served)) } else { res.statusCode = 404; res.end() } })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server.address().port}`
    const updater = await startUpdateEngine(url)
    const newer = await updater.call('update.check')
    check('update.check offers a newer version', newer.ok && newer.result.available === true && newer.result.version === '99.0.0' && newer.result.installer.endsWith('.exe') && newer.result.size === 123456, JSON.stringify(newer.result))
    served = '0.0.0-alpha'   // the test engine reports 0.0.0-test, which is newer
    const older = await updater.call('update.check')
    check('update.check does not offer an older version', older.ok && older.result.available === false, JSON.stringify(older.result))
    served = null   // nothing published
    const none = await updater.call('update.check')
    check('a missing channel file is "no update", not an error', none.ok && none.result.available === false && none.result.reason === 'no_channel', JSON.stringify(none.result))
    await updater.stop(); server.close()
}

const mem = await call('engine.memory')
check('engine memory', mem.ok, JSON.stringify(mem.result))
await call('engine.shutdown')
socket.end()
if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + (stdout + stderr).slice(-4000))
setTimeout(() => { engine.kill(); process.exit() }, 800)
