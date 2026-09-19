// node engine/test/ram.mjs
// The memory a modpack's author sets in the Publisher (javaOptions.ram: minimum and maximum) reaches players as their starting values:
// new players start there, players who already have the modpack get the new numbers once when the author changes them, and what a
// player sets afterwards stays theirs. A modpack that carries only the distribution spec's own numbers behaves exactly as it always did.
//
// ConfigManager is loaded on its own with a fake user-data folder and a fake APPDATA (its legacy-config migration moves files around,
// so it must never see the real ones).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { check } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-ram-'))
const userDir = path.join(root, 'user')
process.env.APPDATA = path.join(root, 'appdata')
fs.mkdirSync(process.env.APPDATA, { recursive: true })

const originalLoad = Module._load
Module._load = function (request, ...rest) {
    if (request === '@electron/remote') return { app: { getPath: () => userDir } }
    return originalLoad.call(this, request, ...rest)
}

try {
    const ConfigManager = require(path.join(here, '..', '..', 'app', 'assets', 'js', 'configmanager.js'))
    ConfigManager.load()
    const options = { suggestedMajor: 21 }
    const ceilingMb = ConfigManager.getAbsoluteMaxRAM() * 1024
    const raw = () => { ConfigManager.save(); return JSON.parse(fs.readFileSync(path.join(userDir, 'config.json'), 'utf8')).javaConfig }
    const ram = (id) => [ConfigManager.getMinRAM(id), ConfigManager.getMaxRAM(id)]
    // small numbers, so the checks do not depend on how much memory this machine has
    const MIN = 1024, MAX = 2048

    // ---- a modpack that sets nothing ----
    ConfigManager.ensureJavaConfig('plain', options, undefined)
    check('no memory set: the legacy default, and nothing about the modpack is recorded', ['2G', '3G', '4G'].includes(ConfigManager.getMinRAM('plain')) && ConfigManager.getMinRAM('plain') === ConfigManager.getMaxRAM('plain') && raw().plain.packRam === undefined, JSON.stringify(ram('plain')))

    // ---- only the spec's own numbers (recommended, minimum): unchanged behaviour ----
    ConfigManager.ensureJavaConfig('spec', options, { recommended: 3072, minimum: 2048 })
    check('only recommended and minimum: both start at recommended, as before', ConfigManager.getMinRAM('spec') === '3072M' && ConfigManager.getMaxRAM('spec') === '3072M' && raw().spec.packRam === undefined, JSON.stringify(ram('spec')))

    // ---- a new player of a modpack that sets both ends ----
    ConfigManager.ensureJavaConfig('set', options, { recommended: MAX, minimum: MIN, maximum: MAX })
    check('both ends set: a new player starts at the minimum and the maximum', ConfigManager.getMinRAM('set') === `${MIN}M` && ConfigManager.getMaxRAM('set') === `${MAX}M`, JSON.stringify(ram('set')))
    check('and what it started from is recorded', raw().set.packRam === `${MIN}-${MAX}`)

    // ---- the player changes them: the same numbers from the author do not overrule that ----
    ConfigManager.setMinRAM('set', '1536M'); ConfigManager.setMaxRAM('set', '1536M')
    ConfigManager.ensureJavaConfig('set', options, { recommended: MAX, minimum: MIN, maximum: MAX })
    check("a player's own numbers stay while the author's have not changed", ConfigManager.getMinRAM('set') === '1536M' && ConfigManager.getMaxRAM('set') === '1536M', JSON.stringify(ram('set')))

    // ---- the author changes them: players who already have the modpack get them once ----
    ConfigManager.ensureJavaConfig('set', options, { recommended: 2560, minimum: 1536, maximum: 2560 })
    check('when the author changes the numbers, they are applied once', ConfigManager.getMinRAM('set') === '1536M' && ConfigManager.getMaxRAM('set') === '2560M' && raw().set.packRam === '1536-2560', JSON.stringify(ram('set')))
    ConfigManager.setMaxRAM('set', '2048M')
    ConfigManager.ensureJavaConfig('set', options, { recommended: 2560, minimum: 1536, maximum: 2560 })
    check('and not again: the player can lower it afterwards', ConfigManager.getMaxRAM('set') === '2048M')

    // ---- a player who already had the modpack before the author set anything ----
    ConfigManager.ensureJavaConfig('old', options, undefined)
    ConfigManager.setMinRAM('old', '512M'); ConfigManager.setMaxRAM('old', '1024M')
    ConfigManager.ensureJavaConfig('old', options, { recommended: MAX, minimum: MIN, maximum: MAX })
    check('a player who already had the modpack gets the first numbers the author sets', ConfigManager.getMinRAM('old') === `${MIN}M` && ConfigManager.getMaxRAM('old') === `${MAX}M`, JSON.stringify(ram('old')))

    // ---- the author removes the setting: nobody is touched ----
    ConfigManager.setMaxRAM('old', '1536M')
    ConfigManager.ensureJavaConfig('old', options, undefined)
    check('if the author stops setting memory, players keep what they have', ConfigManager.getMaxRAM('old') === '1536M')

    // ---- limits ----
    ConfigManager.ensureJavaConfig('huge', options, { recommended: 1e6, minimum: 1e6, maximum: 1e6 })
    check('never more than this machine can give (the sliders\' own ceiling)', ConfigManager.getMaxRAM('huge') === `${ceilingMb}M` && ConfigManager.getMinRAM('huge') === `${ceilingMb}M`, JSON.stringify(ram('huge')) + ` ceiling ${ceilingMb}`)
    ConfigManager.ensureJavaConfig('crossed', options, { recommended: MIN, minimum: 4096, maximum: MIN })
    check('a minimum above the maximum is brought down to it', ConfigManager.getMinRAM('crossed') === `${MIN}M` && ConfigManager.getMaxRAM('crossed') === `${MIN}M`, JSON.stringify(ram('crossed')))
    ConfigManager.ensureJavaConfig('tiny', options, { recommended: 64, minimum: 64, maximum: 64 })
    check('and nothing below 512 MB', ConfigManager.getMinRAM('tiny') === '512M' && ConfigManager.getMaxRAM('tiny') === '512M', JSON.stringify(ram('tiny')))
    ConfigManager.ensureJavaConfig('nomin', options, { recommended: MAX, maximum: MAX })
    check('a maximum without a minimum starts both at the maximum', ConfigManager.getMinRAM('nomin') === `${MAX}M` && ConfigManager.getMaxRAM('nomin') === `${MAX}M`, JSON.stringify(ram('nomin')))

    // ---- what is saved is a normal config ----
    ConfigManager.save()
    check('it saves and reloads with the record intact', (() => { ConfigManager.load(); return ConfigManager.getMaxRAM('set') === '2048M' && raw().set.packRam === '1536-2560' })())
} finally {
    Module._load = originalLoad
    fs.rmSync(root, { recursive: true, force: true })
}
