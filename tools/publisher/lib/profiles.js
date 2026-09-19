// Profiles: one modpack that can be played in several ways (the full one, a lighter one...). They share the instance folder, so worlds,
// options and everything the player made stay put; a profile only changes WHICH mods and files the modpack delivers and, if wanted, the
// memory it starts with.
//
// How it is stored. The modpack's folders hold the union of everything any profile needs (Nebula publishes all of it), and
// servermeta.json keeps, under `profiles`, what each profile does NOT take:
//
//   "profiles": { "default": "completo", "list": [
//       { "id": "completo", "name": "Completo", "description": "", "recommendedBelowGb": null, "ram": null,
//         "exclude": { "mods": [], "files": [] } },
//       { "id": "lite", "name": "Lite", "exclude": { "mods": ["sodium", "iris"], "files": ["shaderpacks/"] }, ... } ] }
//
// `optionalOff` lists mods the profile takes but hands to the player switched OFF (an optional mod that starts disabled; if the mod is
// required in the folders, it becomes optional for that profile). That is how a lighter profile ships the same mods with fewer of
// them running.
//
// Mods are named by their "stem" (the file name up to its version), so putting a newer jar in the folder keeps every choice; a file is
// named by its path inside "files", and a path ending in "/" means everything under it.
//
// What players get. At compile time (applyToDistribution) the distribution is written so that:
//   - the modpack's own `modules` are exactly what the DEFAULT profile plays. A launcher that knows nothing about profiles (an older
//     one) therefore behaves as it always did;
//   - `profiles.pool` holds the modules only some other profile needs, and each profile lists what to take out of `modules` (`remove`)
//     and what to bring in from the pool (`add`), by POSITION in `modules` / in the pool. (Not by id: the ids of "File" modules are
//     only the file's name, so a modpack has many of the same, "options.txt" or "buttom5.png" in different folders.) Positions stay
//     valid because nothing reorders those lists after compiling: only the download links of large files change. The launcher does
//     nothing smarter than that, so there is a single place (this file) that knows what a stem or a folder rule means.

const fs = require('fs')
const path = require('path')
const nebula = require('./nebula')
const { snapRam, normalizeRam } = require('./ram')

const MOD_TYPES = new Set(['FabricMod', 'ForgeMod', 'NeoForgeMod', 'LiteMod'])
// an optional mod that starts switched off (what Nebula writes for the "optionaloff" folder)
const OPTIONAL_OFF = { value: false, def: false }
const MAX_PROFILES = 12
const MAX_RULES = 2000
// what the Apariencia tab looks after: every profile shows the same background, banner and theme
const APPEARANCE_FILE = /^(background|banner)(-preview)?\.[a-z0-9]+$|^theme\.json$/i

// ---------------------------------------------------------------- names

/** "sodium-fabric-0.8.12+mc1.21.11.jar" -> "sodium-fabric": the name up to the first token that looks like a version. */
function stemOf(fileName) {
    const base = String(fileName || '').replace(/\.[a-z0-9]{1,8}$/i, '')
    const tokens = base.split(/[-_ ]+/).filter(Boolean)
    const kept = []
    for (let i = 0; i < tokens.length; i++) {
        if (i > 0 && /^(v|mc)?\d/i.test(tokens[i])) break
        kept.push(tokens[i].toLowerCase())
    }
    return kept.join('-') || base.toLowerCase()
}

const posix = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.?\/+/, '')
const fileKey = (value) => posix(value).toLowerCase()

function slugify(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
}

// ---------------------------------------------------------------- the stored form

function cleanList(values, limit, transform) {
    const seen = new Set()
    const out = []
    for (const value of Array.isArray(values) ? values : []) {
        if (typeof value !== 'string') continue
        const item = transform(value.trim())
        if (!item || seen.has(item)) continue
        seen.add(item)
        out.push(item)
        if (out.length >= limit) break
    }
    return out
}

/**
 * What a person (or the UI) sends -> what is stored, or null when it does not describe at least two profiles. Throws with something
 * they can act on. Profiles keep their id for life (renaming does not change it); a new one gets an id made from its name.
 */
