const fs = require('fs')
const path = require('path')

/**
 * The launcher's background styles ("estilos"), kept in native/src/EmpiLauncher.App/Styles/styles.json. The native launcher embeds that
 * file and offers only the base style plus the ones with a releasedIn version, so each style reaches players as its own update:
 *
 *   ported      the style's code exists in the native launcher (only then can it be released)
 *   releasedIn  the launcher version that turned it on, or null while it is still pending
 *
 * Compiling with a style writes its releasedIn before the installer is built; a compiled build that was never sent gives its style back
 * (releasedIn null again) as soon as something else is compiled, so an abandoned build never switches a style on by accident.
 */
const FILE = ['native', 'src', 'EmpiLauncher.App', 'Styles', 'styles.json']

function manifestPath(config) {
    return path.join(config.launcherRepoPath, ...FILE)
}

function read(config) {
    const file = manifestPath(config)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function write(config, manifest) {
    fs.writeFileSync(manifestPath(config), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/**
 * Every style and where it stands. unsentStyle is the style of a compiled installer that was not sent yet (it is written in the manifest
 * but no player has it).
 *   base       the one every launcher has
 *   published  already out, in releasedIn
 *   compiled   in the installer that is waiting to be sent
 *   ready      ported and not out yet: can be picked
 *   preparing  not ported yet
 */
function list(config, unsentStyle) {
    const manifest = read(config)
    if (!manifest) return []
    return manifest.styles.map((style) => {
        let status
        if (style.id === manifest.base) status = 'base'
        else if (style.releasedIn && style.id === unsentStyle) status = 'compiled'
        else if (style.releasedIn) status = 'published'
        else status = style.ported ? 'ready' : 'preparing'
        return { id: style.id, name: style.name, summary: style.summary, accent: style.accent, notes: style.notes || '', releasedIn: style.releasedIn || null, status }
    })
}

/**
 * Before an installer is built: the style of an earlier unsent build is given back, and the chosen one (if any) is switched on for this
 * version. Returns whether the manifest changed.
 */
function prepare(config, { style, version, unsentStyle, kind }, log = () => {}) {
    const manifest = read(config)
    if (!manifest) {
        if (style) throw new Error('Esta copia del launcher no tiene la lista de estilos (Styles/styles.json).')
        return false
    }
    let changed = false
    if (unsentStyle && unsentStyle !== style) {
        const previous = manifest.styles.find((s) => s.id === unsentStyle)
        if (previous && previous.releasedIn) {
            previous.releasedIn = null
            changed = true
            log(`El estilo ${previous.name} vuelve a Pendientes (su instalador no se llegó a enviar).`)
        }
    }
    if (style) {
        const chosen = manifest.styles.find((s) => s.id === style)
        if (!chosen) throw new Error(`No existe el estilo "${style}".`)
        if (chosen.id === manifest.base) throw new Error(`${chosen.name} es el estilo de siempre: no hace falta publicarlo.`)
        if (!chosen.ported) throw new Error(`El estilo ${chosen.name} todavía se está preparando.`)
        if (kind && kind !== 'native') throw new Error('Los estilos solo existen en el launcher nativo: elige el instalador Nativo.')
        if (chosen.releasedIn && chosen.id !== unsentStyle) throw new Error(`El estilo ${chosen.name} ya salió en la versión ${chosen.releasedIn}.`)
        if (chosen.releasedIn !== version) {
            chosen.releasedIn = version
            changed = true
        }
        log(`Estilo ${chosen.name}: se activa en la versión ${version}.`)
    }
    if (changed) write(config, manifest)
    return changed
}

module.exports = { list, prepare, read, manifestPath }
