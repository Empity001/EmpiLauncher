/**
 * Preferences that only the native interface has. They live in their own file next to the launcher's config.json so the
 * classic launcher's configuration schema is never touched.
 *
 *   fieldMode  'auto' (moves only when it is cheap), 'always' (moves whenever the window is visible), 'off' (a still image)
 *   dotColor   '#rrggbb', the colour of the field's dots (grey by default)
 *   dotOpacity 0.1 to 1, how visible the whole field is (1 by default): lower it to make the background calmer
 *   animatedArt true (default) plays a modpack's animated banner and background (GIF, WebP, APNG); false keeps them still and makes no frames
 *   autoJava true (default): a modpack whose Java is not on the PC gets the right one installed when the player presses Jugar, with no question; false: the launcher asks first
 */
const fs = require('fs')
const path = require('path')
const { ensureCore } = require('./core')
const { EngineError } = require('../ipc/server')

const DEFAULTS = { fieldMode: 'auto', dotColor: '#64635f', dotOpacity: 1, animatedArt: true, autoJava: true }
// what each preference accepts: a list of values, or a test
const ALLOWED = {
    fieldMode: (v) => ['auto', 'always', 'off'].includes(v),
    dotColor: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
    dotOpacity: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0.1 && v <= 1,
    animatedArt: (v) => typeof v === 'boolean',
    autoJava: (v) => typeof v === 'boolean'
}

function register(handlers, state) {
    const file = () => path.join(ensureCore(state).ConfigManager.getLauncherDirectory(), 'native-ui.json')
    const read = () => {
        try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) } } catch { return { ...DEFAULTS } }
    }

    handlers.set('ui.get', async () => read())

    handlers.set('ui.set', async ({ key, value }) => {
        if (!ALLOWED[key] || !ALLOWED[key](value)) throw new EngineError('bad_key', `not a valid preference: ${key}=${value}`)
        const clean = key === 'dotColor' ? value.toLowerCase() : key === 'dotOpacity' ? Math.round(value * 100) / 100 : value
        const next = { ...read(), [key]: clean }
        fs.mkdirSync(path.dirname(file()), { recursive: true })
        fs.writeFileSync(file(), JSON.stringify(next, null, 2))
        return next
    })
}

module.exports = { register }