function normalize(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.list)) return null
    if (input.list.length > MAX_PROFILES) throw new Error(`Como máximo ${MAX_PROFILES} perfiles por modpack.`)
    const taken = new Set()
    const names = new Set()
    const list = input.list.map((raw, index) => {
        const name = String(raw && raw.name || '').trim()
        if (!name) throw new Error(`Al perfil ${index + 1} le falta el nombre.`)
        if (name.length > 32) throw new Error(`El nombre "${name.slice(0, 20)}…" es demasiado largo (máximo 32 letras).`)
        if (names.has(name.toLowerCase())) throw new Error(`Hay dos perfiles llamados "${name}".`)
        names.add(name.toLowerCase())

        let id = /^[a-z0-9][a-z0-9-]{0,23}$/.test(raw.id || '') ? raw.id : slugify(name) || `perfil-${index + 1}`
        for (let n = 2; taken.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
        taken.add(id)

        const below = raw.recommendedBelowGb == null || raw.recommendedBelowGb === '' ? null : Number(raw.recommendedBelowGb)
        if (below != null && !(Number.isFinite(below) && below >= 1 && below <= 128)) throw new Error(`"Recomendado si el equipo tiene menos de…" de ${name} debe estar entre 1 y 128 GB.`)
        const exclude = raw.exclude && typeof raw.exclude === 'object' ? raw.exclude : {}
        return {
            id,
            name,
            description: String(raw.description || '').trim().slice(0, 160),
            recommendedBelowGb: below,
            ram: raw.ram ? snapRam(raw.ram) : null,
            exclude: {
                mods: cleanList(exclude.mods, MAX_RULES, (value) => value.toLowerCase()),
                files: cleanList(exclude.files, MAX_RULES, fileKey)
            },
            optionalOff: cleanList(raw.optionalOff, MAX_RULES, (value) => value.toLowerCase())
        }
    })
    if (list.length < 2) return null
    const wanted = String(input.default || '')
    return { default: list.some((profile) => profile.id === wanted) ? wanted : list[0].id, list }
}

function stored(meta) {
    try { return normalize(meta && meta.profiles) } catch { return null }
}

// ---------------------------------------------------------------- what a profile takes

function excluder(profile) {
    const mods = new Set(profile.exclude.mods)
    const exact = new Set()
    const folders = []
    for (const rule of profile.exclude.files) {
        if (rule.endsWith('/')) folders.push(rule)
        else exact.add(rule)
    }
    return {
        mod: (stem) => mods.has(stem),
        file: (relative) => {
            const key = fileKey(relative)
            return exact.has(key) || folders.some((folder) => key.startsWith(folder))
        }
    }
}

/** A distribution module -> what the profiles talk about: { kind: 'mod', key: stem } | { kind: 'file', key: path } | null (loader, libraries...). */
function classify(module) {
    if (!module) return null
    if (MOD_TYPES.has(module.type)) {
        const artifact = module.artifact || {}
        let name = artifact.path || ''
        if (!name && artifact.url) {
            try { name = decodeURIComponent(new URL(artifact.url).pathname.split('/').pop()) } catch { name = String(artifact.url).split('/').pop() }
        }
        return { kind: 'mod', key: stemOf(path.posix.basename(posix(name || module.id))) }
    }
    if (module.type === 'File') {
        const relative = (module.artifact && module.artifact.path) || module.id
        return APPEARANCE_FILE.test(posix(relative)) ? null : { kind: 'file', key: fileKey(relative) }
    }
    return null
}

const excludes = (rules, module) => {
    const info = classify(module)
    return !!info && (info.kind === 'mod' ? rules.mod(info.key) : rules.file(info.key))
}

// ---------------------------------------------------------------- what the pack has (for the editor)

function walk(dir, root, out) {
    if (!fs.existsSync(dir)) return out
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full, root, out)
        else if (entry.isFile() && !entry.name.endsWith('.part') && !entry.name.startsWith('.')) out.push({ path: path.relative(root, full).split(path.sep).join('/'), size: fs.statSync(full).size })
    }
    return out
}

