/**
 * Engine housekeeping and configuration.
 *
 * Secrets never cross the pipe: the UI sees display names and ids of accounts, never their tokens.
 */
const path = require('path')
const { EngineError } = require('../ipc/server')

/** Loads the classic launcher's config and distribution API the way its preloader does, once. */
function ensureCore(state) {
    if (state.core) return state.core
    const ConfigManager = require(path.join(state.appJs, 'configmanager'))
    ConfigManager.load()
    // Game files (common/ and instances/) live in the data directory, which is NOT under userData: an isolated userData alone
    // would still point Play at the real installation. Development and tests pass --data-dir to isolate that too.
    if (state.dataDir) ConfigManager.setDataDirectory(state.dataDir)
    const { DistroAPI, REMOTE_DISTRO_URL } = require(path.join(state.appJs, 'distromanager'))
    DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
    DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()
    state.core = { ConfigManager, DistroAPI, REMOTE_DISTRO_URL }
    return state.core
}

// The single-value settings the UI may read and write, and how each maps onto ConfigManager.
const SETTINGS = {
    selectedServer: ['getSelectedServer', 'setSelectedServer'],
    gameWidth: ['getGameWidth', 'setGameWidth'],
    gameHeight: ['getGameHeight', 'setGameHeight'],
    fullscreen: ['getFullscreen', 'setFullscreen'],
    autoConnect: ['getAutoConnect', 'setAutoConnect'],
    launchDetached: ['getLaunchDetached', 'setLaunchDetached'],
    allowPrerelease: ['getAllowPrerelease', 'setAllowPrerelease'],
    language: ['getLanguage', 'setLanguage'],
    performanceMode: ['getPerformanceMode', 'setPerformanceMode'],
    dataDirectory: ['getDataDirectory', 'setDataDirectory']
}
// Per-modpack settings: memory, Java and JVM options.
const SERVER_SETTINGS = {
    minRAM: ['getMinRAM', 'setMinRAM'],
    maxRAM: ['getMaxRAM', 'setMaxRAM'],
    javaExecutable: ['getJavaExecutable', 'setJavaExecutable'],
    jvmOptions: ['getJVMOptions', 'setJVMOptions']
}

function accountsView(ConfigManager) {
    const selected = ConfigManager.getSelectedAccount()
    const accounts = Object.values(ConfigManager.getAuthAccounts() || {}).map((a) => ({
        uuid: a.uuid, displayName: a.displayName, username: a.username, type: a.type,
        expiresAt: a.expiresAt || null
    }))
    return { selected: selected ? selected.uuid : null, accounts }
}

function register(handlers, state) {
    handlers.set('engine.hello', async () => ({
        engine: 'empilauncher', protocol: 1, node: process.version, pid: process.pid,
        uptimeMs: Date.now() - state.started
    }))
    handlers.set('engine.ping', async () => ({ t: Date.now() }))
    handlers.set('engine.memory', async () => {
        const m = process.memoryUsage()
        return { rssMB: +(m.rss / 1048576).toFixed(1), heapUsedMB: +(m.heapUsed / 1048576).toFixed(1), externalMB: +(m.external / 1048576).toFixed(1) }
    })
    handlers.set('engine.shutdown', async () => { setImmediate(() => process.exit(0)); return { bye: true } })

    handlers.set('config.get', async () => {
        const { ConfigManager } = ensureCore(state)
        const settings = {}
        for (const [key, [getter]] of Object.entries(SETTINGS)) settings[key] = ConfigManager[getter]()
        return {
            settings,
            firstLaunch: ConfigManager.isFirstLaunch(),
            launcherDirectory: ConfigManager.getLauncherDirectory(),
            commonDirectory: ConfigManager.getCommonDirectory(),
            instanceDirectory: ConfigManager.getInstanceDirectory(),
            accounts: accountsView(ConfigManager)
        }
    })

    handlers.set('config.set', async ({ key, value }) => {
        const { ConfigManager } = ensureCore(state)
        const entry = SETTINGS[key]
        if (!entry) throw new EngineError('bad_key', `unknown setting: ${key}`)
        ConfigManager[entry[1]](value)
        ConfigManager.save()
        return { key, value: ConfigManager[entry[0]]() }
    })

    handlers.set('config.server.get', async ({ serverId }) => {
        const { ConfigManager } = ensureCore(state)
        const out = {}
        for (const [key, [getter]] of Object.entries(SERVER_SETTINGS)) out[key] = ConfigManager[getter](serverId)
        return out
    })
    handlers.set('config.server.set', async ({ serverId, key, value }) => {
        const { ConfigManager } = ensureCore(state)
        const entry = SERVER_SETTINGS[key]
        if (!entry) throw new EngineError('bad_key', `unknown modpack setting: ${key}`)
        ConfigManager[entry[1]](serverId, value)
        ConfigManager.save()
        return { key, value: ConfigManager[entry[0]](serverId) }
    })

    handlers.set('account.list', async () => accountsView(ensureCore(state).ConfigManager))
    handlers.set('account.select', async ({ uuid }) => {
        const { ConfigManager } = ensureCore(state)
        if (!ConfigManager.getAuthAccount(uuid)) throw new EngineError('no_account', 'that account is not saved')
        ConfigManager.setSelectedAccount(uuid)
        ConfigManager.save()
        return accountsView(ConfigManager)
    })
}

module.exports = { register, ensureCore }
