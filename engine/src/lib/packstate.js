/**
 * Installed-modpack bookkeeping: fingerprint, pack-state marker, protected-folder integrity and the backup/restore of the
 * player's personal files. Behaviour-for-behaviour the same rules as the classic launcher's landing.js (readServerPackState,
 * writeServerPackState, backupPersonalDistributionFiles, refreshSelectedPackButton...), minus every UI call.
 *
 * The classic copy stays untouched while both launchers coexist; when the classic one is retired, this is the only copy.
 */
const path = require('path')
const crypto = require('crypto')
const fs = require('fs-extra')

const PACK_STATE_DIRECTORY = '.empilauncher'
const PACK_STATE_FILE = 'pack-state.json'

function stableStringify(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function flattenModules(modules, accumulator = []) {
    for (const module of modules || []) {
        accumulator.push(module)
        if (module.subModules?.length) flattenModules(module.subModules, accumulator)
    }
    return accumulator
}

function getServerPackFingerprint(server) {
    const raw = server?.rawServer || server || {}
    const descriptor = {
        id: raw.id,
        version: raw.version,
        minecraftVersion: raw.minecraftVersion,
        javaOptions: raw.javaOptions || null,
        modules: raw.modules || []
    }
    return crypto.createHash('sha256').update(stableStringify(descriptor)).digest('hex')
}

const isPathInside = (parent, child) => {
    const relative = path.relative(parent, child)
    return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function createPackState({ ConfigManager, PackIntegrity, log }) {
    const idOf = (server) => server?.rawServer?.id || server?.id

    const statePath = (server) => {
        const id = idOf(server)
        return id == null ? null : path.join(ConfigManager.getInstanceDirectory(), id, PACK_STATE_DIRECTORY, PACK_STATE_FILE)
    }

    async function readState(server) {
        const file = statePath(server)
        if (file == null || !(await fs.pathExists(file))) return null
        try { return await fs.readJson(file) } catch (err) { log.warn('Unable to read installed pack state.', err); return null }
    }

    async function writeState(server) {
        const file = statePath(server)
        if (file == null) return
        const fingerprint = getServerPackFingerprint(server)
        await fs.ensureDir(path.dirname(file))
        await fs.writeJson(file, {
            serverId: server.rawServer.id,
            version: server.rawServer.version,
            fingerprint,
            updatedAt: new Date().toISOString()
        }, { spaces: 2 })
        await PackIntegrity.createManifest(ConfigManager.getInstanceDirectory(), server.rawServer.id, fingerprint)
    }

    async function hasInstallation(server) {
        const id = idOf(server)
        if (id == null) return false
        const instancePath = path.join(ConfigManager.getInstanceDirectory(), id)
        if (!(await fs.pathExists(instancePath))) return false
        try {
            return (await fs.readdir(instancePath)).some((entry) => entry !== PACK_STATE_DIRECTORY)
        } catch (err) {
            log.debug('Unable to inspect the local modpack installation.', err)
            return false
        }
    }

    /** Files the pack ships but the player edits (options.txt, configs...): everything of type File outside the protected folders. */
    function personalFiles(server) {
        const serverId = idOf(server)
        if (serverId == null) return []
        const instancePath = path.join(ConfigManager.getInstanceDirectory(), serverId)
        const protectedRoots = new Set(PackIntegrity.PROTECTED_ROOTS.map((root) => root.toLowerCase()))
        const files = new Map()
        for (const module of flattenModules(server?.modules)) {
            const raw = module?.rawModule || module || {}
            if (String(raw.type) !== 'File' || typeof module?.getPath !== 'function') continue
            try {
                const modulePath = path.resolve(module.getPath())
                if (!isPathInside(instancePath, modulePath)) continue
                const relativePath = path.relative(instancePath, modulePath)
                const firstPart = relativePath.split(path.sep)[0].toLowerCase()
                if (protectedRoots.has(firstPart) || firstPart === PACK_STATE_DIRECTORY) continue
                files.set(relativePath, modulePath)
            } catch (err) {
                log.debug('Unable to resolve a personal pack file for backup.', err)
            }
        }
        return [...files.entries()].map(([relativePath, absolutePath]) => ({ relativePath, absolutePath }))
    }

    async function backupPersonalFiles(server) {
        const files = personalFiles(server)
        if (files.length === 0) return null
        const backupRoot = path.join(
            ConfigManager.getDataDirectory(), '.empi-cache', 'restore-backups',
            `${server.rawServer.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
        )
        const entries = []
        for (const file of files) {
            if (!(await fs.pathExists(file.absolutePath))) continue
            let stat
            try { stat = await fs.stat(file.absolutePath) } catch (err) { log.debug('Unable to inspect a personal pack file before restore.', err); continue }
            if (!stat.isFile()) continue
            const backupPath = path.join(backupRoot, file.relativePath)
            await fs.ensureDir(path.dirname(backupPath))
            await fs.copy(file.absolutePath, backupPath, { overwrite: true, preserveTimestamps: true })
            entries.push({ relativePath: file.relativePath, originalPath: file.absolutePath, backupPath })
        }
        if (entries.length === 0) { await fs.remove(backupRoot); return null }
        log.info(`Protected ${entries.length} personal configuration files during modpack restore.`)
        return { backupRoot, entries }
    }

    async function restorePersonalFiles(snapshot) {
        if (snapshot == null) return
        try {
            for (const entry of snapshot.entries) {
                if (!(await fs.pathExists(entry.backupPath))) continue
                await fs.ensureDir(path.dirname(entry.originalPath))
                await fs.copy(entry.backupPath, entry.originalPath, { overwrite: true, preserveTimestamps: true })
            }
            log.info(`Restored ${snapshot.entries.length} personal configuration files after modpack repair.`)
        } finally {
            await fs.remove(snapshot.backupRoot).catch((err) => log.debug('Unable to remove the temporary restore backup.', err))
        }
    }

    /**
     * What the launch button should offer for a modpack: play, update or restore. Same decision table as the classic
     * refreshSelectedPackButton(): a changed fingerprint means an update; protected folders that differ from the recorded
     * manifest mean the pack was modified and offers a restore.
     */
    async function status(server) {
        const serverId = server.rawServer.id
        const fingerprint = getServerPackFingerprint(server)
        const installationExists = await hasInstallation(server)
        const installedState = await readState(server)
        const needsUpdate = installedState == null
            ? installationExists
            : installedState.serverId !== serverId || installedState.fingerprint !== fingerprint

        let integrity = { status: 'clean', differences: [] }
        if (installationExists && !needsUpdate) {
            try {
                integrity = await PackIntegrity.checkIntegrity(ConfigManager.getInstanceDirectory(), serverId, fingerprint)
                if (integrity.status === 'uninitialized') {
                    await PackIntegrity.createManifest(ConfigManager.getInstanceDirectory(), serverId, fingerprint)
                    integrity = { status: 'clean', differences: [] }
                }
            } catch (err) {
                log.warn('Unable to verify the protected modpack folders.', err)
                integrity = { status: 'unknown', differences: [] }
            }
        } else if (installationExists && installedState == null) {
            integrity = { status: 'uninitialized', differences: [] }
        }

        const modified = installationExists && (integrity.status === 'modified' || integrity.status === 'uninitialized'
            || (integrity.status === 'outdated' && !needsUpdate))
        return {
            serverId,
            installed: installationExists,
            installedVersion: installedState?.version || null,
            remoteVersion: server.rawServer.version,
            needsUpdate,
            modified,
            differences: modified ? integrity.differences : [],
            action: modified ? 'restore' : needsUpdate ? 'update' : 'play'
        }
    }

    /** Right before launching: the protected folders must match what was installed. Unreadable integrity does not block. */
    async function verifyBeforeLaunch(server) {
        if (!(await hasInstallation(server))) return { ok: true }
        try {
            const fingerprint = getServerPackFingerprint(server)
            let result = await PackIntegrity.checkIntegrity(ConfigManager.getInstanceDirectory(), server.rawServer.id, fingerprint)
            if (result.status === 'uninitialized') {
                await PackIntegrity.createManifest(ConfigManager.getInstanceDirectory(), server.rawServer.id, fingerprint)
                result = { status: 'clean', differences: [] }
            }
            return result.status === 'clean' ? { ok: true } : { ok: false, differences: result.differences }
        } catch (err) {
            log.warn('Unable to verify the modpack before launch.', err)
            return { ok: true, warning: 'No se pudo comprobar la versión' }
        }
    }

    return { readState, writeState, hasInstallation, backupPersonalFiles, restorePersonalFiles, status, verifyBeforeLaunch }
}

module.exports = { createPackState, getServerPackFingerprint, PACK_STATE_DIRECTORY, PACK_STATE_FILE }
