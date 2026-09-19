// Turning a modpack that already exists (PanolisSMP Lite) into a profile of another (PanolisSMP), instead of typing it in by hand.
//
// It compares the two folders and works out, for the new profile: which mods and files only the other one has (they are copied into
// this modpack and left out of the profiles that already exist), which only this one has (the new profile leaves them out), which
// mods the other one ships switched off, and which files have the same path but another content (kept as the new profile's own
// version, see profiles.js). Nothing is ever deleted: the other modpack is only deactivated, if asked to, and can be activated again.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const nebula = require('./nebula')
const profiles = require('./profiles')

const { fileKey, posix, slugify, VARIANT_DIR, MAX_PROFILES } = profiles

// ---------------------------------------------------------------- where things are

/** The folder of a modpack that is published or deactivated. */
function dirOf(config, id) {
    if (!id || id !== path.basename(id)) throw new Error(`No existe el modpack "${id}".`)
    for (const base of [nebula.serversDir(config), nebula.hideDir(config)]) {
        const dir = path.join(base, id)
        if (fs.existsSync(path.join(dir, 'servermeta.json'))) return dir
    }
    throw new Error(`No existe el modpack "${id}".`)
}

const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }

/**
 * Every other modpack, published or not, and whether it could become a profile of this one (same Minecraft and same loader: they share
 * the instance folder and the mods have to run on the same game). The ones that cannot say why, so the list never looks like it forgot one.
 */
function candidates(config, id) {
    const target = nebula.getPack(config, id)
    return nebula.listPacks(config)
        .filter((pack) => pack.id !== id)
        .map((pack) => {
            const sameMinecraft = pack.minecraft === target.minecraft
            const sameLoader = pack.loader.type === target.loader.type
            const reason = sameMinecraft && sameLoader ? null
                : !sameMinecraft ? `Es de Minecraft ${pack.minecraft} y este de ${target.minecraft}`
                    : `Usa ${LOADER_NAMES[pack.loader.type] || 'otro loader'} y este ${LOADER_NAMES[target.loader.type] || 'otro'}`
            return {
                id: pack.id, name: pack.name, packVersion: pack.packVersion, active: pack.active,
                mods: pack.counts.required + pack.counts.optionalon + pack.counts.optionaloff,
                compatible: reason === null, reason
            }
        })
        .sort((a, b) => Number(b.compatible) - Number(a.compatible) || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }))
}

// ---------------------------------------------------------------- comparing

function md5(file) {
    const hash = crypto.createHash('md5')
    const fd = fs.openSync(file, 'r')
    const buffer = Buffer.alloc(1 << 20)
    try {
        let read
        while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read))
    } finally {
        fs.closeSync(fd)
    }
    return hash.digest('hex')
}

const sameContent = (a, b) => a.size === b.size && md5(a.abs) === md5(b.abs)

/** "PanolisSMP Lite" next to "PanolisSMP" -> "Lite". */
function suggestName(targetName, sourceName) {
    const target = String(targetName || '').trim()
    const source = String(sourceName || '').trim()
    const stripped = source.toLowerCase().startsWith(target.toLowerCase()) ? source.slice(target.length).replace(/^[\s\-_:·]+/, '').trim() : source
    return (stripped || source || 'Perfil').slice(0, 32)
}

