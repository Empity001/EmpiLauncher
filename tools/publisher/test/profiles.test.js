// node --test tools/publisher/test/*.test.js
// Profiles of a modpack: what each one takes, how that is stored, and how the compiled distribution carries it (see lib/profiles.js).
// Against a throwaway Nebula root, never the real one.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const nebula = require('../lib/nebula')
const profiles = require('../lib/profiles')
const largeAssets = require('../lib/largeAssets')

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-profiles-'))
    const config = { nebulaProjectPath: path.join(root, 'no-nebula-here'), nebulaRootPath: root }
    const id = 'Pack-1.21.11'
    const dir = path.join(root, 'servers', id)
    for (const folder of ['fabricmods/required', 'fabricmods/optionalon', 'files/config', 'files/shaderpacks']) fs.mkdirSync(path.join(dir, folder), { recursive: true })
    fs.writeFileSync(path.join(dir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: id, address: 'localhost:25565' }, fabric: { version: '0.16.9' } }, null, 2))
    const put = (relative, size = 10) => { fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true }); fs.writeFileSync(path.join(dir, relative), Buffer.alloc(size, 1)) }
    return { root, config, id, dir, put, meta: () => JSON.parse(fs.readFileSync(path.join(dir, 'servermeta.json'), 'utf8')) }
}

const BOTH = [
    { id: 'completo', name: 'Completo' },
    { id: 'lite', name: 'Lite', exclude: { mods: ['sodium-fabric', 'iris-fabric'], files: ['shaderpacks/', 'config/iris.properties'] } }
]

// ------------------------------------------------------------ names

test('a mod is named by what comes before its version', () => {
    const cases = {
        'sodium-fabric-0.8.12+mc1.21.11.jar': 'sodium-fabric',
        'AdvancementPlaques-1.21.11-fabric-1.7.0.jar': 'advancementplaques',
        'not-enough-vulkan-1.6.2+mc1.21.11.jar': 'not-enough-vulkan',
        'fabric-api-0.141.3+1.21.11.jar': 'fabric-api',
        'Xaeros_Minimap_25.2.0_Fabric_1.21.11.jar': 'xaeros-minimap',
        '3dskinlayers-fabric-1.9.0-mc1.21.11.jar': '3dskinlayers-fabric',
        'modmenu-v17.0.0.jar': 'modmenu',
        'Sodium Extra 0.8.3.jar': 'sodium-extra'
    }
    for (const [file, stem] of Object.entries(cases)) assert.strictEqual(profiles.stemOf(file), stem, file)
})

test('a newer jar of the same mod keeps the same name, and similar mods stay apart', () => {
    assert.strictEqual(profiles.stemOf('sodium-0.8.12.jar'), profiles.stemOf('sodium-0.9.0+mc1.22.jar'))
    assert.notStrictEqual(profiles.stemOf('sodium-0.8.12.jar'), profiles.stemOf('sodium-extra-0.8.3.jar'))
})

// ------------------------------------------------------------ what is stored

test('fewer than two profiles are not profiles', () => {
    assert.strictEqual(profiles.normalize(null), null)
    assert.strictEqual(profiles.normalize({ list: [{ name: 'Solo' }] }), null)
    assert.strictEqual(profiles.normalize({ list: [] }), null)
})

test('profiles get an id from their name and keep it; the default falls back to the first', () => {
    const one = profiles.normalize({ default: 'nope', list: [{ name: 'Sin Sombras' }, { name: 'Ligero' }] })
    assert.deepStrictEqual(one.list.map((profile) => profile.id), ['sin-sombras', 'ligero'])
    assert.strictEqual(one.default, 'sin-sombras')
    const renamed = profiles.normalize({ default: 'ligero', list: [{ id: 'sin-sombras', name: 'Otro nombre' }, { id: 'ligero', name: 'Ligero' }] })
    assert.deepStrictEqual(renamed.list.map((profile) => profile.id), ['sin-sombras', 'ligero'])
    assert.strictEqual(renamed.default, 'ligero')
})

