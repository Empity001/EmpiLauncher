// node --test tools/publisher/test/*.test.js
// Creating a release (lib/gh.js) against a stand-in for gh (PUBLISHER_GH), never GitHub. What matters: the files are never part of the
// "create" call (a 404 on the upload right after it used to throw the whole release away), a failed upload is tried again, and nothing is
// published until every file is up.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-gh-'))
const logFile = path.join(folder, 'calls.log')
const stateFile = path.join(folder, 'state.json')
const fake = path.join(folder, 'fakegh.js')
fs.writeFileSync(fake, `
const fs = require('fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(args) + '\\n')
const state = JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8'))
const [group, action] = args
if (group === 'release' && action === 'upload' && state.failUploads > 0) {
    state.failUploads--
    fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(state))
    console.error('HTTP 404: Not Found (https://uploads.github.com/repos/x/y/releases/1/assets)')
    process.exit(1)
}
if (group === 'release' && action === 'view') { console.error('release not found'); process.exit(1) }
if (group === 'release' && action === 'list') { console.log((state.tags || []).join('\\n')); process.exit(0) }
process.exit(0)
`)
process.env.PUBLISHER_GH = fake
const gh = require('../lib/gh')

const setState = (state) => { fs.writeFileSync(stateFile, JSON.stringify(state)); fs.rmSync(logFile, { force: true }) }
const calls = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [])
const verbs = () => calls().map((args) => `${args[0]} ${args[1]}`)
const FILES = ['C:\\tmp\\Empi-Launcher-setup-9.9.9.exe', 'C:\\tmp\\Empi-Launcher-setup-9.9.9.exe.blockmap', 'C:\\tmp\\latest.yml']

test.after(() => fs.rmSync(folder, { recursive: true, force: true }))

test('with files: the release is created as a draft WITHOUT them, they go up, and only then is it published', async () => {
    setState({ failUploads: 0 })
    await gh.createRelease('o/r', 'v9.9.9', 'v9.9.9', 'notas', () => {}, FILES, 'main', { pauseMs: 1 })
    assert.deepStrictEqual(verbs(), ['release create', 'release upload', 'release edit'])
    const [create, upload, edit] = calls()
    assert.ok(create.includes('--draft') && create.includes('--target') && create.includes('main'))
    assert.ok(!create.some((arg) => FILES.includes(arg)), 'the files are not part of the create call')
    assert.deepStrictEqual(FILES.every((file) => upload.includes(file)) && upload.includes('--clobber'), true)
    assert.ok(edit.includes('--draft=false') && edit.includes('notas'))
})

test('a 404 on the upload is tried again, and the release is published once they are up', async () => {
    setState({ failUploads: 2 })
    const messages = []
    await gh.createRelease('o/r', 'v9.9.9', 'v9.9.9', 'notas', (line) => messages.push(line), FILES, 'main', { pauseMs: 1, attempts: 4 })
    assert.deepStrictEqual(verbs(), ['release create', 'release upload', 'release upload', 'release upload', 'release edit'])
    assert.strictEqual(messages.filter((line) => /La subida falló/.test(line)).length, 2)
})

test('if the files cannot go up, nothing is published, the draft is left for the next attempt, and the person is told what to do', async () => {
    setState({ failUploads: 99 })
    await assert.rejects(gh.createRelease('o/r', 'v9.9.9', 'v9.9.9', 'notas', () => {}, FILES, 'main', { pauseMs: 1, attempts: 3 }), /Queda como borrador y no se publicó nada: vuelve a pulsar "Enviar"/)
    assert.deepStrictEqual(verbs(), ['release create', 'release upload', 'release upload', 'release upload'])
    assert.ok(!verbs().includes('release edit') && !verbs().includes('release delete'))
})

test('without files (an empty release to hold assets later) it is one plain create, published at once', async () => {
    setState({ failUploads: 0 })
    await gh.createRelease('o/r', 'assets', 'Archivos grandes', 'No borrar.', () => {})
    assert.deepStrictEqual(verbs(), ['release create'])
    assert.ok(!calls()[0].includes('--draft'))
})

test('a release that is only a draft counts as existing (gh view does not find a draft by its tag)', async () => {
    setState({ tags: ['v9.9.8', 'v9.9.9'] })
    assert.strictEqual(await gh.releaseExists('o/r', 'v9.9.9'), true)
    setState({ tags: ['v9.9.8'] })
    assert.strictEqual(await gh.releaseExists('o/r', 'v9.9.9'), false)
})