/** Every mod (grouped by stem) and every file the modpack folders hold: the rows of the editor. */
function inventory(config, id) {
    const dir = nebula.packDir(config, id)
    const mods = new Map()
    const found = nebula.modsOf(dir)
    for (const category of nebula.CATEGORIES) {
        for (const file of found[category]) {
            const stem = stemOf(file.name)
            const row = mods.get(stem) || { stem, names: [], category, size: 0 }
            row.names.push(file.name)
            row.size += file.size
            mods.set(stem, row)
        }
    }
    const filesRoot = path.join(dir, 'files')
    const files = walk(filesRoot, filesRoot, []).filter((file) => file.path.includes('/') || !APPEARANCE_FILE.test(file.path))
    files.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true }))
    return { mods: [...mods.values()].sort((a, b) => a.stem.localeCompare(b.stem)), files }
}

function tally(profile, items) {
    const rules = excluder(profile)
    const mods = items.mods.filter((mod) => !rules.mod(mod.stem))
    const files = items.files.filter((file) => !rules.file(file.path))
    return {
        mods: mods.length,
        files: files.length,
        bytes: mods.reduce((sum, mod) => sum + mod.size, 0) + files.reduce((sum, file) => sum + file.size, 0)
    }
}

/** What the editor shows: the stored profiles (null when the pack has none), the rows, how much each profile takes, and rules that match nothing. */
function describe(config, id) {
    const profiles = stored(nebula.readServerMeta(config, id))
    const items = inventory(config, id)
    const result = { profiles, items, totals: null, stale: {} }
    if (!profiles) return result
    result.totals = Object.fromEntries(profiles.list.map((profile) => [profile.id, tally(profile, items)]))
    const stems = new Set(items.mods.map((mod) => mod.stem))
    const paths = items.files.map((file) => fileKey(file.path))
    for (const profile of profiles.list) {
        const missing = {
            mods: profile.exclude.mods.filter((stem) => !stems.has(stem)),
            files: profile.exclude.files.filter((rule) => !paths.some((candidate) => (rule.endsWith('/') ? candidate.startsWith(rule) : candidate === rule)))
        }
        if (missing.mods.length || missing.files.length) result.stale[profile.id] = missing
    }
    return result
}

/** Stores the profiles (or removes them all when `input` is null / has fewer than two) and returns what describe() returns. */
function save(config, id, input) {
    const next = input == null ? null : normalize(input)
    const meta = nebula.readServerMeta(config, id)
    if (next) meta.profiles = next
    else delete meta.profiles
    nebula.writeServerMeta(config, id, meta)
    return describe(config, id)
}

// ---------------------------------------------------------------- compile: the distribution

/**
 * Rewrites the servers of a freshly generated distribution that have profiles (see the top of this file). `metaOf(serverId)` gives the
 * server's servermeta.json (or null). Returns { lines } for the log; throws when what it would publish is not consistent.
 */
