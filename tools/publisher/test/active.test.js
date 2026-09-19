// node --test tools/publisher/test
// Activating and deactivating modpacks, and the flags shown on them, against a throwaway Nebula root (never the real one).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const nebula = require('../lib/nebula')

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-active-'))
    const config = { nebulaProjectPath: path.join(root, 'no-nebula-here'), nebulaRootPath: root }
    const add = (id, meta, where = 'servers') => {
        const dir = path.join(root, where, id)
        fs.mkdirSync(path.join(dir, 'fabricmods', 'required'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: id, address: 'localhost:25565', ...meta }, fabric: { version: '0.16.9' } }, null, 2))
    }
    return { root, config, add, meta: (id, where = 'servers') => JSON.parse(fs.readFileSync(path.join(root, where, id, 'servermeta.json'), 'utf8')).meta }
}

test('the list has active packs first and deactivated ones marked', () => {
    const { config, add } = makeRoot()
    add('Beta-1.21.11', { mainServer: true }); add('Alpha-1.21.11', {}); add('Old-1.21.11', {}, 'hide')
    const list = nebula.listPacks(config)
    assert.deepStrictEqual(list.map((p) => [p.id, p.active]), [['Alpha-1.21.11', true], ['Beta-1.21.11', true], ['Old-1.21.11', false]])
})

test('whitelist and main server show up in the summary', () => {
    const { config, add } = makeRoot()
    add('One-1.21.11', { mainServer: true, whitelist: true }); add('Two-1.21.11', {})
    const byId = Object.fromEntries(nebula.listPacks(config).map((p) => [p.id, p]))
    assert.strictEqual(byId['One-1.21.11'].mainServer, true)
    assert.strictEqual(byId['One-1.21.11'].whitelist, true)
    assert.strictEqual(byId['Two-1.21.11'].whitelist, false)
})

test('deactivating moves the folder to hide and activating brings it back', () => {
    const { root, config, add } = makeRoot()
    add('Pack-1.21.11', {}); add('Other-1.21.11', {})
    const off = nebula.setActive(config, 'Pack-1.21.11', false)
    assert.strictEqual(off.active, false)
    assert.ok(!fs.existsSync(path.join(root, 'servers', 'Pack-1.21.11')))
    assert.ok(fs.existsSync(path.join(root, 'hide', 'Pack-1.21.11', 'servermeta.json')))
    assert.ok(!nebula.listPacks(config).find((p) => p.id === 'Pack-1.21.11').active)
    nebula.setActive(config, 'Pack-1.21.11', true)
    assert.ok(fs.existsSync(path.join(root, 'servers', 'Pack-1.21.11', 'servermeta.json')))
    assert.ok(!fs.existsSync(path.join(root, 'hide', 'Pack-1.21.11')))
})

test('a deactivated pack can be read but not edited', () => {
    const { config, add } = makeRoot()
    add('Gone-1.21.11', { description: 'still here' }, 'hide')
    const pack = nebula.getPack(config, 'Gone-1.21.11')
    assert.strictEqual(pack.active, false)
    assert.strictEqual(pack.meta.description, 'still here')
    assert.throws(() => nebula.patchMeta(config, 'Gone-1.21.11', { name: 'x' }), /No existe/)
})

test('deactivating the main pack hands the role to another one', () => {
    const { config, add, meta } = makeRoot()
    add('Main-1.21.11', { mainServer: true }); add('Next-1.21.11', {})
    const result = nebula.setActive(config, 'Main-1.21.11', false)
    assert.strictEqual(result.promoted, 'Next-1.21.11')
    assert.strictEqual(meta('Next-1.21.11').mainServer, true)
    assert.strictEqual(meta('Main-1.21.11', 'hide').mainServer, false)
})

test('deactivating the only pack leaves no main (nothing to promote)', () => {
    const { config, add } = makeRoot()
    add('Solo-1.21.11', { mainServer: true })
    assert.strictEqual(nebula.setActive(config, 'Solo-1.21.11', false).promoted, null)
})

test('choosing a main server takes the role from the previous one', () => {
    const { config, add, meta } = makeRoot()
    add('Old-1.21.11', { mainServer: true }); add('New-1.21.11', {})
    nebula.patchMeta(config, 'New-1.21.11', { mainServer: true })
    assert.strictEqual(meta('New-1.21.11').mainServer, true)
    assert.strictEqual(meta('Old-1.21.11').mainServer, false)
})

test('refuses names that escape the root and clashes', () => {
    const { config, add } = makeRoot()
    add('A-1.21.11', {}); add('A-1.21.11', {}, 'hide')
    assert.throws(() => nebula.setActive(config, '..\\etc', false), /No existe/)
    assert.throws(() => nebula.setActive(config, 'A-1.21.11', false), /Ya hay/)
    assert.throws(() => nebula.setActive(config, 'Nope-1.21.11', true), /no esta desactivado/)
})
