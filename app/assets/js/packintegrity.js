const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')

const MANIFEST_VERSION = 3
const MANIFEST_DIRECTORY = '.empilauncher'
const MANIFEST_FILE = 'integrity.json'
const PROTECTED_ROOTS = Object.freeze(['mods', 'resourcepacks', 'shaderpacks'])

// Only actual packages are protected. Configurations written by Minecraft,
// Iris and other mods are intentionally outside the integrity system.
const PACKAGE_EXTENSIONS = Object.freeze({
    mods: new Set(['.jar', '.zip', '.litemod']),
    resourcepacks: new Set(['.zip', '.jar']),
    shaderpacks: new Set(['.zip', '.jar'])
})

const IGNORED_ROOT_FILE_EXTENSIONS = new Set([
    '.txt',
    '.properties',
    '.json',
    '.json5',
    '.cfg',
    '.toml',
    '.ini',
    '.conf',
    '.yaml',
    '.yml',
    '.log',
    '.bak',
    '.old'
])

const IGNORED_NAMES = new Set([
    '.ds_store',
    'desktop.ini',
    'thumbs.db',
    '.cache',
    'cache'
])

function normalizeRelative(relativePath){
    return relativePath.split(path.sep).join('/')
}

function getInstancePath(instanceDirectory, serverId){
    return path.join(instanceDirectory, serverId)
}

function getManifestPath(instanceDirectory, serverId){
    return path.join(getInstancePath(instanceDirectory, serverId), MANIFEST_DIRECTORY, MANIFEST_FILE)
}

function shouldIgnorePackageEntry(fileName){
    const lowerName = String(fileName).toLowerCase()
    return lowerName.startsWith('.') || IGNORED_NAMES.has(lowerName)
}

function shouldIgnoreRootFile(fileName){
    const lowerName = String(fileName).toLowerCase()
    if(shouldIgnorePackageEntry(lowerName)){
        return true
    }
    return IGNORED_ROOT_FILE_EXTENSIONS.has(path.extname(lowerName))
}

function isPackageFile(rootName, fileName){
    if(shouldIgnoreRootFile(fileName)){
        return false
    }
    return PACKAGE_EXTENSIONS[rootName]?.has(path.extname(String(fileName).toLowerCase())) === true
}

function isSafeProtectedRelative(relativePath){
    const normalized = normalizeRelative(relativePath || '')
    if(normalized.length === 0 || normalized.startsWith('/') || normalized.includes('../')){
        return false
    }
    const parts = normalized.split('/')
    return parts.length >= 2 && PROTECTED_ROOTS.includes(parts[0])
}

async function hashFile(filePath){
    return await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(filePath)
        stream.on('error', reject)
        stream.on('data', chunk => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
    })
}

async function collectProtectedRecords(instanceDirectory, serverId){
    const instancePath = getInstancePath(instanceDirectory, serverId)
    const records = []

    // IMPORTANT: only inspect this server's instance. Helios stores official
    // Fabric/Forge modules in a shared common directory; tracking that shared
    // directory made one version invalidate another version.
    for(const rootName of PROTECTED_ROOTS){
        const rootPath = path.join(instancePath, rootName)
        if(!(await fs.pathExists(rootPath))){
            continue
        }

        let entries
        try {
            entries = await fs.readdir(rootPath, { withFileTypes: true })
        } catch(err) {
            if(err?.code === 'ENOENT'){
                continue
            }
            throw err
        }

        entries.sort((a, b) => a.name.localeCompare(b.name))
        for(const entry of entries){
            if(shouldIgnorePackageEntry(entry.name)){
                continue
            }

            const absolutePath = path.join(rootPath, entry.name)
            const relativePath = normalizeRelative(path.join(rootName, entry.name))

            if(entry.isDirectory()){
                // Folder resource packs and shaders are compared only by their
                // top-level presence/name. Internal settings are not inspected.
                records.push({
                    path: relativePath,
                    type: 'package-directory'
                })
            } else if(entry.isSymbolicLink()){
                records.push({
                    path: relativePath,
                    type: 'symlink',
                    target: await fs.readlink(absolutePath)
                })
            } else if(entry.isFile() && isPackageFile(rootName, entry.name)){
                const stat = await fs.stat(absolutePath)
                records.push({
                    path: relativePath,
                    type: 'file',
                    absolutePath,
                    size: stat.size,
                    mtimeMs: Math.trunc(stat.mtimeMs)
                })
            }
        }
    }

    records.sort((a, b) => a.path.localeCompare(b.path))
    return records
}

async function mapWithConcurrency(items, limit, mapper){
    const output = new Array(items.length)
    let cursor = 0

    async function worker(){
        while(true){
            const index = cursor
            cursor++
            if(index >= items.length){
                return
            }
            output[index] = await mapper(items[index], index)
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()))
    return output
}

async function finalizeRecords(records){
    return await mapWithConcurrency(records, 4, async record => {
        if(record.type !== 'file'){
            return record
        }
        const sha256 = await hashFile(record.absolutePath)
        const portableRecord = { ...record }
        delete portableRecord.absolutePath
        return {
            ...portableRecord,
            sha256
        }
    })
}

function migrateManifestEntries(entries){
    const migrated = new Map()

    for(const original of entries || []){
        const normalizedPath = normalizeRelative(original?.path || '')
        if(!isSafeProtectedRelative(normalizedPath)){
            // Drops legacy official-mods/* records. Those files live in the
            // shared common directory and must never link two versions.
            continue
        }

        const parts = normalizedPath.split('/')
        const rootName = parts[0]
        const topName = parts[1]
        if(shouldIgnorePackageEntry(topName)){
            continue
        }
        const topPath = `${rootName}/${topName}`

        if(parts.length > 2 || original.type === 'directory' || original.type === 'package-directory'){
            migrated.set(topPath, {
                path: topPath,
                type: 'package-directory'
            })
        } else if(original.type === 'symlink'){
            migrated.set(topPath, {
                path: topPath,
                type: 'symlink',
                target: original.target
            })
        } else if(original.type === 'file' && isPackageFile(rootName, topName)){
            migrated.set(topPath, {
                ...original,
                path: topPath
            })
        }
    }

    return [...migrated.values()].sort((a, b) => a.path.localeCompare(b.path))
}

