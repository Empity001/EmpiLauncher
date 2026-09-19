// node --test tools/publisher/test/*.test.js
// Profiles as links between modpacks (lib/profiles.js), against a throwaway Nebula root, never the real one.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const nebula = require('../lib/nebula')
const profiles = require('../lib/profiles')

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-profiles-'))
    const config = { nebulaProjectPath: path.join(root, 'no-nebula-here'), nebulaRootPath: root }
    const pack = (id, name, fields = {}, loader = 'fabric', where = 'servers', extra = {}) => {
        const dir = path.join(root, where, id)
        fs.mkdirSync(path.join(dir, 'fabricmods', 'required'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'fabricmods', 'required', 'a-1.0.jar'), 'a')
        fs.writeFileSync(path.join(dir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name, description: '', address: 'localhost:25565', ...fields }, [loader]: { version: '1.0.0' }, ...extra }, null, 2))
        return dir
    }
    return { root, config, pack, meta: (id, where = 'servers') => JSON.parse(fs.readFileSync(path.join(root, where, id, 'servermeta.json'), 'utf8')) }
}

// ------------------------------------------------------------ what is stored

test('no links are no profiles', () => {
    assert.strictEqual(profiles.normalize(null), null)
    assert.strictEqual(profiles.normalize({}), null)
    assert.strictEqual(profiles.normalize({ list: [] }), null)
})

test('the profiles from before they were links (no `pack`) are dropped instead of breaking anything', () => {
    const legacy = { default: 'completo', list: [{ id: 'completo', name: 'Completo', exclude: { mods: [], files: [] } }, { id: 'lite', name: 'Lite', exclude: { mods: [], files: [] } }] }
    assert.strictEqual(profiles.normalize(legacy), null)
    assert.strictEqual(profiles.stored({ profiles: legacy }), null)
})

test('a link needs a label, and labels differ (also from the modpack\'s own)', () => {
    assert.throws(() => profiles.normalize({ list: [{ pack: 'A-1.21.11', name: '' }] }), /le falta el nombre/)
    assert.throws(() => profiles.normalize({ list: [{ pack: 'A-1.21.11', name: 'Lite' }, { pack: 'B-1.21.11', name: 'lite' }] }), /dos perfiles llamados/)
    assert.throws(() => profiles.normalize({ self: { name: 'Lite' }, list: [{ pack: 'A-1.21.11', name: 'Lite' }] }), /dos perfiles llamados/)
    assert.throws(() => profiles.normalize({ list: [{ pack: 'A-1.21.11', name: 'Uno' }, { pack: 'A-1.21.11', name: 'Otro' }] }), /no puede ser dos perfiles/)
    assert.throws(() => profiles.normalize({ list: Array.from({ length: 13 }, (_, i) => ({ pack: `P${i}-1.21.11`, name: `P${i}` })) }), /máximo 12/)
})

test('the modpack itself is called Normal unless said otherwise, and the sizes are checked', () => {
    const result = profiles.normalize({ list: [{ pack: 'A-1.21.11', name: 'Lite', recommendedBelowGb: '8', description: '  Menos carga  ' }] })
    assert.deepStrictEqual(result.self, { name: 'Normal', description: '', recommendedBelowGb: null })
    assert.deepStrictEqual(result.list[0], { pack: 'A-1.21.11', name: 'Lite', description: 'Menos carga', recommendedBelowGb: 8 })
    assert.throws(() => profiles.normalize({ list: [{ pack: 'A-1.21.11', name: 'Lite', recommendedBelowGb: 0 }] }), /entre 1 y 128/)
    assert.throws(() => profiles.normalize({ self: { recommendedBelowGb: 500 }, list: [{ pack: 'A-1.21.11', name: 'Lite' }] }), /entre 1 y 128/)
})

test('the label a linked modpack gets by default', () => {
    assert.strictEqual(profiles.suggestName('PanolisSMP', 'PanolisSMP Lite'), 'Lite')
    assert.strictEqual(profiles.suggestName('PanolisSMP', 'PanolisSMP - Sin shaders'), 'Sin shaders')
    assert.strictEqual(profiles.suggestName('PanolisSMP', 'Otra cosa'), 'Otra cosa')
    assert.strictEqual(profiles.suggestName('PanolisSMP', 'PanolisSMP'), 'PanolisSMP')
})

// ------------------------------------------------------------ the editor

test('any other modpack can be chosen: another Minecraft, another loader, deactivated', () => {
    const { config, pack } = makeRoot()
    pack('Host-1.21.11', 'Host')
    pack('Same-1.21.11', 'Same')
    pack('Older-1.20.1', 'Older')
    pack('Forged-1.21.11', 'Forged', {}, 'neoforge')
    pack('Off-1.21.11', 'Off', {}, 'fabric', 'hide')
    const view = profiles.describe(config, 'Host-1.21.11')
    assert.deepStrictEqual(view.versions.map((version) => version.id).sort(), ['Forged-1.21.11', 'Off-1.21.11', 'Older-1.20.1', 'Same-1.21.11'])
    assert.ok(view.versions.every((version) => version.available && version.reason === null))
    const older = view.versions.find((version) => version.id === 'Older-1.20.1')
    assert.deepStrictEqual([older.minecraft, older.loader, older.loaderName, older.mods], ['1.20.1', 'fabric', 'Fabric', 1])
    assert.strictEqual(view.versions.find((version) => version.id === 'Off-1.21.11').active, false)
    assert.strictEqual(view.profiles, null)
})