test('ids never repeat, even when names differ only by accents or case', () => {
    const many = profiles.normalize({ list: [{ name: 'Rápido' }, { name: 'Rapido!' }, { name: 'RAPIDO?' }] })
    assert.strictEqual(new Set(many.list.map((profile) => profile.id)).size, 3)
})

test('names must be there, different, and not too long', () => {
    assert.throws(() => profiles.normalize({ list: [{ name: '' }, { name: 'B' }] }), /le falta el nombre/)
    assert.throws(() => profiles.normalize({ list: [{ name: 'Lite' }, { name: 'lite' }] }), /dos perfiles llamados/)
    assert.throws(() => profiles.normalize({ list: [{ name: 'x'.repeat(40) }, { name: 'B' }] }), /demasiado largo/)
    assert.throws(() => profiles.normalize({ list: Array.from({ length: 13 }, (_, i) => ({ name: `P${i}` })) }), /máximo 12/)
})

test('memory and the recommended size are checked like the rest of the Publisher does', () => {
    const ok = profiles.normalize({ list: [{ name: 'A' }, { name: 'B', ram: { minimumMb: 2000, maximumMb: 5000 }, recommendedBelowGb: '8' }] })
    assert.deepStrictEqual(ok.list[1].ram, { minimumMb: 2048, maximumMb: 5120 })
    assert.strictEqual(ok.list[1].recommendedBelowGb, 8)
    assert.throws(() => profiles.normalize({ list: [{ name: 'A' }, { name: 'B', ram: { minimumMb: 4096, maximumMb: 2048 } }] }), /máxima no puede ser menor/)
    assert.throws(() => profiles.normalize({ list: [{ name: 'A' }, { name: 'B', recommendedBelowGb: 0 }] }), /entre 1 y 128/)
})

test('rules are cleaned: lower case, forward slashes, no repeats, nothing that is not text', () => {
    const result = profiles.normalize({ list: [{ name: 'A' }, { name: 'B', exclude: { mods: ['Sodium', 'sodium', 3, ''], files: ['.\\Config\\A.json', 'config/a.json', 'ShaderPacks/'] } }] })
    assert.deepStrictEqual(result.list[1].exclude, { mods: ['sodium'], files: ['config/a.json', 'shaderpacks/'] })
})

// ------------------------------------------------------------ the editor

test('the editor lists mods once per name and every file except what Apariencia manages', () => {
    const { config, id, put } = makeRoot()
    put('fabricmods/required/sodium-fabric-0.8.12+mc1.21.11.jar', 100)
    put('fabricmods/optionalon/sodium-fabric-0.8.11.jar', 50)
    put('fabricmods/required/iris-fabric-1.10.7.jar', 30)
    put('files/config/iris.properties', 5)
    put('files/shaderpacks/Complementary.zip', 400)
    put('files/background.webp', 9999)
    put('files/theme.json', 5)
    put('files/options.txt', 7)
    const view = profiles.describe(config, id)
    assert.strictEqual(view.profiles, null)
    assert.deepStrictEqual(view.items.mods.map((mod) => [mod.stem, mod.names.length, mod.size]), [['iris-fabric', 1, 30], ['sodium-fabric', 2, 150]])
    assert.deepStrictEqual(view.items.files.map((file) => file.path), ['config/iris.properties', 'options.txt', 'shaderpacks/Complementary.zip'])
})

test('saving keeps the profiles in servermeta.json, tells how much each takes, and flags rules that match nothing', () => {
    const { config, id, put, meta } = makeRoot()
    put('fabricmods/required/sodium-fabric-0.8.12.jar', 100)
    put('fabricmods/required/iris-fabric-1.10.7.jar', 30)
    put('fabricmods/required/fabric-api-0.141.3.jar', 500)
    put('files/config/iris.properties', 5)
    put('files/shaderpacks/Complementary.zip', 400)
    const view = profiles.save(config, id, { default: 'completo', list: [...BOTH, { name: 'Viejo', exclude: { mods: ['ya-no-existe'], files: ['config/borrado.json'] } }] })
    assert.deepStrictEqual(meta().profiles.list.map((profile) => profile.id), ['completo', 'lite', 'viejo'])
    assert.deepStrictEqual(view.totals.completo, { mods: 3, files: 2, bytes: 100 + 30 + 500 + 5 + 400 })
    assert.deepStrictEqual(view.totals.lite, { mods: 1, files: 0, bytes: 500 })
    assert.deepStrictEqual(view.stale, { viejo: { mods: ['ya-no-existe'], files: ['config/borrado.json'] } })
    assert.strictEqual(nebula.listPacks(config)[0].profiles, 3)
})

