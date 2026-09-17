const { run, capture } = require('./exec')

function withLog(log, command, args) {
    log(`$ ${command} ${args.join(' ')}`)
}

async function releaseExists(repo, tag) {
    try {
        await capture('gh', ['release', 'view', tag, '-R', repo])
        return true
    } catch {
        return false
    }
}

async function createRelease(repo, tag, title, notes, log) {
    const args = ['release', 'create', tag, '-R', repo, '--title', title, '--notes', notes]
    withLog(log, 'gh', args)
    await run('gh', args, {}, log)
}

async function createReleaseWithAsset(repo, tag, title, filePath, log) {
    const args = ['release', 'create', tag, filePath, '-R', repo, '--title', title, '--generate-notes']
    withLog(log, 'gh', args)
    await run('gh', args, {}, log)
}

/** Uploads (or overwrites, if it already exists) a single asset on an existing release. */
async function uploadAsset(repo, tag, filePath, log) {
    const args = ['release', 'upload', tag, filePath, '-R', repo, '--clobber']
    withLog(log, 'gh', args)
    await run('gh', args, {}, log)
}

async function assetDownloadUrl(repo, tag, assetName) {
    return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`
}

/** electron-builder's GitHub publisher creates releases as drafts by default - this makes one visible/live. */
async function publishDraft(repo, tag, log) {
    const args = ['release', 'edit', tag, '-R', repo, '--draft=false']
    withLog(log, 'gh', args)
    await run('gh', args, {}, log)
}

module.exports = { releaseExists, createRelease, createReleaseWithAsset, uploadAsset, assetDownloadUrl, publishDraft }
