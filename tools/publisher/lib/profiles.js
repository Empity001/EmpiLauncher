// Profiles: a modpack can list OTHER modpacks (its "versions") as its profiles. In the launcher the player sees one modpack with a small
// selector, and choosing a profile plays that other modpack; it stops being listed on its own there.
//
// A profile is only a link. The modpack it points to keeps being an ordinary modpack in the Publisher: still published, still edited in
// its own sheet (mods, files, memory, Java, everything), never hidden, moved or archived by being somebody's profile. It may have another
// Minecraft version or another loader, because it is played as itself, with its own game folder.
//
// Stored in the host's servermeta.json:
//
//   "profiles": { "self": { "name": "Normal", "description": "", "recommendedBelowGb": null },
//                 "list": [ { "pack": "PanolisSMP-1.21.11-Lite-1.21.11", "name": "Lite", "description": "", "recommendedBelowGb": 8 } ] }
//
// `self` is how the host modpack itself is called in the selector. Written to distribution.json (applyLinks) as
//   host:   "profiles": { "list": [ { id: <host id>, name, description, recommendedBelowGb }, { id: <linked id>, ... } ] }
//   linked: "profileOf": <host id>
// A launcher that does not know profiles ignores both and lists every modpack as it always did.

const fs = require('fs')
const path = require('path')
const nebula = require('./nebula')

const MAX_PROFILES = 12
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' }

// ---------------------------------------------------------------- what is stored

const text = (value, limit) => String(value == null ? '' : value).trim().slice(0, limit)

function below(value, label) {
    if (value == null || value === '') return null
    const number = Number(value)
    if (!(Number.isFinite(number) && number >= 1 && number <= 128)) throw new Error(`«Recomendarlo si el equipo tiene menos de…» de ${label} debe estar entre 1 y 128 GB.`)
    return number
}

/**
 * What a person (or the editor) sends -> what is stored, or null when there are no links. Throws with something they can act on.
 * Entries that are not links (the shape profiles had before they were links) are dropped.
 */
function normalize(input) {
    if (!input || typeof input !== 'object') return null
    const entries = (Array.isArray(input.list) ? input.list : []).filter((entry) => entry && typeof entry.pack === 'string' && entry.pack)
    if (!entries.length) return null
    if (entries.length > MAX_PROFILES) throw new Error(`Como máximo ${MAX_PROFILES} perfiles por modpack.`)
    const self = input.self && typeof input.self === 'object' ? input.self : {}
    const selfName = text(self.name, 32) || 'Normal'
    const names = new Set([selfName.toLowerCase()])
    const packs = new Set()
    const list = entries.map((entry) => {
        const name = text(entry.name, 32)
        if (!name) throw new Error(`Al perfil de «${entry.pack}» le falta el nombre.`)
        if (names.has(name.toLowerCase())) throw new Error(`Hay dos perfiles llamados «${name}».`)
        names.add(name.toLowerCase())
        if (packs.has(entry.pack)) throw new Error('Un mismo modpack no puede ser dos perfiles.')
        packs.add(entry.pack)
        return { pack: entry.pack, name, description: text(entry.description, 160), recommendedBelowGb: below(entry.recommendedBelowGb, name) }
    })
    return { self: { name: selfName, description: text(self.description, 160), recommendedBelowGb: below(self.recommendedBelowGb, selfName) }, list }
}

function stored(meta) {
    try { return normalize(meta && meta.profiles) } catch { return null }
}

// ---------------------------------------------------------------- the modpacks

/** The folder of a modpack that is published or deactivated. */
function dirOf(config, id) {
    if (!id || id !== path.basename(id)) throw new Error(`No existe el modpack "${id}".`)
    for (const base of [nebula.serversDir(config), nebula.hideDir(config)]) {
        const dir = path.join(base, id)
        if (fs.existsSync(path.join(dir, 'servermeta.json'))) return dir
    }
    throw new Error(`No existe el modpack "${id}".`)
}

function metaOf(config, id) {
    try { return JSON.parse(fs.readFileSync(path.join(dirOf(config, id), 'servermeta.json'), 'utf8').replace(/^﻿/, '')) } catch { return null }
}

/** { linked modpack id -> its host's id } over every modpack, published or not. */
function linksOf(config) {
    const links = new Map()
    for (const pack of nebula.listPacks(config)) {
        const profiles = stored(metaOf(config, pack.id))
        if (profiles) for (const entry of profiles.list) if (!links.has(entry.pack)) links.set(entry.pack, pack.id)
    }
    return links
}

function describePack(pack, ram) {
    return {
        id: pack.id, name: pack.name, minecraft: pack.minecraft, loader: pack.loader.type, loaderName: LOADER_NAMES[pack.loader.type] || null,
        packVersion: pack.packVersion, active: pack.active, mods: pack.counts.required + pack.counts.optionalon + pack.counts.optionaloff, ram
    }
}

