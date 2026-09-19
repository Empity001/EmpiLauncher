// node --test tools/publisher/test/*.test.js
// Bringing a modpack that already exists in as a profile of another one (lib/profileimport.js), against a throwaway Nebula root.
// The check that matters is the last of each test: after importing, compiling the modpack with its profiles gives, for each profile,
// exactly what the original modpack it came from delivered.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const nebula = require('../lib/nebula')
const profiles = require('../lib/profiles')
const importer = require('../lib/profileimport')

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-import-'))
    const config = { nebulaProjectPath: path.join(root, 'no-nebula-here'), nebulaRootPath: root }
    const pack = (id, name, fields, mods, files, where = 'servers') => {
        const dir = path.join(root, where, id)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name, description: '', address: 'localhost:25565', ...fields }, fabric: { version: '0.16.9' } }, null, 2))
        for (const [rel, content] of Object.entries(mods)) { fs.mkdirSync(path.dirname(path.join(dir, 'fabricmods', rel)), { recursive: true }); fs.writeFileSync(path.join(dir, 'fabricmods', rel), content) }
        for (const [rel, content] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, 'files', rel)), { recursive: true }); fs.writeFileSync(path.join(dir, 'files', rel), content) }
        return dir
    }
    return { root, config, pack }
}

const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

/** What Nebula would publish for a folder, close enough for this: a module per mod jar (with how it starts) and per file. */
function modulesOf(dir, id) {
    const out = []
    const modsDir = path.join(dir, 'fabricmods')
    for (const category of ['required', 'optionalon', 'optionaloff']) {
        const folder = path.join(modsDir, category)
        if (!fs.existsSync(folder)) continue
        for (const name of fs.readdirSync(folder)) {
            const required = category === 'required' ? undefined : category === 'optionalon' ? { value: false } : { value: false, def: false }
            out.push({ id: `mod.${name}`, name, type: 'FabricMod', artifact: { size: fs.statSync(path.join(folder, name)).size, MD5: md5(path.join(folder, name)), url: `https://x.test/servers/${id}/fabricmods/${category}/${name}` }, ...(required ? { required } : {}) })
        }
    }
    const filesDir = path.join(dir, 'files')
    const walk = (current) => {
        if (!fs.existsSync(current)) return
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) walk(full)
            else {
                const rel = path.relative(filesDir, full).split(path.sep).join('/')
                out.push({ id: entry.name, name: entry.name, type: 'File', artifact: { size: fs.statSync(full).size, MD5: md5(full), url: `https://x.test/servers/${id}/files/${rel}`, path: rel } })
            }
        }
    }
    walk(filesDir)
    return out
}

/** Comparable form of a delivery: the mods (name and how they start) and the files (path and content), without where they are stored. */
const shown = (modules) => modules
    .filter((module) => module.type === 'FabricMod' || module.type === 'File')
    .map((module) => (module.type === 'FabricMod' ? `mod ${module.name} ${JSON.stringify(module.required || null)}` : `file ${module.artifact.path} ${module.artifact.MD5}`))
    .sort()

function compiled(config, id) {
    const dir = importer.dirOf(config, id)
    const distribution = { servers: [{ id, modules: modulesOf(dir, id) }] }
    const meta = nebula.readServerMeta(config, id)
    profiles.applyToDistribution(distribution, () => meta)
    return distribution.servers[0]
}
const played = (server, profileId) => shown(profiles.effectiveModules(server, server.profiles.list.find((profile) => profile.id === profileId)))

function twoPacks() {
    const { config, pack, root } = makeRoot()
    const mods = { 'required/fabric-api-1.0.jar': 'api', 'required/sodium-fabric-1.0.jar': 'sodium', 'optionalon/iris-fabric-1.0.jar': 'iris', 'required/appleskin-1.0.jar': 'apple', 'required/shared-mod-1.0.jar': 'shared' }
    const files = { 'options.txt': 'normal', 'config/iris.properties': 'iris', 'shaderpacks/a.zip': 'A', 'shaderpacks/b.zip': 'B', 'config/shared.json': 'same' }
    pack('Pack-1.21.11', 'Pack', { description: 'El normal' }, mods, files)
    pack('PackLite-1.21.11', 'Pack Lite', { description: 'Menos carga', javaOptions: { ram: { recommended: 3072, minimum: 2048, maximum: 3072 } } },
        { 'required/fabric-api-1.0.jar': 'api', 'required/vulkanmod-1.0.jar': 'vulkan', 'optionaloff/appleskin-1.0.jar': 'apple', 'required/shared-mod-1.0.jar': 'shared' },
        { 'options.txt': 'lite', 'config/vulkan.json': 'v', 'config/shared.json': 'same' })
    return { config, root }
}

