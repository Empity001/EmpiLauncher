/**
 * The failure report: what a person would need to look at a failed launch (versions, Java, memory, mods, the last lines of the game's
 * log and its crash report), as text. It goes nowhere by itself: the player copies it, saves it as a file, or presses "Enviar a soporte".
 *
 * Two kinds. The plain one (for copying) takes out everything that could identify the player or open their session: access tokens, the
 * player's name and ids in the launch arguments, e-mails, and the user name inside every path. The one for SUPPORT (support: {...}) is
 * meant for the author, who has to know who wrote and on what machine: it adds the player's name and id, a code to quote, and more about
 * the PC. It still never carries a token, a session, an e-mail or the Windows user name (those are taken out in both).
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const HIDDEN = '<oculto>'

/** @param {string} text @param {{ userName?: string, extra?: string[] }} [options] `extra`: other strings to hide wherever they appear (the player's own name, say). */
function redact(text, { userName = safeUserName(), extra = [] } = {}) {
    let out = String(text)
    // Launch arguments: the token and the identity travel as "--flag value".
    out = out.replace(/(--(?:accessToken|session|clientId|xuid|userProperties)[= ])(\S+)/gi, `$1${HIDDEN}`)
    out = out.replace(/(--(?:username|uuid)[= ])(\S+)/gi, (_m, flag) => `${flag}<oculto>`)
    // The same things written as key: value or JSON.
    out = out.replace(/("?(?:access_?token|refresh_?token|id_?token|token|secret|password|authorization)"?\s*[:=]\s*"?)([^"\s,}]{6,})/gi, `$1${HIDDEN}`)
    out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/g, `Bearer ${HIDDEN}`)
    out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, HIDDEN)   // a JWT, wherever it is
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<correo>')
    // The user name inside paths (C:\Users\name\..., /Users/name/..., /home/name/...), whatever the slash, and on its own.
    out = out.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, '$1<usuario>')
    out = out.replace(/(\/(?:Users|home)\/)[^/\s"']+/g, '$1<usuario>')
    const names = [userName, ...extra].filter((n) => typeof n === 'string' && n.trim().length >= 3)
    for (const name of names) out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<usuario>')
    // Long opaque strings (keys, hashes of a session) that no pattern above caught.
    out = out.replace(/\b[A-Za-z0-9_-]{48,}\b/g, HIDDEN)
    return out
}

function safeUserName() { try { return os.userInfo().username } catch { return '' } }

const tailLines = (file, count) => {
    try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-count).join('\n') } catch { return null }
}
const headLines = (file, count) => {
    try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(0, count).join('\n') } catch { return null }
}
function newestFile(dir, filter) {
    try {
        return fs.readdirSync(dir).filter(filter).map((name) => ({ name, at: fs.statSync(path.join(dir, name)).mtimeMs })).sort((a, b) => b.at - a.at)[0] || null
    } catch { return null }
}

/**
 * @param {object} input
 * @param {string} input.appVersion
 * @param {object|null} input.server           the distribution's server (name, version, minecraftVersion, modules), when known
 * @param {string} input.id                    the modpack id
 * @param {string} input.instanceDir           <instances>/<id>
 * @param {object} input.settings              { minRAM, maxRAM, java, jvmOptions } for this modpack
 * @param {object|null} input.exit             how the last game ended: { code, signal, stopped, at }
 * @param {string|null} input.accountType      'microsoft' | 'offline' | 'mojang' (never a name)
 * @param {string[]} [input.hide]              strings to take out (the player's name)
 * @param {object} [input.support]             makes it the report for support: { code, player: { name, uuid, type }, installed: {version}, language, performance, engineMb }
 */