/** Everything the import would do, with where each file is (work) and the summary for the person (view). */
function compare(config, id, sourceId) {
    if (id === sourceId) throw new Error('Un modpack no puede ser perfil de sí mismo.')
    const targetDir = nebula.packDir(config, id)
    const sourceDir = dirOf(config, sourceId)
    const targetPack = nebula.getPack(config, id)
    const sourcePack = nebula.getPack(config, sourceId)
    if (sourcePack.minecraft !== targetPack.minecraft || sourcePack.loader.type !== targetPack.loader.type) {
        throw new Error('Solo se puede traer un modpack con la misma versión de Minecraft y el mismo loader.')
    }
    const target = profiles.inventoryOf(targetDir)
    const source = profiles.inventoryOf(sourceDir)

    // mods, by name without version
    const targetMods = new Map(target.mods.map((mod) => [mod.stem, mod]))
    const sourceMods = new Map(source.mods.map((mod) => [mod.stem, mod]))
    const mods = { copy: [], leave: [], off: [], stillOff: [], differentVersion: [], shared: 0 }
    for (const mod of source.mods) {
        const mine = targetMods.get(mod.stem)
        if (!mine) { mods.copy.push(mod); continue }
        mods.shared++
        const names = (list) => [...new Set(list)].sort().join('|')
        if (names(mine.names) !== names(mod.names)) mods.differentVersion.push({ stem: mod.stem, target: [...new Set(mine.names)].join(', '), source: [...new Set(mod.names)].join(', ') })
        if (mod.category === 'optionaloff' && mine.category !== 'optionaloff') mods.off.push(mod.stem)
        else if (mine.category === 'optionaloff' && mod.category !== 'optionaloff') mods.stillOff.push(mod.stem)
    }
    for (const mod of target.mods) if (!sourceMods.has(mod.stem)) mods.leave.push(mod.stem)

    // files, by path
    const targetFiles = new Map(target.files.map((file) => [fileKey(file.path), file]))
    const sourceFiles = new Map(source.files.map((file) => [fileKey(file.path), file]))
    const files = { copy: [], leave: [], own: [], same: 0 }
    for (const file of source.files) {
        const mine = targetFiles.get(fileKey(file.path))
        if (!mine) files.copy.push(file)
        else if (sameContent(mine, file)) files.same++
        else files.own.push(file)
    }
    for (const file of target.files) if (!sourceFiles.has(fileKey(file.path))) files.leave.push(file.path)

    const existing = profiles.stored(nebula.readServerMeta(config, id))
    const bytes = mods.copy.reduce((sum, mod) => sum + mod.size, 0) + files.copy.reduce((sum, file) => sum + file.size, 0) + files.own.reduce((sum, file) => sum + file.size, 0)
    const brief = (list) => list.map(({ path: filePath, size }) => ({ path: filePath, size }))
    const view = {
        source: { id: sourceId, name: sourcePack.name, active: sourcePack.active, packVersion: sourcePack.packVersion },
        target: { id, name: targetPack.name },
        suggestedName: suggestName(targetPack.name, sourcePack.name),
        hadProfiles: !!existing,
        existing: existing ? existing.list.map((profile) => profile.name) : [],
        mods: {
            copy: mods.copy.map(({ stem, names, category, size }) => ({ stem, names, category, size })),
            leave: mods.leave, off: mods.off, stillOff: mods.stillOff, differentVersion: mods.differentVersion, shared: mods.shared
        },
        files: { copy: brief(files.copy), leave: files.leave, own: brief(files.own), same: files.same },
        bytes
    }
    return { view, work: { mods, files, targetDir, sourceDir, targetPack, sourcePack, existing } }
}

/** What bringing `sourceId` in as a profile of `id` would do. Reads only. */
function plan(config, id, sourceId) {
    return compare(config, id, sourceId).view
}

// ---------------------------------------------------------------- doing it

function copyInto(from, to) {
    if (fs.existsSync(to)) return false
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    return true
}

function uniqueId(name, taken, fallback) {
    let id = slugify(name) || fallback
    for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
    taken.add(id)
    return id
}

/**
 * Copies what the other modpack has and this one lacks, stores the new profile (and, when this modpack had none, the profile it
 * already was) and, if asked, deactivates the other one. `options`: { name, baseName, deactivate }. Safe to interrupt and repeat:
 * files already there are never overwritten.
 */
