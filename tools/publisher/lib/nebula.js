const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const { spawn } = require('child_process')
const { runNode } = require('./exec')
const { readJson, writeJson } = require('./config')

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

function summarize(config, id) {
    const dir = path.join(serversDir(config), id)
    const meta = readMeta(config, id)
    if (!meta) return null
    const mods = modsOf(dir)
    return {
        id,
        minecraft: minecraftVersionOf(id),
        name: meta.meta.name,
        packVersion: meta.meta.version,
        loader: loaderOf(meta),
        address: meta.meta.address,
        mainServer: !!meta.meta.mainServer,
        counts: { required: mods.required.length, optionalon: mods.optionalon.length, optionaloff: mods.optionaloff.length },
        hasIcon: fs.existsSync(path.join(dir, 'icon.png'))
    }
}

function listPacks(config) {
    const dir = serversDir(config)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'servermeta.json')))
        .map((entry) => summarize(config, entry.name))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function getPack(config, id) {
    const dir = assertPackId(config, id)
    const summary = summarize(config, id)
    const meta = readMeta(config, id)
    const mods = modsOf(dir)
    const filesDir = path.join(dir, 'files')
    return {
        ...summary,
        meta: meta.meta,
        javaMajor: meta.meta.javaOptions ? meta.meta.javaOptions.suggestedMajor || null : null,
        mods,
        filesEntries: fs.existsSync(filesDir) ? fs.readdirSync(filesDir).slice(0, 60) : [],
        path: dir
    }
}

const JAVA_OPTIONS = (major) => ({ supported: `>=${major} <${Number(major) + 1}`, suggestedMajor: Number(major), distribution: 'TEMURIN' })

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
    if ('javaMajor' in patch) {
        if (patch.javaMajor) meta.javaOptions = JAVA_OPTIONS(patch.javaMajor)
        else delete meta.javaOptions
    }
    if (patch.loaderVersion) {
        const { type } = loaderOf(data)
        if (type) data[type] = { ...data[type], version: String(patch.loaderVersion).trim() }
    }
    if (meta.version && !/^\d+(\.\d+){0,3}([-+][\w.]+)?$/.test(meta.version)) {
        throw new Error(`La version "${meta.version}" no es valida (usa algo como 1.2.0).`)
    }

    writeJson(file, data)
    return getPack(config, id)
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

/** Opens a folder in Explorer (the easiest way to drop configs, resource packs, shaders into "files"). */
function openFolder(config, id, what) {
    const dir = assertPackId(config, id)
    const folder = what === 'files' ? path.join(dir, 'files')
        : what === 'mods' ? path.join(dir, modsFolder(dir) || '')
            : dir
    fs.mkdirSync(folder, { recursive: true })
    if (process.platform === 'win32') spawn('explorer.exe', [folder], { detached: true, stdio: 'ignore' }).unref()
    return folder
}

module.exports = {
    LOADERS, CATEGORIES, env, rootPath, baseUrl, serversDir, generateDistro, runNebula, ensureBuilt,
    listPacks, getPack, patchMeta, createPack, saveMod, deleteMod, moveMod, saveIcon, iconPath, openFolder
}