function build(input) {
    const lines = []
    const add = (text = '') => lines.push(text)
    const s = input.server && input.server.rawServer ? input.server.rawServer : input.server || {}

    const support = input.support || null
    add(support ? 'INFORME PARA SOPORTE DE EMPI LAUNCHER' : 'INFORME DE EMPI LAUNCHER')
    add(`Generado: ${new Date().toISOString()}`)
    if (support) add(`Código del informe: ${support.code}`)
    add(support
        ? 'Lo envía el propio jugador desde el launcher, con su permiso, para que se revise. No lleva su sesión, sus claves, su correo ni el nombre de usuario de Windows.'
        : 'Este informe no se envía a ningún sitio: lo copias tú y lo compartes con quien quieras. Los datos personales están ocultos.')
    add()
    add('== Sistema ==')
    add(`Launcher: ${input.appVersion || 'desconocido'}`)
    add(`Windows: ${os.version ? os.version() + ' ' : ''}${os.release()} (${os.arch()})`)
    add(`Memoria del equipo: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB (libre ${(os.freemem() / 1024 ** 3).toFixed(1)} GB)`)
    add(`Procesador: ${os.cpus()[0] ? os.cpus()[0].model.trim() : 'desconocido'} (${os.cpus().length} núcleos)`)
    add(`Tipo de cuenta: ${input.accountType || 'ninguna'}`)
    if (support) {
        add(`Equipo encendido desde hace: ${(os.uptime() / 3600).toFixed(1)} horas`)
        add(`Zona horaria: ${(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '?' } })()}`)
        add(`Idioma del launcher: ${support.language || '?'}   Modo de rendimiento: ${support.performance || '?'}`)
        const free = (() => { try { const s = fs.statfsSync(input.instanceDir); return (s.bavail * s.bsize / 1024 ** 3).toFixed(1) } catch { return null } })()
        if (free != null) add(`Espacio libre en el disco del juego: ${free} GB`)
        if (support.engineMb) add(`Memoria del motor del launcher: ${support.engineMb} MB`)
    }
    add()
    add('== Modpack ==')
    add(`Id: ${input.id || 'ninguno'}`)
    add(`Nombre: ${s.name || '?'}  versión ${s.version || '?'}  Minecraft ${s.minecraftVersion || '?'}`)
    if (support && support.installed) add(`Instalado en este equipo: versión ${support.installed.version || 'desconocida'}${support.installed.version && s.version && support.installed.version !== s.version ? '  (distinta de la publicada)' : ''}`)
    const loader = (s.modules || []).find((m) => /ForgeHosted|Forge|Fabric|NeoForge/i.test(m.type || ''))
    if (loader) add(`Loader: ${loader.type} ${loader.id || ''}`.trim())
    add(`Java: ${input.settings.java || 'automático'}`)
    add(`Memoria: mínima ${input.settings.minRAM || '?'}, máxima ${input.settings.maxRAM || '?'}`)
    if (input.settings.jvmOptions && input.settings.jvmOptions.length) add(`Opciones de la JVM: ${input.settings.jvmOptions.join(' ')}`)
    add()
    add('== Última partida ==')
    if (input.exit) add(`Salió con código ${input.exit.code ?? 'ninguno'}${input.exit.signal ? ` (señal ${input.exit.signal})` : ''}${input.exit.stopped ? ', detenida por el jugador' : ''}${input.exit.at ? `, ${new Date(input.exit.at).toISOString()}` : ''}`)
    else add('Todavía no se ha jugado en esta sesión.')
    add()

    let mods = []
    try { mods = fs.readdirSync(path.join(input.instanceDir, 'mods')).filter((n) => /\.jar(\.disabled)?$/i.test(n)).sort() } catch { /* no mods folder */ }
    add(`== Mods (${mods.length}) ==`)
    for (const name of mods.slice(0, 400)) add(name)
    if (mods.length > 400) add(`... y ${mods.length - 400} más`)
    add()

    const crash = newestFile(path.join(input.instanceDir, 'crash-reports'), (n) => /^crash-.*\.txt$/i.test(n))
    if (crash && Date.now() - crash.at < 24 * 3600 * 1000) {
        add(`== Informe de fallo de Minecraft (${crash.name}) ==`)
        add(headLines(path.join(input.instanceDir, 'crash-reports', crash.name), 70) || '(no se pudo leer)')
        add()
    }
    const log = tailLines(path.join(input.instanceDir, 'logs', 'latest.log'), 120)
    add('== Últimas líneas del registro del juego ==')
    add(log == null ? '(el juego no ha escrito registro todavía)' : log)

    if (!support) return redact(lines.join('\n'), { extra: input.hide || [] })
    // for support the player is named: the identity block is written AFTER the hiding, so it survives it, and the log keeps their name too
    const who = support.player || {}
    const identity = [
        '== Jugador ==',
        `Nombre: ${who.name || 'desconocido'}`,
        `Cuenta: ${who.type === 'microsoft' ? 'Microsoft' : who.type === 'offline' ? 'sin conexión' : who.type || 'ninguna'}`,
        `Identificador (UUID): ${who.uuid || 'ninguno'}`,
        ''
    ].join('\n')
    const body = redact(lines.join('\n'))
    const at = body.indexOf('== Sistema ==')
    return at < 0 ? `${identity}\n${body}` : `${body.slice(0, at)}${identity}\n${body.slice(at)}`
}

module.exports = { build, redact }
