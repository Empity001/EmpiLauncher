const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_PATH = path.join(os.homedir(), '.empilauncher-publisher.json')

const DEFAULTS = {
    launcherRepoPath: path.join(__dirname, '..', '..', '..'),
    empiPacksRepoPath: path.join(os.homedir(), 'OneDrive', 'Documents', 'GitHub', 'EmpiPacks'),
    empiPacksRepoUrl: 'https://github.com/Empity001/EmpiPacks.git',
    launcherGithubRepo: 'Empity001/EmpiLauncher',
    empiPacksGithubRepo: 'Empity001/EmpiPacks',
    // Nebula writes to its own ROOT folder (see its .env), not into the EmpiPacks git
    // checkout directly - these three get copied over after Nebula runs.
    nebulaProjectPath: path.join(os.homedir(), 'OneDrive', 'Desktop', 'Nebula-master', 'Nebula-master'),
    nebulaRootPath: 'C:\\EmpiPacksRoot',
    nebulaCommand: 'npm run start -- g distro',
    largeFileThresholdMb: 40,
    largeAssetsReleaseTag: 'large-assets'
}

function load() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
        } catch {
            return { ...DEFAULTS }
        }
    }
    return { ...DEFAULTS }
}

function save(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

module.exports = { load, save, DEFAULTS }