function importFrom(config, id, sourceId, options = {}) {
    const { view, work } = compare(config, id, sourceId)
    const name = String(options.name || view.suggestedName).trim()
    if (!name) throw new Error('Ponle un nombre al perfil.')
    if (name.length > 32) throw new Error('El nombre del perfil es demasiado largo (máximo 32 letras).')
    const { existing } = work
    if (existing && existing.list.length >= MAX_PROFILES) throw new Error(`Como máximo ${MAX_PROFILES} perfiles por modpack.`)
    if (existing && existing.list.some((profile) => profile.name.toLowerCase() === name.toLowerCase())) throw new Error(`Ya hay un perfil llamado "${name}".`)
    const baseName = String(options.baseName || '').trim() || 'Normal'
    if (!existing && baseName.toLowerCase() === name.toLowerCase()) throw new Error('El perfil actual de este modpack y el nuevo no pueden llamarse igual.')

    const taken = new Set(existing ? existing.list.map((profile) => profile.id) : [])
    const baseId = existing ? null : uniqueId(baseName, taken, 'normal')
    const newId = uniqueId(name, taken, 'perfil')

    // 1. the files (additive: nothing is overwritten)
    const loader = nebula.loaderOf(nebula.readServerMeta(config, id))
    const modsFolder = nebula.modsOf(work.targetDir).folder || `${loader.type}mods`
    const copied = { mods: 0, files: 0, own: 0 }
    for (const mod of work.mods.copy) {
        for (const file of mod.files) if (copyInto(file.abs, path.join(work.targetDir, modsFolder, file.category, file.name))) copied.mods++
    }
    for (const file of work.files.copy) if (copyInto(file.abs, path.join(work.targetDir, 'files', ...file.path.split('/')))) copied.files++
    for (const file of work.files.own) if (copyInto(file.abs, path.join(work.targetDir, 'files', VARIANT_DIR, newId, ...file.path.split('/')))) copied.own++

    // 2. the profiles: what only the other modpack has is left out of the ones that already existed
    const addedMods = work.mods.copy.map((mod) => mod.stem)
    const addedFiles = work.files.copy.map((file) => fileKey(file.path))
    const union = (a, b) => [...new Set([...a, ...b])]
    const list = existing
        ? existing.list.map((profile) => ({ ...profile, exclude: { mods: union(profile.exclude.mods, addedMods), files: union(profile.exclude.files, addedFiles) } }))
        : [{ id: baseId, name: baseName, description: '', recommendedBelowGb: null, ram: null, exclude: { mods: addedMods, files: addedFiles }, optionalOff: [] }]

    const sourceRam = ramOf(work.sourceDir)
    const targetRam = ramOf(work.targetDir)
    const description = String(work.sourcePack.meta.description || '').trim()
    list.push({
        id: newId,
        name,
        description: description && description !== String(work.targetPack.meta.description || '').trim() ? description.slice(0, 160) : '',
        recommendedBelowGb: null,
        ram: sourceRam && JSON.stringify(sourceRam) !== JSON.stringify(targetRam) ? sourceRam : null,
        exclude: { mods: work.mods.leave, files: work.files.leave.map(fileKey) },
        optionalOff: work.mods.off
    })

    const meta = nebula.readServerMeta(config, id)
    meta.profiles = profiles.normalize({ default: existing ? existing.default : baseId, list })
    nebula.writeServerMeta(config, id, meta)

    // 3. the other modpack stays on its shelf (nothing is deleted)
    let deactivated = false
    let warning = null
    if (options.deactivate !== false && work.sourcePack.active) {
        try { nebula.setActive(config, sourceId, false); deactivated = true } catch (err) { warning = err.message }
    }
    return { profileId: newId, copied, deactivated, warning, editor: profiles.describe(config, id) }
}

/** The memory a modpack asks for, as the profiles store it ({ minimumMb, maximumMb }), or null. */
function ramOf(dir) {
    try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, 'servermeta.json'), 'utf8').replace(/^\uFEFF/, ''))
        const ram = meta.meta && meta.meta.javaOptions && meta.meta.javaOptions.ram
        return ram && Number.isFinite(ram.maximum) ? { minimumMb: Number.isFinite(ram.minimum) ? ram.minimum : ram.maximum, maximumMb: ram.maximum } : null
    } catch { return null }
}

module.exports = { candidates, plan, importFrom, suggestName, dirOf, posix }
