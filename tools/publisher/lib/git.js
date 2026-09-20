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

/** Stages everything quietly (the plain command prints one warning per text file on Windows). */
async function stage(cwd) {
    await capture('git', ['add', '-A'], { cwd })
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

async function clone(url, destination, log) {
    withLog(log, 'git', ['clone', url, destination])
    await run('git', ['clone', url, destination], {}, log)
}

async function pull(cwd, log) {
    withLog(log, 'git', ['pull', '--ff-only'])
    await run('git', ['pull', '--ff-only'], { cwd }, log)
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
async function push(cwd, log) {
    const args = ['push', '-u', 'origin', 'HEAD']
    withLog(log, 'git', args)
    await run('git', args, { cwd }, log)
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

module.exports = { stagedChangesIn, commitOnly, changes, ensureByteExact, stage, stagedChanges, isRepo, clone, pull, add, addAll, commit, push, unpushedCount }
