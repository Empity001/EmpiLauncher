// node engine/test/profiles.mjs
// Profiles are links between modpacks (lib/profiles.js): the index says a modpack lists others as its profiles and each of those says whose
// it is. The engine only tells the interface how to present them; every one of them stays an ordinary modpack with its own settings.
//   part 1  the pure functions
//   part 2  the real engine, served an index over HTTP (nothing real is touched: scratch user/data folders)
import http from 'node:http'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const lib = require('../src/lib/profiles.js')

// ---- the fixture: a modpack with two profiles (one of them another Minecraft and loader), one that is not part of any, and dangling links ----

const module = (name) => ({ id: `x.${name}:${name}:1@jar`, name, type: 'FabricMod', artifact: { size: 1, MD5: 'd41d8cd98f00b204e9800998ecf8427e', url: `http://127.0.0.1/${name}.jar` } })
const server = (id, name, extra = {}) => ({
    id, name, description: '', version: '1.0.0', address: 'localhost:25565', minecraftVersion: '1.21.11', mainServer: id === 'Host-1.21.11', autoconnect: false, whitelist: false,
    javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN' }, modules: [module(id)], ...extra
})
const index = () => ({
    version: '1.0.0',
    servers: [
        server('Host-1.21.11', 'Host', {
            javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN', ram: { recommended: 4096, minimum: 3072, maximum: 4096 } },
            profiles: { list: [
                { id: 'Host-1.21.11', name: 'Normal', description: 'El de siempre' },
                { id: 'Lite-1.21.11', name: 'Lite', description: 'Menos carga', recommendedBelowGb: 128 },
                { id: 'Old-1.20.1', name: 'Antiguo' }
            ] }
        }),
        server('Lite-1.21.11', 'Host Lite', { profileOf: 'Host-1.21.11', javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN', ram: { recommended: 3072, minimum: 2048, maximum: 3072 } } }),
        server('Old-1.20.1', 'Host Old', { profileOf: 'Host-1.21.11', minecraftVersion: '1.20.1', version: '2.5.0', javaOptions: { supported: '>=17 <18', suggestedMajor: 17, distribution: 'TEMURIN' } }),
        server('Alone-1.21.11', 'Alone'),
        // a modpack whose only profile is not in the index any more, and one that claims a host that does not list it
        server('Broken-1.21.11', 'Broken', { profiles: { list: [{ id: 'Broken-1.21.11', name: 'Normal' }, { id: 'Gone-1.21.11', name: 'Gone' }] } }),
        server('Liar-1.21.11', 'Liar', { profileOf: 'Alone-1.21.11' })
    ]
})
const raws = index().servers
const rawOf = (id) => raws.find((entry) => entry.id === id)

// ---- part 1 ---------------------------------------------------------------------------------------------------------------------------

{
    const profiles = lib.describe(rawOf('Host-1.21.11'), raws)
    check('a modpack that lists profiles gets them all, itself first, whatever their Minecraft or loader', profiles && profiles.list.map((profile) => profile.id).join() === 'Host-1.21.11,Lite-1.21.11,Old-1.20.1')
    check('each one carries the name and description the author wrote for it', profiles.list[1].name === 'Lite' && profiles.list[1].description === 'Menos carga' && profiles.list[0].name === 'Normal')
    check('and what the modpack it points to is (its Minecraft and version)', profiles.list[2].minecraftVersion === '1.20.1' && profiles.list[2].version === '2.5.0')
    check('its memory is the one that modpack asks for, in megabytes', JSON.stringify(profiles.list[1].ram) === JSON.stringify({ minimumMb: 2048, maximumMb: 3072 }) && profiles.list[2].ram === null)
    check('only the modpack itself is marked as such', profiles.list.filter((profile) => profile.self).map((profile) => profile.id).join() === 'Host-1.21.11')
    check('a modpack that lists no profiles has none', lib.describe(rawOf('Alone-1.21.11'), raws) === null && lib.describe(rawOf('Lite-1.21.11'), raws) === null)
    check('profiles that are not in the index are left out, and one left alone is not a set of profiles', lib.describe(rawOf('Broken-1.21.11'), raws) === null)

    check('a modpack is shown inside its host when the host lists it', lib.hostOf(rawOf('Lite-1.21.11'), raws) === 'Host-1.21.11' && lib.hostOf(rawOf('Old-1.20.1'), raws) === 'Host-1.21.11')
    check('and on its own when it is nobody\'s profile, or claims a host that does not list it', lib.hostOf(rawOf('Alone-1.21.11'), raws) === null && lib.hostOf(rawOf('Liar-1.21.11'), raws) === null)
    check('or when its host is gone from the index', lib.hostOf({ id: 'X', profileOf: 'Nowhere' }, raws) === null)

    const list = [{ id: 'a', recommendedBelowGb: 8 }, { id: 'b', recommendedBelowGb: 12 }, { id: 'c' }]
    check('recommended: the tightest "below N" that the PC fits', lib.recommendedFor(list, 6) === 'a' && lib.recommendedFor(list, 10) === 'b' && lib.recommendedFor(list, 16) === null)
}

// ---- part 2 ---------------------------------------------------------------------------------------------------------------------------

const web = http.createServer((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(index())) })
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${web.address().port}/distribution.json`

const engine = await startEngine({ label: 'profiles', env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: url } })
const ask = async (method, params) => { const reply = await engine.call(method, params); return reply.ok ? reply.result : { error: reply.error } }
try {
    const loaded = await ask('distro.load')
    const card = (id) => loaded.servers.find((entry) => entry.id === id)
    check('the engine loads the index', loaded.servers && loaded.servers.length === 6, JSON.stringify(loaded.error || ''))
    const host = card('Host-1.21.11')
    check('the host says which profiles it has, what is recommended for this PC, and how much memory this PC has', host.profiles && host.profiles.list.length === 3 && host.profiles.recommended === 'Lite-1.21.11' && host.profiles.machineGb > 0, `${host.profiles && host.profiles.machineGb} GB`)
    check('the host is not a profile of anything', host.profileOf === null)
    check('a profile says whose it is (so the interface shows it inside the host)', card('Lite-1.21.11').profileOf === 'Host-1.21.11' && card('Old-1.20.1').profileOf === 'Host-1.21.11')
    check('a profile has no profiles of its own', card('Lite-1.21.11').profiles === null)
    check('a modpack that is nothing to do with them is as before', card('Alone-1.21.11').profiles === null && card('Alone-1.21.11').profileOf === null)
    check('links that do not hold up are ignored', card('Broken-1.21.11').profiles === null && card('Liar-1.21.11').profileOf === null)

    // choosing a profile is choosing that modpack: it has its own status, and its own memory and Java settings
    const picked = await ask('distro.select', { id: 'Lite-1.21.11' })
    check('choosing a profile is choosing that modpack', picked.selectedServer === 'Lite-1.21.11', JSON.stringify(picked.error || picked))
    const status = await ask('pack.status')
    check('and the pack status is that modpack\'s own', status.serverId === 'Lite-1.21.11')
    const memory = async (serverId) => { const settings = await ask('config.server.get', { serverId }); return `${settings.minRAM}/${settings.maxRAM}` }
    check('each keeps the memory its own author set (the profile\'s is set in its own modpack)', (await memory('Lite-1.21.11')) === '2048M/3072M' && (await memory('Host-1.21.11')) === '3072M/4096M', `${await memory('Lite-1.21.11')} ${await memory('Host-1.21.11')}`)
    const old = await ask('distro.select', { id: 'Old-1.20.1' })
    check('a profile of another Minecraft and loader is chosen the same way', old.selectedServer === 'Old-1.20.1')
    const refreshed = await ask('distro.load', { refresh: true })
    check('the choice is kept', refreshed.selectedServer === 'Old-1.20.1')
} catch (err) {
    check('the test itself ran', false, err.stack || String(err))
} finally {
    web.close()
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}
