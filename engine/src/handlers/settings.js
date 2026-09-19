/**
 * Everything the Settings screen needs that is not a plain config value: memory limits, Java details, the optional mods of a
 * modpack, the player's own drop-in mods and shader packs. It is the logic of the classic settings.js (resolveModsForUI,
 * saveModConfiguration, resolveDropinModsForUI, resolveShaderpacksForUI, prepareJavaTab...) without the DOM, reusing the same
 * modules (ConfigManager, DropinModUtil, helios-core java).
 *
 * Deleting a drop-in mod sends it to the recycle bin, which needs the shell: the engine only validates and resolves the path
 * (dropins.resolve) and the UI does the trashing.
 */
const os = require('os')
const path = require('path')
const { Type } = require('helios-distribution-types')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')

const GiB = 1073741824
const isModType = (type) => type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod

/** '3G' | '2560M' | '4' -> gigabytes as a number (2.5 for 2560M), the unit the sliders use. */
function ramToGb(value) {
    const text = String(value ?? '')
    return text.endsWith('M') ? Number(text.slice(0, -1)) / 1024 : Number.parseFloat(text)
}
/** gigabytes -> the string ConfigManager stores: whole numbers as 'nG', halves as 'nM'. */
const gbToRam = (gb) => (gb % 1 > 0 ? `${Math.round(gb * 1024)}M` : `${gb}G`)

