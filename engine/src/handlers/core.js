/**
 * Engine housekeeping and configuration.
 *
 * Secrets never cross the pipe: the UI sees display names and ids of accounts, never their tokens.
 */
const path = require('path')
const { EngineError } = require('../ipc/server')
const fs = require('fs')
const offline = require('../lib/offline')
const skins = require('../lib/skin')
const profiles = require('../lib/profiles')

/** Loads the classic launcher's config and distribution API the way its preloader does, once. */
function ensureCore(state) {
    if (state.core) return state.core
    const ConfigManager = require(path.join(state.appJs, 'configmanager'))
    ConfigManager.load()
    // Game files (common/ and instances/) live in the data directory, which is NOT under userData: an isolated userData alone
    // would still point Play at the real installation. Development and tests pass --data-dir to isolate that too.
    if (state.dataDir) ConfigManager.setDataDirectory(state.dataDir)
    // Messages the classic modules build for players (auth errors...) come from the language files.
    require(path.join(state.appJs, 'langloader')).setupLanguage(ConfigManager.getLanguage())
    const { DistroAPI, REMOTE_DISTRO_URL } = require(path.join(state.appJs, 'distromanager'))
    DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
    DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()
    // Tests serve their own distribution (engine/test/profiles.mjs); it can only be changed when they turn the test hooks on.
    if (process.env.EMPI_ENGINE_TEST === '1' && process.env.EMPI_DISTRO_URL) DistroAPI['remoteUrl'] = process.env.EMPI_DISTRO_URL
    state.core = { ConfigManager, DistroAPI, REMOTE_DISTRO_URL }
    routeProfiles(state, ConfigManager, DistroAPI)
    return state.core
}

/**
 * Whatever loads the distribution (first load, refresh, the copy on disk when offline) hands over the modpacks as the player has them
 * (see lib/profiles.js). The published index is kept as it came in `state.profiles.pristine`, so the player can change profile without
 * fetching anything, and the copy helios-core writes to disk stays the published one.
 */
function routeProfiles(state, ConfigManager, DistroAPI) {
    state.profiles = { pristine: null }
    const load = DistroAPI['_loadDistributionNullable']
    if (typeof load !== 'function') throw new Error('helios-core no longer has the distribution loader the profiles hook into.')
    DistroAPI['_loadDistributionNullable'] = async function () {
        const raw = await load.call(this)
        if (raw == null) return raw
        state.profiles.pristine = raw
        try {
            return profiles.effectiveDistribution(raw, profiles.readState(ConfigManager.getLauncherDirectory()).selected)
        } catch (err) {
            state.log.error('Unable to apply the profiles of the modpacks; using the published index as it is.', err)
            return raw
        }
    }
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

/** The accounts as the UI sees them. The offline player (see lib/offline.js) is listed like the others, with type "offline" and its 12-digit id. */
function accountsView(ConfigManager) {
    const selected = ConfigManager.getSelectedAccount()
    const accounts = Object.values(ConfigManager.getAuthAccounts() || {}).map((a) => ({
        uuid: a.uuid, displayName: a.displayName, username: a.username, type: a.type,
        expiresAt: a.expiresAt || null
    }))
    let selectedUuid = selected ? selected.uuid : null
    const saved = offline.read(ConfigManager.getLauncherDirectory())
    if (saved) {
        const player = offline.profile(saved.name)
        const entry = { uuid: player.uuid, displayName: player.name, username: player.name, type: 'offline', expiresAt: null, offlineId: player.id }
        if (saved.skin) {
            const files = skins.cached(ConfigManager.getLauncherDirectory(), saved.skin.id)
            entry.skin = { id: saved.skin.id, model: saved.skin.model, front: files && fs.existsSync(files.front) ? files.front : null, head: files && fs.existsSync(files.head) ? files.head : null }
        }
        accounts.push(entry)
        if (saved.active) selectedUuid = player.uuid
    }
    return { selected: selectedUuid, accounts }
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
            accounts: accountsView(ConfigManager),
            appVersion: require('electron').app.getVersion()
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
        const dir = ConfigManager.getLauncherDirectory()
        const saved = offline.read(dir)
        if (saved && offline.profile(saved.name).uuid === uuid) {
            offline.setActive(dir, true)
            return accountsView(ConfigManager)
        }
        if (!ConfigManager.getAuthAccount(uuid)) throw new EngineError('no_account', 'that account is not saved')
        ConfigManager.setSelectedAccount(uuid)
        ConfigManager.save()
        if (saved) offline.setActive(dir, false)   // picking a Microsoft account means it is the one that plays
        return accountsView(ConfigManager)
    })
}

module.exports = { register, ensureCore, accountsView }
