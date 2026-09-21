// node engine/test/javareq.mjs
// Which Java a modpack needs (lib/javareq.js), the main modpack coming first in the list (handlers/distro.js mainFirst), and the Java handlers
// (java.check, java.install from Ajustes > Java) against the real engine. Nothing real is touched: scratch user/data folders, and nothing is downloaded.
//   part 1  the pure functions
//   part 2  the real engine, served an index over HTTP
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const req = require('../src/lib/javareq.js')
const { mainFirst } = require('../src/handlers/distro.js')

// helios-core's own answer when the index says nothing (>=21 for anything from 1.20.5 on): what the launcher used to trust
const heliosDefault = { supported: '>=21.x', suggestedMajor: 21, distribution: 'TEMURIN' }
const fake = (minecraftVersion, javaOptions, effective = heliosDefault) => ({ rawServer: { minecraftVersion, javaOptions }, effectiveJavaOptions: effective })

// ---- part 1 ---------------------------------------------------------------------------------------------------------------------------

{
    check('Minecraft 26.x wants Java 25 (the Fast Version bug: it got Java 21)', req.defaultFor('26.3').suggestedMajor === 25 && req.defaultFor('26.1.2').suggestedMajor === 25 && req.defaultFor('27.1').suggestedMajor === 25)
    check('1.20.5 up to 1.21.x want Java 21', req.defaultFor('1.20.5').suggestedMajor === 21 && req.defaultFor('1.21.11').suggestedMajor === 21 && req.defaultFor('1.21').suggestedMajor === 21)
    check('1.17 up to 1.20.4 want Java 17', req.defaultFor('1.17.1').suggestedMajor === 17 && req.defaultFor('1.20.4').suggestedMajor === 17 && req.defaultFor('1.18.2').suggestedMajor === 17)
    check('1.16 and older want Java 8, and only 8', req.defaultFor('1.16.5').suggestedMajor === 8 && req.defaultFor('1.12.2').supported === '8.x' && req.defaultFor('1.8.9').suggestedMajor === 8)
    check('a version it does not understand (snapshots, nonsense) is left to helios-core', req.defaultFor('24w14a') === null && req.defaultFor('') === null && req.defaultFor(undefined) === null && req.defaultFor('latest') === null)
    check('the range accepts its own major and anything newer', req.defaultFor('26.3').supported === '>=25.x' && req.rangeFor(21) === '>=21.x' && req.rangeFor(8) === '8.x')
    check('the major of a range is its first number', req.majorOfRange('>=25 <26') === 25 && req.majorOfRange('17.x') === 17 && req.majorOfRange('') === null)

    // what the author wrote always wins
    const panolis = req.requirement(fake('1.21.11', { supported: '>=25 <26', suggestedMajor: 25, distribution: 'TEMURIN' }, { supported: '>=25 <26', suggestedMajor: 25, distribution: 'TEMURIN' }))
    check('what the author wrote wins (Panolis: exactly Java 25)', panolis.suggestedMajor === 25 && panolis.supported === '>=25 <26' && panolis.source === 'pack')
    // a pack with nothing written: the table decides, not helios-core's guess
    const fast = req.requirement(fake('26.3', undefined))
    check('Fast Version (26.3, no javaOptions) now needs Java 25', fast.suggestedMajor === 25 && fast.supported === '>=25.x' && fast.source === 'minecraft', JSON.stringify(fast))
    check('and keeps the distribution helios-core picked', fast.distribution === 'TEMURIN')
    const old = req.requirement(fake('1.16.5', undefined, { supported: '8.x', suggestedMajor: 8, distribution: 'TEMURIN' }))
    check('an old pack with nothing written needs Java 8', old.suggestedMajor === 8 && old.supported === '8.x' && old.source === 'minecraft')
    const odd = req.requirement(fake('24w14a', undefined))
    check('an unknown Minecraft version falls back to helios-core\'s answer, and says so', odd.suggestedMajor === 21 && odd.source === 'default')
    // a half-written javaOptions is completed from what it does say
    const onlyRange = req.requirement(fake('26.3', { supported: '>=25 <26' }, { supported: '>=25 <26', suggestedMajor: 21, distribution: 'TEMURIN' }))
    check('only a range written: the major comes from the range, not from helios-core\'s guess', onlyRange.suggestedMajor === 25 && onlyRange.supported === '>=25 <26' && onlyRange.source === 'pack', JSON.stringify(onlyRange))
    const onlyMajor = req.requirement(fake('26.3', { suggestedMajor: 25 }, { supported: '>=21.x', suggestedMajor: 25, distribution: 'TEMURIN' }))
    check('only a major written: the range follows it', onlyMajor.suggestedMajor === 25 && onlyMajor.supported === '>=25.x', JSON.stringify(onlyMajor))
    const other = req.requirement(fake('26.3', { platformOptions: [{ platform: 'someos', supported: '>=1', suggestedMajor: 1 }] }))
    check('javaOptions for another platform only is the same as writing nothing', other.source === 'minecraft' && other.suggestedMajor === 25)

    // the list
    const cards = [{ id: 'a' }, { id: 'b' }, { id: 'main' }, { id: 'c' }]
    check('the main modpack goes first and the others keep their order', mainFirst(cards, 'main').map((c) => c.id).join() === 'main,a,b,c')
    check('already first, or not in the list: nothing moves', mainFirst(cards, 'a').map((c) => c.id).join() === 'a,b,main,c' && mainFirst(cards, 'nope').map((c) => c.id).join() === 'a,b,main,c')
    check('and the list it was given is not changed', cards.map((c) => c.id).join() === 'a,b,main,c')
}

