/**
 * Informe de fallo local, and the two things that go with a modpack that is over:
 *
 *   report.build     {serverId?}              -> { text }   the report, redacted (lib/report.js). Nothing is sent anywhere.
 *   pack.uninstall.preview {id}               -> { installed, gameBytes, savesBytes, screenshotsBytes }   what "quitar de mi PC" would free
 *   pack.uninstall   {id, includePersonal?}   -> { freedBytes }   deletes the modpack's game files; worlds and screenshots stay unless asked
 */
const fs = require('fs')
const path = require('path')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')
const report = require('../lib/report')
const offline = require('../lib/offline')

const PERSONAL = ['saves', 'screenshots']
const safe = (fn) => { try { return fn() } catch { return null } }

async function sizeOf(target) {
    let total = 0
    let entries
    try { entries = await fs.promises.readdir(target, { withFileTypes: true }) } catch { return 0 }
    for (const entry of entries) {
        const full = path.join(target, entry.name)
        if (entry.isDirectory()) total += await sizeOf(full)
        else { try { total += (await fs.promises.stat(full)).size } catch { /* vanished while counting */ } }
    }
    return total
}

function register(handlers, state) {
    const instanceDirOf = (id) => {
        const { ConfigManager } = ensureCore(state)
        const base = path.resolve(ConfigManager.getInstanceDirectory())
        const target = path.resolve(base, String(id || ''))
        // the id names a folder inside the instances folder, never a path that leaves it
        if (!id || path.dirname(target) !== base) throw new EngineError('bad_id', `not a modpack folder: ${id}`)
        return target
    }
    const mustBeIdle = (id) => {
        const game = state.game
        if (game && (game.phase !== 'idle' || game.proc != null)) throw new EngineError('busy', 'Termina o cierra Minecraft antes de quitar un modpack.')
        if (game && game.serverId === id && game.phase !== 'idle') throw new EngineError('busy', 'Ese modpack está en uso.')
    }

    handlers.set('report.build', async ({ serverId } = {}) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        const id = serverId || state.game?.serverId || ConfigManager.getSelectedServer()
        let server = null
        try { server = (await DistroAPI.getDistribution()).getServerById(id) } catch { /* the index could not be read: the report still works */ }
        const account = offline.currentAccount(ConfigManager)
        const text = report.build({
            appVersion: state.shim ? require('electron').app.getVersion() : null,
            server, id, instanceDir: id ? path.join(ConfigManager.getInstanceDirectory(), id) : ConfigManager.getInstanceDirectory(),
            // a modpack the launcher has not set up yet has no Java settings: the report still works, with blanks
            settings: id ? { minRAM: safe(() => ConfigManager.getMinRAM(id)), maxRAM: safe(() => ConfigManager.getMaxRAM(id)), java: safe(() => ConfigManager.getJavaExecutable(id)), jvmOptions: safe(() => ConfigManager.getJVMOptions(id)) } : {},
            exit: state.lastExit || null,
            accountType: account ? account.type : null,
            hide: account ? [account.displayName, account.username] : []
        })
        return { text }
    })

    handlers.set('pack.uninstall.preview', async ({ id } = {}) => {
        const dir = instanceDirOf(id)
        if (!fs.existsSync(dir)) return { installed: false, gameBytes: 0, savesBytes: 0, screenshotsBytes: 0 }
        const savesBytes = await sizeOf(path.join(dir, 'saves'))
        const screenshotsBytes = await sizeOf(path.join(dir, 'screenshots'))
        return { installed: true, gameBytes: Math.max(0, (await sizeOf(dir)) - savesBytes - screenshotsBytes), savesBytes, screenshotsBytes }
    })

    handlers.set('pack.uninstall', async ({ id, includePersonal = false } = {}) => {
        const dir = instanceDirOf(id)
        mustBeIdle(id)
        if (!fs.existsSync(dir)) return { freedBytes: 0 }
        const before = await sizeOf(dir)
        if (includePersonal === true) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
        else {
            for (const entry of fs.readdirSync(dir)) {
                if (PERSONAL.includes(entry)) continue
                fs.rmSync(path.join(dir, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
            }
        }
        const after = fs.existsSync(dir) ? await sizeOf(dir) : 0
        return { freedBytes: Math.max(0, before - after) }
    })
}

module.exports = { register }
