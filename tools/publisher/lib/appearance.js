// The launcher dresses each modpack from a few files in its `files` folder (background.*, banner.*,
// theme.json) plus the accent colour in servermeta.json. This module manages the image files; the accent
// goes through nebula.patchMeta.

const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const nebula = require('./nebula')

const FULL = ['png', 'gif', 'apng', 'webp', 'jpg', 'jpeg', 'avif']
const PREVIEW = ['webp', 'png', 'jpg']

// The names and extensions are the ones the launcher looks for (landing.js getLandingVisualModules).
const KINDS = {
    background: { extensions: FULL, label: 'Fondo' },
    'background-preview': { extensions: PREVIEW, label: 'Vista previa del fondo' },
    banner: { extensions: FULL, label: 'Banner' },
    'banner-preview': { extensions: PREVIEW, label: 'Vista previa del banner' }
}

const MIME = { png: 'image/png', apng: 'image/apng', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif' }

function filesDir(config, id) {
    return path.join(nebula.packDir(config, id), 'files')
}

function assertKind(kind) {
    if (!KINDS[kind]) throw new Error('Tipo de imagen no valido.')
    return KINDS[kind]
}

/** The current file of a kind, or null. The launcher takes the first extension it finds, so there is only ever one. */
function find(config, id, kind) {
    const { extensions } = assertKind(kind)
    const dir = filesDir(config, id)
    for (const extension of extensions) {
        const file = path.join(dir, `${kind}.${extension}`)
        if (fs.existsSync(file)) return { file, extension, name: path.basename(file), size: fs.statSync(file).size, mime: MIME[extension] }
    }
    return null
}

function info(config, id) {
    const result = {}
    for (const kind of Object.keys(KINDS)) {
        const found = find(config, id, kind)
        result[kind] = found && { name: found.name, size: found.size }
    }
    return result
}

function remove(config, id, kind) {
    const { extensions } = assertKind(kind)
    for (const extension of extensions) fs.rmSync(path.join(filesDir(config, id), `${kind}.${extension}`), { force: true })
}

async function save(config, id, kind, extension, stream) {
    const { extensions } = assertKind(kind)
    const clean = String(extension || '').toLowerCase().replace(/^\./, '')
    if (!extensions.includes(clean)) throw new Error(`Para "${KINDS[kind].label}" usa uno de estos formatos: ${extensions.join(', ')}.`)

    const dir = filesDir(config, id)
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, `${kind}.${clean}`)
    await pipeline(stream, fs.createWriteStream(`${target}.part`))
    remove(config, id, kind) // never leave a second candidate next to the new one
    fs.renameSync(`${target}.part`, target)
    return info(config, id)
}

module.exports = { KINDS, find, info, save, remove }
