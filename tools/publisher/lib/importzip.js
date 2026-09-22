/**
 * "Importar desde zip": the author zips a real instance folder (a Modrinth App profile, a CurseForge/Prism .minecraft, a plain
 * .minecraft) and this sorts it into a new modpack instead of dragging mods one by one. Two steps, matching the two-step feel of
 * the rest of the Publisher (nothing is created until the author presses the button):
 *
 *   inspect(zipPath)  reads the zip's index only (lib/zipfile.js), works out what Minecraft version and loader it is for, and
 *                      counts what would come in and what would be left out. Nothing is written to a modpack yet.
 *   apply(...)         creates the modpack (nebula.createPack, same as the manual form) and copies the kept files into it.
 *
 * What is kept: .jar files directly inside mods/ (not the disabled ones, renamed *.jar.disabled by Modrinth/Prism/MultiMC),
 * everything under config/, and .zip files directly inside resourcepacks/ and shaderpacks/ (an unzipped resource or shader pack
 * folder is left out and reported, same as the Publisher's own upload only accepts .zip there). Everything else - saves,
 * screenshots, logs, crash-reports, per-player caches, launcher bookkeeping - is left out and listed, so the author sees what did
 * not come along instead of wondering where it went.
 *
 * Detecting the Minecraft version and loader (best source first):
 *   1. logs/latest.log (or the newest logs/*.log / *.log.gz): the game's own startup line says it outright. Fabric prints
 *      "Loading Minecraft X with Fabric Loader Y" (X and Y both exact). Forge and NeoForge run through ModLauncher, which logs
 *      its full argument list once, including --fml.mcVersion and either --fml.forgeVersion or --fml.neoForgeVersion (also
 *      exact). This is the only source exact enough to also give the LOADER VERSION Nebula needs.
 *   2. mod filenames, when there is no log to read: mod authors put the Minecraft version in almost every filename ("...-1.20.1-
 *      ...jar"), so the most common "1.x" or "1.x.y" token across the mod list is a good guess, and counting "fabric" against
 *      "forge"/"neoforge" in the same names guesses the loader. This NEVER gives a loader version (nothing in a filename says
 *      that reliably), so it is offered as source "guess", always shown to the author to confirm or fix before creating anything.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')
const zipfile = require('./zipfile')
const nebula = require('./nebula')

const KEEP = { mods: 'mods', config: 'config', resourcepacks: 'resourcepacks', shaderpacks: 'shaderpacks' }
const STAGING_TTL_MS = 3 * 60 * 60 * 1000   // an import nobody confirmed within 3 hours is assumed abandoned

function stagingRoot() {
    return path.join(os.tmpdir(), 'empi-publisher-imports')
}

/** Deletes staged uploads nobody confirmed a while ago. Called on every inspect(), so orphans never pile up even across restarts. */
function sweepStaleImports() {
    const root = stagingRoot()
    let names
    try { names = fs.readdirSync(root) } catch { return }
    const cutoff = Date.now() - STAGING_TTL_MS
    for (const name of names) {
        const dir = path.join(root, name)
        try { if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true }) } catch { /* already gone */ }
    }
}

// ---------------------------------------------------------------- detecting Minecraft version and loader

/** The exact values from the game's own log line, or null when none of the entries has one. */
function detectFromLog(text) {
    const fabric = /Loading Minecraft (\S+) with Fabric Loader (\S+)/.exec(text)
    if (fabric) return { minecraft: fabric[1], loader: 'fabric', loaderVersion: fabric[2], source: 'log' }

    const mc = /--fml\.mcVersion,\s*([^\s,\]]+)/.exec(text)
    const forge = /--fml\.forgeVersion,\s*([^\s,\]]+)/.exec(text)
    const neoforge = /--fml\.neoForgeVersion,\s*([^\s,\]]+)/.exec(text)
    if (mc && neoforge) return { minecraft: mc[1], loader: 'neoforge', loaderVersion: neoforge[1], source: 'log' }
    if (mc && forge) return { minecraft: mc[1], loader: 'forge', loaderVersion: forge[1], source: 'log' }
    return null
}

/** A weaker guess from the mod filenames alone: no log to read, or the game was never launched. Never gives a loader version. */
function detectFromFilenames(names) {
    if (names.length === 0) return null
    const votes = new Map()
    // no \b before the "1": a letter can sit right against it ("mc1.20.1", very common), only another digit must not ("21.20" is not "1.20").
    for (const name of names) {
        for (const match of name.matchAll(/(?<!\d)1\.\d{1,2}(?:\.\d{1,2})?\b/g)) votes.set(match[0], (votes.get(match[0]) || 0) + 1)
    }
    let minecraft = null, best = 0
    for (const [version, count] of votes) {
        // ties favour the more specific "1.20.1" over "1.20": a mod's own unrelated version is rarely a plain two-part "1.x" too
        if (count > best || (count === best && minecraft && version.split('.').length > minecraft.split('.').length)) { minecraft = version; best = count }
    }
    if (!minecraft || best < 2 || best < names.length * 0.2) return null   // fewer than two mods agreeing is not "the mods agree", it's one mod

    const neo = names.filter((n) => /neoforge/i.test(n)).length
    const forge = names.filter((n) => /forge/i.test(n) && !/neoforge/i.test(n)).length
    const fabric = names.filter((n) => /fabric/i.test(n)).length
    const ranked = [['neoforge', neo], ['forge', forge], ['fabric', fabric]].sort((a, b) => b[1] - a[1])
    if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return { minecraft, loader: null, loaderVersion: null, source: 'guess' }
    return { minecraft, loader: ranked[0][0], loaderVersion: null, source: 'guess' }
}

