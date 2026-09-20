const fs = require('fs')
const path = require('path')
const os = require('os')

// EMPI_PUBLISHER_HOME points settings, state and cache somewhere else: tests and demos use it so they never touch the real ones.
const HOME = process.env.EMPI_PUBLISHER_HOME || os.homedir()
const CONFIG_PATH = path.join(HOME, '.empilauncher-publisher.json')
const STATE_PATH = path.join(HOME, '.empilauncher-publisher-state.json')
const CACHE_PATH = path.join(HOME, '.empilauncher-publisher-cache.json')

const DEFAULTS = {
    launcherRepoPath: path.join(__dirname, '..', '..', '..'),
    empiPacksRepoPath: path.join(HOME, 'OneDrive', 'Documents', 'GitHub', 'EmpiPacks'),
    empiPacksRepoUrl: 'https://github.com/Empity001/EmpiPacks.git',
    launcherGithubRepo: 'Empity001/EmpiLauncher',
    empiPacksGithubRepo: 'Empity001/EmpiPacks',
    // Nebula writes to its own ROOT folder (see its .env), not into the EmpiPacks git
    // checkout directly - the result gets mirrored over when compiling.
    nebulaProjectPath: path.join(HOME, 'OneDrive', 'Desktop', 'Nebula-master', 'Nebula-master'),
    nebulaRootPath: 'C:\\EmpiPacksRoot',
    largeFileThresholdMb: 40,
    largeAssetsReleaseTag: 'large-assets'
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    } catch {
        return fallback
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function load() {
    return { ...DEFAULTS, ...readJson(CONFIG_PATH, {}) }
}

function save(config) {
    writeJson(CONFIG_PATH, config)
}

/** Small persistent scratchpad (last compile results etc.) so a page reload or restart doesn't lose the step you were on. */
function loadState() {
    return readJson(STATE_PATH, {})
}

function saveState(patch) {
    const next = { ...loadState(), ...patch }
    writeJson(STATE_PATH, next)
    return next
}

/** sha256 + upload cache for the big files that live in a GitHub Release. Kept outside the git checkout. */
function loadCache() {
    return readJson(CACHE_PATH, {})
}

function saveCache(cache) {
    writeJson(CACHE_PATH, cache)
}

module.exports = { HOME, load, save, loadState, saveState, loadCache, saveCache, readJson, writeJson, DEFAULTS }
