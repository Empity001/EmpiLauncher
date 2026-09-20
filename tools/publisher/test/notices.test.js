// node --test tools/publisher/test/*.test.js
// Avisos (lib/notices.js): what is validated, what goes into avisos.json, and that publishing touches only avisos.json and avisos/
// (a modpack that was compiled but not sent must stay as it is). Everything runs in scratch folders with a local git remote.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { Readable } = require('stream')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-avisos-home-'))
process.env.EMPI_PUBLISHER_HOME = home   // before anything loads lib/config.js
const notices = require('../lib/notices')

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')])
const stream = (bytes) => Readable.from([bytes])

// a remote (bare) and a clone of it, with one commit, like the EmpiPacks checkout
const remote = path.join(home, 'remote.git')
const clone = path.join(home, 'EmpiPacks')
fs.mkdirSync(remote)
git(remote, 'init', '--bare', '-b', 'main')
git(home, 'clone', remote, clone)
git(clone, 'config', 'user.email', 't@example.test')
git(clone, 'config', 'user.name', 'Test')
fs.writeFileSync(path.join(clone, 'README.md'), 'hola')
git(clone, 'add', '-A')
git(clone, 'commit', '-m', 'init')
git(clone, 'push', '-u', 'origin', 'main')
const config = { empiPacksRepoPath: clone, empiPacksRepoUrl: remote, nebulaRootPath: path.join(home, 'root'), nebulaProjectPath: path.join(home, 'nebula') }
const run = (options = {}) => { const lines = []; return notices.publish(config, options, (l) => lines.push(l), () => {}).then((result) => ({ result, lines })) }

test.after(() => fs.rmSync(home, { recursive: true, force: true }))

test('a notice needs a short title, an https button, and a page that is a real image', async () => {
    assert.throws(() => notices.saveNotice(config, null, { title: '   ' }), /título corto/)
    assert.throws(() => notices.saveNotice(config, null, { title: 'x', button: { label: 'Abrir', url: 'http://example.com' } }), /https/)
    assert.throws(() => notices.saveNotice(config, null, { title: 'x', expiresAt: 'mañana' }), /fecha/)
    const made = notices.saveNotice(config, null, { title: 'Reinicio a las 20:00', severity: 'critical', targets: ['*', 'no-existe'], summary: 'resumen', button: { label: 'Ver en Discord', url: 'https://discord.gg/x' }, published: true, editor: { blocks: [] } })
    assert.ok(/^n[a-z0-9]+$/.test(made.id) && made.severity === 'critical' && made.hasImage === false)
    assert.deepStrictEqual(made.targets, ['*'], 'a modpack that does not exist is dropped from "where it shows"')
    await assert.rejects(notices.saveImage(made.id, stream(Buffer.from('esto no es una imagen'))), /WebP o PNG/)
    await assert.rejects(notices.saveImage('inexistente', stream(WEBP)), /Guarda primero/)
    const saved = await notices.saveImage(made.id, stream(WEBP))
    assert.ok(/^[a-f0-9]{10}$/.test(saved.pageHash))
    await assert.rejects(notices.saveAsset(made.id, stream(Buffer.from('nada'))), /WebP, PNG o JPG/)
    const asset = await notices.saveAsset(made.id, stream(PNG))
    assert.ok(/^[a-f0-9]{10}\.png$/.test(asset.name) && fs.existsSync(notices.assetOf(made.id, asset.name).file))
    assert.throws(() => notices.assetOf(made.id, '../../../x.png'), /no válida/)
})

