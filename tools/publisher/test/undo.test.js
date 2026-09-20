// node --test tools/publisher/test/*.test.js
// "Deshacer la última publicación de avisos": players go back to what they saw before, the drafts on this PC stay, and doing it twice puts it back.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { Readable } = require('stream')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-undo-'))
process.env.EMPI_PUBLISHER_HOME = home   // before anything loads lib/config.js
const notices = require('../lib/notices')

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const stream = (bytes) => Readable.from([bytes])
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
const publish = () => notices.publish(config, {}, () => {}, () => {})
const undo = () => { const lines = []; return notices.undoLast(config, (l) => lines.push(l), () => {}).then((result) => ({ result, lines })) }
const fresh = (name) => { const dir = path.join(home, name); git(home, 'clone', remote, dir); return dir }
const titlesIn = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'avisos.json'), 'utf8')).notices.map((n) => n.title).sort()

test.after(() => fs.rmSync(home, { recursive: true, force: true }))

async function newNotice(title) {
    const made = notices.saveNotice(config, null, { title, published: true, editor: { blocks: [] } })
    await notices.saveImage(made.id, stream(Buffer.concat([WEBP, Buffer.from(title)])))
    return made
}

test('with nothing ever published there is nothing to undo, and it says so', async () => {
    await assert.rejects(undo(), /no hay nada que deshacer/)
})

test('undoing goes back to the previous publication: the notice and its page leave, the earlier ones stay', async () => {
    await newNotice('Primero')
    await publish()
    const second = await newNotice('Segundo')
    await publish()
    assert.deepStrictEqual(titlesIn(clone), ['Primero', 'Segundo'])

    const { result, lines } = await undo()
    assert.strictEqual(result.undone, true, lines.join('\n'))
    const check = fresh('check1')
    assert.deepStrictEqual(titlesIn(check), ['Primero'], 'what players see is the first publication again')
    assert.strictEqual(fs.readdirSync(path.join(check, 'avisos')).length, 1, 'and the page of the second one is gone')
    assert.strictEqual(git(check, 'log', '-1', '--format=%s'), 'Deshacer la última publicación de avisos')

    // the drafts on this PC are untouched, and the tab says there is something to publish again
    assert.ok(notices.readState().notices.some((n) => n.id === second.id), 'the draft of the second notice is still here')
    assert.strictEqual(notices.describe(config).published.pending, true)
})

test('undoing twice puts it back (it is a new commit, nothing was rewritten)', async () => {
    const { result } = await undo()
    assert.strictEqual(result.undone, true)
    const check = fresh('check2')
    assert.deepStrictEqual(titlesIn(check), ['Primero', 'Segundo'])
    assert.strictEqual(fs.readdirSync(path.join(check, 'avisos')).length, 2)
})

test('the very first publication can be undone too: players are left with no notices', async () => {
    // a repository where only one publication exists
    const solo = path.join(home, 'solo')
    fs.mkdirSync(solo)
    git(solo, 'init', '-b', 'main')
    git(solo, 'config', 'user.email', 't@example.test')
    git(solo, 'config', 'user.name', 'Test')
    fs.writeFileSync(path.join(solo, 'avisos.json'), JSON.stringify({ version: 1, notices: [{ id: 'x', title: 'Único' }], modpacks: {} }))
    git(solo, 'add', '-A')
    git(solo, 'commit', '-m', 'Actualizar avisos')
    const soloRemote = path.join(home, 'solo-remote.git')
    fs.mkdirSync(soloRemote)
    git(soloRemote, 'init', '--bare', '-b', 'main')
    git(solo, 'remote', 'add', 'origin', soloRemote)
    git(solo, 'push', '-u', 'origin', 'main')
    const lines = []
    const result = await notices.undoLast({ ...config, empiPacksRepoPath: solo, empiPacksRepoUrl: soloRemote }, (l) => lines.push(l), () => {})
    assert.strictEqual(result.undone, true, lines.join('\n'))
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(solo, 'avisos.json'), 'utf8')).notices, [])
})
