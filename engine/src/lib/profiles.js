/**
 * Profiles of a modpack: what the Publisher wrote at compile time (tools/publisher/lib/profiles.js explains the format) turned into
 * the modpack the player is actually playing.
 *
 * The distribution says: `modules` is what the default profile plays, `profiles.pool` holds the modules only other profiles play, and
 * each profile lists what to take out (`remove`) and bring in (`add`) by position in those two lists. Here nothing is interpreted: the chosen profile's
 * lists are applied and the result is an ordinary server with the SAME id, so everything keyed by it (the instance folder with the
 * worlds and options, mod and Java settings, the pack state) is shared between profiles, and everything downstream (helios-core's
 * repair, ProcessBuilder, the pack fingerprint) sees a plain modpack.
 *
 * The player's choice lives in native-profiles.json next to the rest of the launcher's files.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const FILE = 'native-profiles.json'
const VIEW_DIRECTORY = 'profile-view'
const MOD_TYPES = new Set(['FabricMod', 'ForgeMod', 'NeoForgeMod', 'LiteMod'])

const hasProfiles = (server) => !!server && !!server.profiles && Array.isArray(server.profiles.list) && server.profiles.list.length >= 2

// ---- what the player chose ---------------------------------------------------------------------------------------------

/** { selected: { serverId: profileId }, stash: { serverId: { profileId: { ram, mods } } } }, never throws. */
function readState(directory) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(directory, FILE), 'utf8'))
        return { selected: data.selected && typeof data.selected === 'object' ? data.selected : {}, stash: data.stash && typeof data.stash === 'object' ? data.stash : {} }
    } catch {
        return { selected: {}, stash: {} }
    }
}

function writeState(directory, state) {
    fs.mkdirSync(directory, { recursive: true })
    const target = path.join(directory, FILE)
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(state, null, 2))
    fs.renameSync(`${target}.tmp`, target)
}

// ---- the modpack for a profile -----------------------------------------------------------------------------------------

function modulesFor(server, profile) {
    const remove = new Set(profile.remove || [])
    const pool = server.profiles.pool || []
    const modules = server.modules.filter((_module, index) => !remove.has(index))
    for (const index of profile.add || []) {
        if (pool[index]) modules.push(pool[index])
    }
    return modules
}

/** The profile that applies: the wanted one if the modpack still has it, otherwise the modpack's default. */
function chosenProfile(server, wanted) {
    const { list, default: fallback } = server.profiles
    return list.find((profile) => profile.id === wanted) || list.find((profile) => profile.id === fallback) || list[0]
}

const toMb = (ram) => (ram && Number.isFinite(ram.maximum) ? { minimumMb: Number.isFinite(ram.minimum) ? ram.minimum : ram.maximum, maximumMb: ram.maximum } : null)

/** The server as it is for one profile: same id and everything else, the modules of that profile, and its memory. */
function effectiveServer(server, wanted) {
    if (!hasProfiles(server)) return server
    const chosen = chosenProfile(server, wanted)
    const effective = {
        ...server,
        modules: modulesFor(server, chosen),
        profiles: {
            default: server.profiles.default,
            selected: chosen.id,
            list: server.profiles.list.map((profile) => ({
                id: profile.id,
                name: profile.name,
                description: profile.description || '',
                recommendedBelowGb: profile.recommendedBelowGb || null,
                ram: toMb(profile.ram),
                mods: modulesFor(server, profile).filter((module) => MOD_TYPES.has(module.type)).length
            }))
        }
    }
    if ('ram' in chosen) {
        const { ram: _previous, ...java } = server.javaOptions || {}
        if (chosen.ram) effective.javaOptions = { ...java, ram: chosen.ram }
        else if (Object.keys(java).length > 0) effective.javaOptions = java
        else delete effective.javaOptions
    }
    return effective
}

/** The whole distribution with every modpack that has profiles set to the player's choice. Returns the same object when none does. */
function effectiveDistribution(raw, selected) {
    if (!raw || !Array.isArray(raw.servers) || !raw.servers.some(hasProfiles)) return raw
    return { ...raw, servers: raw.servers.map((server) => effectiveServer(server, selected && selected[server.id])) }
}

// ---- for the interface -------------------------------------------------------------------------------------------------

/** Total memory of this PC in whole GB (what "recommended below" is compared with). */
const machineGb = () => Math.round(os.totalmem() / 1073741824)

/** The profile meant for a PC with this much memory: of those that say "recommended below N GB" with N above it, the tightest one. */
function recommendedFor(list, gb) {
    let best = null
    for (const profile of list) {
        if (profile.recommendedBelowGb && gb < profile.recommendedBelowGb && (!best || profile.recommendedBelowGb < best.recommendedBelowGb)) best = profile
    }
    return best ? best.id : null
}

/** What the UI shows of a modpack's profiles (null when it has none). `server` is the effective raw server. */
function describe(server) {
    if (!server || !server.profiles || !server.profiles.selected) return null
    const gb = machineGb()
    return { ...server.profiles, machineGb: gb, recommended: recommendedFor(server.profiles.list, gb) }
}

// ---- for helios-core's repair ------------------------------------------------------------------------------------------

/**
 * helios-core's repair runs in its own process and reads the distribution from a folder: give it one that holds the modpacks as the
 * player has them (not the copy the launcher keeps of the published one, which lists every profile's files together). A distribution
 * without profiles keeps using the launcher folder itself, exactly as before.
 */
function repairDirectory(launcherDirectory, effectiveRaw) {
    if (!effectiveRaw || !Array.isArray(effectiveRaw.servers) || !effectiveRaw.servers.some((server) => server.profiles && server.profiles.selected)) return launcherDirectory
    const directory = path.join(launcherDirectory, VIEW_DIRECTORY)
    fs.mkdirSync(directory, { recursive: true })
    const text = JSON.stringify(effectiveRaw)
    // development mode reads the other name
    for (const name of ['distribution.json', 'distribution_dev.json']) fs.writeFileSync(path.join(directory, name), text)
    return directory
}

module.exports = {
    FILE, VIEW_DIRECTORY, MOD_TYPES, hasProfiles, readState, writeState, chosenProfile, effectiveServer, effectiveDistribution,
    recommendedFor, describe, machineGb, repairDirectory
}
