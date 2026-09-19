/**
 * Playing without an account. The rule that turns a name into a stable identity lives in lib/offline.js; this only exposes it.
 *
 * The offline player shows up in the account list like the others (type "offline"), so choosing it, using another account and
 * removing it are the ordinary account.select / account.remove calls. What is specific to it:
 *
 *   offline.preview {name}  -> { valid, reason?, name, id, uuid }   what a name would become, for the sign-in box
 *   offline.set {name}      -> the account list, with this player now in use   (creates it or renames it)
 */
const offline = require('../lib/offline')
const { ensureCore, accountsView } = require('./core')
const { EngineError } = require('../ipc/server')

function register(handlers, state) {
    handlers.set('offline.preview', async ({ name } = {}) => offline.profile(name))

    handlers.set('offline.set', async ({ name } = {}) => {
        const { ConfigManager } = ensureCore(state)
        const player = offline.profile(name)
        if (!player.valid) throw new EngineError('bad_name', player.reason)
        offline.write(ConfigManager.getLauncherDirectory(), { name: player.name, active: true })
        return accountsView(ConfigManager)
    })
}

module.exports = { register }
