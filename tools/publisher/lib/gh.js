const { run, capture } = require('./exec')

// Where gh is. PUBLISHER_GH (a .js file) stands in for it in tests.
function ghCall(args) {
    const custom = process.env.PUBLISHER_GH
    return custom && custom.endsWith('.js') ? { command: process.execPath, args: [custom, ...args] } : { command: custom || 'gh', args }
}
const ghRun = (args, log = () => {}) => { const call = ghCall(args); return run(call.command, call.args, {}, log) }
const ghCapture = (args) => { const call = ghCall(args); return capture(call.command, call.args) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function withLog(log, command, args) {
    log(`$ ${command} ${args.join(' ')}`)
}

async function authStatus() {
    try {
        await ghCapture(['auth', 'status'])
        return true
    } catch {
        return false
    }
}

async function token() {
    return ghCapture(['auth', 'token'])
}

/** A release with that tag, published or not: "gh release view" does not find a draft by its tag, the list does. */
async function releaseExists(repo, tag) {
    try {
        await ghCapture(['release', 'view', tag, '-R', repo])
        return true
    } catch { /* maybe a draft: look in the list */ }
    try {
        const out = await ghCapture(['release', 'list', '-R', repo, '-L', '100', '--json', 'tagName', '-q', '.[].tagName'])
        return out.split(/\r?\n/).map((line) => line.trim()).includes(tag)
    } catch {
        return false
    }
}

/** Latest published (non-draft) release tag, or null when there is none / gh is unreachable. */
async function latestTag(repo) {
    try {
        const out = await ghCapture(['release', 'list', '-R', repo, '--exclude-drafts', '-L', '1', '--json', 'tagName', '-q', '.[0].tagName'])
        return out || null
    } catch {
        return null
    }
}

async function listAssets(repo, tag) {
    try {
        const out = await ghCapture(['release', 'view', tag, '-R', repo, '--json', 'assets', '-q', '.assets'])
        return JSON.parse(out || '[]').map((asset) => ({ name: asset.name, size: asset.size }))
    } catch {
        return []
    }
}

/**
 * Creates a release. With files, it does NOT create it with them in one go ("gh release create <files>"): the release is created as a
 * draft, the files go up with retries, and only then is it published. Uploading right after the draft appears can answer "404 Not Found"
 * for a moment, and in one go that throws the whole release away; this way it is tried again, and if the files really cannot go up the draft
 * stays for the next attempt (which finds it and continues) and nothing is published half done.
 */
async function createRelease(repo, tag, title, notes, log, files = [], target, options = {}) {
    const args = ['release', 'create', tag, '-R', repo, '--title', title, '--notes', notes || `${title}`]
    if (target) args.push('--target', target)
    if (files.length === 0) {
        withLog(log, 'gh', args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)))
        await ghRun(args, log)
        return
    }

    args.push('--draft')
    withLog(log, 'gh', args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)))
    await ghRun(args, log)

    const pause = options.pauseMs == null ? 4000 : options.pauseMs
    const attempts = options.attempts || 4
    for (let attempt = 1; ; attempt++) {
        try {
            await uploadAssets(repo, tag, files, log)
            break
        } catch (err) {
            if (attempt >= attempts) {
                throw new Error(`No pude subir los archivos al release ${tag} tras ${attempts} intentos (${err.message}). Queda como borrador y no se publicó nada: vuelve a pulsar "Enviar" y lo retoma.`)
            }
            log(`La subida falló (intento ${attempt} de ${attempts}); lo intento otra vez en ${Math.round((pause * attempt) / 1000)} s.`)
            await sleep(pause * attempt)
        }
    }
    await editRelease(repo, tag, { title, notes: notes || `${title}`, draft: false }, log)
}

/** Uploads (or overwrites, if it already exists) assets on an existing release. */
async function uploadAssets(repo, tag, files, log) {
    const args = ['release', 'upload', tag, ...files, '-R', repo, '--clobber']
    withLog(log, 'gh', args)
    await ghRun(args, log)
}

async function editRelease(repo, tag, { title, notes, draft } = {}, log) {
    const args = ['release', 'edit', tag, '-R', repo]
    if (title) args.push('--title', title)
    if (notes != null) args.push('--notes', notes)
    if (draft === false) args.push('--draft=false')
    withLog(log, 'gh', ['release', 'edit', tag])
    await ghRun(args, log)
}

function assetDownloadUrl(repo, tag, assetName) {
    return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`
}

module.exports = { authStatus, token, releaseExists, latestTag, listAssets, createRelease, uploadAssets, editRelease, assetDownloadUrl }
