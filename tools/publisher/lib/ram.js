// The memory a modpack (or one of its profiles) asks for, as the launcher wants it: whole steps of 512 MB, in megabytes.
// The distribution spec only has `recommended` and `minimum`; the launcher also reads `maximum` (see ConfigManager: it is where a
// player STARTS, the player can change it afterwards), and `recommended` is written equal to the maximum so an older launcher that
// only knows the spec starts at the same value as before.

const RAM_STEP_MB = 512
const RAM_LIMIT_MB = 128 * 1024

/** { minimumMb, maximumMb } typed by a person -> { minimumMb, maximumMb } snapped to steps, or throws with something they can act on. */
function snapRam(input) {
    const minimum = Number(input && input.minimumMb)
    const maximum = Number(input && input.maximumMb)
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) throw new Error('Escribe la memoria mínima y la máxima en números.')
    const snap = (mb) => Math.round(mb / RAM_STEP_MB) * RAM_STEP_MB
    const min = snap(minimum)
    const max = snap(maximum)
    if (min < RAM_STEP_MB) throw new Error('La memoria mínima no puede ser menos de 0,5 GB.')
    if (max < min) throw new Error('La memoria máxima no puede ser menor que la mínima.')
    if (max > RAM_LIMIT_MB) throw new Error('La memoria máxima no puede pasar de 128 GB.')
    return { minimumMb: min, maximumMb: max }
}

/** What goes in servermeta.json (`javaOptions.ram`). */
function normalizeRam(input) {
    const { minimumMb, maximumMb } = snapRam(input)
    return { recommended: maximumMb, minimum: minimumMb, maximum: maximumMb }
}

module.exports = { RAM_STEP_MB, RAM_LIMIT_MB, snapRam, normalizeRam }
