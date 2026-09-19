// node engine/test/profiles.mjs
// Profiles of a modpack, from the compiled distribution to the launcher.
//   part 1  the pure functions (lib/profiles.js) against a distribution written by the Publisher's own compile step
//   part 2  the real engine, served a distribution over HTTP: the profile the player has, changing it, what is kept per profile,
//           the copy the repair reads, and what must be refused
// Nothing real is touched: the engine gets scratch user/data folders and never sees the published index.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const publisher = require('../../tools/publisher/lib/profiles.js')
const lib = require('../src/lib/profiles.js')

// ---- the fixture: a compiled distribution with a modpack that has two profiles and one that has none --------------------------

const artifact = (name, folder) => ({ size: 10, MD5: 'd41d8cd98f00b204e9800998ecf8427e', url: `http://127.0.0.1/servers/Pack-1.21.11/${folder}/${name}` })
const mod = (id, name, folder = 'required', required) => ({ id, name, type: 'FabricMod', artifact: artifact(name, `fabricmods/${folder}`), ...(required ? { required } : {}) })
const file = (relative) => ({ id: relative, name: relative, type: 'File', artifact: { ...artifact(relative, 'files'), path: relative } })
const loader = () => ({
    id: 'net.fabricmc:fabric-loader:0.16.9', name: 'Fabric (fabric-loader)', type: 'Fabric', artifact: artifact('fabric-loader-0.16.9.jar', 'lib'),
    subModules: [{ id: '1.21.11-fabric-0.16.9', name: 'Fabric (version.json)', type: 'VersionManifest', artifact: artifact('1.21.11-fabric-0.16.9.json', 'versions') }]
})
const server = (id, name, extra = {}) => ({
    id, name, description: '', version: '1.0.0', address: 'localhost:25565', minecraftVersion: '1.21.11', mainServer: id === 'Pack-1.21.11', autoconnect: false, whitelist: false,
    javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN' }, ...extra
})

function fixture() {
    const packModules = [
        loader(),
        mod('net.fabricmc:fabric-api:0.141.3@jar', 'fabric-api-0.141.3.jar'),
        mod('net.caffeinemc.mods:sodium:0.8.12@jar', 'sodium-fabric-0.8.12+mc1.21.11.jar'),
        mod('generated.fabricmod:iris:1.10.7@jar', 'iris-fabric-1.10.7.jar', 'optionalon', { value: false }),
        mod('net.vulkanmod:vulkanmod:0.6.8@jar', 'vulkanmod-0.6.8.jar'),
        file('config/iris.properties'), file('config/vulkanmod_settings.json'), file('shaderpacks/Complementary.zip'), file('options.txt')
    ]
    const distribution = {
        version: '1.0.0', rss: '',
        servers: [
            { ...server('Pack-1.21.11', 'Pack'), modules: packModules },
            { ...server('Plain-1.21.11', 'Plain'), modules: [loader(), mod('a.b:c:1.0@jar', 'c-1.0.jar')] }
        ]
    }
    const meta = {
        profiles: {
            default: 'completo',
            list: [
                { id: 'completo', name: 'Completo', exclude: { mods: ['vulkanmod'], files: ['config/vulkanmod_settings.json'] }, ram: { minimumMb: 1536, maximumMb: 2048 } },
                { id: 'lite', name: 'Lite', description: 'Menos carga', recommendedBelowGb: 128, ram: { minimumMb: 1024, maximumMb: 1536 }, exclude: { mods: ['sodium-fabric', 'iris-fabric'], files: ['shaderpacks/', 'config/iris.properties'] } }
            ]
        }
    }
    publisher.applyToDistribution(distribution, (id) => (id === 'Pack-1.21.11' ? meta : null))
    return distribution
}

const idsOf = (modules) => modules.map((module) => module.id).sort()
const published = fixture()
const pack = () => published.servers[0]
const expected = (profileId) => idsOf(publisher.effectiveModules(pack(), pack().profiles.list.find((profile) => profile.id === profileId)))

// ---- part 1: the functions ----------------------------------------------------------------------------------------------------

