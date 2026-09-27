// Looks up which Minecraft / loader versions exist, so the "new modpack" form can offer a
// list instead of asking you to remember "47.2.0". Every lookup is optional: if the
// network is down the form falls back to a plain text box.

const TTL = 60 * 60 * 1000
const cache = new Map()
const inflight = new Map()

// The same lookup asked twice at once shares one request, and a stale answer beats an error (a refresh that fails, a mirror hiccup,
// the network dropping) - the last good list is kept instead of the whole thing throwing.
async function cached(key, fn) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) return hit.value
    if (inflight.has(key)) return inflight.get(key)
    const pending = (async () => {
        try {
            const value = await fn()
            cache.set(key, { at: Date.now(), value })
            return value
        } catch (err) {
            if (hit) return hit.value
            throw err
        }
    })().finally(() => inflight.delete(key))
    inflight.set(key, pending)
    return pending
}

// maven.neoforged.net (Reposilite behind a CDN) sometimes answers a bogus "404 Not Found" for maven-metadata.xml in bursts, so the
// metadata files are asked again a few times, a little slower each time, before giving up.
async function fetchOk(url) {
    const tries = /maven-metadata\.xml$/.test(url) ? 5 : 1
    let last
    for (let attempt = 1; attempt <= tries; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'EmpiLauncher-Publisher' }, signal: AbortSignal.timeout(15000) })
            if (res.ok) return res
            last = new Error(`${url} -> ${res.status}`)
        } catch (err) {
            last = err
        }
        if (attempt < tries) await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
    }
    throw last
}

const getJson = async (url) => (await fetchOk(url)).json()
const getText = async (url) => (await fetchOk(url)).text()

function segments(version) {
    return version.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

function compareVersions(a, b) {
    const left = segments(a)
    const right = segments(b)
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const x = left[i]
        const y = right[i]
        if (x === y) continue
        if (x === undefined) return -1
        if (y === undefined) return 1
        if (typeof x === 'number' && typeof y === 'number') return x - y
        return String(x).localeCompare(String(y))
    }
    return 0
}

function mavenVersions(xml) {
    return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
}

const newestFirst = (list) => [...list].sort((a, b) => compareVersions(b, a))
const isStable = (version) => !/(alpha|beta|rc|snapshot|pre)/i.test(version)

async function minecraft() {
    return cached('mc', async () => {
        const manifest = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
        return {
            latest: manifest.latest.release,
            versions: manifest.versions.filter((entry) => entry.type === 'release').map((entry) => entry.id)
        }
    })
}

async function fabric() {
    return cached('fabric', async () => {
        const list = await getJson('https://meta.fabricmc.net/v2/versions/loader')
        // Nebula only accepts Fabric Loader 0.12.3 or newer (FabricResolver.isForVersion); older builds would fail at compile time
        const usable = list.filter((entry) => !entry.version.includes('+') && compareVersions(entry.version, '0.12.3') >= 0)
        const versions = usable.map((entry) => entry.version)
        const stable = usable.find((entry) => entry.stable)
        return { versions, recommended: stable ? stable.version : versions[0] }
    })
}

/** Every Minecraft version Fabric has a build for (the short list; the per-game endpoint is much bigger for the same answer). */
async function fabricGames() {
    return cached('fabric-games', async () => new Set((await getJson('https://meta.fabricmc.net/v2/versions/game')).map((entry) => entry.version)))
}

