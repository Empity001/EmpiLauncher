// node --test tools/publisher/test/*.test.js
// What the Publisher can now manage of a modpack besides its mods: the memory players start with and the "files" folder (shaders,
// resource packs, configs and the rest), against a throwaway Nebula root (never the real one).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const nebula = require('../lib/nebula')

function makeRoot(meta = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-options-'))
    const config = { nebulaProjectPath: path.join(root, 'no-nebula-here'), nebulaRootPath: root }
    const id = 'Pack-1.21.11'
    const dir = path.join(root, 'servers', id)
    fs.mkdirSync(path.join(dir, 'fabricmods', 'required'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: id, address: 'localhost:25565', ...meta }, fabric: { version: '0.16.9' } }, null, 2))
    return { root, config, id, dir, meta: () => JSON.parse(fs.readFileSync(path.join(dir, 'servermeta.json'), 'utf8')).meta }
}
const bytes = (text) => Readable.from([Buffer.from(text)])

// ------------------------------------------------------------ memory

test('memory is written as the spec wants it, with the maximum also as the recommended one', () => {
    const { config, id, meta } = makeRoot()
    const pack = nebula.patchMeta(config, id, { ram: { minimumMb: 2048, maximumMb: 6144 } })
    assert.deepStrictEqual(meta().javaOptions.ram, { recommended: 6144, minimum: 2048, maximum: 6144 })
    assert.deepStrictEqual(pack.ram, { minimumMb: 2048, maximumMb: 6144 })
})

test('memory snaps to steps of 512 MB', () => {
    const { config, id, meta } = makeRoot()
    nebula.patchMeta(config, id, { ram: { minimumMb: 2000, maximumMb: 5000 } })
    assert.deepStrictEqual([meta().javaOptions.ram.minimum, meta().javaOptions.ram.maximum], [2048, 5120])
})

test('memory that makes no sense is refused with a reason', () => {
    const { config, id, meta } = makeRoot()
    assert.throws(() => nebula.patchMeta(config, id, { ram: { minimumMb: 4096, maximumMb: 2048 } }), /máxima no puede ser menor/)
    assert.throws(() => nebula.patchMeta(config, id, { ram: { minimumMb: 100, maximumMb: 2048 } }), /menos de 0,5 GB/)
    assert.throws(() => nebula.patchMeta(config, id, { ram: { minimumMb: 1024, maximumMb: 999999 } }), /128 GB/)
    assert.throws(() => nebula.patchMeta(config, id, { ram: { minimumMb: 'x', maximumMb: 2048 } }), /en números/)
    assert.strictEqual(meta().javaOptions, undefined)
})

test('choosing another Java does not take the memory away, and choosing automatic keeps it', () => {
    const { config, id, meta } = makeRoot()
    nebula.patchMeta(config, id, { ram: { minimumMb: 2048, maximumMb: 4096 } })
    nebula.patchMeta(config, id, { javaMajor: 21 })
    assert.strictEqual(meta().javaOptions.suggestedMajor, 21)
    assert.strictEqual(meta().javaOptions.ram.maximum, 4096)
    nebula.patchMeta(config, id, { javaMajor: null })
    assert.deepStrictEqual(Object.keys(meta().javaOptions), ['ram'])
    assert.strictEqual(nebula.getPack(config, id).javaMajor, null)
    assert.strictEqual(nebula.getPack(config, id).ram.maximumMb, 4096)
})

test('both in one save work, in either order of intent', () => {
    const { config, id, meta } = makeRoot()
    nebula.patchMeta(config, id, { javaMajor: 25, ram: { minimumMb: 1024, maximumMb: 3072 } })
    assert.strictEqual(meta().javaOptions.suggestedMajor, 25)
    assert.strictEqual(meta().javaOptions.ram.maximum, 3072)
})

test('removing the memory leaves the Java rules, and with none left removes javaOptions', () => {
    const { config, id, meta } = makeRoot()
    nebula.patchMeta(config, id, { javaMajor: 21, ram: { minimumMb: 1024, maximumMb: 2048 } })
    nebula.patchMeta(config, id, { ram: null })
    assert.strictEqual(meta().javaOptions.ram, undefined)
    assert.strictEqual(meta().javaOptions.suggestedMajor, 21)
    assert.strictEqual(nebula.getPack(config, id).ram, null)
    nebula.patchMeta(config, id, { javaMajor: null })
    assert.strictEqual(meta().javaOptions, undefined)
    nebula.patchMeta(config, id, { ram: { minimumMb: 1024, maximumMb: 2048 } })
    nebula.patchMeta(config, id, { ram: null })
    assert.strictEqual(meta().javaOptions, undefined)
})

test('a pack that only has the spec\'s own numbers shows as having none', () => {
    const { config, id } = makeRoot({ javaOptions: { supported: '>=21 <22', suggestedMajor: 21, ram: { recommended: 4096, minimum: 3072 } } })
    assert.strictEqual(nebula.getPack(config, id).ram, null)
})

// ------------------------------------------------------------ the files folder

