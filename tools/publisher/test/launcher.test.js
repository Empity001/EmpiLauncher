// node --test tools/publisher/test
// The launcher release bookkeeping: version bumps, and reading what a build left in dist/ (the names auto-update looks for).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const launcher = require('../lib/launcher')

function makeRepo() {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-launcher-'))
    fs.mkdirSync(path.join(repo, 'dist'))
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'empilauncher', version: '2.6.2' }))
    return { repo, config: { launcherRepoPath: repo }, dist: path.join(repo, 'dist') }
}

const latest = (version, name) => `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: abc==\n    size: 10\npath: ${name}\nsha512: abc==\nreleaseDate: '2026-09-19T00:00:00.000Z'\n`

test('bump changes only the part that was asked for', () => {
    assert.strictEqual(launcher.bump('2.6.2', 'patch'), '2.6.3')
    assert.strictEqual(launcher.bump('2.6.2', 'minor'), '2.7.0')
    assert.strictEqual(launcher.bump('2.6.2', 'major'), '3.0.0')
    assert.strictEqual(launcher.bump('2.6.2', 'same'), '2.6.2')
})

test('a native build is found by the dashed name latest.yml promises', () => {
    const { config, dist } = makeRepo()
    fs.writeFileSync(path.join(dist, 'Empi-Launcher-setup-3.0.0.exe'), 'installer')
    fs.writeFileSync(path.join(dist, 'Empi-Launcher-setup-3.0.0.exe.blockmap'), 'map')
    fs.writeFileSync(path.join(dist, 'latest.yml'), latest('3.0.0', 'Empi-Launcher-setup-3.0.0.exe'))
    const build = launcher.readBuild(config, '3.0.0')
    assert.strictEqual(build.version, '3.0.0')
    assert.strictEqual(build.assetName, 'Empi-Launcher-setup-3.0.0.exe')
    assert.ok(build.exe.endsWith('Empi-Launcher-setup-3.0.0.exe'))
})

test('a classic build (spaces locally, dashes in latest.yml) is still found', () => {
    const { config, dist } = makeRepo()
    fs.writeFileSync(path.join(dist, 'Empi Launcher-setup-2.6.3.exe'), 'installer')
    fs.writeFileSync(path.join(dist, 'Empi Launcher-setup-2.6.3.exe.blockmap'), 'map')
    fs.writeFileSync(path.join(dist, 'latest.yml'), latest('2.6.3', 'Empi-Launcher-setup-2.6.3.exe'))
    assert.ok(launcher.readBuild(config, '2.6.3'))
})

test('a build of another version, or without its blockmap, does not count', () => {
    const { config, dist } = makeRepo()
    fs.writeFileSync(path.join(dist, 'Empi-Launcher-setup-3.0.0.exe'), 'installer')
    fs.writeFileSync(path.join(dist, 'latest.yml'), latest('3.0.0', 'Empi-Launcher-setup-3.0.0.exe'))
    assert.strictEqual(launcher.readBuild(config, '3.0.0'), null)          // no blockmap yet
    fs.writeFileSync(path.join(dist, 'Empi-Launcher-setup-3.0.0.exe.blockmap'), 'map')
    assert.ok(launcher.readBuild(config, '3.0.0'))
    assert.strictEqual(launcher.readBuild(config, '3.0.1'), null)          // asked for another version
})