async function forge(mc) {
    const all = await cached('forge', async () => mavenVersions(await getText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')))
    // old Forge (1.7.10 - 1.10) lists "10.13.4.1614-1.7.10": that suffix is part of the version and must stay (Nebula's artifact name needs it)
    const versions = newestFirst(all.filter((version) => version.startsWith(`${mc}-`)).map((version) => version.slice(mc.length + 1)))

    let recommended = versions[0]
    try {
        const promos = await cached('forge-promos', () => getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'))
        const promoted = promos.promos[`${mc}-recommended`] || promos.promos[`${mc}-latest`]
        // the promotion says "11.15.1.2318" where the list has "11.15.1.2318-1.8.9": point at the entry that is really in the list
        if (promoted) recommended = versions.find((version) => version === promoted || version.startsWith(`${promoted}-`)) || recommended
    } catch { /* promotions are a nicety, the list itself is enough */ }
    return { versions, recommended }
}

/**
 * NeoForge versions embed the Minecraft version: 1.21.1 -> "21.1.<build>", and the newer
 * year-style Minecraft versions (26.2) -> "26.2.0.<build>".
 */
function neoforgePrefix(mc) {
    const parts = mc.split('.').map(Number)
    if (parts[0] === 1) return `${parts[1]}.${parts[2] || 0}.`
    return `${parts[0]}.${parts[1] || 0}.${parts[2] || 0}.`
}

async function neoforge(mc) {
    const all = await cached('neoforge', async () => mavenVersions(await getText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')))
    const prefix = neoforgePrefix(mc)
    const versions = newestFirst(all.filter((version) => version.startsWith(prefix)))
    return { versions, recommended: versions.find(isStable) || versions[0] }
}

async function loader(type, mc) {
    if (type === 'fabric') return fabric()
    if (type === 'forge') return forge(mc)
    if (type === 'neoforge') return neoforge(mc)
    throw new Error(`Loader desconocido: ${type}`)
}

// ------------------------------------------------------------------ which loaders exist for one Minecraft version

const NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }
const LOADER_ORDER = ['fabric', 'forge', 'neoforge']

/** The minor of an old-style "1.x" version (1.12.2 -> 12); null for the year-style ones (26.3). */
function oneDotMinor(mc) {
    const parts = mc.split('.').map(Number)
    return parts[0] === 1 ? parts[1] : null
}

/**
 * What Nebula can really build, mirroring its resolvers' isForVersion (ForgeGradle2 [7-12], ForgeGradle3 [12-21], NeoForge [20-27]).
 * Year-style Minecraft (26.x) is accepted for Forge/NeoForge now that VersionUtil.isVersionAcceptable knows about it (see the engine's
 * javareq.js comment on the same "one launcher-wide table" idea); this list only needs to stay in sync with Nebula's own bounds.
 */
const NEBULA_ACCEPTS = {
    fabric: () => true,
    forge: (mc) => { const minor = oneDotMinor(mc); return minor === null ? true : minor >= 7 && minor <= 21 },
    neoforge: (mc) => { const minor = oneDotMinor(mc); return minor === null ? true : minor >= 20 && minor <= 27 }
}

const status = (state, reason, extra) => ({ status: state, versions: [], recommended: null, reason: reason || null, ...extra })

async function fabricSupport(mc) {
    if (!(await fabricGames()).has(mc)) {
        return status('none', compareVersions(mc, '1.14') < 0 ? 'Fabric solo existe desde Minecraft 1.14.' : `Fabric no tiene versión para Minecraft ${mc}.`)
    }
    const { versions, recommended } = await fabric()
    return status('ok', null, { versions, recommended })
}

async function forgeSupport(mc) {
    const { versions, recommended } = await forge(mc)
    if (versions.length === 0) return status('none', `Forge no publicó nada para Minecraft ${mc}.`)
    if (!NEBULA_ACCEPTS.forge(mc)) return status('blocked', `Forge sí existe para Minecraft ${mc}, pero Nebula todavía no sabe armarlo.`)
    return status('ok', null, { versions, recommended })
}

async function neoforgeSupport(mc) {
    const { versions, recommended } = await neoforge(mc)
    if (versions.length === 0) {
        // NeoForge 1.20.1 (47.1.x) is published apart, as net.neoforged:forge, which Nebula does not read
        if (mc === '1.20.1') {
            try {
                const legacy = mavenVersions(await cached('neoforge-legacy', () => getText('https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml')))
                if (legacy.some((version) => version.startsWith('1.20.1-'))) return status('blocked', 'NeoForge para 1.20.1 se publica aparte y Nebula no lo lee. Usa Forge o Fabric.')
            } catch { /* only used to explain, the plain answer below is still right */ }
        }
        return status('none', compareVersions(mc, '1.20.2') < 0 ? 'NeoForge solo existe desde Minecraft 1.20.2.' : `NeoForge no publicó nada para Minecraft ${mc}.`)
    }
    if (!NEBULA_ACCEPTS.neoforge(mc)) return status('blocked', `NeoForge sí existe para Minecraft ${mc}, pero Nebula todavía no sabe armarlo.`)
    return status('ok', null, { versions, recommended })
}

/**
 * The three loaders side by side for one Minecraft version, so the form can grey out the ones that do not exist and pick one by itself.
 * Each entry: status "ok" (offer it), "none" (does not exist for this Minecraft), "blocked" (exists, but Nebula cannot build it) or
 * "unknown" (the lookup itself failed: leave it clickable and let the operator type the version).
 */
async function support(mc) {
    if (!/^\d+(\.\d+){1,2}$/.test(mc || '')) {
        const err = new Error('La versión de Minecraft debe verse como 1.21.11.')
        err.status = 400
        throw err
    }
    const attempt = async (type, lookup) => {
        try { return await lookup(mc) } catch (err) { return status('unknown', `No pude consultar ${NAMES[type]} ahora (${err.message}).`) }
    }
    const [fabricResult, forgeResult, neoforgeResult] = await Promise.all([attempt('fabric', fabricSupport), attempt('forge', forgeSupport), attempt('neoforge', neoforgeSupport)])
    const loaders = { fabric: fabricResult, forge: forgeResult, neoforge: neoforgeResult }
    return { mc, loaders, suggested: LOADER_ORDER.find((type) => loaders[type].status === 'ok') || null }
}

module.exports = { minecraft, loader, support }
