/**
 * What the classic launcher's uibinder.js does every time the distribution index is (re)loaded, without the UI:
 * keep the per-modpack optional-mod choices in step with the index (syncModConfigurations) and make sure every modpack has
 * a Java/memory configuration (ensureJavaSettings). ProcessBuilder and Play read both, so they must exist before launching.
 */
const { Type } = require('helios-distribution-types')

const isModType = (type) => type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod

/** Recursively scans optional sub modules: a boolean when there are none, a `{ mods, value? }` object when there are. */
function scanOptionalSubModules(mdls, origin) {
    if (mdls != null) {
        const mods = {}
        for (const mdl of mdls) {
            if (!isModType(mdl.rawModule.type)) continue
            if (!mdl.getRequired().value) {
                mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
            } else if (mdl.hasSubModules()) {
                const v = scanOptionalSubModules(mdl.subModules, mdl)
                if (typeof v === 'object') mods[mdl.getVersionlessMavenIdentifier()] = v
            }
        }
        if (Object.keys(mods).length > 0) {
            const ret = { mods }
            if (!origin.getRequired().value) ret.value = origin.getRequired().def
            return ret
        }
    }
    return origin.getRequired().def
}

/** Recursively merges the player's old choice `o` into the newly scanned configuration `n`. */
function mergeModConfiguration(o, n, nReq = false) {
    if (typeof o === 'boolean') {
        if (typeof n === 'boolean') return o
        if (typeof n === 'object') {
            if (!nReq) n.value = o
            return n
        }
    } else if (typeof o === 'object') {
        if (typeof n === 'boolean') return typeof o.value !== 'undefined' ? o.value : true
        if (typeof n === 'object') {
            if (!nReq) n.value = typeof o.value !== 'undefined' ? o.value : true
            for (const mod of Object.keys(n.mods)) {
                if (o.mods[mod] != null) n.mods[mod] = mergeModConfiguration(o.mods[mod], n.mods[mod])
            }
            return n
        }
    }
    // Could not merge: use the new value, like the classic launcher.
    return n
}

function syncModConfigurations(ConfigManager, distro) {
    const synced = []
    for (const serv of distro.servers) {
        const id = serv.rawServer.id
        const cfg = ConfigManager.getModConfiguration(id)
        const modsOld = cfg != null ? cfg.mods : null
        const mods = {}

        for (const mdl of serv.modules) {
            if (!isModType(mdl.rawModule.type)) continue
            const mdlID = mdl.getVersionlessMavenIdentifier()
            if (!mdl.getRequired().value) {
                const scanned = scanOptionalSubModules(mdl.subModules, mdl)
                mods[mdlID] = modsOld != null && modsOld[mdlID] != null ? mergeModConfiguration(modsOld[mdlID], scanned, false) : scanned
            } else if (mdl.subModules.length > 0) {
                const v = scanOptionalSubModules(mdl.subModules, mdl)
                if (typeof v === 'object') {
                    mods[mdlID] = modsOld != null && modsOld[mdlID] != null ? mergeModConfiguration(modsOld[mdlID], v, true) : v
                }
            }
        }
        synced.push({ id, mods })
    }
    ConfigManager.setModConfigurations(synced)
    ConfigManager.save()
}

function ensureJavaSettings(ConfigManager, distro) {
    for (const serv of distro.servers) {
        ConfigManager.ensureJavaConfig(serv.rawServer.id, serv.effectiveJavaOptions, serv.rawServer.javaOptions?.ram)
    }
    ConfigManager.save()
}

/** Everything the classic launcher runs after the index is loaded or refreshed. */
function onDistroLoaded(ConfigManager, distro) {
    const selected = ConfigManager.getSelectedServer()
    if (selected == null || distro.getServerById(selected) == null) {
        ConfigManager.setSelectedServer(distro.getMainServer().rawServer.id)
    }
    syncModConfigurations(ConfigManager, distro)
    ensureJavaSettings(ConfigManager, distro)
}

module.exports = { onDistroLoaded, syncModConfigurations, ensureJavaSettings, mergeModConfiguration }