{
    const both = ['completo', 'lite']
    for (const id of both) {
        const effective = lib.effectiveServer(pack(), id)
        check(`${id}: the engine builds exactly the modules the Publisher says that profile plays`, JSON.stringify(idsOf(effective.modules)) === JSON.stringify(expected(id)))
        check(`${id}: same id and settings as the modpack`, effective.id === pack().id && effective.version === pack().version && effective.address === pack().address)
        check(`${id}: says which profile it is`, effective.profiles.selected === id && effective.profiles.default === 'completo' && effective.profiles.list.length === 2)
    }
    check('the profiles do not carry the pool into the effective modpack', lib.effectiveServer(pack(), 'lite').profiles.pool === undefined)
    check('each profile is told how many mods it plays', lib.effectiveServer(pack(), 'completo').profiles.list.map((profile) => profile.mods).join() === '3,2', lib.effectiveServer(pack(), 'completo').profiles.list.map((profile) => profile.mods).join())
    check('a profile the modpack does not have falls back to the default one', lib.effectiveServer(pack(), 'borrado').profiles.selected === 'completo')
    check('lite: its own memory', JSON.stringify(lib.effectiveServer(pack(), 'lite').javaOptions.ram) === JSON.stringify({ recommended: 1536, minimum: 1024, maximum: 1536 }) && lib.effectiveServer(pack(), 'lite').javaOptions.supported === '>=21 <22')
    check('the memory shown to the UI is in megabytes', JSON.stringify(lib.effectiveServer(pack(), 'lite').profiles.list[1].ram) === JSON.stringify({ minimumMb: 1024, maximumMb: 1536 }))

    const noRam = fixture()
    noRam.servers[0].profiles.list[1].ram = null
    check('a profile with no memory of its own does not keep the memory of the one before', !('ram' in (lib.effectiveServer(noRam.servers[0], 'lite').javaOptions || {})))

    const untouched = { version: '1', servers: [{ id: 'X', modules: [] }] }
    check('a distribution without profiles is returned as it came', lib.effectiveDistribution(untouched, { X: 'lite' }) === untouched)
    const whole = lib.effectiveDistribution(published, { 'Pack-1.21.11': 'lite' })
    check('the whole distribution: profile applied to the modpack that has them, the rest untouched', whole.servers[0].profiles.selected === 'lite' && whole.servers[1] === published.servers[1])
    check('the published distribution itself is not modified', pack().profiles.pool.length === 2 && pack().modules.length === 7 && pack().profiles.selected === undefined)

    const list = [{ id: 'a', recommendedBelowGb: 8 }, { id: 'b', recommendedBelowGb: 12 }, { id: 'c' }]
    check('recommended: the tightest "below N" that the PC fits', lib.recommendedFor(list, 6) === 'a' && lib.recommendedFor(list, 10) === 'b' && lib.recommendedFor(list, 16) === null)

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-profiles-'))
    check('no profile in use: the repair keeps reading the launcher folder', lib.repairDirectory(dir, untouched) === dir && !fs.existsSync(path.join(dir, lib.VIEW_DIRECTORY)))
    const view = lib.repairDirectory(dir, whole)
    check('profile in use: the repair reads a copy with the chosen profile', view !== dir && ['distribution.json', 'distribution_dev.json'].every((name) => JSON.stringify(idsOf(JSON.parse(fs.readFileSync(path.join(view, name), 'utf8')).servers[0].modules)) === JSON.stringify(expected('lite'))))
    check('an unreadable or missing choices file means no choices', JSON.stringify(lib.readState(dir)) === '{"selected":{},"stash":{}}')
    fs.writeFileSync(path.join(dir, lib.FILE), '{not json')
    check('and so does a broken one', JSON.stringify(lib.readState(dir)) === '{"selected":{},"stash":{}}')
    lib.writeState(dir, { selected: { a: 'b' }, stash: {} })
    check('choices are saved and read back', lib.readState(dir).selected.a === 'b' && !fs.existsSync(path.join(dir, `${lib.FILE}.tmp`)))
    fs.rmSync(dir, { recursive: true, force: true })
}

// ---- part 2: the engine -------------------------------------------------------------------------------------------------------