test('the candidates are the other modpacks with the same Minecraft and loader, published or deactivated', () => {
    const { config, pack } = makeRoot()
    pack('Pack-1.21.11', 'Pack', {}, {}, {})
    pack('Other-1.21.11', 'Other', {}, {}, {})
    pack('Off-1.21.11', 'Off', {}, {}, {}, 'hide')
    pack('Old-1.20.1', 'Old', {}, {}, {})
    const list = importer.candidates(config, 'Pack-1.21.11')
    assert.deepStrictEqual(list.filter((entry) => entry.compatible).map((entry) => [entry.id, entry.active]).sort(), [['Off-1.21.11', false], ['Other-1.21.11', true]])
    const old = list.find((entry) => entry.id === 'Old-1.20.1')
    assert.strictEqual(old.compatible, false)
    assert.match(old.reason, /Minecraft 1\.20\.1 y este de 1\.21\.11/)
    assert.strictEqual(list[list.length - 1].id, 'Old-1.20.1', 'the ones that can be chosen come first')
})

test('the plan says what would be copied, left out, switched off and kept as the profile\'s own', () => {
    const { config } = twoPacks()
    const plan = importer.plan(config, 'Pack-1.21.11', 'PackLite-1.21.11')
    assert.strictEqual(plan.suggestedName, 'Lite')
    assert.strictEqual(plan.hadProfiles, false)
    assert.deepStrictEqual(plan.mods.copy.map((mod) => mod.stem), ['vulkanmod'])
    assert.deepStrictEqual(plan.mods.leave.sort(), ['iris-fabric', 'sodium-fabric'])
    assert.deepStrictEqual(plan.mods.off, ['appleskin'])
    assert.strictEqual(plan.mods.shared, 3)
    assert.deepStrictEqual(plan.files.copy.map((file) => file.path), ['config/vulkan.json'])
    assert.deepStrictEqual(plan.files.leave.sort(), ['config/iris.properties', 'shaderpacks/a.zip', 'shaderpacks/b.zip'])
    assert.deepStrictEqual(plan.files.own.map((file) => file.path), ['options.txt'])
    assert.strictEqual(plan.files.same, 1)
    assert.ok(plan.bytes > 0)
})

test('the plan reads only: nothing on disk changes', () => {
    const { config, root } = twoPacks()
    const snapshot = () => JSON.stringify([...fs.readdirSync(path.join(root, 'servers'))].map((id) => modulesOf(path.join(root, 'servers', id), id).map((module) => module.artifact.MD5)))
    const before = snapshot()
    importer.plan(config, 'Pack-1.21.11', 'PackLite-1.21.11')
    assert.strictEqual(snapshot(), before)
    assert.strictEqual(nebula.readServerMeta(config, 'Pack-1.21.11').profiles, undefined)
})

test('importing brings what was missing, stores both profiles, and shelves the other modpack without deleting it', () => {
    const { config, root } = twoPacks()
    const result = importer.importFrom(config, 'Pack-1.21.11', 'PackLite-1.21.11', {})
    const dir = path.join(root, 'servers', 'Pack-1.21.11')
    assert.ok(fs.existsSync(path.join(dir, 'fabricmods', 'required', 'vulkanmod-1.0.jar')))
    assert.strictEqual(fs.readFileSync(path.join(dir, 'files', 'config', 'vulkan.json'), 'utf8'), 'v')
    assert.strictEqual(fs.readFileSync(path.join(dir, 'files', 'options.txt'), 'utf8'), 'normal', 'the original is never overwritten')
    assert.strictEqual(fs.readFileSync(path.join(dir, 'files', '_perfiles', 'lite', 'options.txt'), 'utf8'), 'lite')
    assert.deepStrictEqual(result.copied, { mods: 1, files: 1, own: 1 })

    const stored = nebula.readServerMeta(config, 'Pack-1.21.11').profiles
    assert.strictEqual(stored.default, 'normal')
    assert.deepStrictEqual(stored.list.map((profile) => profile.name), ['Normal', 'Lite'])
    assert.deepStrictEqual(stored.list[0].exclude, { mods: ['vulkanmod'], files: ['config/vulkan.json'] })
    assert.deepStrictEqual(stored.list[1].optionalOff, ['appleskin'])
    assert.deepStrictEqual(stored.list[1].ram, { minimumMb: 2048, maximumMb: 3072 })
    assert.strictEqual(stored.list[1].description, 'Menos carga')

    assert.strictEqual(result.deactivated, true)
    assert.ok(!fs.existsSync(path.join(root, 'servers', 'PackLite-1.21.11')))
    assert.ok(fs.existsSync(path.join(root, 'hide', 'PackLite-1.21.11', 'servermeta.json')), 'the other modpack is on its shelf, whole')
    assert.ok(fs.existsSync(path.join(root, 'hide', 'PackLite-1.21.11', 'fabricmods', 'required', 'vulkanmod-1.0.jar')))
})

