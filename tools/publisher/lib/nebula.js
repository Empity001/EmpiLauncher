const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const { spawn } = require('child_process')
const { runNode } = require('./exec')
const { readJson, writeJson } = require('./config')
const { normalizeRam } = require('./ram')

const LOADERS = ['fabric', 'forge', 'neoforge']
const CATEGORIES = ['required', 'optionalon', 'optionaloff']
const MOD_FOLDERS = ['fabricmods', 'forgemods', 'neoforgemods']

// ---------------------------------------------------------------- environment

/** Nebula's own .env is the source of truth for ROOT and BASE_URL; the settings only back it up. */
function env(config) {
    const values = {}
    try {
        for (const line of fs.readFileSync(path.join(config.nebulaProjectPath, '.env'), 'utf8').split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
            if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '')
        }
    } catch { /* no .env: fall back to the settings */ }
    return values
}

function rootPath(config) {
    return env(config).ROOT || config.nebulaRootPath
}

function baseUrl(config) {
    const url = env(config).BASE_URL || ''
    return url && !url.endsWith('/') ? `${url}/` : url
}

function serversDir(config) {
    return path.join(rootPath(config), 'servers')
}

/** Deactivated modpacks wait here: Nebula only reads `servers`, so what is in `hide` is never published. */
function hideDir(config) {
    return path.join(rootPath(config), 'hide')
}

// ---------------------------------------------------------------- running nebula

function newestMtime(dir) {
    let newest = 0
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs)
    }
    return newest
}

/** Nebula is TypeScript; compile it only when the sources are newer than the build (npm start rebuilt it on every run). */
async function ensureBuilt(config, log) {
    const entry = path.join(config.nebulaProjectPath, 'dist', 'index.js')
    const sourceDir = path.join(config.nebulaProjectPath, 'src')
    if (!fs.existsSync(path.join(config.nebulaProjectPath, 'node_modules'))) {
        throw new Error(`Nebula no tiene node_modules en ${config.nebulaProjectPath}. Corre "npm install" una vez ahi.`)
    }
    if (fs.existsSync(entry) && fs.statSync(entry).mtimeMs >= newestMtime(sourceDir)) return
    log('Compilando Nebula (solo hace falta cuando cambia su codigo)...')
    await runNode(path.join(config.nebulaProjectPath, 'node_modules', 'typescript', 'bin', 'tsc'), [], { cwd: config.nebulaProjectPath }, log)
}

async function runNebula(config, args, log) {
    await ensureBuilt(config, log)
    await runNode(path.join('dist', 'index.js'), args, { cwd: config.nebulaProjectPath }, log)
}

/** Nebula reports most failures in its log but still exits 0, so success is judged by a fresh distribution.json. */
async function generateDistro(config, log) {
    const target = path.join(rootPath(config), 'distribution.json')
    const startedAt = Date.now()
    const errors = []
    await runNebula(config, ['g', 'distro'], (line) => {
        if (/\[error\]/i.test(line)) errors.push(line)
        log(line)
    })
    if (!fs.existsSync(target) || fs.statSync(target).mtimeMs < startedAt - 1000) {
        throw new Error(`Nebula no pudo generar distribution.json.${errors.length ? ` ${errors.slice(-2).join(' ')}` : ' Revisa el registro de arriba.'}`)
    }
}

// ---------------------------------------------------------------- packs

function assertPackId(config, id) {
    const dir = path.join(serversDir(config), id)
    if (!id || id !== path.basename(id) || !fs.existsSync(path.join(dir, 'servermeta.json'))) {
        throw new Error(`No existe el modpack "${id}".`)
    }
    return dir
}

function metaPath(config, id) {
    return path.join(assertPackId(config, id), 'servermeta.json')
}

function readMeta(config, id) {
    return readJson(metaPath(config, id), null)
}

/** Nebula names a server folder "<id>-<minecraft version>". */
function minecraftVersionOf(id) {
    return id.slice(id.lastIndexOf('-') + 1)
}

function loaderOf(meta) {
    for (const type of LOADERS) {
        if (meta[type] && meta[type].version) return { type, version: meta[type].version }
    }
    return { type: null, version: null }
}

function modsFolder(dir) {
    return MOD_FOLDERS.find((name) => fs.existsSync(path.join(dir, name))) || null
}