test('sending nothing (or one profile) takes the profiles away and leaves the rest of the file alone', () => {
    const { config, id, meta } = makeRoot()
    profiles.save(config, id, { list: BOTH })
    assert.ok(meta().profiles)
    profiles.save(config, id, null)
    assert.strictEqual(meta().profiles, undefined)
    assert.strictEqual(meta().fabric.version, '0.16.9')
    assert.strictEqual(nebula.listPacks(config)[0].profiles, 0)
})

// ------------------------------------------------------------ the compiled distribution

const mod = (id, file, folder = 'required') => ({ id, name: file, type: 'FabricMod', artifact: { size: 10, url: `https://example.test/servers/Pack-1.21.11/fabricmods/${folder}/${encodeURIComponent(file)}`, MD5: 'x' } })
const file = (relative) => ({ id: relative, name: relative, type: 'File', artifact: { size: 5, url: `https://example.test/servers/Pack-1.21.11/files/${relative}`, MD5: 'y', path: relative } })

function fixture() {
    return {
        version: '1.0.0',
        servers: [{
            id: 'Pack-1.21.11', name: 'Pack', version: '1.0.0', javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN', ram: { recommended: 6144, minimum: 4096, maximum: 6144 } },
            modules: [
                { id: 'net.fabricmc:fabric-loader:0.16.9', type: 'Fabric', artifact: { size: 1, url: 'https://example.test/loader.jar' } },
                { id: 'net.minecraft:1.21.11', type: 'VersionManifest', artifact: { size: 1, url: 'https://example.test/v.json' } },
                mod('net.fabricmc:fabric-api:0.141.3@jar', 'fabric-api-0.141.3.jar'),
                mod('net.caffeinemc.mods:sodium:0.8.12@jar', 'sodium-fabric-0.8.12+mc1.21.11.jar'),
                mod('generated.fabricmod:iris:1.10.7@jar', 'iris-fabric-1.10.7.jar', 'optionalon'),
                mod('net.vulkanmod:vulkanmod:0.6.8@jar', 'vulkanmod-0.6.8.jar'),
                file('config/iris.properties'), file('config/vulkanmod_settings.json'), file('shaderpacks/Complementary.zip'), file('options.txt'), file('background.webp')
            ]
        }, { id: 'Other-1.21.11', modules: [mod('a:b:1@jar', 'b-1.jar')] }]
    }
}
const twoProfiles = () => ({
    default: 'completo',
    list: [
        { name: 'Completo', id: 'completo', exclude: { mods: ['vulkanmod'], files: ['config/vulkanmod_settings.json'] } },
        { name: 'Lite', id: 'lite', ram: { minimumMb: 2048, maximumMb: 3072 }, exclude: { mods: ['sodium-fabric', 'iris-fabric'], files: ['shaderpacks/', 'config/iris.properties'] } }
    ]
})
const compile = (distribution, meta = { profiles: twoProfiles() }) => profiles.applyToDistribution(distribution, (id) => (id === 'Pack-1.21.11' ? meta : null))
const idsOf = (modules) => modules.map((module) => module.id)

test('the modpack itself is what the default profile plays, so a launcher without profiles is unchanged', () => {
    const distribution = fixture()
    compile(distribution)
    const server = distribution.servers[0]
    assert.ok(!idsOf(server.modules).includes('net.vulkanmod:vulkanmod:0.6.8@jar'))
    assert.ok(!idsOf(server.modules).includes('config/vulkanmod_settings.json'))
    assert.ok(idsOf(server.modules).includes('net.caffeinemc.mods:sodium:0.8.12@jar'))
    assert.ok(idsOf(server.modules).includes('shaderpacks/Complementary.zip'))
    assert.deepStrictEqual(idsOf(server.profiles.pool), ['net.vulkanmod:vulkanmod:0.6.8@jar', 'config/vulkanmod_settings.json'])
})