test('shaders and resource packs take .zip only; configs take anything', async () => {
    const { config, id, dir } = makeRoot()
    await nebula.saveFile(config, id, 'shaderpacks', 'Complementary.zip', bytes('zip'))
    await nebula.saveFile(config, id, 'resourcepacks', 'Faithful.zip', bytes('zip'))
    await nebula.saveFile(config, id, 'config', 'sodium-options.json', bytes('{}'))
    assert.ok(fs.existsSync(path.join(dir, 'files', 'shaderpacks', 'Complementary.zip')))
    await assert.rejects(nebula.saveFile(config, id, 'shaderpacks', 'notes.txt', bytes('x')), /solo se aceptan archivos \.zip/)
    await assert.rejects(nebula.saveFile(config, id, 'resourcepacks', 'a.jar', bytes('x')), /solo se aceptan/)
    const listed = nebula.packFiles(config, id)
    assert.deepStrictEqual(listed.kinds.shaders.entries.map((e) => [e.name, e.dir]), [['Complementary.zip', false]])
    assert.deepStrictEqual(listed.kinds.config.entries.map((e) => e.name), ['sodium-options.json'])
    assert.strictEqual(listed.kinds.shaders.folder, 'shaderpacks')
    assert.ok(!fs.existsSync(path.join(dir, 'files', 'shaderpacks', 'notes.txt.part')), 'no half-written leftovers')
})

test('a folder of the pack (an unzipped shader) is listed with its size, and everything else in files is "other"', async () => {
    const { config, id, dir } = makeRoot()
    fs.mkdirSync(path.join(dir, 'files', 'shaderpacks', 'Loose', 'shaders'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'files', 'shaderpacks', 'Loose', 'shaders', 'a.fsh'), '12345')
    fs.writeFileSync(path.join(dir, 'files', 'shaderpacks', 'Loose', 'shaders', 'b.fsh'), '123')
    fs.writeFileSync(path.join(dir, 'files', 'options.txt'), 'x')
    fs.writeFileSync(path.join(dir, 'files', 'background.webp'), 'x')
    fs.writeFileSync(path.join(dir, 'files', 'theme.json'), '{}')
    const listed = nebula.packFiles(config, id)
    assert.deepStrictEqual(listed.kinds.shaders.entries[0], { name: 'Loose', dir: true, size: 8, files: 2 })
    const other = Object.fromEntries(listed.other.map((e) => [e.name, e.managed]))
    assert.deepStrictEqual(other, { 'background.webp': true, 'options.txt': false, 'theme.json': true })
    assert.ok(!('shaderpacks' in other))
})

test('files can also go to the top of the folder (options.txt), except what Apariencia manages', async () => {
    const { config, id, dir } = makeRoot()
    await nebula.saveFile(config, id, '', 'options.txt', bytes('x'))
    assert.ok(fs.existsSync(path.join(dir, 'files', 'options.txt')))
    await assert.rejects(nebula.saveFile(config, id, '', 'theme.json', bytes('{}')), /Apariencia/)
    await assert.rejects(nebula.saveFile(config, id, '', 'background.png', bytes('x')), /Apariencia/)
})

test('names and folders that would escape the modpack are refused', async () => {
    const { config, id, root } = makeRoot()
    await assert.rejects(nebula.saveFile(config, id, 'shaderpacks', '..\\..\\evil.zip', bytes('x')), /no valido/i)
    await assert.rejects(nebula.saveFile(config, id, 'shaderpacks', '../evil.zip', bytes('x')), /no valido/i)
    await assert.rejects(nebula.saveFile(config, id, '..', 'evil.zip', bytes('x')), /no es válida/)
    await assert.rejects(nebula.saveFile(config, id, 'mods', 'evil.zip', bytes('x')), /no es válida/)
    assert.throws(() => nebula.deleteFile(config, id, 'shaderpacks', '..'), /no valido/i)
    assert.throws(() => nebula.deleteFile(config, id, '..', 'servermeta.json'), /no es válida/)
    assert.ok(!fs.existsSync(path.join(root, 'evil.zip')))
})

test('deleting takes out a file or a folder, and never the known folders or what Apariencia manages', async () => {
    const { config, id, dir } = makeRoot()
    await nebula.saveFile(config, id, 'shaderpacks', 'A.zip', bytes('x'))
    fs.mkdirSync(path.join(dir, 'files', 'shaderpacks', 'Loose'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'files', 'shaderpacks', 'Loose', 'x.fsh'), 'x')
    nebula.deleteFile(config, id, 'shaderpacks', 'A.zip')
    nebula.deleteFile(config, id, 'shaderpacks', 'Loose')
    assert.deepStrictEqual(nebula.packFiles(config, id).kinds.shaders.entries, [])
    assert.throws(() => nebula.deleteFile(config, id, '', 'config'), /archivo por archivo/)
    assert.throws(() => nebula.deleteFile(config, id, '', 'theme.json'), /Apariencia/)
    nebula.deleteFile(config, id, 'shaderpacks', 'not-there.zip')   // already gone: nothing to do, no error
})
