// node engine/test/footprint.mjs   (ENGINE_NODE=<runtime> to choose the runtime; ELECTRON_RUN_AS_NODE=1 when it is electron.exe)
// Memory of the engine once it has loaded config and the distribution and then sits idle: what the launcher pays while it is open.
import { spawn, execFileSync } from 'node:child_process'
import net from 'node:net'
import crypto from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const main = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.js')
const runtime = process.env.ENGINE_NODE || process.execPath
const pipe = `empi-engine-fp-${process.pid}`
const token = crypto.randomBytes(16).toString('hex')
const engine = spawn(runtime, [main, '--pipe', pipe, '--token', token, '--user-data', fs.mkdtempSync(path.join(os.tmpdir(), 'empi-fp-'))], { stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise((resolve, reject) => { engine.stdout.on('data', (d) => String(d).includes('ENGINE_READY') && resolve()); engine.on('exit', reject); setTimeout(() => reject(new Error('not ready')), 15000) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readMem = () => JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', `$p = Get-Process -Id ${engine.pid}; @{ ws = [math]::Round($p.WorkingSet64/1MB,1); commit = [math]::Round($p.PrivateMemorySize64/1MB,1) } | ConvertTo-Json -Compress`], { encoding: 'utf8' }))

const socket = net.connect(`\\\\.\\pipe\\${pipe}`)
await new Promise((r) => socket.once('connect', r))
let buffer = ''; const waiting = new Map(); let id = 0
socket.setEncoding('utf8')
socket.on('data', (c) => { buffer += c; let i; while ((i = buffer.indexOf('\n')) >= 0) { const m = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1); waiting.get(m.id)?.(m) } })
const call = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); socket.write(JSON.stringify({ id: n, method, params }) + '\n') })

await call('engine.hello', { token })
const before = readMem()
await call('config.get'); await call('distro.load')
await sleep(6000)
const after = readMem()
console.log(`${path.basename(runtime)} ${process.env.ELECTRON_RUN_AS_NODE ? '(electron as node)' : ''}`.padEnd(34),
    `idle before load: ws ${before.ws} MB | after config+distro, settled: ws ${after.ws} MB, commit ${after.commit} MB`)
await call('engine.shutdown')
setTimeout(() => process.exit(), 500)
