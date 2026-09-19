/**
 * EmpiLauncher engine: the launcher's logic (helios-core, config, integrity, Java, launch) running headless in plain Node.
 * No Chromium, no window. The native UI starts this process and talks to it over a named pipe (see ipc/server.js).
 *
 *   node engine/src/main.js --pipe <name> --token <secret> [--user-data <dir>] [--data-dir <dir>] [--app-version <x.y.z>]
 */
const path = require('path')

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const pipeName = arg('pipe')
const token = arg('token')
if (!pipeName || !token) {
    process.stderr.write('usage: node main.js --pipe <name> --token <secret> [--user-data <dir>] [--data-dir <dir>] [--app-version <x.y.z>]\n')
    process.exit(2)
}

// The reused launcher modules must see the shim before they are loaded.
// The classic ProcessBuilder mirrors Minecraft's output to the console when it thinks it runs from a checkout
// (isdev.js looks for node_modules/electron in the exe path). The engine's stdout belongs to the UI: never do that here.
if (!('ELECTRON_IS_DEV' in process.env)) process.env.ELECTRON_IS_DEV = '0'

const shim = require('./shim/install')
shim.__configure({ userDataDir: arg('user-data'), version: arg('app-version') })

// The classic launcher's own modules are required lazily from here, relative to the repository root.
const appJs = path.join(__dirname, '..', '..', 'app', 'assets', 'js')
const { LoggerUtil } = require('helios-core')
const log = LoggerUtil.getLogger('Engine')

const { createServer } = require('./ipc/server')
const handlers = new Map()
const state = { started: Date.now(), keepAlive: new Set(), appJs, shim, log, dataDir: arg('data-dir') }

require('./handlers/core').register(handlers, state)
require('./handlers/distro').register(handlers, state)
require('./handlers/game').register(handlers, state)

const ipc = createServer({
    pipeName, token, handlers, log,
    onIdle: () => {
        if (state.keepAlive.size === 0) { log.info('UI disconnected, exiting.'); process.exit(0) }
    }
})
state.ipc = ipc

ipc.listen().then(() => {
    // The UI waits for this line on stdout before it connects.
    process.stdout.write(`ENGINE_READY ${pipeName}\n`)
}).catch((err) => {
    process.stderr.write(`ENGINE_FAILED ${err.message}\n`)
    process.exit(1)
})

process.on('uncaughtException', (err) => { log.error('uncaught exception', err) })
process.on('unhandledRejection', (err) => { log.error('unhandled rejection', err) })
process.on('SIGTERM', () => process.exit(0))