function applyToDistribution(distribution, metaOf) {
    const lines = []
    for (const server of distribution.servers || []) {
        const meta = metaOf(server.id)
        const profiles = stored(meta)
        if (!profiles) continue

        const packRam = server.javaOptions && server.javaOptions.ram ? server.javaOptions.ram : null
        const original = server.modules || []
        const byProfile = new Map(profiles.list.map((profile) => [profile.id, excluder(profile)]))
        const main = byProfile.get(profiles.default)

        const offSets = new Map(profiles.list.map((profile) => [profile.id, new Set(profile.optionalOff)]))
        const modStem = (module) => { const info = classify(module); return info && info.kind === 'mod' ? info.key : null }
        // how the module is delivered to a profile: as published, or as an optional mod that starts off
        const shapeFor = (profileId, module) => (modStem(module) !== null && offSets.get(profileId).has(modStem(module)) ? OPTIONAL_OFF : module.required)
        const sameShape = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b)
        const withShape = (module, shape) => { const { required: _old, ...rest } = module; return shape === undefined ? rest : { ...rest, required: shape } }

        // the modpack itself is what the default profile plays, with the default profile's own way of delivering each mod
        const kept = original.filter((module) => !excludes(main, module))
        const base = kept.map((module) => { const shape = shapeFor(profiles.default, module); return sameShape(shape, module.required) ? module : withShape(module, shape) })
        const pool = original.filter((module) => excludes(main, module))

        // a copy of a module delivered in another way lives in the pool, once, however many profiles want it
        const variants = new Map()
        const variantFor = (module, shape) => {
            const key = `${original.indexOf(module)}|${JSON.stringify(shape === undefined ? null : shape)}`
            if (!variants.has(key)) { pool.push(withShape(module, shape)); variants.set(key, pool.length - 1) }
            return variants.get(key)
        }

        const list = profiles.list.map((profile) => {
            const rules = byProfile.get(profile.id)
            const isDefault = profile.id === profiles.default
            const remove = []
            const add = []
            if (!isDefault) {
                kept.forEach((module, position) => {
                    if (excludes(rules, module)) { remove.push(position); return }
                    const shape = shapeFor(profile.id, module)
                    if (!sameShape(shape, base[position].required)) { remove.push(position); add.push(variantFor(module, shape)) }
                })
                original.filter((module) => excludes(main, module)).forEach((module, index) => {
                    if (excludes(rules, module)) return
                    const shape = shapeFor(profile.id, module)
                    add.push(sameShape(shape, module.required) ? index : variantFor(module, shape))
                })
            }
            return {
                id: profile.id,
                name: profile.name,
                ...(profile.description ? { description: profile.description } : {}),
                ...(profile.recommendedBelowGb ? { recommendedBelowGb: profile.recommendedBelowGb } : {}),
                ram: profile.ram ? normalizeRam(profile.ram) : packRam,
                remove,
                add
            }
        })

        const defaultRam = list.find((profile) => profile.id === profiles.default).ram
        server.modules = base
        server.profiles = { default: profiles.default, list, pool }
        if (defaultRam) server.javaOptions = { ...(server.javaOptions || {}), ram: defaultRam }

        verify(server)
        lines.push(`${server.id}: ${list.length} perfiles (${list.map((profile) => `${profile.name}: ${effectiveModules(server, profile).length} módulos`).join(', ')}).`)
    }
    return { lines }
}

/** The modules a profile plays: the modpack's, minus what the profile removes, plus what it brings in from the pool. */
function effectiveModules(server, profile) {
    const remove = new Set(profile.remove)
    return [...server.modules.filter((_module, index) => !remove.has(index)), ...profile.add.map((index) => server.profiles.pool[index]).filter(Boolean)]
}

/** A server that would reach players with a profile that points at nothing, or at the same place twice, or plays no mods, is not sent. */
function verify(server) {
    const { list, pool } = server.profiles
    const check = (positions, length, what, profile) => {
        const seen = new Set()
        for (const index of positions) {
            if (!Number.isInteger(index) || index < 0 || index >= length) throw new Error(`${server.id}: el perfil ${profile.name} ${what} un módulo que no existe (posición ${index}).`)
            if (seen.has(index)) throw new Error(`${server.id}: el perfil ${profile.name} ${what} dos veces el mismo módulo.`)
            seen.add(index)
        }
    }
    for (const profile of list) {
        check(profile.remove, server.modules.length, 'quita', profile)
        check(profile.add, pool.length, 'agrega', profile)
        const modules = effectiveModules(server, profile)
        if (!modules.some((module) => MOD_TYPES.has(module.type))) throw new Error(`${server.id}: el perfil ${profile.name} se queda sin ningún mod.`)
        for (const module of modules) {
            if (module.artifact && !module.artifact.url) throw new Error(`${server.id}: el módulo ${module.id} no tiene dirección de descarga.`)
        }
    }
}

module.exports = { stemOf, slugify, normalize, stored, excluder, classify, inventory, describe, save, applyToDistribution, effectiveModules, verify, MOD_TYPES, MAX_PROFILES }
