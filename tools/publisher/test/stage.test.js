// node --test tools/publisher/test/*.test.js
// Files committed while Git's line-ending conversion was on are stored with other line breaks than the ones Nebula hashed (players' downloads
// then fail their checksum). git.stage adds every tracked file again exactly as it is on disk, which repairs them without touching the rest.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const git = require('../lib/git')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-stage-'))
const sh = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
test.after(() => fs.rmSync(dir, { recursive: true, force: true }))

test('a file stored with LF while it is CRLF on disk is put right at the next stage, and nothing else changes', async () => {
    sh('init', '-b', 'main'); sh('config', 'user.email', 't@example.test'); sh('config', 'user.name', 'Test')
    fs.mkdirSync(path.join(dir, 'servers'))
    const crlf = Buffer.from('a=1\r\nb=2\r\n')
    fs.writeFileSync(path.join(dir, 'servers', 'config.toml'), crlf)
    fs.writeFileSync(path.join(dir, 'servers', 'mod.jar'), Buffer.from([0, 1, 2, 13, 10, 4]))   // has a NUL: binary for Git
    sh('config', 'core.autocrlf', 'true')
    sh('add', '-A'); sh('commit', '-m', 'con conversion')
    assert.match(sh('ls-files', '--eol', 'servers/config.toml'), /^i\/lf\s+w\/crlf/, 'the text file was stored converted')

    await git.ensureByteExact(dir)            // what the Publisher does first: conversion off
    await git.stage(dir)
    const staged = await git.stagedChanges(dir)
    assert.deepStrictEqual(staged.map((s) => s.file), ['servers/config.toml'], 'only the converted text file is re-added (a binary that happens to hold CR LF is not)')
    assert.match(sh('ls-files', '--eol', 'servers/config.toml'), /^i\/crlf\s+w\/crlf/)
})
