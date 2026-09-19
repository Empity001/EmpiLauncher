/**
 * Runs the Electron sign-in helper (engine/auth-helper) and returns what it reported.
 * Chromium exists only while this promise is pending.
 */
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const HELPER_DIR = path.join(__dirname, '..', '..', 'auth-helper')
const TIMEOUT_MS = 10 * 60 * 1000

/** The Electron binary that can show the window: told explicitly, or the one running the engine, or the development install. */
function findElectron(hint) {
    if (hint && fs.existsSync(hint)) return hint
    if (process.versions.electron) return process.execPath
    const dev = path.join(__dirname, '..', '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe')
    if (fs.existsSync(dev)) return dev
    return null
}

/**
 * @param {'login'|'logout'} mode
 * @param {{ electron?: string, userDataDir: string, clientId?: string, onStart?: (child) => void }} options
 * @returns {Promise<{type: 'result'|'loggedout'|'cancelled', query?: object}>}
 */
function runAuthHelper(mode, { electron, userDataDir, clientId, onStart }) {
    return new Promise((resolve, reject) => {
        const exe = findElectron(electron)
        if (!exe) { reject(new Error('Electron was not found: the sign-in window cannot be opened.')); return }

        fs.mkdirSync(userDataDir, { recursive: true })
        const args = [HELPER_DIR, `--${mode}`, `--user-data-dir=${userDataDir}`]
        if (mode === 'login') args.push('--client-id', clientId)

        // The engine may itself be Electron running as plain Node; the helper must run as a real Electron app.
        const env = { ...process.env }
        delete env.ELECTRON_RUN_AS_NODE

        const child = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })
        if (onStart) onStart(child)

        let out = ''
        let settled = false
        const finish = (value, error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (error) reject(error); else resolve(value)
        }
        const timer = setTimeout(() => { try { child.kill() } catch { /* already gone */ } finish({ type: 'cancelled' }) }, TIMEOUT_MS)

        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
            out += chunk
            // Chromium may print its own lines on stdout too: only a line that is JSON with a "type" is the helper's answer.
            let newline
            while ((newline = out.indexOf('\n')) >= 0) {
                const line = out.slice(0, newline).trim()
                out = out.slice(newline + 1)
                if (!line.startsWith('{')) continue
                try {
                    const message = JSON.parse(line)
                    if (message && typeof message.type === 'string') finish(message)
                } catch { /* not ours */ }
            }
        })
        child.on('error', (err) => finish(null, err))
        // Closing the window (or killing the helper) without a result is the player cancelling.
        child.on('exit', () => finish({ type: 'cancelled' }))
    })
}

module.exports = { runAuthHelper, findElectron }
