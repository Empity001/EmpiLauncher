/**
 * Preferences that only the native interface has. They live in their own file next to the launcher's config.json so the
 * classic launcher's configuration schema is never touched.
 *
 *   fieldMode  'auto' (moves only when it is cheap), 'always' (moves whenever the window is visible), 'off' (a still image)
 */
const fs = require('fs')
const path = require('path')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')

const DEFAULTS = { fieldMode: 'auto' }
const ALLOWED = { fieldMode: ['auto', 'always', 'off'] }

function register(handlers, state) {
    const file = () => path.join(ensureCore(state).ConfigManager.getLauncherDirectory(), 'native-ui.json')
    const read = () => {
        try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) } } catch { return { ...DEFAULTS } }
    }

    handlers.set('ui.get', async () => read())

    handlers.set('ui.set', async ({ key, value }) => {
        if (!ALLOWED[key] || !ALLOWED[key].includes(value)) throw new EngineError('bad_key', `not a valid preference: ${key}=${value}`)
        const next = { ...read(), [key]: value }
        fs.mkdirSync(path.dirname(file()), { recursive: true })
        fs.writeFileSync(file(), JSON.stringify(next, null, 2))
        return next
    })
}

module.exports = { register }