test('maintenance, schedule and the minimum version are checked when saved', () => {
    assert.throws(() => notices.saveAccess({ launcher: { minVersion: 'tres punto cuatro' } }), /3\.4\.0/)
    assert.throws(() => notices.saveAccess({ modpacks: { P: { novedades: 'ftp://x' } } }), /https/)
    const out = notices.saveAccess({
        launcher: { minVersion: '3.4.0', novedades: 'https://discord.gg/l' },
        modpacks: {
            P: { maintenance: { active: true, message: 'Volvemos pronto', until: '2030-01-01T20:00:00Z', allow: [{ name: 'Empi_Ty', uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, { name: 'x', uuid: 'malo' }] }, novedades: 'https://discord.gg/p' },
            Q: { maintenance: { active: false }, schedule: { from: '2030-02-01T00:00:00Z' } },
            R: {}
        }
    })
    assert.deepStrictEqual(out.modpacks.P.maintenance.allow, [{ name: 'Empi_Ty', uuid: 'aaaaaaaabbbbccccddddeeeeeeeeeeee' }], 'an id that is not one is dropped')
    assert.ok(out.modpacks.Q.schedule && !out.modpacks.Q.maintenance && !('R' in out.modpacks))
})

test('the file that would be published is one the launcher accepts as it is', () => {
    const state = notices.readState()
    const { doc } = notices.buildDoc(state, (n, ext) => `avisos/${n.id}-${n.pageHash}.${ext}`)
    assert.deepStrictEqual(notices.problems(doc), [])
    assert.deepStrictEqual(doc.modpacks.P.maintenance.allow, ['aaaaaaaabbbbccccddddeeeeeeeeeeee'], 'the file carries ids, never player names')
    assert.strictEqual(doc.version, 1)
    // a page the launcher would refuse must be caught here, not silently dropped there
    const bad = { ...doc, notices: [{ ...doc.notices[0], page: 'imagenes/../x.webp', button: { label: 'a', url: 'http://x' } }] }
    assert.ok(notices.problems(bad).length >= 2)
})

test('publishing puts avisos.json and the pages in the repository, and only those', async () => {
    // a modpack compiled but not sent yet: staged in the clone, and it must stay exactly like that
    fs.mkdirSync(path.join(clone, 'servers'), { recursive: true })
    fs.writeFileSync(path.join(clone, 'servers', 'compilado.txt'), 'todavía sin enviar')
    git(clone, 'add', '-A', '--', 'servers')

    const { result, lines } = await run({ message: 'Avisos de prueba' })
    assert.strictEqual(result.published, true, lines.join('\n'))
    const check = path.join(home, 'check')
    git(home, 'clone', remote, check)
    const doc = JSON.parse(fs.readFileSync(path.join(check, 'avisos.json'), 'utf8'))
    assert.strictEqual(doc.notices.length, 1)
    assert.ok(/^avisos\/n[a-z0-9]+-[a-f0-9]{10}\.webp$/.test(doc.notices[0].page) && fs.existsSync(path.join(check, doc.notices[0].page)))
    assert.ok(!fs.existsSync(path.join(check, 'servers')), 'what was compiled but not sent did not go with it')
    assert.match(git(clone, 'status', '--short'), /A\s+servers\/compilado\.txt/, 'and it is still staged in the clone')
    assert.strictEqual(git(check, 'log', '-1', '--format=%s'), 'Avisos de prueba')
    fs.rmSync(check, { recursive: true, force: true })
})

test('publishing again with nothing new says so, and an unpublished notice takes its page away', async () => {
    const again = await run()
    assert.strictEqual(again.result.published, false)
    assert.strictEqual(notices.describe(config).published.pending, false, 'nothing is pending right after publishing')

    const state = notices.readState()
    notices.saveNotice(config, state.notices[0].id, { ...state.notices[0], published: false })
    assert.strictEqual(notices.describe(config).published.pending, true, 'and unpublishing is a change to publish')
    const out = await run({ message: 'Quitar aviso' })
    assert.strictEqual(out.result.published, true)
    const check = path.join(home, 'check2')
    git(home, 'clone', remote, check)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(check, 'avisos.json'), 'utf8')).notices.length, 0)
    assert.ok(!fs.existsSync(path.join(check, 'avisos')), 'the page is gone from the repository too')
    fs.rmSync(check, { recursive: true, force: true })
})

test('a notice marked to publish but with no saved page stops the publishing with a sentence', async () => {
    const made = notices.saveNotice(config, null, { title: 'Sin página', published: true })
    await assert.rejects(run(), /todavía no tienen página guardada: Sin página/)
    notices.deleteNotice(made.id)
    assert.ok(!notices.readState().notices.some((n) => n.id === made.id))
})