test('after importing, each profile delivers exactly what the modpack it came from delivered', () => {
    const { config, root } = twoPacks()
    const originalNormal = shown(modulesOf(path.join(root, 'servers', 'Pack-1.21.11'), 'Pack-1.21.11'))
    const originalLite = shown(modulesOf(path.join(root, 'servers', 'PackLite-1.21.11'), 'PackLite-1.21.11'))
    importer.importFrom(config, 'Pack-1.21.11', 'PackLite-1.21.11', {})
    const server = compiled(config, 'Pack-1.21.11')
    assert.deepStrictEqual(played(server, 'normal'), originalNormal)
    assert.deepStrictEqual(played(server, 'lite'), originalLite)
})

test('a modpack that already has profiles gets another; what only the new one has stays out of the others', () => {
    const { config, root } = twoPacks()
    importer.importFrom(config, 'Pack-1.21.11', 'PackLite-1.21.11', {})
    // a third modpack, with a mod and a config of its own
    const third = path.join(root, 'servers', 'PackUltra-1.21.11')
    fs.mkdirSync(path.join(third, 'fabricmods', 'required'), { recursive: true })
    fs.mkdirSync(path.join(third, 'fabricmods', 'optionalon'), { recursive: true })
    fs.mkdirSync(path.join(third, 'files', 'config'), { recursive: true })
    fs.writeFileSync(path.join(third, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: 'Pack Ultra', address: 'x' }, fabric: { version: '0.16.9' } }))
    for (const [rel, content] of Object.entries({ 'fabric-api-1.0.jar': 'api', 'sodium-fabric-1.0.jar': 'sodium', 'appleskin-1.0.jar': 'apple', 'shared-mod-1.0.jar': 'shared', 'raytracing-9.jar': 'rt' })) fs.writeFileSync(path.join(third, 'fabricmods', 'required', rel), content)
    fs.writeFileSync(path.join(third, 'fabricmods', 'optionalon', 'iris-fabric-1.0.jar'), 'iris')
    for (const [rel, content] of Object.entries({ 'options.txt': 'ultra', 'config/iris.properties': 'iris', 'config/shared.json': 'same', 'config/rt.json': 'rt' })) fs.writeFileSync(path.join(third, 'files', rel), content)
    const originalUltra = shown(modulesOf(third, 'PackUltra-1.21.11'))

    assert.strictEqual(importer.plan(config, 'Pack-1.21.11', 'PackUltra-1.21.11').hadProfiles, true)
    importer.importFrom(config, 'Pack-1.21.11', 'PackUltra-1.21.11', { name: 'Ultra', deactivate: false })
    assert.ok(fs.existsSync(path.join(root, 'servers', 'PackUltra-1.21.11')), 'not deactivated when asked not to')
    const stored = nebula.readServerMeta(config, 'Pack-1.21.11').profiles
    assert.deepStrictEqual(stored.list.map((profile) => profile.id), ['normal', 'lite', 'ultra'])
    assert.ok(stored.list[0].exclude.mods.includes('raytracing') && stored.list[1].exclude.mods.includes('raytracing'))
    assert.ok(!stored.list[2].exclude.mods.includes('raytracing'))

    const server = compiled(config, 'Pack-1.21.11')
    assert.ok(!played(server, 'normal').some((line) => line.includes('raytracing')))
    assert.deepStrictEqual(played(server, 'ultra'), originalUltra)
})

test('what cannot be done is refused with a reason', () => {
    const { config, pack } = makeRoot()
    pack('Pack-1.21.11', 'Pack', {}, { 'required/a-1.jar': 'a' }, {})
    pack('Older-1.20.1', 'Older', {}, { 'required/a-1.jar': 'a' }, {})
    pack('Twin-1.21.11', 'Twin', {}, { 'required/b-1.jar': 'b' }, {})
    assert.throws(() => importer.plan(config, 'Pack-1.21.11', 'Older-1.20.1'), /misma versión de Minecraft/)
    assert.throws(() => importer.plan(config, 'Pack-1.21.11', 'Pack-1.21.11'), /de sí mismo/)
    assert.throws(() => importer.plan(config, 'Pack-1.21.11', 'Nope-1.21.11'), /No existe/)
    assert.throws(() => importer.importFrom(config, 'Pack-1.21.11', 'Twin-1.21.11', { name: 'Normal' }), /no pueden llamarse igual/)
    assert.throws(() => importer.importFrom(config, 'Pack-1.21.11', 'Twin-1.21.11', { name: 'x'.repeat(40) }), /demasiado largo/)
    assert.strictEqual(nebula.readServerMeta(config, 'Pack-1.21.11').profiles, undefined, 'a refused import leaves the modpack as it was')
})

test('the names it suggests', () => {
    assert.strictEqual(importer.suggestName('PanolisSMP', 'PanolisSMP Lite'), 'Lite')
    assert.strictEqual(importer.suggestName('PanolisSMP', 'PanolisSMP - Sin shaders'), 'Sin shaders')
    assert.strictEqual(importer.suggestName('PanolisSMP', 'Otra cosa'), 'Otra cosa')
    assert.strictEqual(importer.suggestName('PanolisSMP', 'PanolisSMP'), 'PanolisSMP')
})