test('each profile says what to take out and what to bring in, by position', () => {
    const distribution = fixture()
    compile(distribution)
    const server = distribution.servers[0]
    const [completo, lite] = server.profiles.list
    const at = (modules, positions) => positions.map((position) => modules[position].id)
    assert.deepStrictEqual([completo.remove, completo.add], [[], []])
    assert.deepStrictEqual(at(server.modules, lite.remove), ['net.caffeinemc.mods:sodium:0.8.12@jar', 'generated.fabricmod:iris:1.10.7@jar', 'config/iris.properties', 'shaderpacks/Complementary.zip'])
    assert.deepStrictEqual(at(server.profiles.pool, lite.add), ['net.vulkanmod:vulkanmod:0.6.8@jar', 'config/vulkanmod_settings.json'])
})

test('files that share a name but live in different folders are told apart (their ids are only the file name)', () => {
    const distribution = fixture()
    const twin = (folder) => ({ id: 'options.txt', name: 'options.txt', type: 'File', artifact: { size: 3, url: `https://example.test/servers/Pack-1.21.11/files/${folder}/options.txt`, MD5: 'z', path: `${folder}/options.txt` } })
    distribution.servers[0].modules.push(twin('config/fancymenu'), twin('config/drippyloadingscreen'))
    compile(distribution, { profiles: { default: 'completo', list: [{ name: 'Completo', id: 'completo' }, { name: 'Lite', id: 'lite', exclude: { files: ['config/fancymenu/'] } }] } })
    const server = distribution.servers[0]
    const lite = server.profiles.list[1]
    const played = profiles.effectiveModules(server, lite).filter((module) => module.id === 'options.txt').map((module) => module.artifact.path).sort()
    assert.deepStrictEqual(played, ['config/drippyloadingscreen/options.txt', 'options.txt'])
    assert.strictEqual(profiles.effectiveModules(server, server.profiles.list[0]).filter((module) => module.id === 'options.txt').length, 3)
})

test('applying a profile gives exactly the modules that profile plays', () => {
    const distribution = fixture()
    compile(distribution)
    const server = distribution.servers[0]
    const [completo, lite] = server.profiles.list
    const lists = { completo: idsOf(profiles.effectiveModules(server, completo)), lite: idsOf(profiles.effectiveModules(server, lite)) }
    // what never belongs to a profile is in both: loader, version manifest, shared mods, options, the launcher's background
    for (const shared of ['net.fabricmc:fabric-loader:0.16.9', 'net.minecraft:1.21.11', 'net.fabricmc:fabric-api:0.141.3@jar', 'options.txt', 'background.webp']) {
        assert.ok(lists.completo.includes(shared) && lists.lite.includes(shared), shared)
    }
    assert.ok(lists.completo.includes('net.caffeinemc.mods:sodium:0.8.12@jar') && !lists.lite.includes('net.caffeinemc.mods:sodium:0.8.12@jar'))
    assert.ok(lists.lite.includes('net.vulkanmod:vulkanmod:0.6.8@jar') && !lists.completo.includes('net.vulkanmod:vulkanmod:0.6.8@jar'))
    assert.deepStrictEqual([lists.completo.length, lists.lite.length], [9, 7])
})

test('a file rule with a trailing slash takes a whole folder, and a stem takes every version of the mod', () => {
    const distribution = fixture()
    distribution.servers[0].modules.push(file('shaderpacks/Other.zip'), mod('generated.fabricmod:iris:1.9@jar', 'iris-fabric-1.9.0.jar', 'optionaloff'))
    compile(distribution)
    const server = distribution.servers[0]
    const removed = server.profiles.list[1].remove.map((position) => server.modules[position].id)
    assert.ok(removed.includes('shaderpacks/Other.zip'))
    assert.ok(removed.includes('generated.fabricmod:iris:1.9@jar'))
})