// ---------------------------------------------------------------- reading the zip

/** If every entry sits under one shared top folder (the author zipped the profile folder itself, not its contents), that folder is dropped. */
function stripCommonRoot(entries) {
    const tops = new Set(entries.map((entry) => entry.name.split('/')[0]))
    if (tops.size !== 1) return entries
    const only = [...tops][0]
    if (Object.values(KEEP).some((known) => known.toLowerCase() === only.toLowerCase())) return entries   // that "one folder" IS mods/ or config/ itself
    const prefix = `${only}/`
    return entries.filter((entry) => entry.name.startsWith(prefix) || entry.name === only).map((entry) => ({ ...entry, name: entry.name.slice(prefix.length) }))
}

/** { name, size } for entries a step below `folder/`, only where `test` says yes (mods/config/resourcepacks/shaderpacks each have their own rule). */
function directChildren(entries, folder, test) {
    const prefix = `${folder}/`
    return entries.filter((entry) => !entry.dir && entry.name.startsWith(prefix) && !entry.name.slice(prefix.length).includes('/') && test(entry.name.slice(prefix.length)))
}

/** Sorts the zip's entries into what would be imported and what would be left out, without touching disk beyond the zip itself. */
function classify(entries) {
    const stripped = stripCommonRoot(entries)
    const mods = directChildren(stripped, KEEP.mods, (name) => /\.jar$/i.test(name))
    // Modrinth App, Prism and MultiMC all disable a mod by renaming "foo.jar" to "foo.jar.disabled": left out, and counted so the author
    // knows (its own line, not folded into "skipped": that list is for what the author might not expect, not for the disabling they chose).
    const disabledEntries = directChildren(stripped, KEEP.mods, (name) => /\.jar\.disabled$/i.test(name))
    const config = stripped.filter((entry) => !entry.dir && entry.name.startsWith(`${KEEP.config}/`))
    const resourcepacks = directChildren(stripped, KEEP.resourcepacks, (name) => /\.zip$/i.test(name))
    const shaderpacks = directChildren(stripped, KEEP.shaderpacks, (name) => /\.zip$/i.test(name))
    const kept = new Set([...mods, ...config, ...resourcepacks, ...shaderpacks, ...disabledEntries].map((entry) => entry.name))

    // everything else, grouped by its top-level name, so "saves (51 MB)" reads better than fifty file names
    const skippedTotals = new Map()
    for (const entry of stripped) {
        if (entry.dir || kept.has(entry.name)) continue
        const top = entry.name.split('/')[0] || entry.name
        skippedTotals.set(top, (skippedTotals.get(top) || 0) + entry.size)
    }
    const skipped = [...skippedTotals.entries()].map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size)

    return { stripped, mods, config, resourcepacks, shaderpacks, disabledMods: disabledEntries.length, skipped }
}

