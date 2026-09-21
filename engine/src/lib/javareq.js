/**
 * Which Java a modpack needs.
 *
 * helios-core decides it from the index: what the author wrote in `javaOptions`, and when there is nothing, a guess from the Minecraft
 * version that stops at "1.20.5 or newer wants Java 21". That guess is wrong for the year-numbered releases (26.1 and later, which
 * want Java 25): a pack like "Fast Version" (Minecraft 26.3, no javaOptions) got "Java 21 or newer", the launcher installed or picked a
 * Java 21, and the game would not even open.
 *
 * So: what the author wrote always wins; only when it is missing does this table decide (and a partly written javaOptions is completed
 * from what it does say, never from the wrong guess). Every place in the engine that asks "which Java" goes through requirement().
 */

/** [major, minor, patch] of a release Minecraft version ("1.21.11", "26.3"), or null for anything else (snapshots, "latest"...). */
function parseMinecraft(version) {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version || '').trim())
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null
}

/** The Java a Minecraft release needs by default, or null when the version is not one this table understands. */
function defaultFor(minecraftVersion) {
    const parsed = parseMinecraft(minecraftVersion)
    if (!parsed) return null
    const [first, minor, patch] = parsed
    if (first >= 26) return { supported: '>=25.x', suggestedMajor: 25 }                                     // 26.1 and later: Java 25
    if (first !== 1) return null
    if (minor > 20 || (minor === 20 && patch >= 5)) return { supported: '>=21.x', suggestedMajor: 21 }     // 1.20.5 to 1.21.x: Java 21
    if (minor >= 17) return { supported: '>=17.x', suggestedMajor: 17 }                                      // 1.17 to 1.20.4 (1.17 asks for 16: 17 does it too)
    return { supported: '8.x', suggestedMajor: 8 }
}

/** The first whole number in a semver range (">=25 <26" -> 25), the major it is about. */
const majorOfRange = (range) => {
    const match = /(\d+)/.exec(String(range || ''))
    return match ? Number(match[1]) : null
}

/** A range that accepts `major` (and, past Java 8, anything newer: that is what helios-core's own defaults say too). */
const rangeFor = (major) => (major <= 8 ? `${major}.x` : `>=${major}.x`)

/** True when the author's javaOptions says anything at all about the Java that applies on this platform. */
function statesSomething(javaOptions) {
    if (!javaOptions) return false
    if (javaOptions.supported != null || javaOptions.suggestedMajor != null) return true
    return (javaOptions.platformOptions || []).some((option) => option && option.platform === process.platform)
}

/**
 * @param {{ rawServer: { minecraftVersion: string, javaOptions?: object }, effectiveJavaOptions: { supported: string, suggestedMajor: number, distribution: string } }} server a helios-core server
 * @returns {{ supported: string, suggestedMajor: number, distribution: string, source: 'pack' | 'minecraft' | 'default' }}
 *   source says where it comes from: what the author wrote, the Minecraft table above, or helios-core's own last-resort guess.
 */
function requirement(server) {
    const effective = server.effectiveJavaOptions            // helios-core's merge: the author's options (platform ones first), then its defaults
    const stated = statesSomething(server.rawServer.javaOptions)
    if (stated) {
        let { supported, suggestedMajor } = effective
        const raw = server.rawServer.javaOptions
        // one of the two is missing: helios-core filled it with its guess; make it agree with the one the author did write
        const platform = (raw.platformOptions || []).find((option) => option && option.platform === process.platform && option.architecture === process.arch)
            || (raw.platformOptions || []).find((option) => option && option.platform === process.platform) || {}
        const writtenSupported = platform.supported ?? raw.supported
        const writtenMajor = platform.suggestedMajor ?? raw.suggestedMajor
        if (writtenSupported != null && writtenMajor == null) suggestedMajor = majorOfRange(writtenSupported) ?? suggestedMajor
        if (writtenMajor != null && writtenSupported == null) supported = rangeFor(writtenMajor)
        return { supported, suggestedMajor, distribution: effective.distribution, source: 'pack' }
    }
    const guess = defaultFor(server.rawServer.minecraftVersion)
    if (guess) return { ...guess, distribution: effective.distribution, source: 'minecraft' }
    return { supported: effective.supported, suggestedMajor: effective.suggestedMajor, distribution: effective.distribution, source: 'default' }
}

module.exports = { requirement, defaultFor, parseMinecraft, majorOfRange, rangeFor }
