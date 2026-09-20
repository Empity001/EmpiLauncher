// node --test tools/publisher/test/*.test.js
// The first "Publicar avisos" of someone who only set a maintenance or the minimum version: there is no page, so there is no avisos/ folder,
// neither on disk nor in the repository. git add / commit refuse a path they do not know (exit 128), so it must not be asked for.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-avisos-first-'))
process.env.EMPI_PUBLISHER_HOME = home   // before anything loads lib/config.js
const notices = require('../lib/notices')

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
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

test('publishing only settings (no notice, so no avisos/ folder anywhere) works and puts just avisos.json', async () => {
    notices.saveAccess({ launcher: { minVersion: '3.4.0' }, modpacks: { 'Pack-1.0': { maintenance: { active: true, message: 'Volvemos pronto' } } } })
    const { result, lines } = await run({ message: 'Solo ajustes' })
    assert.strictEqual(result.published, true, lines.join('\n'))
    const check = path.join(home, 'check')
    git(home, 'clone', remote, check)
    const doc = JSON.parse(fs.readFileSync(path.join(check, 'avisos.json'), 'utf8'))
    assert.strictEqual(doc.launcher.minVersion, '3.4.0')
    assert.strictEqual(doc.modpacks['Pack-1.0'].maintenance.active, true)
    assert.ok(!fs.existsSync(path.join(check, 'avisos')), 'no empty folder is invented')
    assert.strictEqual(git(check, 'log', '-1', '--format=%s'), 'Solo ajustes')
    fs.rmSync(check, { recursive: true, force: true })
})

test('and publishing the same thing again says there is nothing new', async () => {
    const again = await run()
    assert.strictEqual(again.result.published, false)
})
