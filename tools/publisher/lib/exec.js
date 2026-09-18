const { spawn } = require('child_process')
const { AsyncLocalStorage } = require('async_hooks')
const fs = require('fs')
const path = require('path')

// Every job runs inside its own async context, so a child started anywhere down the call
// chain registers itself here and "Cancelar" can stop it without threading a handle through.
const jobContext = new AsyncLocalStorage()

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g

function runInJob(store, fn) {
    return jobContext.run(store, fn)
}

/** Kills a process and everything it spawned (child.kill() alone leaves Windows grandchildren behind). */
function killTree(child) {
    if (!child || child.exitCode != null || !child.pid) return
    if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
        try { child.kill('SIGTERM') } catch { /* already gone */ }
    }
}

/**
 * Runs a command, streaming each output line to `onLine` as it arrives (for live
 * log UIs), and resolves/rejects based on the exit code.
 */
function run(command, args, options = {}, onLine = () => {}) {
    return new Promise((resolve, reject) => {
        const store = jobContext.getStore()
        if (store && store.cancelled) return reject(new Error('Cancelado'))

        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            shell: false,
            windowsHide: true
        })
        if (store) store.children.add(child)

        let buffer = ''
        const feed = (chunk) => {
            buffer += chunk.toString()
            const lines = buffer.split(/\r?\n|\r/)
            buffer = lines.pop()
            for (const line of lines) {
                const clean = line.replace(ANSI, '')
                if (clean.trim()) onLine(clean)
            }
        }

        child.stdout.on('data', feed)
        child.stderr.on('data', feed)

        child.on('error', (err) => {
            if (store) store.children.delete(child)
            reject(err)
        })
        child.on('close', (code) => {
            if (store) store.children.delete(child)
            const rest = buffer.replace(ANSI, '')
            if (rest.trim()) onLine(rest)
            if (store && store.cancelled) reject(new Error('Cancelado'))
            else if (code === 0) resolve()
            else reject(new Error(`"${path.basename(command)} ${args.join(' ')}" salio con codigo ${code}`))
        })
    })
}

/** Runs a command silently and returns its combined stdout+stderr as a string. */
async function capture(command, args, options = {}) {
    const lines = []
    await run(command, args, options, (line) => lines.push(line))
    return lines.join('\n').trim()
}

/** Runs a node script with the same node that runs this tool (no shell, no .cmd shims). */
function runNode(scriptPath, args, options, onLine) {
    return run(process.execPath, [scriptPath, ...args], options, onLine)
}

/** npm is a .cmd shim on Windows; calling its JS entry point through node avoids needing a shell. */
function npmCliPath() {
    const candidates = [
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function runNpm(args, options, onLine) {
    const cli = npmCliPath()
    if (!cli) return Promise.reject(new Error('No encontre npm junto a Node.'))
    return runNode(cli, args, options, onLine)
}

module.exports = { run, capture, runNode, runNpm, runInJob, killTree }
