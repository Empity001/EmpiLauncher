/**
 * Playing without an account. The rule that turns a name into a stable identity lives in lib/offline.js; this only exposes it.
 *
 * The offline player shows up in the account list like the others (type "offline"), so choosing it, using another account and
 * removing it are the ordinary account.select / account.remove calls. What is specific to it:
 *
 *   offline.preview {name}   -> { valid, reason?, name, id, uuid }   what a name would become, for the sign-in box
 *   offline.set {name}       -> the account list, with this player now in use   (creates it or renames it; its skin stays)
 *
 * Its skin comes from a NameMC skin id (lib/skin.js). Nothing here searches NameMC: the player gives the id or the link.
 *   skin.parse {input}       -> { valid, id?, reason? }   what was typed or pasted; no network, for the live hint
 *   skin.fetch {input}       -> { id, model, front, head }   downloads (once) and checks that skin, and draws its preview; changes nothing
 *   skin.set {id, model?}    -> the account list   makes it the skin of the offline player (also gets the skin component the first time)
 *   skin.clear               -> the account list   back to the game's default skin
 */
const offline = require('../lib/offline')
const skins = require('../lib/skin')
const { ensureCore, accountsView } = require('./core')
const { EngineError } = require('../ipc/server')

function register(handlers, state) {
    handlers.set('offline.preview', async ({ name } = {}) => offline.profile(name))

    handlers.set('offline.set', async ({ name } = {}) => {
        const { ConfigManager } = ensureCore(state)
        const player = offline.profile(name)
        if (!player.valid) throw new EngineError('bad_name', player.reason)
        const dir = ConfigManager.getLauncherDirectory()
        offline.write(dir, { name: player.name, active: true, skin: offline.read(dir)?.skin })
        return accountsView(ConfigManager)
    })

    handlers.set('skin.parse', async ({ input } = {}) => {
        const parsed = skins.parseSkinInput(input)
        return parsed.id ? { valid: true, id: parsed.id } : { valid: false, reason: parsed.reason }
    })

    handlers.set('skin.fetch', async ({ input } = {}) => {
        const { ConfigManager } = ensureCore(state)
        const parsed = skins.parseSkinInput(input)
        if (!parsed.id) throw new EngineError('bad_skin', parsed.reason)
        try {
            const skin = await skins.fetchSkin(ConfigManager.getLauncherDirectory(), parsed.id)
            return { id: skin.id, model: skin.model, front: skin.front, head: skin.head }
        } catch (err) {
            throw new EngineError('skin_failed', err.message)
        }
    })

    handlers.set('skin.set', async ({ id, model } = {}) => {
        const { ConfigManager } = ensureCore(state)
        const dir = ConfigManager.getLauncherDirectory()
        if (!offline.read(dir)) throw new EngineError('no_offline', 'Primero elige jugar sin conexión.')
        let skin
        try {
            skin = await skins.fetchSkin(dir, String(id))
            await skins.ensureInjector(dir)   // the piece the game needs to show it; downloaded once, then it is there without internet
        } catch (err) {
            throw new EngineError('skin_failed', err.message)
        }
        offline.setSkin(dir, { id: skin.id, model: model === 'slim' || model === 'default' ? model : skin.model })
        return accountsView(ConfigManager)
    })

    handlers.set('skin.clear', async () => {
        const { ConfigManager } = ensureCore(state)
        offline.setSkin(ConfigManager.getLauncherDirectory(), null)
        return accountsView(ConfigManager)
    })
}

module.exports = { register }