let served = fixture()
const web = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(served))
})
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${web.address().port}/distribution.json`

const engine = await startEngine({ label: 'profiles', env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: url } })
const PACK = 'Pack-1.21.11'
const ask = async (method, params) => { const reply = await engine.call(method, params); return reply.ok ? reply.result : { error: reply.error } }
const card = (distribution, id = PACK) => distribution.servers.find((entry) => entry.id === id)
try {
    const loaded = await ask('distro.load')
    check('the engine loads the served distribution', loaded.servers && loaded.servers.length === 2, JSON.stringify(loaded.error || ''))
    const summary = card(loaded).profiles
    check('the modpack lists its profiles, the default one chosen', summary && summary.selected === 'completo' && summary.default === 'completo' && summary.list.map((profile) => profile.id).join() === 'completo,lite')
    check('each profile arrives with name, description and memory', summary.list[1].name === 'Lite' && summary.list[1].description === 'Menos carga' && summary.list[1].ram.maximumMb === 1536)
    check('it says what is recommended for this PC', summary.recommended === 'lite' && summary.machineGb > 0, `${summary.machineGb} GB`)
    check('a modpack without profiles says null', card(loaded, 'Plain-1.21.11').profiles === null)

    let modules = await ask('test.effectiveModules', { serverId: PACK })
    check('the engine plays the default profile at first', JSON.stringify(idsOf(modules.ids.map((id) => ({ id })))) === JSON.stringify(expected('completo')))
    const ram = async () => ({ min: (await ask('config.server.get', { serverId: PACK })).minRAM, max: (await ask('config.server.get', { serverId: PACK })).maxRAM })
    check('its memory is the one that profile sets', JSON.stringify(await ram()) === JSON.stringify({ min: '1536M', max: '2048M' }), JSON.stringify(await ram()))

    // ---- changing profile
    const toLite = await ask('profile.select', { serverId: PACK, profileId: 'lite' })
    check('changing to lite works', toLite.changed === true && toLite.profileId === 'lite', JSON.stringify(toLite.error || ''))
    check('the answer carries the modpack list as it is now', card(toLite.distribution).profiles.selected === 'lite')
    check('and the pack status', toLite.pack && toLite.pack.serverId === PACK)
    modules = await ask('test.effectiveModules', { serverId: PACK })
    check('the engine now plays the lite modules', JSON.stringify(idsOf(modules.ids.map((id) => ({ id })))) === JSON.stringify(expected('lite')))
    check('and starts with the memory lite sets', JSON.stringify(await ram()) === JSON.stringify({ min: '1024M', max: '1536M' }), JSON.stringify(await ram()))
    const events = engine.events.filter((event) => event.event === 'distro.refreshed' || event.event === 'pack.status')
    check('the interface is told (pack status and the new modpack list)', events.some((event) => event.event === 'pack.status') && events.some((event) => event.event === 'distro.refreshed'))
    const again = await ask('profile.select', { serverId: PACK, profileId: 'lite' })
    check('choosing the one already chosen changes nothing', again.changed === false)

    // ---- what the player set up is kept per profile
    await ask('config.server.set', { serverId: PACK, key: 'minRAM', value: '512M' })
    await ask('config.server.set', { serverId: PACK, key: 'maxRAM', value: '1024M' })
    await ask('profile.select', { serverId: PACK, profileId: 'completo' })
    check('going back gives the memory the author set for that profile', JSON.stringify(await ram()) === JSON.stringify({ min: '1536M', max: '2048M' }), JSON.stringify(await ram()))
    await ask('config.server.set', { serverId: PACK, key: 'maxRAM', value: '2560M' })
    await ask('profile.select', { serverId: PACK, profileId: 'lite' })
    check('lite still has what the player set in it', JSON.stringify(await ram()) === JSON.stringify({ min: '512M', max: '1024M' }), JSON.stringify(await ram()))
    await ask('profile.select', { serverId: PACK, profileId: 'completo' })
    check('and completo has what the player set in it', (await ram()).max === '2560M', JSON.stringify(await ram()))

    // ---- it survives a refresh, and a profile that disappears
    await ask('profile.select', { serverId: PACK, profileId: 'lite' })
    const config = await ask('config.get')
    check('the choice is written to the launcher folder', fs.existsSync(path.join(config.launcherDirectory, 'native-profiles.json')) && JSON.parse(fs.readFileSync(path.join(config.launcherDirectory, 'native-profiles.json'), 'utf8')).selected[PACK] === 'lite')
    const refreshed = await ask('distro.load', { refresh: true })
    check('a refresh of the published index keeps the choice', card(refreshed).profiles.selected === 'lite')
    modules = await ask('test.effectiveModules', { serverId: PACK })
    check('and the modules that go with it', JSON.stringify(idsOf(modules.ids.map((id) => ({ id })))) === JSON.stringify(expected('lite')))

    // ---- the copy the repair reads
    await ask('game.start', { mode: 'update' })
    const viewFile = path.join(config.launcherDirectory, 'profile-view', 'distribution.json')
    const arrived = await (async () => { const end = Date.now() + 20000; while (Date.now() < end) { if (fs.existsSync(viewFile)) return true; await new Promise((r) => setTimeout(r, 200)) } return false })()
    check('an update writes the copy of the distribution the repair reads', arrived)
    if (arrived) {
        const { DistributionAPI } = require('helios-core/common')
        const api = new DistributionAPI(path.dirname(viewFile), path.join(config.launcherDirectory, 'c'), path.join(config.launcherDirectory, 'i'), null, false)
        const seenByRepair = (await api.getDistributionLocalLoadOnly()).getServerById(PACK)
        check('helios-core, reading it the way the repair does, sees the lite modules', JSON.stringify(idsOf(seenByRepair.rawServer.modules)) === JSON.stringify(expected('lite')))
        check('the launcher\'s own copy of the published index still lists every profile', fs.existsSync(path.join(config.launcherDirectory, 'distribution.json')) && JSON.parse(fs.readFileSync(path.join(config.launcherDirectory, 'distribution.json'), 'utf8')).servers[0].profiles.pool.length === 2)
    }
} catch (err) {
    check('the test itself ran', false, err.stack || String(err))
}

// what must be refused (a fresh engine: the update above is still running in the first one)
try {
    const clean = await startEngine({ label: 'profiles-refuse', env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: url } })
    try {
        await clean.call('distro.load')
        const refuse = async (params) => (await clean.call('profile.select', params)).error
        // while the game (here a stand-in that just waits) runs, nothing about the installation may change under it
        await clean.call('test.spawnFake', { script: 'setTimeout(() => {}, 30000)' })
        check('the profile cannot be changed while the game runs', (await refuse({ serverId: PACK, profileId: 'lite' }))?.code === 'busy')
        await clean.call('game.stop')
        for (let waited = 0; waited < 10000; waited += 250) { if ((await clean.call('game.status')).result.phase === 'idle') break; await new Promise((r) => setTimeout(r, 250)) }
        check('a modpack without profiles has nothing to choose', (await refuse({ serverId: 'Plain-1.21.11', profileId: 'lite' }))?.code === 'no_profiles')
        check('a profile it does not have is refused', (await refuse({ serverId: PACK, profileId: 'nada' }))?.code === 'no_profile')
        check('a modpack that does not exist is refused', (await refuse({ serverId: 'Nope-1.0', profileId: 'lite' }))?.code === 'no_profiles')

        // the published modpack loses the profile the player had chosen: they end up on the default one
        await clean.call('profile.select', { serverId: PACK, profileId: 'lite' })
        served = fixture()
        served.servers[0].profiles.list = served.servers[0].profiles.list.filter((profile) => profile.id !== 'lite')
        served.servers[0].profiles.list.push({ id: 'otro', name: 'Otro', remove: [], add: [], ram: null })
        const after = await clean.call('distro.load', { refresh: true })
        check('a profile that was removed from the modpack leaves the player on the default one', card(after.result).profiles.selected === 'completo', JSON.stringify(card(after.result).profiles?.selected))
    } finally {
        await clean.stop()
    }
} catch (err) {
    check('the refusals ran', false, err.stack || String(err))
} finally {
    web.close()
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}
