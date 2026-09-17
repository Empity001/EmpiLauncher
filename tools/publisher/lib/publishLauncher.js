const fs = require('fs')
const path = require('path')
const { run, capture, npmBinary } = require('./exec')
const git = require('./git')

function bumpPatch(version) {
    const parts = version.split('.')
    parts[2] = String(Number(parts[2]) + 1)
    return parts.join('.')
}

async function publishLauncher(config, options, log) {
    const repoRoot = config.launcherRepoPath
    const packageJsonPath = path.join(repoRoot, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const currentVersion = pkg.version

    let version = currentVersion
    if (options.bumpVersion) {
        version = bumpPatch(currentVersion)
        pkg.version = version
        fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
        log(`Version: ${currentVersion} -> ${version}`)

        await git.addAll(repoRoot, log)
        await git.commit(repoRoot, `Release v${version}`, log)
    } else {
        log(`Publicando version actual: v${version}`)
    }

    log('Pidiendo un token de GitHub a "gh" para que electron-builder pueda publicar...')
    const ghToken = await capture('gh', ['auth', 'token'])

    log('Compilando y publicando con electron-builder (puede tardar varios minutos)...')
    await run(npmBinary(), ['run', 'release:win'], {
        cwd: repoRoot,
        env: { GH_TOKEN: ghToken }
    }, log)

    if (options.bumpVersion) {
        await git.push(repoRoot, log)
    }

    return { version }
}

module.exports = { publishLauncher, bumpPatch }
