const fs = require('fs')
const os = require('os')
const path = require('path')
const gh = require('./gh')
const { loadCache, saveCache } = require('./config')

const MB = 1024 * 1024

/** GitHub Pages / plain git refuse big files, so those go to a Release asset instead. */
function toPosix(relativePath) {
    return relativePath.split(path.sep).join('/')
}

/** Turns a relative path into a unique, GitHub-safe release asset filename. */
function flattenAssetName(relKey) {
    return relKey.replace(/[^a-zA-Z0-9._/-]/g, '_').split('/').join('__')
}

/** Every file under `topDir`, with paths relative to `root`. */
function collect(topDir, root, out = []) {
    if (!fs.existsSync(topDir)) return out
    for (const entry of fs.readdirSync(topDir, { withFileTypes: true })) {
        const full = path.join(topDir, entry.name)
        if (entry.isDirectory()) {
            collect(full, root, out)
        } else if (entry.isFile()) {
            const stats = fs.statSync(full)
            out.push({ rel: toPosix(path.relative(root, full)), abs: full, size: stats.size, mtimeMs: stats.mtimeMs })
        }
    }
    return out
}

/**
 * Works out which large files exist and which of them still need uploading. Nothing is hashed:
 * a file counts as already uploaded when a release asset with the same name and size exists and
 * the local copy hasn't been touched since we uploaded it.
 */
async function plan(config, largeFiles) {
    if (largeFiles.length === 0) return []
    const remote = new Map((await gh.listAssets(config.empiPacksGithubRepo, config.largeAssetsReleaseTag)).map((asset) => [asset.name, asset.size]))
    const cache = loadCache()

    return largeFiles.map((file) => {
        const assetName = flattenAssetName(file.rel)
        const cached = cache[file.rel]
        const onRemote = remote.get(assetName) === file.size
        const untouched = !cached || (cached.size === file.size && cached.mtimeMs === file.mtimeMs)
        return {
            rel: file.rel,
            abs: file.abs,
            size: file.size,
            mtimeMs: file.mtimeMs,
            assetName,
            url: gh.assetDownloadUrl(config.empiPacksGithubRepo, config.largeAssetsReleaseTag, assetName),
            needsUpload: !(onRemote && untouched)
        }
    })
}

/** Uploads the files a plan marked as needing it. Files keep their original folder-derived name in the release. */
async function upload(config, planned, log) {
    const pending = planned.filter((file) => file.needsUpload)
    if (pending.length === 0) {
        if (planned.length > 0) log('Los archivos grandes ya estaban subidos, no hay nada que mover.')
        return
    }

    const tag = config.largeAssetsReleaseTag
    if (!(await gh.releaseExists(config.empiPacksGithubRepo, tag))) {
        await gh.createRelease(config.empiPacksGithubRepo, tag, 'Archivos grandes de EmpiPacks', 'Assets grandes servidos aparte del repositorio. No borrar.', log)
    }

    const cache = loadCache()
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-large-'))
    try {
        for (const file of pending) {
            log(`Subiendo ${(file.size / MB).toFixed(1)} MB: ${file.rel}`)
            const staged = path.join(staging, file.assetName)
            try {
                fs.linkSync(file.abs, staged)
            } catch {
                fs.copyFileSync(file.abs, staged)
            }
            await gh.uploadAssets(config.empiPacksGithubRepo, tag, [staged], log)
            fs.rmSync(staged, { force: true })
            cache[file.rel] = { size: file.size, mtimeMs: file.mtimeMs, url: file.url }
            saveCache(cache)
        }
    } finally {
        fs.rmSync(staging, { recursive: true, force: true })
    }
}

/** Points every module (and submodule) whose file moved to a Release at its new URL. */
function rewriteDistributionUrls(distribution, urlMap, pagesBaseUrl) {
    let changed = 0

    function visit(modules) {
        if (!Array.isArray(modules)) return
        for (const mdl of modules) {
            if (mdl.artifact && mdl.artifact.url && mdl.artifact.url.startsWith(pagesBaseUrl)) {
                const key = decodeURIComponent(mdl.artifact.url.slice(pagesBaseUrl.length))
                if (urlMap[key]) {
                    mdl.artifact.url = urlMap[key]
                    changed++
                }
            }
            visit(mdl.subModules)
        }
    }

    for (const server of distribution.servers || []) visit(server.modules)
    return changed
}

module.exports = { collect, plan, upload, rewriteDistributionUrls, toPosix, MB }
