// node --test tools/publisher/test
// Pendientes: the launcher's styles go out one release at a time, switched on in styles.json right before the installer is built.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const styles = require('../lib/styles')

function makeRepo(entries) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-styles-'))
    const config = { launcherRepoPath: repo }
    fs.mkdirSync(path.dirname(styles.manifestPath(config)), { recursive: true })
    fs.writeFileSync(styles.manifestPath(config), JSON.stringify({ version: 1, base: 'actual', styles: entries }))
    return config
}

const STYLES = () => [
    { id: 'actual', name: 'Actual', ported: true, releasedIn: null, notes: '' },
    { id: 'oleaje', name: 'Oleaje', ported: true, releasedIn: null, notes: '# Empi Launcher {version}: Oleaje' },
    { id: 'shell', name: 'Shell', ported: true, releasedIn: '3.7.0', notes: '' },
    { id: 'punk', name: 'Punk', ported: false, releasedIn: null, notes: '' }
]

const statusOf = (config, unsent) => Object.fromEntries(styles.list(config, unsent).map((s) => [s.id, s.status]))

test('each style says where it stands', () => {
    const config = makeRepo(STYLES())
    assert.deepStrictEqual(statusOf(config, null), { actual: 'base', oleaje: 'ready', shell: 'published', punk: 'preparing' })
    // the unsent build's style is written in the manifest but nobody has it yet
    assert.strictEqual(statusOf(config, 'shell').shell, 'compiled')
})

test('compiling with a style switches it on for that version', () => {
    const config = makeRepo(STYLES())
    assert.strictEqual(styles.prepare(config, { style: 'oleaje', version: '3.8.0', unsentStyle: null, kind: 'native' }), true)
    assert.strictEqual(styles.read(config).styles.find((s) => s.id === 'oleaje').releasedIn, '3.8.0')
})

test('an unsent style goes back to Pendientes when something else is compiled', () => {
    const config = makeRepo(STYLES())
    styles.prepare(config, { style: 'oleaje', version: '3.8.0', unsentStyle: null, kind: 'native' })
    // a normal update compiled instead: Oleaje must not ride along
    styles.prepare(config, { style: null, version: '3.8.0', unsentStyle: 'oleaje', kind: 'native' })
    assert.strictEqual(styles.read(config).styles.find((s) => s.id === 'oleaje').releasedIn, null)
})

test('the same unsent style can be compiled again with another number', () => {
    const config = makeRepo(STYLES())
    styles.prepare(config, { style: 'oleaje', version: '3.8.0', unsentStyle: null, kind: 'native' })
    styles.prepare(config, { style: 'oleaje', version: '4.0.0', unsentStyle: 'oleaje', kind: 'native' })
    assert.strictEqual(styles.read(config).styles.find((s) => s.id === 'oleaje').releasedIn, '4.0.0')
})

test('a published style, one still being made, the base one or a classic build are refused', () => {
    const config = makeRepo(STYLES())
    assert.throws(() => styles.prepare(config, { style: 'shell', version: '3.8.0', unsentStyle: null, kind: 'native' }), /ya salió/)
    assert.throws(() => styles.prepare(config, { style: 'punk', version: '3.8.0', unsentStyle: null, kind: 'native' }), /preparando/)
    assert.throws(() => styles.prepare(config, { style: 'actual', version: '3.8.0', unsentStyle: null, kind: 'native' }), /de siempre/)
    assert.throws(() => styles.prepare(config, { style: 'oleaje', version: '3.8.0', unsentStyle: null, kind: 'classic' }), /nativo/)
    assert.throws(() => styles.prepare(config, { style: 'nope', version: '3.8.0', unsentStyle: null, kind: 'native' }), /No existe/)
    // nothing was written by the refusals
    assert.deepStrictEqual(statusOf(config, null), { actual: 'base', oleaje: 'ready', shell: 'published', punk: 'preparing' })
})

test('a normal update touches nothing', () => {
    const config = makeRepo(STYLES())
    const before = fs.readFileSync(styles.manifestPath(config), 'utf8')
    assert.strictEqual(styles.prepare(config, { style: null, version: '3.8.0', unsentStyle: null, kind: 'classic' }), false)
    assert.strictEqual(fs.readFileSync(styles.manifestPath(config), 'utf8'), before)
})

test('the real styles.json is valid and every style has its notes', () => {
    const real = { launcherRepoPath: path.resolve(__dirname, '..', '..', '..') }
    const manifest = styles.read(real)
    assert.ok(manifest, 'styles.json exists')
    const ids = manifest.styles.map((s) => s.id)
    assert.strictEqual(new Set(ids).size, ids.length, 'ids are unique')
    assert.ok(ids.includes(manifest.base))
    for (const s of manifest.styles) {
        assert.match(s.id, /^[a-z]{2,20}$/)
        assert.match(s.accent, /^#[0-9a-f]{6}$/i)
        if (s.id !== manifest.base) assert.match(s.notes, /\{version\}/, `${s.id} names its version`)
    }
})
