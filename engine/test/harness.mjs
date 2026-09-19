// Shared by the engine tests that need to drive a real operation: starts the engine the way the native UI does
// (isolated user-data AND data directory, so no test can touch the real installation) and gives back a tiny client.
import { spawn, execFileSync } from 'node:child_process'
import net from 'node:net'
import crypto from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export async function startEngine({ label = 'test', env = {} } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `empi-${label}-`))
    const pipe = `empi-engine-${label}-${process.pid}`
    const token = crypto.randomBytes(16).toString('hex')
    const runtime = process.env.ENGINE_NODE || process.execPath
    const engine = spawn(runtime, [path.join(here, '..', 'src', 'main.js'), '--pipe', pipe, '--token', token, '--user-data', path.join(root, 'user'), '--data-dir', path.join(root, 'data'), '--app-version', '0.0.0-test'],
        { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    let output = ''
    engine.stdout.on('data', (d) => { output += d })
    engine.stderr.on('data', (d) => { output += d })
    await new Promise((resolve, reject) => {
        engine.stdout.on('data', (d) => { if (String(d).includes('ENGINE_READY')) resolve() })
        engine.on('exit', (code) => reject(new Error(`engine exited early (${code})\n${output}`)))
        setTimeout(() => reject(new Error('engine did not become ready in 15 s')), 15000)
    })

    const socket = net.connect(`\\\\.\\pipe\\${pipe}`)
    await new Promise((r) => socket.once('connect', r))
    const waiting = new Map()
    const events = []
    let buffer = ''
    let id = 0
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
        buffer += chunk
        let i
        while ((i = buffer.indexOf('\n')) >= 0) {
            const message = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1)
            if (message.id != null && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id) } else events.push({ ...message, at: Date.now() })
        }
    })
    const call = (method, params = {}) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); socket.write(JSON.stringify({ id: n, method, params }) + '\n') })
    const waitFor = async (predicate, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const hit = events.find(predicate); if (hit) return hit; await new Promise((r) => setTimeout(r, 100)) } return null }
    await call('engine.hello', { token, client: label })

    return {
        call, events, waitFor, output: () => output, root, pid: engine.pid,
        /** Kills the engine and everything it started (repair receiver, game), then deletes the scratch folders. */
        async stop() {
            socket.destroy()
            try { execFileSync('taskkill', ['/PID', String(engine.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
            await new Promise((r) => setTimeout(r, 600))
            fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
        }
    }
}

export const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) process.exitCode = 1 }
