/**
 * The list of modpacks ("versions" in the UI) and what each one looks like.
 * Reads the same distribution.json the classic launcher reads, through helios-core's DistributionAPI.
 */
const fs = require('fs')
const path = require('path')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')
const { onDistroLoaded } = require('../lib/distrosync')
const profilesLib = require('../lib/profiles')

const VISUALS = {
    banner: ['banner.png', 'banner.gif', 'banner.apng', 'banner.webp', 'banner.jpg', 'banner.jpeg', 'banner.avif', 'logo.png', 'logo.gif', 'logo.apng', 'logo.webp'],
    background: ['background.png', 'background.gif', 'background.apng', 'background.webp', 'background.jpg', 'background.jpeg', 'background.avif'],
    bannerPreview: ['banner-preview.webp', 'banner-preview.png', 'banner-preview.jpg', 'logo-preview.webp', 'logo-preview.png', 'logo-preview.jpg'],
    backgroundPreview: ['background-preview.webp', 'background-preview.png', 'background-preview.jpg'],
    theme: ['theme.json', 'launcher-theme.json']
}

function flatten(modules, acc = []) {
    for (const module of modules || []) {
        acc.push(module)
        if (module.subModules && module.subModules.length) flatten(module.subModules, acc)
    }
    return acc
}
const relPath = (module) => String((module.rawModule || module).artifact?.path || (module.rawModule || module).id || '').replaceAll('\\', '/').toLowerCase()

function findModule(server, names) {
    const wanted = names.map((n) => n.toLowerCase())
    return flatten(server.modules).find((m) => { const p = relPath(m); return wanted.some((n) => p === n || p.endsWith('/' + n)) }) || null
}

function isWhitelisted(raw) {
    return [raw.whitelist, raw.meta?.whitelist, raw.metadata?.whitelist, raw.serverMeta?.whitelist].some((v) => v === true || String(v).toLowerCase() === 'true')
}

function describeVisual(ConfigManager, server, module) {
    if (!module) return null
    const raw = module.rawModule || module
    const artifact = raw.artifact || {}
    let local = null
    if (artifact.path) {
        const candidate = path.resolve(ConfigManager.getInstanceDirectory(), server.rawServer.id, ...String(artifact.path).replaceAll('\\', '/').split('/'))
        if (fs.existsSync(candidate)) local = candidate
    }
    return { path: artifact.path || null, url: artifact.url || null, local, size: artifact.size || null, md5: artifact.MD5 || artifact.sha1 || null }
}

function describeServer(ConfigManager, server) {
    const raw = server.rawServer
    const visuals = {}
    for (const [kind, names] of Object.entries(VISUALS)) visuals[kind] = describeVisual(ConfigManager, server, findModule(server, names))
    return {
        id: raw.id, name: raw.name, description: raw.description || '', icon: raw.icon || null,
        minecraftVersion: raw.minecraftVersion, version: raw.version, mainServer: !!raw.mainServer,
        whitelist: isWhitelisted(raw), address: raw.address || null,
        accent: raw.accent || raw.theme?.accent || raw.theme?.color || null,
        javaOptions: raw.javaOptions || null,
        discord: raw.discord || null,
        profiles: profilesLib.describe(raw),
        visuals
    }
}

function describeDistribution(ConfigManager, distro) {
    return {
        selectedServer: ConfigManager.getSelectedServer(),
        mainServer: distro.getMainServer().rawServer.id,
        servers: distro.servers.map((s) => describeServer(ConfigManager, s))
    }
}

/** Same trick as the classic launcher: a throwaway query parameter forces the remote index past any HTTP cache. */
async function refreshWithoutCache(DistroAPI) {
    const original = DistroAPI['remoteUrl']
    if (typeof original !== 'string' || original.length === 0) return DistroAPI.refreshDistributionOrFallback()
    const clean = original.replace(/([?&])_empiRefresh=\d+(&?)/, (_m, prefix, suffix) => (suffix ? prefix : ''))
    DistroAPI['remoteUrl'] = `${clean}${clean.includes('?') ? '&' : '?'}_empiRefresh=${Date.now()}`
    try { return await DistroAPI.refreshDistributionOrFallback() } finally { DistroAPI['remoteUrl'] = clean }
}

function register(handlers, state) {
    handlers.set('distro.load', async ({ refresh = false } = {}) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        const t0 = Date.now()
        const distro = refresh ? await refreshWithoutCache(DistroAPI) : await DistroAPI.getDistribution()
        if (!distro) throw new EngineError('no_distribution', 'the distribution index could not be loaded')
        onDistroLoaded(ConfigManager, distro)
        state.distroSynced = true
        return { tookMs: Date.now() - t0, ...describeDistribution(ConfigManager, distro) }
    })

    handlers.set('distro.select', async ({ id }) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        const distro = await DistroAPI.getDistribution()
        if (!distro.getServerById(id)) throw new EngineError('no_server', `no such modpack: ${id}`)
        ConfigManager.setSelectedServer(id)
        ConfigManager.save()
        return { selectedServer: id }
    })

    /** The launcher theme (accent colour). Remote first with a short timeout, then the local copy, like the classic launcher. */
    handlers.set('distro.theme', async ({ id }) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(id)
        if (!server) throw new EngineError('no_server', `no such modpack: ${id}`)
        const module = findModule(server, VISUALS.theme)
        const visual = describeVisual(ConfigManager, server, module)
        if (visual && visual.url) {
            try {
                const url = new URL(visual.url)
                url.searchParams.set('empiVersion', server.rawServer.version || '0')
                url.searchParams.set('empiHash', visual.md5 || visual.size || 'theme')
                const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(1800) })
                if (response.ok) return { source: 'remote', theme: await response.json() }
            } catch { /* fall through to the local copy */ }
        }
        if (visual && visual.local) {
            try { return { source: 'local', theme: JSON.parse(fs.readFileSync(visual.local, 'utf8')) } } catch { /* unreadable */ }
        }
        return { source: 'none', theme: null }
    })
}

module.exports = { register, describeDistribution, describeServer, refreshWithoutCache }