function listFiles(dir) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.endsWith('.part'))
        .map((entry) => ({ name: entry.name, size: fs.statSync(path.join(dir, entry.name)).size }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function modsOf(dir) {
    const folder = modsFolder(dir)
    const result = { folder, required: [], optionalon: [], optionaloff: [] }
    if (!folder) return result
    for (const category of CATEGORIES) result[category] = listFiles(path.join(dir, folder, category))
    return result
}

function summarize(config, id, active = true) {
    const dir = path.join(active ? serversDir(config) : hideDir(config), id)
    const meta = readJson(path.join(dir, 'servermeta.json'), null)
    if (!meta) return null
    const mods = modsOf(dir)
    return {
        id,
        active,
        minecraft: minecraftVersionOf(id),
        name: meta.meta.name,
        packVersion: meta.meta.version,
        loader: loaderOf(meta),
        address: meta.meta.address,
        mainServer: !!meta.meta.mainServer,
        whitelist: !!meta.meta.whitelist,
        counts: { required: mods.required.length, optionalon: mods.optionalon.length, optionaloff: mods.optionaloff.length },
        hasIcon: fs.existsSync(path.join(dir, 'icon.png'))
    }
}

function packsIn(dir, active, config) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'servermeta.json')))
        .map((entry) => summarize(config, entry.name, active))
        .filter(Boolean)
        .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { sensitivity: 'base' }))
}

/** Every modpack: the active ones first (what gets published), then the deactivated ones (marked `active: false`). */
function listPacks(config) {
    return [...packsIn(serversDir(config), true, config), ...packsIn(hideDir(config), false, config)]
}

/**
 * Deactivate (move to `hide`) or activate (move back to `servers`) a modpack. Nothing is deleted and nothing is lost: the
 * folder just changes place. The change reaches players with the next Compile and Send. There is always one main server,
 * so if the one being deactivated was it, the first remaining active pack is promoted and the caller is told.
 */
function setActive(config, id, active) {
    if (!id || id !== path.basename(id)) throw new Error(`No existe el modpack "${id}".`)
    const from = path.join(active ? hideDir(config) : serversDir(config), id)
    const to = path.join(active ? serversDir(config) : hideDir(config), id)
    if (!fs.existsSync(path.join(from, 'servermeta.json'))) {
        throw new Error(active ? `El modpack "${id}" no esta desactivado.` : `No existe el modpack "${id}".`)
    }
    if (fs.existsSync(to)) throw new Error(`Ya hay un modpack llamado "${id}" en ${active ? 'los activos' : 'los desactivados'}.`)

    const wasMain = !active && !!(readJson(path.join(from, 'servermeta.json'), null)?.meta?.mainServer)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.renameSync(from, to)

    let promoted = null
    if (wasMain) {
        // A deactivated pack must not stay "the main one": clear it, and hand the role to another active pack if there is one.
        writeMainFlag(path.join(to, 'servermeta.json'), false)
        const next = packsIn(serversDir(config), true, config)[0]
        if (next) {
            writeMainFlag(path.join(serversDir(config), next.id, 'servermeta.json'), true)
            promoted = next.id
        }
    }
    return { id, active, promoted }
}

function writeMainFlag(file, value) {
    const data = readJson(file, null)
    if (!data) return
    data.meta.mainServer = value
    writeJson(file, data)
}

function getPack(config, id) {
    if (!id || id !== path.basename(id)) throw new Error(`No existe el modpack "${id}".`)
    // A deactivated pack can be looked at (and reactivated) but not edited.
    if (!fs.existsSync(path.join(serversDir(config), id, 'servermeta.json')) && fs.existsSync(path.join(hideDir(config), id, 'servermeta.json'))) {
        const dir = path.join(hideDir(config), id)
        const meta = readJson(path.join(dir, 'servermeta.json'), null)
        return { ...summarize(config, id, false), meta: meta.meta, mods: modsOf(dir), filesEntries: [], path: dir, javaMajor: null, ram: ramOf(meta) }
    }
    const dir = assertPackId(config, id)
    const summary = summarize(config, id)
    const meta = readMeta(config, id)
    const mods = modsOf(dir)
    const filesDir = path.join(dir, 'files')
    return {
        ...summary,
        meta: meta.meta,
        defaultDiscordImage: `${baseUrl(config)}servers/${id}/icon.png`,
        javaMajor: meta.meta.javaOptions ? meta.meta.javaOptions.suggestedMajor || null : null,
        ram: ramOf(meta),
        mods,
        filesEntries: fs.existsSync(filesDir) ? fs.readdirSync(filesDir).slice(0, 60) : [],
        path: dir
    }
}

