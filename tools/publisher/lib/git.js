const fs = require('fs')
const path = require('path')
const { run, capture } = require('./exec')

function withLog(log, command, args) {
    log(`$ ${command} ${args.join(' ')}`)
}

/** `git status --short` as a list of { code, file } (empty when the tree is clean). */
async function changes(cwd) {
    const out = await capture('git', ['status', '--short', '-uall'], { cwd })
    return out.split('\n').filter((line) => line.trim()).map((line) => ({ code: line.slice(0, 2).trim(), file: line.slice(3) }))
}

/**
 * The EmpiPacks files must reach GitHub byte-for-byte as Nebula hashed them. With Git's default Windows
 * setting (autocrlf) text files get their line endings rewritten on commit, which would make players'
 * downloads fail the checksum in distribution.json - so conversion is switched off for that repo.
 */
async function ensureByteExact(cwd) {
    await capture('git', ['config', 'core.autocrlf', 'false'], { cwd })
    await capture('git', ['config', 'core.safecrlf', 'false'], { cwd })
}

/**
 * Stages everything quietly (the plain command prints one warning per text file on Windows).
 * The second command adds every tracked file again exactly as it is on disk: files committed while Git's line-ending conversion was still on
 * are stored on GitHub with other line breaks than the ones Nebula hashed, so players' downloads fail their checksum. Git does not notice
 * on its own (the file on disk has not changed), which is why "Verificar publicación" found them; this repairs them at the next send.
 */
async function stage(cwd) {
    await capture('git', ['add', '-A'], { cwd })
    await capture('git', ['add', '--renormalize', '--', '.'], { cwd })
}

/** What a commit right now would contain, as [{ code: 'A'|'M'|'D', file }]. Needs `stage` first. */
async function stagedChanges(cwd) {
    const out = await capture('git', ['diff', '--cached', '--no-renames', '--name-status'], { cwd })
    return out.split('\n').filter((line) => line.trim()).map((line) => {
        const [code, ...rest] = line.split('\t')
        return { code: code.trim(), file: rest.join('\t') }
    })
}

async function isRepo(cwd) {
    try {
        await capture('git', ['rev-parse', '--is-inside-work-tree'], { cwd })
        return true
    } catch {
        return false
    }
}

// What git prints when the connection to GitHub could not be made or was cut (exit 128): worth trying again, unlike a rejected push or a bad path.
const NETWORK_ERROR = /unable to access|Could not resolve host|Failed to connect|Connection (?:timed out|reset|refused)|Operation timed out|timed out|early EOF|RPC failed|Empty reply from server|SSL_ERROR|schannel|hung up unexpectedly|Recv failure|Send failure|TLS connection/i

/**
 * Runs a git command that talks to GitHub. A dropped or refused connection is tried again (after 3 s, then 8 s); after that the error says
 * what happened in words instead of just "codigo 128". Anything else (a rejected push, a wrong path) fails at once, as before.
 */
