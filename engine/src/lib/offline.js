/**
 * Playing without an account ("sin conexión", what some call "no premium"): no Microsoft session, no skin, just the name the player picked.
 *
 * The launcher needs a stable identity for that player, because Minecraft keeps single-player data (inventory, advancements,
 * settings that follow the player) under a UUID. So the identity is derived from the name alone, with a fixed rule:
 *
 *   1. the name is lower-cased (Juanito and juanito are the same player)
 *   2. every valid character has a fixed value:  a-z = 1..26,  0-9 = 27..36,  _ = 37
 *   3. the values are combined with FNV-1a (64 bit): h = (h xor value) * 1099511628211, starting from 14695981039346656037
 *   4. the result is reduced to 12 digits (h mod 10^12) and padded with zeros on the left
 *
 * Same name, same 12 digits, always: nothing depends on the date, the server, the session or any random source, so the id can
 * be recomputed anywhere from the name. The UUID the game receives is that id inside a well-formed version-3 UUID:
 * 00000000-0000-3000-8000-<12 digits>.
 */
const fs = require('fs')
const path = require('path')

const NAME = /^[A-Za-z0-9_]{3,16}$/
const OFFSET = 0xcbf29ce484222325n
const PRIME = 0x100000001b3n
const MASK = 0xffffffffffffffffn
const MODULUS = 1_000_000_000_000n

/** The fixed value of one (lower-case) character, or 0 for a character that is not valid. */
function charValue(ch) {
    const code = ch.charCodeAt(0)
    if (code >= 97 && code <= 122) return code - 96          // a-z -> 1..26
    if (code >= 48 && code <= 57) return code - 48 + 27      // 0-9 -> 27..36
    if (ch === '_') return 37
    return 0
}

/** Why a name cannot be used, in words for the player; null when it can. */
function problem(name) {
    const trimmed = String(name ?? '').trim()
    if (trimmed.length < 3) return 'El nombre necesita al menos 3 caracteres.'
    if (trimmed.length > 16) return 'El nombre puede tener 16 caracteres como máximo.'
    if (!NAME.test(trimmed)) return 'Solo se permiten letras (sin tildes ni ñ), números y guion bajo.'
    return null
}

/** The 12-digit identifier of a name (see the rule above). Throws for a name that is not valid. */
function offlineId(name) {
    const why = problem(name)
    if (why) throw new Error(why)
    let hash = OFFSET
    for (const ch of String(name).trim().toLowerCase()) {
        hash ^= BigInt(charValue(ch))
        hash = (hash * PRIME) & MASK
    }
    return (hash % MODULUS).toString().padStart(12, '0')
}

const offlineUuid = (id) => `00000000-0000-3000-8000-${id}`

/** Everything the launcher and the game need to know about a name. */
function profile(name) {
    const why = problem(name)
    if (why) return { valid: false, reason: why, name: String(name ?? '').trim() }
    const clean = String(name).trim()
    const id = offlineId(clean)
    return { valid: true, name: clean, id, uuid: offlineUuid(id) }
}

/**
 * The account object the classic ProcessBuilder expects, for a player without an account. The game gets the UUID undashed,
 * the way it gets a Microsoft profile id (every Minecraft version parses that form); the list of accounts keeps the dashed one.
 */
function authUser(name) {
    const p = profile(name)
    if (!p.valid) throw new Error(p.reason)
    return { type: 'offline', displayName: p.name, username: p.name, uuid: p.uuid.replace(/-/g, ''), accessToken: 'offline' }
}

// ---- what is remembered: one offline player and whether it is the one in use --------------------------------------------
// Kept in the native launcher's own file, never in the shared config.json: the classic launcher must not meet an account type it does not know.

const file = (dir) => path.join(dir, 'native-offline.json')

function read(dir) {
    try {
        const saved = JSON.parse(fs.readFileSync(file(dir), 'utf8'))
        return problem(saved.name) ? null : { name: String(saved.name).trim(), active: saved.active === true }
    } catch { return null }
}

function write(dir, saved) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file(dir), JSON.stringify(saved, null, 2))
}

const clear = (dir) => fs.rmSync(file(dir), { force: true })

function setActive(dir, active) {
    const saved = read(dir)
    if (saved) write(dir, { ...saved, active })
    return saved ? { ...saved, active } : null
}

/** Who plays: the offline player when it is in use, otherwise the selected Microsoft account (null when there is none). */
function currentAccount(ConfigManager) {
    const saved = read(ConfigManager.getLauncherDirectory())
    if (saved && saved.active) return authUser(saved.name)
    return ConfigManager.getSelectedAccount()
}

module.exports = { problem, offlineId, offlineUuid, profile, authUser, read, write, clear, setActive, currentAccount }