const JAVA_OPTIONS = (major) => ({ supported: `>=${major} <${Number(major) + 1}`, suggestedMajor: Number(major), distribution: 'TEMURIN' })

// ---------------------------------------------------------------- memory (javaOptions.ram)

/** The memory the author asked for (see ram.js for how it is written), in megabytes, or null. */
function ramOf(data) {
    const ram = data && data.meta && data.meta.javaOptions && data.meta.javaOptions.ram
    if (!ram || !Number.isFinite(ram.maximum)) return null
    return { minimumMb: Number.isFinite(ram.minimum) ? ram.minimum : ram.maximum, maximumMb: ram.maximum }
}

/** Edits the handful of servermeta fields the UI exposes and leaves everything else in the file alone. */
function patchMeta(config, id, patch) {
    const file = metaPath(config, id)
    const data = readJson(file, null)
    const meta = data.meta

    for (const key of ['name', 'description', 'version', 'address']) {
        if (typeof patch[key] === 'string') meta[key] = patch[key].trim()
    }
    for (const key of ['mainServer', 'autoconnect', 'whitelist']) {
        if (typeof patch[key] === 'boolean') meta[key] = patch[key]
    }
    // There is one main server: choosing this one takes the role from whichever had it.
    if (patch.mainServer === true) {
        for (const other of packsIn(serversDir(config), true, config)) {
            if (other.id !== id && other.mainServer) writeMainFlag(path.join(serversDir(config), other.id, 'servermeta.json'), false)
        }
    }
    if ('javaMajor' in patch) {
        // choosing another Java must not take the memory the author set with it
        const ram = meta.javaOptions && meta.javaOptions.ram
        if (patch.javaMajor) meta.javaOptions = { ...JAVA_OPTIONS(patch.javaMajor), ...(ram ? { ram } : {}) }
        else if (ram) meta.javaOptions = { ram }
        else delete meta.javaOptions
    }
    if ('ram' in patch) {
        const current = meta.javaOptions || {}
        if (patch.ram) {
            meta.javaOptions = { ...current, ram: normalizeRam(patch.ram) }
        } else {
            const { ram: _removed, ...rest } = current
            if (Object.keys(rest).length > 0) meta.javaOptions = rest
            else delete meta.javaOptions
        }
    }
    if (patch.loaderVersion) {
        const { type } = loaderOf(data)
        if (type) data[type] = { ...data[type], version: String(patch.loaderVersion).trim() }
    }
    if ('accent' in patch) {
        const accent = patch.accent ? String(patch.accent).trim().toLowerCase() : ''
        if (accent && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(accent)) throw new Error('El color tiene que ser un hex como #5e89ff.')
        if (accent) meta.accent = accent
        else delete meta.accent
        syncThemeAccent(path.dirname(file), accent)
    }
    if ('discord' in patch) {
        const clean = (value) => String(value ?? '').trim()
        const discord = patch.discord && typeof patch.discord === 'object'
            ? { shortId: clean(patch.discord.shortId), largeImageText: clean(patch.discord.largeImageText), largeImageKey: clean(patch.discord.largeImageKey) }
            : null
        if (discord && (discord.shortId || discord.largeImageText || discord.largeImageKey)) meta.discord = discord
        else delete meta.discord
    }
    if (meta.version && !/^\d+(\.\d+){0,3}([-+][\w.]+)?$/.test(meta.version)) {
        throw new Error(`La version "${meta.version}" no es valida (usa algo como 1.2.0).`)
    }

    writeJson(file, data)
    return getPack(config, id)
}

/**
 * The launcher lets files/theme.json override the accent from the distribution, so the two are kept in
 * step: whatever colour is chosen here is written to both, and nothing else in theme.json is touched.
 */
function syncThemeAccent(packDirectory, accent) {
    const themeFile = path.join(packDirectory, 'files', 'theme.json')
    const theme = readJson(themeFile, {})
    if (accent) theme.accent = accent
    else delete theme.accent
    if (Object.keys(theme).length > 0) {
        fs.mkdirSync(path.dirname(themeFile), { recursive: true })
        writeJson(themeFile, theme)
    } else {
        fs.rmSync(themeFile, { force: true })
    }
}

function packDir(config, id) {
    return assertPackId(config, id)
}

function readServerMeta(config, id) {
    return readMeta(config, id)
}