test('memory: each profile has its own, the pack default is used when it has none, and the default profile sets the pack', () => {
    const distribution = fixture()
    compile(distribution)
    const server = distribution.servers[0]
    const [completo, lite] = server.profiles.list
    assert.deepStrictEqual(lite.ram, { recommended: 3072, minimum: 2048, maximum: 3072 })
    assert.deepStrictEqual(completo.ram, { recommended: 6144, minimum: 4096, maximum: 6144 })
    assert.deepStrictEqual(server.javaOptions.ram, completo.ram)

    const another = fixture()
    const meta = { profiles: { default: 'lite', list: twoProfiles().list } }
    compile(another, meta)
    assert.deepStrictEqual(another.servers[0].javaOptions.ram, { recommended: 3072, minimum: 2048, maximum: 3072 })
    assert.deepStrictEqual(another.servers[0].profiles.list.find((profile) => profile.id === 'completo').ram, { recommended: 6144, minimum: 4096, maximum: 6144 })
})

test('choosing another default profile changes what a launcher without profiles gets', () => {
    const distribution = fixture()
    compile(distribution, { profiles: { default: 'lite', list: twoProfiles().list } })
    const server = distribution.servers[0]
    assert.ok(idsOf(server.modules).includes('net.vulkanmod:vulkanmod:0.6.8@jar'), 'the lite profile plays vulkanmod')
    assert.ok(!idsOf(server.modules).includes('net.caffeinemc.mods:sodium:0.8.12@jar'))
    assert.strictEqual(server.profiles.default, 'lite')
})

test('a modpack without profiles, and the others in the distribution, are left exactly as they were', () => {
    const distribution = fixture()
    const before = JSON.stringify(distribution)
    const result = compile(distribution, {})
    assert.strictEqual(JSON.stringify(distribution), before)
    assert.deepStrictEqual(result.lines, [])
    compile(fixture(), { profiles: { list: [{ name: 'Solo' }] } })
})

test('the log says what each profile ended up with', () => {
    const { lines } = compile(fixture())
    assert.strictEqual(lines.length, 1)
    assert.match(lines[0], /Pack-1\.21\.11: 2 perfiles \(Completo: \d+ módulos, Lite: \d+ módulos\)/)
})

test('a profile that would play no mods at all is refused instead of published', () => {
    const meta = { profiles: { default: 'completo', list: [{ name: 'Completo', id: 'completo' }, { name: 'Vacio', id: 'vacio', exclude: { mods: ['fabric-api', 'sodium-fabric', 'iris-fabric', 'vulkanmod'] } }] } }
    assert.throws(() => compile(fixture(), meta), /se queda sin ningún mod/)
})

test('a distribution whose profiles point at nothing, or twice at the same place, is not published', () => {
    const make = () => { const distribution = fixture(); compile(distribution); return distribution.servers[0] }
    const outside = make()
    outside.profiles.list[1].remove.push(999)
    assert.throws(() => profiles.verify(outside), /módulo que no existe/)
    const twice = make()
    twice.profiles.list[1].add.push(twice.profiles.list[1].add[0])
    assert.throws(() => profiles.verify(twice), /dos veces el mismo módulo/)
    assert.doesNotThrow(() => profiles.verify(make()))
})

test('large files that only another profile plays still get their Release link', () => {
    const distribution = fixture()
    compile(distribution)
    const pooled = distribution.servers[0].profiles.pool.find((module) => module.id === 'net.vulkanmod:vulkanmod:0.6.8@jar')
    const key = 'servers/Pack-1.21.11/fabricmods/required/vulkanmod-0.6.8.jar'
    const changed = largeAssets.rewriteDistributionUrls(distribution, { [key]: 'https://releases.test/vulkanmod.jar' }, 'https://example.test/')
    assert.strictEqual(changed, 1)
    assert.strictEqual(pooled.artifact.url, 'https://releases.test/vulkanmod.jar')
})
