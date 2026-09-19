/**
 * Launcher updates: is there a newer launcher, and getting it installed.
 *
 * The release carries the same channel file electron-builder always published (latest.yml: version, installer name, sha512,
 * size). There is ONE channel: the classic Electron launcher reads it too, so a player who still has the classic launcher is
 * offered this installer, and running it replaces the classic program with the native one (see native/build/installer.nsi).
 *
 *   update.check    -> what is newer, if anything
 *   update.install  -> download the installer, check its sha512, start it silently; the UI closes right after
 *   update.changelog -> the release notes of every version newer than this one, newest first (the whole trail, not just the last)
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')
const semver = require('semver')

const OWNER = 'Empity001'
const REPO = 'EmpiLauncher'
const CHANNEL_FILE = 'latest.yml'
/** The installer is named by a file we downloaded, so it must be a plain file name: never a path, never a URL. */
const INSTALLER_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,120}\.exe$/

/** electron-builder's latest.yml is flat enough to read without a YAML dependency: key: value lines and one files: list. */
function parseLatestYml(text) {
    const out = { files: [] }
    let file = null
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/\s+$/, '')
        const item = /^\s*-\s+(\w+):\s*(.*)$/.exec(line)
        const pair = /^\s*(\w+):\s*(.*)$/.exec(line)
        const unquote = (v) => v.replace(/^['"]|['"]$/g, '')
        if (item) { file = { [item[1]]: unquote(item[2]) }; out.files.push(file) }
        else if (pair && /^\s{2,}/.test(line) && file) file[pair[1]] = unquote(pair[2])
        else if (pair && !/^\s/.test(line)) { if (pair[1] !== 'files') out[pair[1]] = unquote(pair[2]); file = null }
    }
    return out
}

