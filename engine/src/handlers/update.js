/**
 * Launcher updates: is there a newer native launcher, and where is its installer.
 *
 * It reads the same kind of file electron-builder publishes next to every release (latest.yml: version, installer name, sha512,
 * size). The native launcher has its own channel file, `latest-native.yml`, so the classic and the native launcher never offer
 * each other's installer while both exist. Downloading and running the installer belongs to the native packaging step and is
 * not done here: this only answers "is there something newer" and hands over what the UI needs to offer it.
 */
const { ensureCore } = require('./core')
const semver = require('semver')

const OWNER = 'Empity001'
const REPO = 'EmpiLauncher'

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
    async function channelUrl(file, allowPrerelease) {
        if (process.env.EMPI_UPDATE_URL) return `${process.env.EMPI_UPDATE_URL.replace(/\/$/, '')}/${file}`
        if (!allowPrerelease) return `https://github.com/${OWNER}/${REPO}/releases/latest/download/${file}`
        const list = JSON.parse(await text(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=5`) || '[]')
        const tag = list[0]?.tag_name
        return tag ? `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${file}` : null
    }

    handlers.set('update.check', async ({ channel = 'native' } = {}) => {
        const { ConfigManager } = ensureCore(state)
        const current = state.shim && require('electron').app.getVersion()
        const file = channel === 'native' ? 'latest-native.yml' : 'latest.yml'
        try {
            const url = await channelUrl(file, ConfigManager.getAllowPrerelease())
            const body = url ? await text(url) : null
            if (!body) return { available: false, current, reason: 'no_channel' }
            const info = parseLatestYml(body)
            if (!info.version || !semver.valid(info.version)) return { available: false, current, reason: 'bad_channel' }
            const newer = semver.valid(current) ? semver.gt(info.version, current) : true
            const installer = info.files[0] || {}
            return {
                available: newer, current, version: info.version, releaseDate: info.releaseDate || null,
                installer: installer.url || info.path || null, sha512: installer.sha512 || info.sha512 || null, size: Number(installer.size) || null,
                page: `https://github.com/${OWNER}/${REPO}/releases/tag/v${info.version}`
            }
        } catch (err) {
            state.log.debug('Update check failed.', err)
            return { available: false, current, reason: 'offline' }
        }
    })
}

module.exports = { register, parseLatestYml }