function writeServerMeta(config, id, data) {
    writeJson(metaPath(config, id), data)
}

/** Fresh servers come with "<FILL IN>" placeholders from Nebula; blank them so nothing weird reaches players. */
function cleanPlaceholders(config, id, displayName) {
    const file = metaPath(config, id)
    const data = readJson(file, null)
    data.meta.name = displayName
    data.meta.description = ''
    data.meta.icon = ''
    if (data.meta.discord && String(data.meta.discord.shortId).includes('<FILL IN')) delete data.meta.discord
    writeJson(file, data)
}

async function createPack(config, options, log, step) {
    const { id, minecraft, loader, loaderVersion } = options
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id || '')) throw new Error('El nombre solo puede tener letras, numeros, guiones y guion bajo (sin espacios).')
    if (!/^\d+(\.\d+){1,2}$/.test(minecraft || '')) throw new Error('La version de Minecraft debe verse como 1.21.11.')
    if (!LOADERS.includes(loader)) throw new Error('Elige Fabric, Forge o NeoForge.')
    if (!loaderVersion || !String(loaderVersion).trim()) throw new Error('Falta la version del loader.')

    const effectiveId = `${id}-${minecraft}`
    if (fs.existsSync(path.join(serversDir(config), effectiveId))) {
        throw new Error(`Ya existe un modpack llamado ${effectiveId}.`)
    }

    step('Creando la estructura con Nebula')
    await runNebula(config, ['g', 'server', id, minecraft, `--${loader}`, String(loaderVersion).trim()], log)
    if (!fs.existsSync(path.join(serversDir(config), effectiveId, 'servermeta.json'))) {
        throw new Error('Nebula no creo el modpack. Revisa el registro de arriba.')
    }

    step('Dejando los ajustes listos')
    cleanPlaceholders(config, effectiveId, options.displayName || id)
    log(`Listo: ${effectiveId}. Ahora sube los mods y ajusta el resto en su ficha.`)
    return { id: effectiveId }
}

// ---------------------------------------------------------------- mods & files

function safeName(name) {
    const base = path.basename(String(name || ''))
    if (!base || base.startsWith('.') || base !== name) throw new Error('Nombre de archivo no valido.')
    return base
}

function categoryDir(config, id, category) {
    if (!CATEGORIES.includes(category)) throw new Error('Categoria no valida.')
    const dir = assertPackId(config, id)
    const folder = modsFolder(dir)
    if (!folder) throw new Error('Este modpack no tiene carpeta de mods.')
    return path.join(dir, folder, category)
}

async function saveMod(config, id, category, name, stream) {
    const dir = categoryDir(config, id, category)
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, safeName(name))
    const temp = `${target}.part`
    await pipeline(stream, fs.createWriteStream(temp))
    fs.renameSync(temp, target)
}

function deleteMod(config, id, category, name) {
    fs.rmSync(path.join(categoryDir(config, id, category), safeName(name)), { force: true })
}

function moveMod(config, id, from, to, name) {
    const source = path.join(categoryDir(config, id, from), safeName(name))
    const dir = categoryDir(config, id, to)
    fs.mkdirSync(dir, { recursive: true })
    fs.renameSync(source, path.join(dir, safeName(name)))
}

async function saveIcon(config, id, stream) {
    const target = path.join(assertPackId(config, id), 'icon.png')
    await pipeline(stream, fs.createWriteStream(`${target}.part`))
    fs.renameSync(`${target}.part`, target)
}

function iconPath(config, id) {
    const file = path.join(assertPackId(config, id), 'icon.png')
    return fs.existsSync(file) ? file : null
}

// ---------------------------------------------------------------- the files folder (shaders, resource packs, configs, the rest)

// What the launcher hands to every player from "files": these three folders get their own place in the Publisher (with the kind of
// file each takes); anything else in "files" (options.txt, servers.dat, data packs...) is listed as "other".
const FILE_KINDS = [
    { id: 'shaders', folder: 'shaderpacks', extensions: ['.zip'] },
    { id: 'resourcepacks', folder: 'resourcepacks', extensions: ['.zip'] },
    { id: 'config', folder: 'config', extensions: null }
]
// what the Apariencia tab looks after (see appearance.js): they are not uploaded or deleted from here
const APPEARANCE_FILE = /^(background|banner)(-preview)?\.[a-z0-9]+$|^theme\.json$/i

function filesRoot(config, id) {
    return path.join(assertPackId(config, id), 'files')
}