function register(handlers, state) {
    async function text(url) {
        const response = await fetch(url, { headers: { 'User-Agent': 'EmpiLauncher' }, signal: AbortSignal.timeout(10000), cache: 'no-store' })
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.text()
    }

    /** Where the channel file lives: the latest release, or the newest release of any kind when prereleases are allowed. */
    async function channelUrl(allowPrerelease) {
        if (process.env.EMPI_UPDATE_URL) return `${process.env.EMPI_UPDATE_URL.replace(/\/$/, '')}/${CHANNEL_FILE}`
        if (!allowPrerelease) return `https://github.com/${OWNER}/${REPO}/releases/latest/download/${CHANNEL_FILE}`
        const list = JSON.parse(await text(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=5`) || '[]')
        const tag = list[0]?.tag_name
        return tag ? `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${CHANNEL_FILE}` : null
    }

    async function findUpdate() {
        const { ConfigManager } = ensureCore(state)
        const current = state.shim && require('electron').app.getVersion()
        try {
            const url = await channelUrl(ConfigManager.getAllowPrerelease())
            const body = url ? await text(url) : null
            if (!body) return { available: false, current, reason: 'no_channel' }
            const info = parseLatestYml(body)
            if (!info.version || !semver.valid(info.version)) return { available: false, current, reason: 'bad_channel' }
            const newer = semver.valid(current) ? semver.gt(info.version, current) : true
            const installer = info.files[0] || {}
            return {
                available: newer, current, version: info.version, releaseDate: info.releaseDate || null,
                installer: installer.url || info.path || null, sha512: installer.sha512 || info.sha512 || null, size: Number(installer.size) || null,
                page: `https://github.com/${OWNER}/${REPO}/releases/tag/v${info.version}`,
                base: url.slice(0, url.lastIndexOf('/') + 1)
            }
        } catch (err) {
            state.log.debug('Update check failed.', err)
            return { available: false, current, reason: 'offline' }
        }
    }

    handlers.set('update.check', async () => {
        const { base, ...info } = await findUpdate()
        return info
    })

    // The notes of every release newer than the running one. GitHub's release list is public; it is asked at most once every ten minutes.
    let changelog = null
    handlers.set('update.changelog', async () => {
        const { ConfigManager } = ensureCore(state)
        const current = state.shim && require('electron').app.getVersion()
        if (changelog && Date.now() - changelog.at < 10 * 60 * 1000 && changelog.current === current) return { current, entries: changelog.entries }
        try {
            let releases
            if (process.env.EMPI_ENGINE_TEST === '1' && process.env.EMPI_UPDATE_URL) releases = JSON.parse(await text(`${process.env.EMPI_UPDATE_URL.replace(/\/$/, '')}/releases.json`) || '[]')
            else releases = JSON.parse(await text(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=40`) || '[]')
            const entries = releases
                .filter((r) => !r.draft && (!r.prerelease || ConfigManager.getAllowPrerelease()))
                .map((r) => ({ version: String(r.tag_name || '').replace(/^v/, ''), name: r.name || r.tag_name, date: r.published_at || null, body: String(r.body || '').slice(0, 6000), url: r.html_url || null }))
                .filter((r) => semver.valid(r.version) && (!semver.valid(current) || semver.gt(r.version, current)))
                .sort((a, b) => semver.rcompare(a.version, b.version))
            changelog = { at: Date.now(), current, entries }
            return { current, entries }
        } catch (err) {
            state.log.debug('Release notes could not be read.', err)
            return { current, entries: [], reason: 'offline' }
        }
    })

    let installing = false
    let abort = null

    // The installer of an update that already ran (140 MB) has no use after the launcher restarted: drop it a minute after start-up.
    const leftovers = () => path.join(require('electron').app.getPath('userData'), 'updates')
    setTimeout(() => { if (!installing) fs.rm(leftovers(), { recursive: true, force: true }, () => {}) }, 60000).unref()

    handlers.set('update.cancel', async () => { abort?.abort(); return { ok: true } })
    handlers.set('update.install', async (_params, ctx) => {
        if (installing) throw new EngineError('busy', 'La actualización ya está en marcha.')
        // Replacing the program under a running game would close the engine that is holding it.
        if (state.keepAlive.has('game')) throw new EngineError('game_running', 'Cierra Minecraft antes de actualizar el launcher.')
        if (state.keepAlive.size > 0) throw new EngineError('busy', 'Termina lo que estás haciendo (inicio de sesión) antes de actualizar el launcher.')
        installing = true
        try {
            const info = await findUpdate()
            if (!info.available || !info.installer || !info.base) throw new EngineError('no_update', 'No hay una versión nueva del launcher.')
            if (!INSTALLER_NAME.test(info.installer)) throw new EngineError('bad_channel', 'El instalador publicado tiene un nombre que no se acepta.')
            if (!info.sha512) throw new EngineError('bad_channel', 'La versión publicada no trae su huella (sha512); no se instala sin poder comprobarla.')

            const folder = path.join(require('electron').app.getPath('userData'), 'updates')
            fs.rmSync(folder, { recursive: true, force: true })
            fs.mkdirSync(folder, { recursive: true })
            const target = path.join(folder, info.installer)

            ctx.emit('update.progress', { stage: 'download', received: 0, total: info.size })
            abort = new AbortController()
            const cancelled = () => new EngineError('cancelled', 'Actualización cancelada.')
            let response
            try {
                response = await fetch(info.base + encodeURIComponent(info.installer), { headers: { 'User-Agent': 'EmpiLauncher' }, redirect: 'follow', signal: abort.signal })
            } catch (err) {
                throw abort.signal.aborted ? cancelled() : new EngineError('download_failed', `No se pudo descargar el instalador: ${err.message}`)
            }
            if (!response.ok || !response.body) throw new EngineError('download_failed', `No se pudo descargar el instalador (HTTP ${response.status}).`)
            const total = Number(response.headers.get('content-length')) || info.size || 0

            const hash = crypto.createHash('sha512')
            const file = fs.createWriteStream(`${target}.part`)
            let received = 0
            let lastEmit = 0
            const startedAt = Date.now()
            try {
                for await (const chunk of response.body) {
                    hash.update(chunk)
                    if (!file.write(chunk)) await new Promise((resolve) => file.once('drain', resolve))
                    received += chunk.length
                    const now = Date.now()
                    if (now - lastEmit > 250) {
                        lastEmit = now
                        ctx.emit('update.progress', { stage: 'download', received, total, bytesPerSecond: Math.round(received / Math.max(1, (now - startedAt) / 1000)) })
                    }
                }
                await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())))
            } catch (err) {
                file.destroy()
                fs.rmSync(`${target}.part`, { force: true })
                throw abort.signal.aborted ? cancelled() : new EngineError('download_failed', `Se cortó la descarga del instalador: ${err.message}`)
            }

            if (hash.digest('base64') !== info.sha512) {
                fs.rmSync(`${target}.part`, { force: true })
                throw new EngineError('bad_checksum', 'El instalador descargado no coincide con el publicado (huella distinta). No se instala.')
            }
            fs.renameSync(`${target}.part`, target)
            ctx.emit('update.progress', { stage: 'ready', received, total: received })

            // Tests download and verify for real but must not start an installer that would replace a program.
            if (process.env.EMPI_ENGINE_TEST === '1' && process.env.EMPI_UPDATE_NO_RUN === '1') return { launched: false, file: target, version: info.version }

            // Same arguments electron-updater gave the classic installer: silent, "this is an update", start the launcher afterwards.
            const child = spawn(target, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' })
            await new Promise((resolve, reject) => {
                child.once('error', reject)
                child.once('spawn', resolve)
            }).catch((err) => { throw new EngineError('install_failed', `Windows no dejó abrir el instalador: ${err.message}`) })
            child.unref()
            return { launched: true, file: target, version: info.version }
        } finally {
            installing = false
            abort = null
        }
    })
}

module.exports = { register, parseLatestYml }