async function online(cwd, args, log, { delays = [3000, 8000], sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    withLog(log, 'git', args)
    for (let attempt = 0; ; attempt++) {
        const seen = []
        try {
            await run('git', args, { cwd }, (line) => { seen.push(line); log(line) })
            return
        } catch (err) {
            const said = seen.join('\n')
            if (/Cancelado/.test(err.message) || !NETWORK_ERROR.test(said)) throw err
            if (attempt >= delays.length) {
                const last = seen.filter((line) => NETWORK_ERROR.test(line)).pop() || ''
                throw new Error(`No pude conectar con GitHub después de ${attempt + 1} intentos (${last.replace(/^fatal:\s*/, '').trim()}). Revisa tu internet y vuelve a pulsar el botón: lo que ya está guardado se conserva y solo falta subirlo.`)
            }
            log(`Sin conexión con GitHub (intento ${attempt + 1} de ${delays.length + 1}). Reintento en ${delays[attempt] / 1000} s...`)
            await sleep(delays[attempt])
        }
    }
}

async function clone(url, destination, log, options) {
    await online(undefined, ['clone', url, destination], log, options)
}

async function pull(cwd, log, options) {
    await online(cwd, ['pull', '--ff-only'], log, options)
}

async function add(cwd, paths, log) {
    const args = ['add', '-A', '--', ...paths]
    withLog(log, 'git', args)
    await run('git', args, { cwd }, log)
}

async function addAll(cwd, log) {
    withLog(log, 'git', ['add', '-A'])
    await run('git', ['add', '-A'], { cwd }, log)
}

async function commit(cwd, message, log) {
    withLog(log, 'git', ['commit', '-m', message])
    await run('git', ['commit', '-m', message], { cwd }, log)
}

/** `-u origin HEAD` also works on a branch that has no upstream yet (a plain `git push` stops there with code 128). */
async function push(cwd, log, options) {
    await online(cwd, ['push', '-u', 'origin', 'HEAD'], log, options)
}

/** True when the local branch has commits the remote doesn't (for "nothing to send" checks after a failed push). */
async function unpushedCount(cwd) {
    const count = async (range) => Number(await capture('git', ['rev-list', '--count', range], { cwd })) || 0
    try {
        return await count('@{u}..HEAD')
    } catch {
        // No upstream configured: compare with the same-named branch on origin instead.
        try {
            const branch = await capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
            return await count(`origin/${branch}..HEAD`)
        } catch {
            return 0
        }
    }
}

/**
 * Of these paths, the ones git can be asked about: they exist in the working tree or are already tracked (a folder that was deleted still
 * has to be staged as deleted). git add / commit stop with "pathspec ... did not match any files" (exit 128) for one that is neither.
 */
async function knownPaths(cwd, paths) {
    const known = []
    for (const p of paths) {
        if (fs.existsSync(path.join(cwd, p)) || (await capture('git', ['ls-files', '--', p], { cwd })).trim()) known.push(p)
    }
    return known
}

/** The commits (newest first) that touched these paths. */
async function commitsTouching(cwd, paths, limit = 2) {
    const out = await capture('git', ['log', `-n${limit}`, '--format=%H', '--', ...paths], { cwd })
    return out.split('\n').map((line) => line.trim()).filter((line) => /^[0-9a-f]{40}$/.test(line))
}

/** The files under these paths as they were at `rev`. */
async function filesAt(cwd, rev, paths) {
    const out = await capture('git', ['ls-tree', '-r', '--name-only', rev, '--', ...paths], { cwd })
    return out.split('\n').map((line) => line.trim()).filter(Boolean)
}

/** Puts these files back as they were at `rev` (working tree and index). */
async function restoreFrom(cwd, rev, files, log) {
    withLog(log, 'git', ['checkout', rev.slice(0, 7), '--', `(${files.length} archivos)`])
    await run('git', ['checkout', rev, '--', ...files], { cwd }, log)
}

/** "2026-09-20 18:04 · Actualizar avisos": which commit, for a person to read. */
async function describeCommit(cwd, rev) {
    return capture('git', ['log', '-1', '--format=%cd · %s', '--date=format:%Y-%m-%d %H:%M', rev], { cwd })
}

/** Commits of the remote branch last seen (after a fetch): the date of the newest, in seconds. */
async function lastPushAt(cwd) {
    try { return Number(await capture('git', ['log', '-1', '--format=%ct', '@{u}'], { cwd })) || 0 } catch { return 0 }
}

/** A file as the remote branch has it (what was really pushed), or null. */
async function pushedFile(cwd, file) {
    try { return await capture('git', ['show', `@{u}:${file}`], { cwd }) } catch { return null }
}

/** What a commit of only these paths would contain (needs `add` first). */
async function stagedChangesIn(cwd, paths) {
    const out = await capture('git', ['diff', '--cached', '--no-renames', '--name-status', '--', ...paths], { cwd })
    return out.split('\n').filter((line) => line.trim()).map((line) => {
        const [code, ...rest] = line.split('\t')
        return { code: code.trim(), file: rest.join('\t') }
    })
}

/** Commits only these paths, leaving anything else that is staged exactly as it is. */
async function commitOnly(cwd, message, paths, log) {
    const args = ['commit', '-m', message, '--only', '--', ...paths]
    withLog(log, 'git', ['commit', '-m', message, '--only', '--', ...paths])
    await run('git', args, { cwd }, log)
}

module.exports = { commitsTouching, filesAt, restoreFrom, describeCommit, lastPushAt, pushedFile, online, knownPaths, stagedChangesIn, commitOnly, changes, ensureByteExact, stage, stagedChanges, isRepo, clone, pull, add, addAll, commit, push, unpushedCount }