test('saving links keeps them in servermeta.json, and the linked modpack is not touched: not hidden, not changed, still published', () => {
    const { config, pack, root, meta } = makeRoot()
    pack('Host-1.21.11', 'Host')
    const lite = pack('HostLite-1.21.11', 'Host Lite', { javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN', ram: { recommended: 3072, minimum: 2048, maximum: 3072 } } })
    const before = fs.readFileSync(path.join(lite, 'servermeta.json'), 'utf8')
    const view = profiles.save(config, 'Host-1.21.11', { self: { name: 'Normal' }, list: [{ pack: 'HostLite-1.21.11', name: 'Lite', recommendedBelowGb: 8 }] })
    assert.deepStrictEqual(meta('Host-1.21.11').profiles.list, [{ pack: 'HostLite-1.21.11', name: 'Lite', description: '', recommendedBelowGb: 8 }])
    assert.strictEqual(fs.readFileSync(path.join(lite, 'servermeta.json'), 'utf8'), before, 'the linked modpack\'s own settings are untouched')
    assert.ok(fs.existsSync(path.join(root, 'servers', 'HostLite-1.21.11', 'fabricmods', 'required', 'a-1.0.jar')), 'and it stays where it is')
    assert.ok(!fs.existsSync(path.join(root, 'hide', 'HostLite-1.21.11')))
    // what the editor shows of it: read from the linked modpack itself (memory included), so it is set there
    assert.deepStrictEqual(view.profiles.list[0].info.ram, { minimumMb: 2048, maximumMb: 3072 })
    assert.strictEqual(view.profiles.list[0].info.name, 'Host Lite')
    assert.strictEqual(view.versions.find((version) => version.id === 'HostLite-1.21.11').linked, true)
})

test('the list of modpacks says whose profile each one is', () => {
    const { config, pack } = makeRoot()
    pack('Host-1.21.11', 'Host')
    pack('HostLite-1.21.11', 'Host Lite')
    pack('Other-1.21.11', 'Other')
    profiles.save(config, 'Host-1.21.11', { list: [{ pack: 'HostLite-1.21.11', name: 'Lite' }] })
    const list = nebula.listPacks(config)
    assert.strictEqual(list.find((entry) => entry.id === 'HostLite-1.21.11').profileOf, 'Host-1.21.11')
    assert.strictEqual(list.find((entry) => entry.id === 'Other-1.21.11').profileOf, null)
    assert.strictEqual(list.find((entry) => entry.id === 'Host-1.21.11').profiles, 1)
    assert.strictEqual(profiles.describe(config, 'HostLite-1.21.11').profileOf.id, 'Host-1.21.11')
})

test('one modpack is a profile of only one modpack, a profile has no profiles, and a modpack is not its own profile', () => {
    const { config, pack } = makeRoot()
    pack('Host-1.21.11', 'Host')
    pack('Other-1.21.11', 'Other')
    pack('Lite-1.21.11', 'Lite')
    profiles.save(config, 'Host-1.21.11', { list: [{ pack: 'Lite-1.21.11', name: 'Lite' }] })
    assert.throws(() => profiles.save(config, 'Other-1.21.11', { list: [{ pack: 'Lite-1.21.11', name: 'Lite' }] }), /ya es un perfil de Host-1\.21\.11/)
    assert.throws(() => profiles.save(config, 'Lite-1.21.11', { list: [{ pack: 'Other-1.21.11', name: 'Otro' }] }), /un perfil no puede tener perfiles/)
    assert.throws(() => profiles.save(config, 'Other-1.21.11', { list: [{ pack: 'Host-1.21.11', name: 'Host' }] }), /tiene perfiles propios/)
    assert.throws(() => profiles.save(config, 'Other-1.21.11', { list: [{ pack: 'Other-1.21.11', name: 'Yo' }] }), /de sí mismo/)
    assert.throws(() => profiles.save(config, 'Other-1.21.11', { list: [{ pack: 'Nope-1.21.11', name: 'X' }] }), /No existe/)
    const view = profiles.describe(config, 'Other-1.21.11')
    assert.strictEqual(view.versions.find((version) => version.id === 'Lite-1.21.11').available, false)
    assert.match(view.versions.find((version) => version.id === 'Lite-1.21.11').reason, /Ya es un perfil de Host/)
    assert.strictEqual(view.versions.find((version) => version.id === 'Host-1.21.11').available, false)
})

test('removing the profiles leaves both modpacks exactly as they were, without the link', () => {
    const { config, pack, root, meta } = makeRoot()
    pack('Host-1.21.11', 'Host')
    pack('Lite-1.21.11', 'Lite')
    profiles.save(config, 'Host-1.21.11', { list: [{ pack: 'Lite-1.21.11', name: 'Lite' }] })
    profiles.save(config, 'Host-1.21.11', null)
    assert.strictEqual(meta('Host-1.21.11').profiles, undefined)
    assert.strictEqual(meta('Host-1.21.11').fabric.version, '1.0.0')
    assert.ok(fs.existsSync(path.join(root, 'servers', 'Lite-1.21.11')))
    assert.strictEqual(nebula.listPacks(config).find((entry) => entry.id === 'Lite-1.21.11').profileOf, null)
})

test('profiles left from the old kind are ignored, flagged, and replaced on the next save', () => {
    const { config, pack, meta } = makeRoot()
    pack('Host-1.21.11', 'Host', {}, 'fabric', 'servers', { profiles: { default: 'normal', list: [{ id: 'normal', name: 'Normal', exclude: { mods: [], files: [] } }, { id: 'lite', name: 'Lite', exclude: { mods: [], files: [] } }] } })
    pack('Lite-1.21.11', 'Lite')
    const view = profiles.describe(config, 'Host-1.21.11')
    assert.strictEqual(view.profiles, null)
    assert.strictEqual(view.legacy, true)
    profiles.save(config, 'Host-1.21.11', { list: [{ pack: 'Lite-1.21.11', name: 'Lite' }] })
    assert.strictEqual(meta('Host-1.21.11').profiles.list[0].pack, 'Lite-1.21.11')
    assert.strictEqual(profiles.describe(config, 'Host-1.21.11').legacy, false)
})

// ------------------------------------------------------------ the compiled distribution

const server = (id, extra = {}) => ({ id, name: id, version: '1.0.0', minecraftVersion: '1.21.11', modules: [{ id: 'x:y:1@jar', type: 'FabricMod', artifact: { url: 'https://x.test/a.jar', size: 1, MD5: 'a' } }], ...extra })
const metas = (table) => (id) => table[id] || null

test('the host lists itself first and its profiles after it; each profile says whose it is; nothing else changes', () => {
    const distribution = { servers: [server('Host-1.21.11', { javaOptions: { ram: { maximum: 4096 } } }), server('Lite-1.20.1', { minecraftVersion: '1.20.1' }), server('Other-1.21.11')] }
    const before = JSON.stringify(distribution.servers.map((entry) => entry.modules))
    const { lines } = profiles.applyLinks(distribution, metas({
        'Host-1.21.11': { profiles: { self: { name: 'Normal', description: 'Todo' }, list: [{ pack: 'Lite-1.20.1', name: 'Lite', description: 'Ligero', recommendedBelowGb: 8 }] } }
    }))
    const [host, lite, other] = distribution.servers
    assert.deepStrictEqual(host.profiles.list, [
        { id: 'Host-1.21.11', name: 'Normal', description: 'Todo' },
        { id: 'Lite-1.20.1', name: 'Lite', description: 'Ligero', recommendedBelowGb: 8 }
    ])
    assert.strictEqual(lite.profileOf, 'Host-1.21.11')
    assert.strictEqual(other.profileOf, undefined)
    assert.strictEqual(other.profiles, undefined)
    assert.strictEqual(JSON.stringify(distribution.servers.map((entry) => entry.modules)), before, 'no module moves: every modpack is delivered whole')
    assert.deepStrictEqual(host.javaOptions, { ram: { maximum: 4096 } }, 'the memory each modpack asks for is its own')
    assert.match(lines[0], /Host-1\.21\.11: 2 perfiles \(Normal, Lite\)/)
})

test('a profile that is not published is left out with a line saying so, and a host left with none has no profiles', () => {
    const distribution = { servers: [server('Host-1.21.11'), server('Solo-1.21.11')] }
    const { lines } = profiles.applyLinks(distribution, metas({
        'Host-1.21.11': { profiles: { list: [{ pack: 'Off-1.21.11', name: 'Off' }] } },
        'Solo-1.21.11': { profiles: { list: [{ pack: 'Other-1.21.11', name: 'Otro' }] } }
    }))
    assert.strictEqual(distribution.servers[0].profiles, undefined)
    assert.strictEqual(lines.filter((line) => /no está publicado/.test(line)).length, 2)
})

test('a modpack that is a host and somebody\'s profile keeps only the host part; one modpack is one host\'s profile', () => {
    const distribution = { servers: [server('A-1.21.11'), server('B-1.21.11'), server('C-1.21.11')] }
    const { lines } = profiles.applyLinks(distribution, metas({
        'A-1.21.11': { profiles: { list: [{ pack: 'B-1.21.11', name: 'B' }, { pack: 'C-1.21.11', name: 'C' }] } },
        'B-1.21.11': { profiles: { list: [{ pack: 'C-1.21.11', name: 'C' }] } }
    }))
    const [a, b, c] = distribution.servers
    assert.deepStrictEqual(a.profiles.list.map((entry) => entry.id), ['A-1.21.11', 'C-1.21.11'])
    assert.strictEqual(b.profileOf, undefined)
    assert.strictEqual(c.profileOf, 'A-1.21.11')
    assert.ok(lines.some((line) => /no puede ser un perfil/.test(line)))
})
