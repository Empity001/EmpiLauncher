// Looks up which Minecraft / loader versions exist, so the "new modpack" form can offer a
// list instead of asking you to remember "47.2.0". Every lookup is optional: if the
// network is down the form falls back to a plain text box.

const TTL = 60 * 60 * 1000
const cache = new Map()

async function cached(key, fn) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) return hit.value
    const value = await fn()
    cache.set(key, { at: Date.now(), value })
    return value
}

async function fetchOk(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'EmpiLauncher-Publisher' }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return res
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
        const versions = list.map((entry) => entry.version)
        const stable = list.find((entry) => entry.stable)
        return { versions, recommended: stable ? stable.version : versions[0] }
    })
}

async function forge(mc) {
    const all = await cached('forge', async () => mavenVersions(await getText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml')))
    const versions = newestFirst(all.filter((version) => version.startsWith(`${mc}-`)).map((version) => version.slice(mc.length + 1)))

    let recommended = versions[0]
    try {
        const promos = await cached('forge-promos', () => getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'))
        recommended = promos.promos[`${mc}-recommended`] || promos.promos[`${mc}-latest`] || recommended
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

module.exports = { minecraft, loader }
