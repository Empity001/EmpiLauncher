// node --test tools/publisher/test/*.test.js
// A dropped connection to GitHub ("git push ... salio con codigo 128") is tried again and, if it stays down, says what happened.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const git = require('../lib/git')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-retry-'))
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
test.after(() => fs.rmSync(dir, { recursive: true, force: true }))

const repoWithRemote = (name, url) => {
    const repo = path.join(dir, name)
    fs.mkdirSync(repo)
    sh(repo, 'init', '-b', 'main')
    sh(repo, 'config', 'user.email', 't@example.test')
    sh(repo, 'config', 'user.name', 'Test')
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a')
    sh(repo, 'add', '-A')
    sh(repo, 'commit', '-m', 'a')
    sh(repo, 'remote', 'add', 'origin', url)
    return repo
}

test('a connection that cannot be made is tried three times and then explained in words', async () => {
    // nothing listens on port 1: "Failed to connect" / "Connection refused", the same family of errors as a network that is down
    const repo = repoWithRemote('down', 'http://127.0.0.1:1/empi.git')
    const lines = []
    const waits = []
    await assert.rejects(
        git.push(repo, (l) => lines.push(l), { delays: [1, 2], sleep: async (ms) => { waits.push(ms) } }),
        (err) => /No pude conectar con GitHub después de 3 intentos/.test(err.message) && /vuelve a pulsar/.test(err.message) && !/codigo 128/.test(err.message)
    )
    assert.deepStrictEqual(waits, [1, 2], 'it waited between the tries')
    assert.strictEqual(lines.filter((l) => /Sin conexión con GitHub/.test(l)).length, 2)
})

test('a failure that is not the network is not retried', async () => {
    // a path that is not a repository: git says so at once (and asking again would not change it)
    const notRepo = path.join(dir, 'plain')
    fs.mkdirSync(notRepo)
    const waits = []
    await assert.rejects(git.push(notRepo, () => {}, { delays: [1, 2], sleep: async (ms) => { waits.push(ms) } }), /salio con codigo/)
    assert.deepStrictEqual(waits, [], 'no retries for something that is not a dropped connection')
})

test('when the connection works the first time nothing is repeated', async () => {
    const remote = path.join(dir, 'remote.git')
    fs.mkdirSync(remote)
    sh(remote, 'init', '--bare', '-b', 'main')
    const repo = repoWithRemote('up', remote)
    const waits = []
    await git.push(repo, () => {}, { delays: [1, 2], sleep: async (ms) => { waits.push(ms) } })
    assert.deepStrictEqual(waits, [])
    assert.strictEqual(sh(remote, 'log', '-1', '--format=%s'), 'a')
})