// ---- part 2 ---------------------------------------------------------------------------------------------------------------------------

const module = (name) => ({ id: `x.${name}:${name}:1@jar`, name, type: 'FabricMod', artifact: { size: 1, MD5: 'd41d8cd98f00b204e9800998ecf8427e', url: `http://127.0.0.1/${name}.jar` } })
const server = (id, name, extra = {}) => ({ id, name, description: '', version: '1.0.0', address: 'localhost:25565', minecraftVersion: '1.21.11', mainServer: false, autoconnect: false, whitelist: false, modules: [module(id)], ...extra })
// the real order of the published index: two test packs first, the main one after them, then its lite profile
const index = () => ({
    version: '1.0.0',
    servers: [
        server('Fast-26.3', 'Fast Version', { minecraftVersion: '26.3' }),
        server('Fast-Mant-26.3', 'Fast Mantenimiento', { minecraftVersion: '26.3', profileOf: 'Fast-26.3' }),
        server('Main-1.21.11', 'Principal', { mainServer: true, javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN' } }),
        server('Lite-1.21.11', 'Principal Lite', { profileOf: 'Main-1.21.11', javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN' } }),
        server('Old-1.16.5', 'Viejo', { minecraftVersion: '1.16.5' })
    ]
})
const web = http.createServer((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(index())) })
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${web.address().port}/distribution.json`

const engine = await startEngine({ label: 'javareq', env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: url } })
const ask = async (method, params) => { const reply = await engine.call(method, params); return reply.ok ? reply.result : { error: reply.error } }
try {
    const loaded = await ask('distro.load')
    check('the engine loads the index', loaded.servers && loaded.servers.length === 5, JSON.stringify(loaded.error || ''))
    check('the main modpack comes first, whatever place the index gave it', loaded.servers[0].id === 'Main-1.21.11' && loaded.mainServer === 'Main-1.21.11', loaded.servers.map((s) => s.id).join())
    check('the others keep the index\'s order after it', loaded.servers.slice(1).map((s) => s.id).join() === 'Fast-26.3,Fast-Mant-26.3,Lite-1.21.11,Old-1.16.5', loaded.servers.map((s) => s.id).join())
    check('and it is what opens the first time (nothing was chosen yet)', loaded.selectedServer === 'Main-1.21.11')

    // java.check: what each modpack needs
    const need = async (serverId) => (await ask('java.check', { serverId }))
    const fast = await need('Fast-26.3')
    check('java.check: Fast Version needs Java 25, decided from its Minecraft', fast.required && fast.required.major === 25 && fast.required.source === 'minecraft' && fast.required.supported === '>=25.x', JSON.stringify(fast))
    const main = await need('Main-1.21.11')
    check('java.check: the main pack needs what its author wrote', main.required.major === 21 && main.required.source === 'pack' && main.required.supported === '>=21 <22')
    const oldPack = await need('Old-1.16.5')
    check('java.check: an old pack needs Java 8', oldPack.required.major === 8 && oldPack.required.supported === '8.x')
    check('java.check: with nothing chosen yet there is no current Java, and the automatic install is on', fast.current === null && fast.autoInstall === true)
    check('java.check without a serverId is the selected modpack', (await ask('java.check')).serverId === 'Main-1.21.11')
    check('java.check of a modpack that does not exist is an error', (await ask('java.check', { serverId: 'Nope' })).error != null)

    // the settings the interface shows now agree with it
    const settings = await ask('settings.java', { serverId: 'Fast-26.3' })
    check('settings.java says Java 25 for Fast Version too', settings.suggestedMajor === 25 && settings.supported === '>=25.x', JSON.stringify(settings))

    // the preference
    check('"Instalar Java automáticamente" is on by default and can be turned off', (await ask('ui.get')).autoJava === true && (await ask('ui.set', { key: 'autoJava', value: false })).autoJava === false && (await need('Main-1.21.11')).autoInstall === false)
    check('and only takes true or false', (await ask('ui.set', { key: 'autoJava', value: 'si' })).error != null)
    await ask('ui.set', { key: 'autoJava', value: true })

    // java.install from Ajustes: a Java that fits this PC is used without downloading anything. It needs a Java 21 in the usual place (the one the skin test uses).
    const java21 = 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.11.10-hotspot'
    if (fs.existsSync(path.join(java21, 'bin', 'javaw.exe'))) {
        const started = await ask('java.install', { serverId: 'Main-1.21.11' })
        check('java.install {serverId} starts a Java setup without a launch', started.started === true && started.standalone === true, JSON.stringify(started))
        const done = await engine.waitFor((e) => e.event === 'java.installed' || e.event === 'game.failure', 60000)
        check('a Java that fits this PC is used, not downloaded', done && done.event === 'java.installed' && done.data.reused === true && done.data.major === 21, JSON.stringify(done && done.data))
        const after = await need('Main-1.21.11')
        check('and java.check now says the modpack uses a fitting Java', after.current && after.current.ok === true && /^21\./.test(after.current.version || ''), JSON.stringify(after.current))
        const state = await ask('game.status')
        check('the engine is idle again afterwards', state.phase === 'idle')
    } else {
        console.log('SKIP  no Java 21 at the usual place: the java.install from Ajustes checks did not run')
    }
    check('java.install refuses a modpack that does not exist', (await ask('java.install', { serverId: 'Nope' })).error != null)
} catch (err) {
    check('the test itself ran', false, err.stack || String(err))
} finally {
    web.close()
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}