async function createManifest(instanceDirectory, serverId, packFingerprint){
    const records = await collectProtectedRecords(instanceDirectory, serverId)
    const finalizedRecords = await finalizeRecords(records)

    const manifestPath = getManifestPath(instanceDirectory, serverId)
    await fs.ensureDir(path.dirname(manifestPath))
    await fs.writeJson(manifestPath, {
        schemaVersion: MANIFEST_VERSION,
        serverId,
        packFingerprint,
        protectedRoots: PROTECTED_ROOTS,
        generatedAt: new Date().toISOString(),
        entries: finalizedRecords
    }, { spaces: 2 })

    return manifestPath
}

async function readManifest(instanceDirectory, serverId){
    const manifestPath = getManifestPath(instanceDirectory, serverId)
    if(!(await fs.pathExists(manifestPath))){
        return null
    }
    try {
        const manifest = await fs.readJson(manifestPath)
        if(manifest?.serverId !== serverId || !Array.isArray(manifest?.entries)){
            return null
        }
        if(manifest.schemaVersion === MANIFEST_VERSION){
            return manifest
        }

        // Migrate V1/V2 in place, while removing the old shared common-mod
        // records that caused Culones and Panolis to affect each other.
        const migratedManifest = {
            ...manifest,
            schemaVersion: MANIFEST_VERSION,
            protectedRoots: PROTECTED_ROOTS,
            migratedAt: new Date().toISOString(),
            entries: migrateManifestEntries(manifest.entries)
        }
        await fs.writeJson(manifestPath, migratedManifest, { spaces: 2 })
        return migratedManifest
    } catch(_err) {
        return null
    }
}

function pushDifference(differences, difference){
    if(differences.length < 20){
        differences.push(difference)
    }
}

async function checkIntegrity(instanceDirectory, serverId, packFingerprint){
    const manifest = await readManifest(instanceDirectory, serverId)
    if(manifest == null){
        return {
            status: 'uninitialized',
            differences: []
        }
    }

    if(manifest.packFingerprint !== packFingerprint){
        return {
            status: 'outdated',
            differences: []
        }
    }

    const expectedEntries = migrateManifestEntries(manifest.entries)
    const currentRecords = await collectProtectedRecords(instanceDirectory, serverId)
    const expectedByPath = new Map(expectedEntries.map(entry => [entry.path, entry]))
    const currentByPath = new Map(currentRecords.map(entry => [entry.path, entry]))
    const differences = []

    for(const expected of expectedEntries){
        const current = currentByPath.get(expected.path)
        if(current == null){
            pushDifference(differences, { type: 'missing', path: expected.path })
            continue
        }
        if(current.type !== expected.type){
            pushDifference(differences, { type: 'changed', path: expected.path })
            continue
        }
        if(expected.type === 'symlink' && current.target !== expected.target){
            pushDifference(differences, { type: 'changed', path: expected.path })
            continue
        }
        if(expected.type === 'file'){
            if(current.size !== expected.size){
                pushDifference(differences, { type: 'changed', path: expected.path })
                continue
            }
            if(current.mtimeMs !== expected.mtimeMs){
                const currentHash = await hashFile(current.absolutePath)
                if(currentHash !== expected.sha256){
                    pushDifference(differences, { type: 'changed', path: expected.path })
                }
            }
        }
    }

    for(const current of currentRecords){
        if(!expectedByPath.has(current.path)){
            pushDifference(differences, { type: 'added', path: current.path })
        }
    }

    return {
        status: differences.length === 0 ? 'clean' : 'modified',
        differences
    }
}

async function cleanProtectedContent(instanceDirectory, serverId, differences = null){
    const instancePath = getInstancePath(instanceDirectory, serverId)

    // During a normal pack update we may need a full cleanup because the old
    // manifest belongs to another published version. During RESTORE we receive
    // exact differences and remove only the changed/extra package.
    if(Array.isArray(differences) && differences.length > 0){
        const targets = new Set()
        for(const difference of differences){
            if(difference?.type !== 'added' && difference?.type !== 'changed'){
                continue
            }
            const relativePath = normalizeRelative(difference.path || '')
            if(!isSafeProtectedRelative(relativePath)){
                continue
            }
            targets.add(relativePath)
        }
        for(const relativePath of targets){
            await fs.remove(path.join(instancePath, ...relativePath.split('/')))
        }
        return
    }

    for(const rootName of PROTECTED_ROOTS){
        const rootPath = path.join(instancePath, rootName)
        if(!(await fs.pathExists(rootPath))){
            continue
        }

        const entries = await fs.readdir(rootPath, { withFileTypes: true })
        for(const entry of entries){
            if(shouldIgnorePackageEntry(entry.name)){
                continue
            }
            if(entry.isFile() && !isPackageFile(rootName, entry.name)){
                continue
            }
            await fs.remove(path.join(rootPath, entry.name))
        }
    }
}

async function removeManifest(instanceDirectory, serverId){
    await fs.remove(getManifestPath(instanceDirectory, serverId))
}

module.exports = {
    PROTECTED_ROOTS,
    checkIntegrity,
    cleanProtectedContent,
    createManifest,
    getManifestPath,
    removeManifest
}