function register(handlers, state) {
    const core = () => ensureCore(state)
    const dropinUtil = () => require(path.join(state.appJs, 'dropinmodutil'))
    const rt = () => (state.settingsRuntime ??= require('helios-core/java'))

    async function serverById(id) {
        const { ConfigManager, DistroAPI } = core()
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(id || ConfigManager.getSelectedServer())
        if (!server) throw new EngineError('no_server', 'no such modpack')
        return server
    }

    /** Resolves a name inside `root`, refusing anything that escapes it (../, absolute paths). */
    function inside(root, name) {
        const resolved = path.resolve(root, name)
        if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new EngineError('bad_path', 'that path is outside the modpack folder')
        return resolved
    }

    // ---- memory and Java ------------------------------------------------------------------------------------------

    handlers.set('system.memory', async () => ({ totalGB: +(os.totalmem() / GiB).toFixed(2), freeGB: +(os.freemem() / GiB).toFixed(2) }))

    /** Memory sliders, Java requirement and JVM options for one modpack, in the units the UI works with. */
    handlers.set('settings.java', async ({ serverId } = {}) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const id = server.rawServer.id
        const options = server.effectiveJavaOptions
        return {
            serverId: id,
            minRAMGb: ramToGb(ConfigManager.getMinRAM(id)),
            maxRAMGb: ramToGb(ConfigManager.getMaxRAM(id)),
            absoluteMinGb: ConfigManager.getAbsoluteMinRAM(server.rawServer.javaOptions?.ram),
            absoluteMaxGb: ConfigManager.getAbsoluteMaxRAM(server.rawServer.javaOptions?.ram),
            totalGB: +(os.totalmem() / GiB).toFixed(2),
            freeGB: +(os.freemem() / GiB).toFixed(2),
            javaExecutable: ConfigManager.getJavaExecutable(id) || '',
            jvmOptions: ConfigManager.getJVMOptions(id) || [],
            suggestedMajor: options.suggestedMajor,
            supported: options.supported
        }
    })

    /** Any subset of { minRAMGb, maxRAMGb, javaExecutable, jvmOptions (array or a string split on spaces) } for a modpack. */
    handlers.set('settings.java.set', async ({ serverId, minRAMGb, maxRAMGb, javaExecutable, jvmOptions } = {}) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const id = server.rawServer.id
        if (minRAMGb != null && maxRAMGb != null && Number(maxRAMGb) < Number(minRAMGb)) maxRAMGb = minRAMGb   // never a max below the min
        if (minRAMGb != null) ConfigManager.setMinRAM(id, gbToRam(Number(minRAMGb)))
        if (maxRAMGb != null) ConfigManager.setMaxRAM(id, gbToRam(Number(maxRAMGb)))
        if (javaExecutable != null) ConfigManager.setJavaExecutable(id, String(javaExecutable))
        if (jvmOptions != null) {
            const list = Array.isArray(jvmOptions) ? jvmOptions : String(jvmOptions).trim().split(/\s+/).filter(Boolean)
            ConfigManager.setJVMOptions(id, list)
        }
        ConfigManager.save()
        return handlers.get('settings.java')({ serverId: id })
    })

    /** Is this Java usable for the modpack, and which one is it. Spawns java, so it is a separate call from settings.java. */
    handlers.set('java.details', async ({ serverId, path: execPath } = {}) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const target = execPath ?? ConfigManager.getJavaExecutable(server.rawServer.id) ?? ''
        if (!target) return { valid: false, version: null, vendor: null, path: '' }
        const details = await rt().validateSelectedJvm(rt().ensureJavaDirIsRoot(target), server.effectiveJavaOptions.supported)
        return details ? { valid: true, version: details.semverStr, vendor: details.vendor, path: target } : { valid: false, version: null, vendor: null, path: target }
    })

    /** Same rules the classic settings apply while typing: null when valid, otherwise the field that failed. */
    handlers.set('config.validate', async ({ key, value }) => {
        const { ConfigManager } = core()
        const validator = { gameWidth: 'validateGameWidth', gameHeight: 'validateGameHeight' }[key]
        if (!validator) return { valid: true }
        return { valid: !!ConfigManager[validator](value) }
    })

    // ---- optional mods --------------------------------------------------------------------------------------------

    /** Required mods are informational; optional ones can be switched. Sub modules nest under their parent, required first. */
    function parseModules(mdls, conf, parentPath = []) {
        const required = []
        const optional = []
        for (const mdl of mdls || []) {
            if (!isModType(mdl.rawModule.type)) continue
            const id = mdl.getVersionlessMavenIdentifier()
            const node = { id, path: [...parentPath, id], name: mdl.rawModule.name, version: mdl.mavenComponents?.version || '', required: !!mdl.getRequired().value, enabled: true, children: [] }
            if (node.required) {
                if (mdl.subModules.length > 0) {
                    const sub = parseModules(mdl.subModules, conf?.[id]?.mods ?? {}, node.path)
                    node.children = [...sub.required, ...sub.optional]
                }
                required.push(node)
            } else {
                const value = conf?.[id]
                node.enabled = !!(typeof value === 'object' && value !== null ? value.value : value)
                if (mdl.subModules.length > 0) {
                    const sub = parseModules(mdl.subModules, (typeof value === 'object' && value !== null ? value.mods : null) ?? {}, node.path)
                    node.children = [...sub.required, ...sub.optional]
                }
                optional.push(node)
            }
        }
        return { required, optional }
    }

    handlers.set('mods.list', async ({ serverId } = {}) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const id = server.rawServer.id
        const conf = ConfigManager.getModConfiguration(id)
        const { required, optional } = parseModules(server.modules, conf?.mods ?? {})

        const modsDir = path.join(ConfigManager.getInstanceDirectory(), id, 'mods')
        const instanceDir = path.join(ConfigManager.getInstanceDirectory(), id)
        const util = dropinUtil()
        return {
            serverId: id,
            required, optional,
            dropins: { dir: modsDir, mods: util.scanForDropinMods(modsDir, server.rawServer.minecraftVersion) },
            shaders: { dir: path.join(instanceDir, 'shaderpacks'), packs: util.scanForShaderpacks(instanceDir), selected: util.getEnabledShaderpack(instanceDir) }
        }
    })

    /** Switches one optional mod. `path` is the node's path from mods.list (its id, preceded by its parents' ids). */
    handlers.set('mods.set', async ({ serverId, path: modPath, enabled }) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const id = server.rawServer.id
        if (!Array.isArray(modPath) || modPath.length === 0) throw new EngineError('bad_path', 'a mod path is required')
        const conf = ConfigManager.getModConfiguration(id)
        let level = conf.mods
        for (const part of modPath.slice(0, -1)) {
            if (level?.[part]?.mods == null) throw new EngineError('no_mod', `no such mod: ${modPath.join(' > ')}`)
            level = level[part].mods
        }
        const last = modPath[modPath.length - 1]
        if (level?.[last] == null) throw new EngineError('no_mod', `no such mod: ${modPath.join(' > ')}`)
        if (typeof level[last] === 'boolean') level[last] = !!enabled
        else level[last].value = !!enabled
        ConfigManager.setModConfiguration(id, conf)
        ConfigManager.save()
        return { path: modPath, enabled: !!enabled }
    })

    // ---- drop-in mods and shader packs ----------------------------------------------------------------------------

    handlers.set('dropins.toggle', async ({ serverId, fullName, enabled }) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const modsDir = path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id, 'mods')
        inside(modsDir, fullName)
        await dropinUtil().toggleDropinMod(modsDir, fullName, !!enabled)
        return { fullName, enabled: !!enabled }
    })

    /** The absolute path of a drop-in mod (validated to be inside the mods folder) so the UI can send it to the recycle bin. */
    handlers.set('dropins.resolve', async ({ serverId, fullName }) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        return { path: inside(path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id, 'mods'), fullName) }
    })

    /** Moves .jar/.zip/.litemod files into the mods folder, like dropping them on the classic "open folder" button. */
    handlers.set('dropins.add', async ({ serverId, paths }) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const modsDir = path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id, 'mods')
        dropinUtil().addDropinMods((paths || []).map((p) => ({ name: path.basename(p), path: p })), modsDir)
        return { dir: modsDir }
    })

    handlers.set('shaders.select', async ({ serverId, name }) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        dropinUtil().setEnabledShaderpack(path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id), String(name || 'OFF'))
        return { selected: name || 'OFF' }
    })

    handlers.set('shaders.add', async ({ serverId, paths }) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        const instanceDir = path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id)
        dropinUtil().addShaderpacks((paths || []).map((p) => ({ name: path.basename(p), path: p })), instanceDir)
        return { dir: path.join(instanceDir, 'shaderpacks') }
    })

    /** Where the player's screenshots are, for the native gallery to read directly. */
    handlers.set('screenshots.dir', async ({ serverId } = {}) => {
        const { ConfigManager } = core()
        const server = await serverById(serverId)
        return { dir: path.join(ConfigManager.getInstanceDirectory(), server.rawServer.id, 'screenshots') }
    })
}

module.exports = { register, ramToGb, gbToRam }