/** Size and number of files of a folder (stops counting after 5,000 files: this is for showing, not for accounting). */
function treeSize(dir) {
    let size = 0
    let files = 0
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (files >= 5000) return
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.isFile()) { size += fs.statSync(full).size; files++ }
        }
    }
    try { walk(dir) } catch { /* a folder that vanished while listing */ }
    return { size, files }
}

function entriesOf(dir) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || (entry.isFile() && !entry.name.endsWith('.part')))
        .map((entry) => {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) return { name: entry.name, dir: true, ...treeSize(full) }
            return { name: entry.name, dir: false, size: fs.statSync(full).size, files: 1 }
        })
        .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : a.dir ? -1 : 1))
}

/** Everything in a modpack's "files" folder: the three known folders, each with its entries, and the rest. */
function packFiles(config, id) {
    const root = filesRoot(config, id)
    const known = new Set(FILE_KINDS.map((kind) => kind.folder))
    const kinds = {}
    for (const kind of FILE_KINDS) kinds[kind.id] = { folder: kind.folder, extensions: kind.extensions, entries: entriesOf(path.join(root, kind.folder)) }
    const other = entriesOf(root).filter((entry) => !known.has(entry.name)).map((entry) => ({ ...entry, managed: APPEARANCE_FILE.test(entry.name) }))
    return { dir: root, kinds, other }
}

/** Where a file would go, having checked that it is allowed there. `folder` is one of the known folders, or '' for the top of "files". */
function fileTarget(config, id, folder, name) {
    const root = filesRoot(config, id)
    const kind = folder ? FILE_KINDS.find((candidate) => candidate.folder === folder) : null
    if (folder && !kind) throw new Error('Esa carpeta no es válida.')
    const base = safeName(name)
    if (kind && kind.extensions && !kind.extensions.includes(path.extname(base).toLowerCase())) {
        throw new Error(`En ${folder} solo se aceptan archivos ${kind.extensions.join(' o ')}.`)
    }
    if (!folder && APPEARANCE_FILE.test(base)) throw new Error(`${base} se cambia en la pestaña Apariencia.`)
    return { dir: folder ? path.join(root, folder) : root, base }
}

async function saveFile(config, id, folder, name, stream) {
    const { dir, base } = fileTarget(config, id, folder, name)
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, base)
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) throw new Error(`Ya hay una carpeta llamada ${base}.`)
    await pipeline(stream, fs.createWriteStream(`${target}.part`))
    fs.renameSync(`${target}.part`, target)
}

/** Removes a file or a folder of "files" (a shader pack that was unzipped is a folder). The known folders themselves stay. */
function deleteFile(config, id, folder, name) {
    const root = filesRoot(config, id)
    if (folder && !FILE_KINDS.some((kind) => kind.folder === folder)) throw new Error('Esa carpeta no es válida.')
    const base = safeName(name)
    if (!folder && (APPEARANCE_FILE.test(base) || FILE_KINDS.some((kind) => kind.folder === base))) {
        throw new Error(APPEARANCE_FILE.test(base) ? `${base} se cambia en la pestaña Apariencia.` : `La carpeta ${base} se vacía archivo por archivo.`)
    }
    fs.rmSync(path.join(folder ? path.join(root, folder) : root, base), { recursive: true, force: true })
}

/** Opens a folder in Explorer (the easiest way to drop configs, resource packs, shaders into "files"). */
function openFolder(config, id, what) {
    const dir = assertPackId(config, id)
    const kind = FILE_KINDS.find((candidate) => candidate.folder === what)
    const folder = what === 'files' ? path.join(dir, 'files')
        : kind ? path.join(dir, 'files', kind.folder)
            : what === 'mods' ? path.join(dir, modsFolder(dir) || '')
                : dir
    fs.mkdirSync(folder, { recursive: true })
    if (process.platform === 'win32') spawn('explorer.exe', [folder], { detached: true, stdio: 'ignore' }).unref()
    return folder
}

module.exports = {
    LOADERS, CATEGORIES, env, rootPath, baseUrl, serversDir, hideDir, generateDistro, runNebula, ensureBuilt,
    listPacks, getPack, setActive, patchMeta, createPack, saveMod, deleteMod, moveMod, saveIcon, iconPath, openFolder,
    packDir, readServerMeta, writeServerMeta, modsOf, loaderOf, minecraftVersionOf,
    FILE_KINDS, packFiles, saveFile, deleteFile
}