/** logs/latest.log if present, else the newest of logs/*.log or *.log.gz (Windows keeps rotated ones gzipped, like Zombie Invade's logs folder). */
function pickLogEntry(entries) {
    const inLogs = entries.filter((entry) => !entry.dir && /^logs\//i.test(entry.name) && /\.log(\.gz)?$/i.test(entry.name))
    return inLogs.find((entry) => /\/latest\.log$/i.test(entry.name)) || inLogs.sort((a, b) => b.name.localeCompare(a.name))[0] || null
}

async function readEntryText(zip, entry) {
    // extractTo always writes to a path; a throwaway temp file is simpler here than teaching it to also hand back a stream, and the
    // log entry is at most a few hundred KB.
    const temp = path.join(os.tmpdir(), `empi-import-log-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await zip.extractTo(entry, temp)
    try {
        const raw = fs.readFileSync(temp)
        return /\.gz$/i.test(entry.name) ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8')
    } finally {
        fs.rmSync(temp, { force: true })
    }
}

/** Reads the uploaded zip (already saved to disk) and works out what it holds, without creating or touching any modpack. */
async function inspect(uploadedZipPath) {
    sweepStaleImports()
    const importId = crypto.randomUUID()
    const dir = path.join(stagingRoot(), importId)
    fs.mkdirSync(dir, { recursive: true })
    const zipPath = path.join(dir, 'upload.zip')
    fs.renameSync(uploadedZipPath, zipPath)

    const zip = zipfile.open(zipPath)
    let plan, proposal
    try {
        plan = classify(zip.entries)
        const logEntry = pickLogEntry(plan.stripped)
        proposal = logEntry ? detectFromLog(await readEntryText(zip, logEntry)) : null
        if (!proposal) proposal = detectFromFilenames(plan.mods.map((entry) => entry.name.split('/').pop()))
    } finally {
        zip.close()
    }

    const sum = (list) => list.reduce((total, entry) => total + entry.size, 0)
    return {
        importId,
        proposal: proposal || null,
        counts: { mods: plan.mods.length, disabledMods: plan.disabledMods, configFiles: plan.config.length, resourcepacks: plan.resourcepacks.length, shaderpacks: plan.shaderpacks.length },
        sizeBytes: sum(plan.mods) + sum(plan.config) + sum(plan.resourcepacks) + sum(plan.shaderpacks),
        skipped: plan.skipped.slice(0, 12)
    }
}

/** importId only ever comes from crypto.randomUUID() (inspect()'s own return value); this rejects anything else before it is ever
 * joined into a filesystem path, so a crafted "../../somewhere" in a request body can not point apply()'s cleanup outside the
 * staging folder. */
function assertImportId(importId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId || '')) throw new Error('Importación no válida.')
    return importId
}

/** Finds a staged import by id, or says clearly that it is gone (swept, or the server restarted since). */
function stagedZip(importId) {
    const zipPath = path.join(stagingRoot(), assertImportId(importId), 'upload.zip')
    if (!fs.existsSync(zipPath)) throw new Error('Ese archivo ya no está disponible (pasó demasiado tiempo). Súbelo otra vez.')
    return zipPath
}

/** Copies a staged zip's kept files into a modpack that already exists (id). Used by apply() right after creating one; split out so it
 * can also be tested (and, later, reused to bulk-update an existing modpack's mods) without spawning the real Nebula CLI each time. */
async function copyInto(config, id, importId, log) {
    const zipPath = stagedZip(importId)
    const dir = nebula.packDir(config, id)
    const zip = zipfile.open(zipPath)
    try {
        const plan = classify(zip.entries)
        const modsFolder = nebula.modsFolder(dir)
        if (plan.mods.length > 0 && !modsFolder) throw new Error('Este modpack no tiene carpeta de mods (¿el loader no llegó a crearse?).')

        for (const entry of plan.mods) await zip.extractTo(entry, path.join(dir, modsFolder, 'required', path.basename(entry.name)))
        log(`${plan.mods.length} ${plan.mods.length === 1 ? 'mod' : 'mods'} copiados${plan.disabledMods ? ` (${plan.disabledMods} estaban desactivados y no se incluyeron)` : ''}.`)

        for (const entry of plan.config) await zip.extractTo(entry, path.join(dir, 'files', 'config', entry.name.slice(KEEP.config.length + 1)))
        if (plan.config.length) log(`${plan.config.length} archivos de configuración copiados.`)

        for (const entry of plan.resourcepacks) await zip.extractTo(entry, path.join(dir, 'files', 'resourcepacks', path.basename(entry.name)))
        if (plan.resourcepacks.length) log(`${plan.resourcepacks.length} ${plan.resourcepacks.length === 1 ? 'paquete de recursos' : 'paquetes de recursos'} copiados.`)

        for (const entry of plan.shaderpacks) await zip.extractTo(entry, path.join(dir, 'files', 'shaderpacks', path.basename(entry.name)))
        if (plan.shaderpacks.length) log(`${plan.shaderpacks.length} ${plan.shaderpacks.length === 1 ? 'paquete de shaders' : 'paquetes de shaders'} copiados.`)

        if (plan.skipped.length) log(`No se incluyó (no hacía falta): ${plan.skipped.map((entry) => entry.name).join(', ')}.`)
        return { mods: plan.mods.length, disabledMods: plan.disabledMods, config: plan.config.length, resourcepacks: plan.resourcepacks.length, shaderpacks: plan.shaderpacks.length }
    } finally {
        zip.close()
    }
}

/** Creates the modpack (like the manual form) and copies the kept files into it. Removes the staged zip either way. */
async function apply(config, importId, options, log, step) {
    assertImportId(importId)   // validated up front: the cleanup below joins it into a path even if creating the pack fails first
    try {
        step('Creando la estructura con Nebula')
        const { id } = await nebula.createPack(config, options, log, step)
        step('Copiando mods, configuración y recursos del zip')
        const counts = await copyInto(config, id, importId, log)
        return { id, counts }
    } finally {
        fs.rmSync(path.join(stagingRoot(), importId), { recursive: true, force: true })
    }
}

module.exports = { inspect, apply, copyInto, classify, detectFromLog, detectFromFilenames, stripCommonRoot, sweepStaleImports, stagingRoot }
