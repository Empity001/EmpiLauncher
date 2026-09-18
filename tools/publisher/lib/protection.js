// Which files of a modpack the launcher restores ("locked") and which the player may change ("free").
// The rules live in servermeta.json under `protection`; the meaning of a rule (which one wins, what a
// wildcard matches) comes from Nebula's own ProtectionPolicy, so this page can never disagree with what
// Nebula publishes.

const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const nebula = require('./nebula')

const MAX_RULES = 500
const policyModules = new Map()

async function policyFor(config) {
    const key = config.nebulaProjectPath
    if (!policyModules.has(key)) {
        await nebula.ensureBuilt(config, () => {})
        policyModules.set(key, import(pathToFileURL(path.join(key, 'dist', 'util', 'ProtectionPolicy.js')).href))
    }
    return policyModules.get(key)
}

function normalize(protection) {
    const input = protection && typeof protection === 'object' ? protection : {}
    return {
        default: input.default === 'free' ? 'free' : 'locked',
        revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 0,
        rules: (Array.isArray(input.rules) ? input.rules : [])
            .filter((rule) => rule && typeof rule.path === 'string' && rule.path.trim() && (rule.mode === 'locked' || rule.mode === 'free'))
            .map((rule) => ({ path: rule.path.trim(), mode: rule.mode }))
    }
}

/** Forge/NeoForge 1.20.3+ take their mods from the instance's own mods folder; everything else is fed by the launcher. */
function modsLiveInInstance(pack) {
    if (!['forge', 'neoforge'].includes(pack.loader.type)) return false
    const [major, minor = 0, patch = 0] = pack.minecraft.split('.').map(Number)
    if (major !== 1) return true // year-style versions (26.x) come after 1.21
    return minor > 20 || (minor === 20 && patch >= 3)
}

function walk(dir, root, out) {
    if (!fs.existsSync(dir)) return out
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full, root, out)
        else if (entry.isFile()) out.push({ path: path.relative(root, full).split(path.sep).join('/'), size: fs.statSync(full).size, kind: 'file' })
    }
    return out
}

async function describe(config, id) {
    const policy = await policyFor(config)
    const dir = nebula.packDir(config, id)
    const pack = nebula.getPack(config, id)
    const protection = normalize(nebula.readServerMeta(config, id).protection)

    const items = walk(path.join(dir, 'files'), path.join(dir, 'files'), [])
    for (const category of nebula.CATEGORIES) {
        for (const mod of pack.mods[category]) items.push({ path: `mods/${mod.name}`, size: mod.size, kind: 'mod', category })
    }

    const counts = { locked: 0, free: 0 }
    for (const item of items) {
        const resolved = policy.resolveMode(item.path, protection)
        item.mode = resolved.mode
        item.by = resolved.rule ? resolved.rule.path : null
        counts[item.mode]++
    }
    items.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true }))

    return { protection, items, counts, modsLiveInInstance: modsLiveInInstance(pack) }
}

/** Stores the protection block. `input` may carry any of: default, rules, bumpRevision. */
async function save(config, id, input) {
    const meta = nebula.readServerMeta(config, id)
    const current = normalize(meta.protection)
    const next = { ...current }

    if ('default' in input) next.default = input.default === 'free' ? 'free' : 'locked'
    if ('rules' in input) {
        if (!Array.isArray(input.rules)) throw new Error('Las reglas tienen que ser una lista.')
        if (input.rules.length > MAX_RULES) throw new Error(`Demasiadas reglas (maximo ${MAX_RULES}).`)
        const seen = new Set()
        next.rules = normalize({ rules: input.rules }).rules.filter((rule) => {
            const key = rule.path.replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }
    if (input.bumpRevision) next.revision = current.revision + 1

    if (next.default === 'locked' && next.rules.length === 0 && next.revision === 0) delete meta.protection
    else meta.protection = next
    nebula.writeServerMeta(config, id, meta)
    return describe(config, id)
}

module.exports = { describe, save, normalize }
