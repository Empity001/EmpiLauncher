/**
 * Profiles, as the index publishes them (tools/publisher/lib/profiles.js explains the format): a modpack lists OTHER modpacks as its
 * profiles, and each of those says whose profile it is. Nothing is merged: every one of them is an ordinary modpack of the index, with
 * its own game folder, mods, memory and Java, so the rest of the engine does not know profiles exist. Choosing a profile is choosing that
 * modpack (distro.select); what this file does is only tell the interface how to present them.
 */
const os = require('os')

/** Total memory of this PC in whole GB (what "recommended below" is compared with). */
const machineGb = () => Math.round(os.totalmem() / 1073741824)

const toMb = (ram) => (ram && Number.isFinite(ram.maximum) ? { minimumMb: Number.isFinite(ram.minimum) ? ram.minimum : ram.maximum, maximumMb: ram.maximum } : null)

/** The profile meant for a PC with this much memory: of those that say "recommended below N GB" with N above it, the tightest one. */
function recommendedFor(list, gb) {
    let best = null
    for (const profile of list) {
        if (profile.recommendedBelowGb && gb < profile.recommendedBelowGb && (!best || profile.recommendedBelowGb < best.recommendedBelowGb)) best = profile
    }
    return best ? best.id : null
}

/**
 * What the interface shows of the profiles of one modpack: null when it has none that hold up. A listed modpack that is not in this index
 * (it was deactivated after the list was written) is left out, and fewer than two left means no profiles at all.
 */
function describe(raw, rawServers) {
    if (!raw || !raw.profiles || !Array.isArray(raw.profiles.list)) return null
    const byId = new Map((rawServers || []).map((server) => [server.id, server]))
    const list = raw.profiles.list
        .filter((entry) => entry && byId.has(entry.id) && (entry.id === raw.id || byId.get(entry.id).profileOf === raw.id))
        .map((entry) => {
            const server = byId.get(entry.id)
            return {
                id: entry.id,
                name: entry.name || server.name,
                description: entry.description || '',
                recommendedBelowGb: entry.recommendedBelowGb || null,
                minecraftVersion: server.minecraftVersion,
                version: server.version,
                ram: toMb(server.javaOptions && server.javaOptions.ram),
                self: entry.id === raw.id
            }
        })
    if (list.length < 2 || !list.some((profile) => profile.self)) return null
    const gb = machineGb()
    return { machineGb: gb, recommended: recommendedFor(list, gb), list }
}

/** The modpack this one is a profile of, only when that modpack exists in the index and lists it (otherwise this one is shown on its own). */
function hostOf(raw, rawServers) {
    if (!raw || !raw.profileOf || raw.profileOf === raw.id) return null
    const host = (rawServers || []).find((server) => server.id === raw.profileOf)
    return host && describe(host, rawServers) && describe(host, rawServers).list.some((profile) => profile.id === raw.id) ? host.id : null
}

module.exports = { describe, hostOf, recommendedFor, machineGb }
