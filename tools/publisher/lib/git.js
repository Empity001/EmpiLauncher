const { run, capture } = require('./exec')

function withLog(log, command, args) {
    log(`$ ${command} ${args.join(' ')}`)
}

async function status(cwd) {
    return capture('git', ['status', '--short'], { cwd })
}

async function isRepo(cwd) {
    try {
        await capture('git', ['rev-parse', '--is-inside-work-tree'], { cwd })
        return true
    } catch {
        return false
    }
}

async function clone(url, destination, log) {
    withLog(log, 'git', ['clone', url, destination])
    await run('git', ['clone', url, destination], {}, log)
}

async function pull(cwd, log) {
    withLog(log, 'git', ['pull'])
    await run('git', ['pull'], { cwd }, log)
}

async function addAll(cwd, log) {
    withLog(log, 'git', ['add', '-A'])
    await run('git', ['add', '-A'], { cwd }, log)
}

async function commit(cwd, message, log) {
    withLog(log, 'git', ['commit', '-m', message])
    await run('git', ['commit', '-m', message], { cwd }, log)
}

async function push(cwd, log) {
    withLog(log, 'git', ['push'])
    await run('git', ['push'], { cwd }, log)
}

/** Stops tracking a path without deleting it from disk (used to remove a file from git once it moves to a GitHub Release). */
async function untrack(cwd, relativePath, log) {
    withLog(log, 'git', ['rm', '--cached', '--ignore-unmatch', relativePath])
    await run('git', ['rm', '--cached', '--ignore-unmatch', relativePath], { cwd }, log)
}

module.exports = { status, isRepo, clone, pull, addAll, commit, push, untrack }
