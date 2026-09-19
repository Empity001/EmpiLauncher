const fs = require('fs')
const os = require('os')
const path = require('path')
const { capture, runNode } = require('./exec')
const git = require('./git')
const gh = require('./gh')
const { loadState, saveState } = require('./config')

const MB = 1024 * 1024

function readPackage(config) {
    return JSON.parse(fs.readFileSync(path.join(config.launcherRepoPath, 'package.json'), 'utf8'))
}

function bump(version, kind) {
    const [major, minor, patch] = version.split('.').map(Number)
    if (kind === 'major') return `${major + 1}.0.0`
    if (kind === 'minor') return `${major}.${minor + 1}.0`
    if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
    return version
}

/** Rewrites only the version text (package.json once, package-lock.json's top two spots) so the files' formatting and diffs stay untouched. */
function setVersion(config, version) {
    for (const [file, occurrences] of [['package.json', 1], ['package-lock.json', 2]]) {
        const target = path.join(config.launcherRepoPath, file)
        if (!fs.existsSync(target)) continue
        let left = occurrences
        const text = fs.readFileSync(target, 'utf8').replace(/("version"\s*:\s*")[^"]+(")/g, (match, open, close) => (left-- > 0 ? `${open}${version}${close}` : match))
        fs.writeFileSync(target, text, 'utf8')
    }
}

/** What electron-builder produced, as recorded in dist/latest.yml (the exact names auto-update looks for). */
function readBuild(config, expectedVersion) {
    const dist = path.join(config.launcherRepoPath, 'dist')
    const yml = path.join(dist, 'latest.yml')
    if (!fs.existsSync(yml)) return null
    const text = fs.readFileSync(yml, 'utf8')
    const version = (text.match(/^version:\s*(.+)$/m) || [])[1]
    const assetName = (text.match(/^path:\s*(.+)$/m) || [])[1]
    if (!version || !assetName || (expectedVersion && version.trim() !== expectedVersion)) return null

    // Locally the installer keeps its spaces ("Empi Launcher-setup-x.exe"); on GitHub they become dashes.
    const local = fs.readdirSync(dist).find((name) => name.replace(/ /g, '-') === assetName.trim())
    if (!local) return null
    const exe = path.join(dist, local)
    if (!fs.existsSync(`${exe}.blockmap`)) return null
    return { version: version.trim(), assetName: assetName.trim(), exe, size: fs.statSync(exe).size, yml }
}

/**
 * Two ways to build the installer, both ending in the same three files (installer, .blockmap, latest.yml):
 *   native   the WPF launcher: native/build/build.mjs (dotnet publish + engine + Electron runtime + NSIS)
 *   classic  the Electron launcher through electron-builder (kept as the way back)
 * The channel is the same latest.yml for both, so a player with the classic launcher who receives a native build
 * is updated into it: the native installer removes the classic program (native/build/installer.nsi).
 */
const KINDS = {
    native: (config) => fs.existsSync(path.join(config.launcherRepoPath, 'native', 'build', 'build.mjs')),
    classic: (config) => fs.existsSync(path.join(config.launcherRepoPath, 'node_modules', 'electron-builder', 'cli.js'))
}

function availableKinds(config) {
    return Object.fromEntries(Object.entries(KINDS).map(([kind, exists]) => [kind, exists(config)]))
}

function defaultKind(config) {
    return KINDS.native(config) ? 'native' : 'classic'
}

async function info(config) {
    const pkg = readPackage(config)
    const state = loadState().launcherBuild || null
    const build = state ? readBuild(config, state.version) : null
    let dirty = 0
    try { dirty = (await git.changes(config.launcherRepoPath)).length } catch { /* not a repo */ }
    const latestTag = await gh.latestTag(config.launcherGithubRepo)
    const kind = (state && state.kind) || defaultKind(config)
    // Every release before the native one was a classic one; after the first native release it is remembered here.
    const lastSentKind = loadState().lastSentKind || (latestTag ? 'classic' : null)
    return {
        kinds: availableKinds(config),
        kind,
        migrates: kind === 'native' && lastSentKind === 'classic',
        version: pkg.version,
        next: { patch: bump(pkg.version, 'patch'), minor: bump(pkg.version, 'minor'), major: bump(pkg.version, 'major') },
        latestTag,
        dirty,
        build: build ? { version: build.version, name: path.basename(build.exe), size: build.size, at: state.at, notes: state.notes, sent: !!state.sentAt, kind: state.kind || 'classic' } : null
    }
}

async function compile(config, options, log, step) {
    const repo = config.launcherRepoPath
    const current = readPackage(config).version
    const version = options.version ? String(options.version).trim() : current
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('La version debe verse como 2.6.0.')

    step(`Poniendo la version ${version}`)
    if (version !== current) {
        setVersion(config, version)
        log(`Version: ${current} -> ${version}`)
    } else {
        log(`Se mantiene la version ${version}.`)
    }

    const kind = options.kind || defaultKind(config)
    if (!KINDS[kind]) throw new Error(`Tipo de instalador desconocido: ${kind}.`)
    if (!KINDS[kind](config)) throw new Error(kind === 'native' ? 'Falta native/build/build.mjs en la carpeta del launcher.' : 'Faltan las dependencias del launcher. Corre "npm install" en su carpeta una vez.')

    if (kind === 'native') {
        step('Construyendo el instalador nativo (tarda unos minutos)')
        // build.mjs prints "==> [n] what it is doing" for each stage: those become the job's steps, the rest is the log.
        await runNode(path.join(repo, 'native', 'build', 'build.mjs'), ['--version', version], { cwd: repo }, (line) => {
            const stage = /^==> \[\d+\]\s*(.+)$/.exec(line)
            if (stage) step(stage[1]); else log(line)
        })
    } else {
        step('Construyendo el instalador clasico (tarda unos minutos)')
        await runNode(path.join(repo, 'node_modules', 'electron-builder', 'cli.js'), ['build', '-w', '--publish', 'never'], {
            cwd: repo,
            env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
        }, log)
    }

    step('Comprobando el instalador')
    const build = readBuild(config, version)
    if (!build) throw new Error('La compilacion termino pero no encuentro el instalador de esa version.')
    log(`Instalador listo: ${path.basename(build.exe)} (${(build.size / MB).toFixed(0)} MB)`)

    saveState({ launcherBuild: { version, kind, at: new Date().toISOString(), notes: options.notes || '' } })
    return { version, kind }
}

async function send(config, options, log, step) {
    const repo = config.launcherRepoPath
    const state = loadState().launcherBuild
    if (!state) throw new Error('Primero pulsa "Compilar".')
    const build = readBuild(config, state.version)
    if (!build) throw new Error('No encuentro el instalador compilado. Vuelve a pulsar "Compilar".')
    if (readPackage(config).version !== state.version) throw new Error('La versión cambió después de compilar. Vuelve a pulsar "Compilar".')

    const tag = `v${state.version}`
    const notes = (options.notes != null ? options.notes : state.notes) || ''

    step('Subiendo el codigo a GitHub')
    await git.addAll(repo, log)
    if ((await git.changes(repo)).length > 0) await git.commit(repo, `Release ${tag}`, log)
    await git.push(repo, log)
    const branch = await capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo })

    step('Publicando el Release')
    // The installer is renamed to what latest.yml promises, otherwise auto-update can't find it.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-launcher-'))
    try {
        const files = [
            [build.exe, build.assetName],
            [`${build.exe}.blockmap`, `${build.assetName}.blockmap`],
            [build.yml, 'latest.yml']
        ].map(([source, name]) => {
            const staged = path.join(staging, name)
            try { fs.linkSync(source, staged) } catch { fs.copyFileSync(source, staged) }
            return staged
        })

        if (await gh.releaseExists(config.launcherGithubRepo, tag)) {
            log(`El release ${tag} ya existia, lo actualizo.`)
            await gh.uploadAssets(config.launcherGithubRepo, tag, files, log)
            await gh.editRelease(config.launcherGithubRepo, tag, { title: tag, notes, draft: false }, log)
        } else {
            await gh.createRelease(config.launcherGithubRepo, tag, tag, notes, log, files, branch)
        }
    } finally {
        fs.rmSync(staging, { recursive: true, force: true })
    }

    step('Comprobando que quedo publicado')
    const assets = (await gh.listAssets(config.launcherGithubRepo, tag)).map((asset) => asset.name)
    for (const name of [build.assetName, `${build.assetName}.blockmap`, 'latest.yml']) {
        if (!assets.includes(name)) throw new Error(`En GitHub falta ${name}. Vuelve a pulsar "Enviar".`)
    }

    // Old installers pile up ~100 MB each; only the one just released is worth keeping.
    const dist = path.dirname(build.exe)
    for (const name of fs.readdirSync(dist)) {
        if (/^Empi[ -]Launcher-setup-.*\.exe(\.blockmap)?$/.test(name) && !name.startsWith(path.basename(build.exe))) {
            fs.rmSync(path.join(dist, name), { force: true })
        }
    }

    saveState({ launcherBuild: { ...state, sentAt: new Date().toISOString() }, lastSentKind: state.kind || 'classic' })
    log(`Publicado: https://github.com/${config.launcherGithubRepo}/releases/tag/${tag}`)
    return { version: state.version, url: `https://github.com/${config.launcherGithubRepo}/releases/tag/${tag}` }
}

module.exports = { info, compile, send, bump, readBuild }
