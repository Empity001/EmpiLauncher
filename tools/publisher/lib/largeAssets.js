const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const gh = require('./gh')
const git = require('./git')

const CACHE_FILENAME = '.publisher-cache.json'

function loadCache(repoRoot) {
    const cachePath = path.join(repoRoot, CACHE_FILENAME)
    if (fs.existsSync(cachePath)) {
        try {
            return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
        } catch {
            return {}
        }
    }
    return {}
}

function saveCache(repoRoot, cache) {
    fs.writeFileSync(path.join(repoRoot, CACHE_FILENAME), JSON.stringify(cache, null, 2), 'utf8')
}

function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        const stream = fs.createReadStream(filePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(hash.digest('hex')))
    })
}

/** Turns a relative path into a unique, GitHub-safe release asset filename. */
function flattenAssetName(relativePath) {
    const safe = relativePath
        .split(path.sep).join('/')
        .replace(/[^a-zA-Z0-9._/-]/g, '_')
        .split('/').join('__')
    return safe
}

function walk(dir, root, results) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === CACHE_FILENAME) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(fullPath, root, results)
        } else if (entry.isFile()) {
            results.push({
                absolutePath: fullPath,
                relativePath: path.relative(root, fullPath),
                size: fs.statSync(fullPath).size
            })
        }
    }
}

function findLargeFiles(repoRoot, thresholdBytes) {
    const all = []
    walk(repoRoot, repoRoot, all)
    return all.filter((f) => f.size > thresholdBytes)
}

function ensureGitignored(repoRoot, relativePath, log) {
    const gitignorePath = path.join(repoRoot, '.gitignore')
    const forwardSlashPath = relativePath.split(path.sep).join('/')
    let content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
    const lines = content.split(/\r?\n/)
    if (!lines.includes(`/${forwardSlashPath}`)) {
        content = content.replace(/\s*$/, '\n') + `/${forwardSlashPath}\n`
        fs.writeFileSync(gitignorePath, content, 'utf8')
        log(`Agregado a .gitignore: /${forwardSlashPath}`)
    }
}

/**
 * Finds every file over the configured threshold, uploads any new/changed ones to a
 * single evergreen GitHub Release on the EmpiPacks repo (skipping unchanged ones using
 * a local hash cache), keeps them out of git going forward, and returns a map of
 * relativePath -> public download URL for every large file (new or already-cached).
 */
async function processLargeFiles(repoRoot, config, log) {
    const thresholdBytes = config.largeFileThresholdMb * 1024 * 1024
    const largeFiles = findLargeFiles(repoRoot, thresholdBytes)
    const urlMap = {}

    if (largeFiles.length === 0) {
        log('No hay archivos grandes que mover a un Release.')
        return urlMap
    }

    log(`Encontrados ${largeFiles.length} archivo(s) de mas de ${config.largeFileThresholdMb}MB.`)

    const cache = loadCache(repoRoot)
    const tag = config.largeAssetsReleaseTag
    let releaseReady = await gh.releaseExists(config.empiPacksGithubRepo, tag)

    for (const file of largeFiles) {
        const relKey = file.relativePath.split(path.sep).join('/')
        const hash = await sha256File(file.absolutePath)
        const cached = cache[relKey]

        if (cached && cached.sha256 === hash) {
            log(`Sin cambios, reutilizando: ${relKey}`)
            urlMap[relKey] = cached.url
            ensureGitignored(repoRoot, file.relativePath, log)
            continue
        }

        if (!releaseReady) {
            await gh.createRelease(config.empiPacksGithubRepo, tag, 'Archivos grandes de EmpiPacks', 'Assets grandes servidos aparte del repositorio. No borrar.', log)
            releaseReady = true
        }

        // Upload under a flattened, path-derived name (not the original basename) so files
        // with the same filename in different folders don't collide inside the one release.
        const assetName = flattenAssetName(relKey)
        const tempCopyPath = path.join(os.tmpdir(), assetName)
        fs.copyFileSync(file.absolutePath, tempCopyPath)
        log(`Subiendo (${(file.size / 1024 / 1024).toFixed(1)}MB): ${relKey} -> ${assetName}`)
        try {
            await gh.uploadAsset(config.empiPacksGithubRepo, tag, tempCopyPath, log)
        } finally {
            fs.unlinkSync(tempCopyPath)
        }
        const url = await gh.assetDownloadUrl(config.empiPacksGithubRepo, tag, assetName)

        cache[relKey] = { sha256: hash, size: file.size, url }
        urlMap[relKey] = url

        await git.untrack(repoRoot, file.relativePath, log)
        ensureGitignored(repoRoot, file.relativePath, log)
    }

    saveCache(repoRoot, cache)
    return urlMap
}

/** Rewrites every module (and submodule) artifact URL that points at a now-externally-hosted file. */
function rewriteDistributionUrls(distribution, urlMap, pagesBaseUrl) {
    let changed = 0

    function visit(modules) {
        if (!Array.isArray(modules)) return
        for (const mdl of modules) {
            if (mdl.artifact && mdl.artifact.url) {
                const withoutBase = mdl.artifact.url.startsWith(pagesBaseUrl)
                    ? decodeURIComponent(mdl.artifact.url.slice(pagesBaseUrl.length))
                    : null
                if (withoutBase != null && urlMap[withoutBase]) {
                    mdl.artifact.url = urlMap[withoutBase]
                    changed++
                }
            }
            if (mdl.subModules) visit(mdl.subModules)
        }
    }

    for (const server of distribution.servers || []) {
        visit(server.modules)
    }

    return changed
}

module.exports = { processLargeFiles, rewriteDistributionUrls, flattenAssetName, sha256File }
