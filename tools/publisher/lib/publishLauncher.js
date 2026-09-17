const fs = require('fs')
const path = require('path')
const { run, capture, npmBinary } = require('./exec')
const git = require('./git')
const gh = require('./gh')

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

    // electron-builder creates the GitHub release as a draft by default; without this
    // extra step players never see the update until someone remembers to click
    // "Publish release" on GitHub by hand.
    log('Publicando el Release (sacandolo de modo borrador)...')
    await gh.publishDraft(config.launcherGithubRepo, `v${version}`, log)

    if (options.bumpVersion) {
        await git.push(repoRoot, log)
    }

    return { version }
}

module.exports = { publishLauncher, bumpPatch }
