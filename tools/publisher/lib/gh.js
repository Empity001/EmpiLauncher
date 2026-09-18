const { run, capture } = require('./exec')

function withLog(log, command, args) {
    log(`$ ${command} ${args.join(' ')}`)
}

async function authStatus() {
    try {
        await capture('gh', ['auth', 'status'])
        return true
    } catch {
        return false
    }
}

async function token() {
    return capture('gh', ['auth', 'token'])
}

async function releaseExists(repo, tag) {
    try {
        await capture('gh', ['release', 'view', tag, '-R', repo])
        return true
    } catch {
        return false
    }
}

/** Latest published (non-draft) release tag, or null when there is none / gh is unreachable. */
async function latestTag(repo) {
    try {
        const out = await capture('gh', ['release', 'list', '-R', repo, '--exclude-drafts', '-L', '1', '--json', 'tagName', '-q', '.[0].tagName'])
        return out || null
    } catch {
        return null
    }
}

async function listAssets(repo, tag) {
    try {
        const out = await capture('gh', ['release', 'view', tag, '-R', repo, '--json', 'assets', '-q', '.assets'])
        return JSON.parse(out || '[]').map((asset) => ({ name: asset.name, size: asset.size }))
    } catch {
        return []
    }
}

async function createRelease(repo, tag, title, notes, log, files = [], target) {
    const args = ['release', 'create', tag, ...files, '-R', repo, '--title', title, '--notes', notes || `${title}`]
    if (target) args.push('--target', target)
    withLog(log, 'gh', args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)))
    await run('gh', args, {}, log)
}

/** Uploads (or overwrites, if it already exists) assets on an existing release. */
async function uploadAssets(repo, tag, files, log) {
    const args = ['release', 'upload', tag, ...files, '-R', repo, '--clobber']
    withLog(log, 'gh', args)
    await run('gh', args, {}, log)
}

async function editRelease(repo, tag, { title, notes, draft } = {}, log) {
    const args = ['release', 'edit', tag, '-R', repo]
    if (title) args.push('--title', title)
    if (notes != null) args.push('--notes', notes)
    if (draft === false) args.push('--draft=false')
    withLog(log, 'gh', ['release', 'edit', tag])
    await run('gh', args, {}, log)
}

function assetDownloadUrl(repo, tag, assetName) {
    return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`
}

module.exports = { authStatus, token, releaseExists, latestTag, listAssets, createRelease, uploadAssets, editRelease, assetDownloadUrl }
