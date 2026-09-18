/**
 * Puts a modpack's mods into the instance's own mods folder (Forge/NeoForge 1.20.3+ no longer
 * accept a mod list, so the mods have to sit there).
 *
 * How each mod is treated depends on the protection Nebula stamped on it (see Nebula's ProtectionPolicy):
 *  - locked (default): checked on every launch, restored when missing, renamed or altered.
 *  - free  (policy:"free"): copied once; afterwards the player may edit, rename or delete it.
 * What was already handed over is remembered in .empi-provisioned.json, the same file the
 * distribution validation (helios-core DistributionIndexProcessor) keeps for the `files` folder.
 */

const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')

const RECORD_FILE = '.empi-provisioned.json'
const MANAGED_FILE = '.empi-managed-mods.json'

function md5Of(file) {
    return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')
}

/** True when `file` exists and is exactly what the pack published. */
function isIntact(file, artifact) {
    try {
        if(artifact.size != null && fs.statSync(file).size !== artifact.size) {
            return false
        }
        return artifact.MD5 == null || md5Of(file) === artifact.MD5
    } catch {
        return false
    }
}

function readRecord(gameDir, revision) {
    try {
        const saved = fs.readJsonSync(path.join(gameDir, RECORD_FILE))
        if((saved.revision ?? 0) === revision && saved.items != null) {
            return { revision, items: saved.items }
        }
    } catch {
        // No record yet: nothing has been handed over.
    }
    return { revision, items: {} }
}

function readManaged(gameDir) {
    try {
        return fs.readJsonSync(path.join(gameDir, MANAGED_FILE))
    } catch {
        return []
    }
}

/**
 * @param {{ gameDir: string, mods: any[], revision?: number }} options `mods` are the enabled mods
 *        (objects with getPath() and rawModule); `revision` is the server's protection.revision.
 */
function syncMods({ gameDir, mods, revision = 0 }) {
    const modsDir = path.join(gameDir, 'mods')
    fs.ensureDirSync(modsDir)

    const record = readRecord(gameDir, revision)
    const previouslyManaged = readManaged(gameDir)
    const currentlyManaged = []
    let recordChanged = false
    const result = { copied: 0, kept: 0, left: 0, removed: 0 }

    for(const mod of mods) {
        const fileName = path.basename(mod.getPath())
        const key = `mods/${fileName}`
        const destination = path.join(modsDir, fileName)
        const free = mod.rawModule?.policy === 'free'
        currentlyManaged.push(fileName)

        if(free && record.items[key]) {
            result.left++
            continue
        }

        if(isIntact(destination, mod.rawModule?.artifact || {})) {
            result.kept++
        } else {
            fs.copyFileSync(mod.getPath(), destination)
            result.copied++
        }

        if(free) {
            record.items[key] = 1
            recordChanged = true
        }
    }

    // Mods the pack no longer ships (or the player switched off) leave the folder.
    for(const fileName of previouslyManaged) {
        if(!currentlyManaged.includes(fileName)) {
            fs.removeSync(path.join(modsDir, fileName))
            result.removed++
        }
    }

    fs.writeJsonSync(path.join(gameDir, MANAGED_FILE), currentlyManaged)
    if(recordChanged) {
        // The validation step may have written entries for the `files` folder: keep them.
        const onDisk = readRecord(gameDir, revision)
        fs.writeJsonSync(path.join(gameDir, RECORD_FILE), { revision, items: { ...onDisk.items, ...record.items } })
    }
    return result
}

module.exports = { syncMods, RECORD_FILE, MANAGED_FILE }