/** What the editor shows: the stored profiles (null when there are none) and every other modpack with whether it can be one. */
function describe(config, id) {
    const meta = nebula.readServerMeta(config, id)
    const profiles = stored(meta)
    const links = linksOf(config)
    const all = nebula.listPacks(config)
    const hosts = new Set(all.filter((pack) => stored(metaOf(config, pack.id))).map((pack) => pack.id))
    const byId = new Map(all.map((pack) => [pack.id, pack]))
    const ramOf = (packId) => { try { return nebula.getPack(config, packId).ram } catch { return null } }

    const versions = all.filter((pack) => pack.id !== id).map((pack) => {
        const host = links.get(pack.id) || null
        const reason = host && host !== id ? `Ya es un perfil de ${byId.get(host) ? byId.get(host).name : host}`
            : hosts.has(pack.id) ? 'Tiene perfiles propios'
                : null
        return { ...describePack(pack, ramOf(pack.id)), available: reason === null, reason, linked: host === id }
    })
    const own = links.get(id) || null
    return {
        profiles: profiles && {
            self: profiles.self,
            list: profiles.list.map((entry) => ({ ...entry, info: byId.has(entry.pack) ? describePack(byId.get(entry.pack), ramOf(entry.pack)) : null }))
        },
        versions,
        profileOf: own ? { id: own, name: byId.get(own) ? byId.get(own).name : own } : null,
        legacy: !!(meta.profiles && !profiles)   // profiles left from before they were links: they do nothing and go away on the next save
    }
}

/** Stores the profiles (or removes them all when `input` is null / has no links) and returns what describe() returns. */
function save(config, id, input) {
    const next = input == null ? null : normalize(input)
    if (next) {
        const links = linksOf(config)
        if (links.has(id)) throw new Error(`Este modpack ya es un perfil de ${links.get(id)}: un perfil no puede tener perfiles.`)
        const hosts = new Set(nebula.listPacks(config).filter((pack) => pack.id !== id && stored(metaOf(config, pack.id))).map((pack) => pack.id))
        for (const entry of next.list) {
            if (entry.pack === id) throw new Error('Un modpack no puede ser perfil de sí mismo.')
            dirOf(config, entry.pack)
            if (links.has(entry.pack) && links.get(entry.pack) !== id) throw new Error(`«${entry.name}» ya es un perfil de ${links.get(entry.pack)}.`)
            if (hosts.has(entry.pack)) throw new Error(`«${entry.name}» tiene perfiles propios: un perfil no puede tener perfiles.`)
        }
    }
    const meta = nebula.readServerMeta(config, id)
    if (next) meta.profiles = next
    else delete meta.profiles
    nebula.writeServerMeta(config, id, meta)
    return describe(config, id)
}

/** A sensible label for a linked modpack: "PanolisSMP Lite" next to "PanolisSMP" -> "Lite". */
function suggestName(hostName, packName) {
    const host = text(hostName, 100)
    const pack = text(packName, 100)
    const stripped = pack.toLowerCase().startsWith(host.toLowerCase()) ? pack.slice(host.length).replace(/^[\s\-_:·]+/, '').trim() : pack
    return (stripped || pack || 'Perfil').slice(0, 32)
}

// ---------------------------------------------------------------- compile: the distribution

/**
 * Writes the links into a freshly generated distribution (see the top of this file). `metaOf(serverId)` gives a server's servermeta.json
 * (or null). A profile whose modpack is not in the distribution (deactivated) is left out with a line saying so; a modpack that is
 * both a host and somebody's profile keeps only the host part. Returns { lines } for the log.
 */
function applyLinks(distribution, metaOf) {
    const lines = []
    const servers = distribution.servers || []
    const byId = new Map(servers.map((server) => [server.id, server]))
    const hosts = new Map()
    for (const server of servers) {
        const profiles = stored(metaOf(server.id))
        if (profiles) hosts.set(server.id, profiles)
    }
    const taken = new Set()
    for (const [hostId, profiles] of hosts) {
        const host = byId.get(hostId)
        const kept = []
        for (const entry of profiles.list) {
            const target = byId.get(entry.pack)
            if (!target) { lines.push(`${hostId}: el perfil «${entry.name}» (${entry.pack}) no está publicado (¿desactivado?): se deja fuera.`); continue }
            if (entry.pack === hostId || hosts.has(entry.pack) || taken.has(entry.pack)) { lines.push(`${hostId}: «${entry.name}» no puede ser un perfil (ya es un perfil, o tiene perfiles propios): se deja fuera.`); continue }
            taken.add(entry.pack)
            kept.push(entry)
        }
        if (!kept.length) continue
        host.profiles = {
            list: [
                { id: hostId, name: profiles.self.name, ...(profiles.self.description ? { description: profiles.self.description } : {}), ...(profiles.self.recommendedBelowGb ? { recommendedBelowGb: profiles.self.recommendedBelowGb } : {}) },
                ...kept.map((entry) => ({ id: entry.pack, name: entry.name, ...(entry.description ? { description: entry.description } : {}), ...(entry.recommendedBelowGb ? { recommendedBelowGb: entry.recommendedBelowGb } : {}) }))
            ]
        }
        for (const entry of kept) byId.get(entry.pack).profileOf = hostId
        lines.push(`${hostId}: ${kept.length + 1} perfiles (${host.profiles.list.map((profile) => profile.name).join(', ')}).`)
    }
    return { lines }
}

module.exports = { normalize, stored, describe, save, suggestName, applyLinks, linksOf, dirOf, MAX_PROFILES }
