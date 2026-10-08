const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { capture, runNode } = require('./exec')
const git = require('./git')
const gh = require('./gh')
const { loadState, saveState } = require('./config')
const styles = require('./styles')

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
function readBuild(config, expectedVersion, kind) {
    const dist = path.join(config.launcherRepoPath, 'dist')
    const linux = kind === 'linux'
    const yml = path.join(dist, linux ? 'latest-linux.yml' : 'latest.yml')
    if (!fs.existsSync(yml)) return null
    const text = fs.readFileSync(yml, 'utf8')
    const version = (text.match(/^version:\s*(.+)$/m) || [])[1]
    const assetName = (text.match(/^path:\s*(.+)$/m) || [])[1]
    if (!version || !assetName || (expectedVersion && version.trim() !== expectedVersion)) return null

    // Locally the installer keeps its spaces ("Empi Launcher-setup-x.exe"); on GitHub they become dashes.
    const local = fs.readdirSync(dist).find((name) => name.replace(/ /g, '-') === assetName.trim())
    if (!local) return null
    const exe = path.join(dist, local)
    if (!linux && !fs.existsSync(`${exe}.blockmap`)) return null   // the Linux package has no installer block map
    return { version: version.trim(), assetName: assetName.trim(), exe, size: fs.statSync(exe).size, yml, ymlName: path.basename(yml), kind: kind || 'classic' }
}

/**
 * Two ways to build the installer, both ending in the same three files (installer, .blockmap, latest.yml):
 *   native   the WPF launcher: native/build/build.mjs (dotnet publish + engine + Electron runtime + NSIS)
 *   classic  the Electron launcher through electron-builder (kept as the way back)
 * The channel is the same latest.yml for both, so a player with the classic launcher who receives a native build
 * is updated into it: the native installer removes the classic program (native/build/installer.nsi).
 */
const hasBuilder = (config) => fs.existsSync(path.join(config.launcherRepoPath, 'node_modules', 'electron-builder', 'cli.js'))
const hasDotnet = () => spawnSync('dotnet', ['--version'], { encoding: 'utf8' }).status === 0
const hasWine = () => (process.env.PATH || '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, 'wine')))
const hasTool = (name, arg) => spawnSync(name, [arg], { encoding: 'utf8' }).status === 0
const hasBuildScript = (config, name) => fs.existsSync(path.join(config.launcherRepoPath, 'native', 'build', name))

/**
 * "Nativo" is the native launcher for every system this PC can build it for, each one a target:
 *   native  the WPF launcher for Windows (native/build/build.mjs): built on Windows, or from here with the .NET SDK, makensis and unzip (cross-build)
 *   linux   the Avalonia launcher for Linux (native/build/build-linux.mjs): built on Linux with the .NET SDK
 * One Compilar builds all the targets there are, one Enviar uploads them all to the same Release.
 */
const TARGETS = {
    native: (config) => hasBuildScript(config, 'build.mjs') && (process.platform === 'win32' || (hasDotnet() && hasTool('makensis', '-VERSION') && hasTool('unzip', '-v'))),
    linux: (config) => process.platform === 'linux' && hasBuildScript(config, 'build-linux.mjs') && hasDotnet()
}

const nativeTargets = (config) => Object.keys(TARGETS).filter((target) => TARGETS[target](config))

const KINDS = {
    native: (config) => nativeTargets(config).length > 0,
    classic: (config) => hasBuilder(config) && (process.platform === 'win32' || hasWine())
}

function availableKinds(config) {
    return Object.fromEntries(Object.entries(KINDS).map(([kind, exists]) => [kind, exists(config)]))
}

function defaultKind(config) {
    return KINDS.native(config) ? 'native' : 'classic'
}

/** What a compiled build is made of: native builds carry their targets (a build made before targets existed has just the one its kind names). */
const targetsOf = (state) => (state && state.targets) || (state && state.kind ? [state.kind] : [])

/** Every file of every target of the compiled build, or null while any of them is missing (compile again). */
function readBuilds(config, state) {
    if (!state) return null
    const builds = targetsOf(state).map((target) => readBuild(config, state.version, target))
    return builds.length > 0 && builds.every(Boolean) ? builds : null
}

async function info(config) {
    const pkg = readPackage(config)
    const state = loadState().launcherBuild || null
    const builds = readBuilds(config, state)
    let dirty = 0
    try { dirty = (await git.changes(config.launcherRepoPath)).length } catch { /* not a repo */ }
    const latestTag = await gh.latestTag(config.launcherGithubRepo)
    const kind = state && state.kind === 'linux' ? 'native' : (state && state.kind) || defaultKind(config)
    // Every release before the native one was a classic one; after the first native release it is remembered here.
    const lastSentKind = loadState().lastSentKind || (latestTag ? 'classic' : null)
    let styleList = []
    try { styleList = styles.list(config, unsentStyle(state)) } catch { /* a broken styles.json only hides Pendientes */ }
    return {
        kinds: availableKinds(config),
        targets: nativeTargets(config),
        kind,
        migrates: kind === 'native' && lastSentKind === 'classic',
        version: pkg.version,
        next: { patch: bump(pkg.version, 'patch'), minor: bump(pkg.version, 'minor'), major: bump(pkg.version, 'major') },
        latestTag,
        dirty,
        styles: styleList,
        build: builds ? { version: builds[0].version, name: builds.map((b) => path.basename(b.exe)).join(' + '), size: builds.reduce((total, b) => total + b.size, 0), at: state.at, notes: state.notes, sent: !!state.sentAt, kind: state.kind === 'linux' ? 'native' : state.kind || 'classic', targets: targetsOf(state), style: state.style || null } : null
    }
}

/** The style of a compiled installer that was not sent: it is switched on in styles.json but no player has it yet. */
function unsentStyle(build) {
    return build && !build.sentAt && build.style ? build.style : null
}

async function compile(config, options, log, step) {
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

    const kind = options.kind === 'linux' ? 'native' : options.kind || defaultKind(config)   // "linux" alone was the first way to ask for the Linux build: Nativo includes it now
    if (!KINDS[kind]) throw new Error(`Tipo de instalador desconocido: ${kind}.`)
    if (!KINDS[kind](config)) throw new Error(kind === 'native' ? 'Aqui no se puede compilar el launcher nativo: hace falta el SDK de .NET (en Linux tambien makensis y unzip para el de Windows).' : 'El instalador clasico necesita Windows (o Wine).')
    const targets = kind === 'native' ? nativeTargets(config) : [kind]

    // A style from Pendientes is switched on in styles.json BEFORE the build, so the installer carries it; one left in an unsent build goes back.
    const style = options.style ? String(options.style) : null
    const manifestFile = styles.manifestPath(config)
    const manifestBefore = fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile, 'utf8') : null
    styles.prepare(config, { style, version, unsentStyle: unsentStyle(loadState().launcherBuild), kind }, log)
    try {
        for (const target of targets) {
            await build(config, target, version, log, step)
            step('Comprobando el instalador')
            const built = readBuild(config, version, target)
            if (!built) throw new Error(`La compilacion de ${target === 'linux' ? 'Linux' : 'Windows'} termino pero no encuentro su instalador de esa version.`)
            log(`Instalador listo: ${path.basename(built.exe)} (${(built.size / MB).toFixed(0)} MB)`)
        }
        if (kind === 'native' && !targets.includes('native')) log('Ojo: este equipo no puede compilar el de Windows, asi que esta version sale solo para Linux; el de Windows se agrega compilando de nuevo en Windows.')
        if (kind === 'native' && !targets.includes('linux')) log('Ojo: este equipo no puede compilar el de Linux, asi que esta version sale solo para Windows; el de Linux se agrega compilando de nuevo en Linux.')
    } catch (err) {
        // no installer came out: styles.json goes back to how it was, so a failed build never leaves a style switched on
        if (manifestBefore != null) fs.writeFileSync(manifestFile, manifestBefore, 'utf8')
        throw err
    }

    saveState({ launcherBuild: { version, kind, targets, at: new Date().toISOString(), notes: options.notes || '', style } })
    return { version, kind, targets, style }
}

async function build(config, kind, version, log, step) {
    const repo = config.launcherRepoPath
    if (kind === 'native') {
        step('Construyendo el instalador nativo (tarda unos minutos)')
        // build.mjs prints "==> [n] what it is doing" for each stage: those become the job's steps, the rest is the log.
        await runNode(path.join(repo, 'native', 'build', 'build.mjs'), ['--version', version], { cwd: repo }, (line) => {
            const stage = /^==> \[\d+\]\s*(.+)$/.exec(line)
            if (stage) step(stage[1]); else log(line)
        })
    } else if (kind === 'linux') {
        step('Construyendo el launcher de Linux (tarda un par de minutos)')
        await runNode(path.join(repo, 'native', 'build', 'build-linux.mjs'), ['--version', version], { cwd: repo }, (line) => {
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
}

async function send(config, options, log, step) {
    const repo = config.launcherRepoPath
    const state = loadState().launcherBuild
    if (!state) throw new Error('Primero pulsa "Compilar".')
    const builds = readBuilds(config, state)
    if (!builds) throw new Error('No encuentro el instalador compilado. Vuelve a pulsar "Compilar".')
    if (readPackage(config).version !== state.version) throw new Error('La versión cambió después de compilar. Vuelve a pulsar "Compilar".')
    const windowsBuild = builds.some((b) => b.kind !== 'linux')

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
        const files = builds.flatMap((build) => [
            [build.exe, build.assetName],
            ...(build.kind === 'linux' ? [] : [[`${build.exe}.blockmap`, `${build.assetName}.blockmap`]]),
            [build.yml, build.ymlName]
        ]).map(([source, name]) => {
            const staged = path.join(staging, name)
            try { fs.linkSync(source, staged) } catch { fs.copyFileSync(source, staged) }
            return staged
        })

        if (await gh.releaseExists(config.launcherGithubRepo, tag)) {
            log(`El release ${tag} ya existia, lo actualizo.`)
            await gh.uploadAssets(config.launcherGithubRepo, tag, files, log)
            // the Windows build of a version that Linux published first is the one that makes it "the latest": that is what Windows launchers read
            await gh.editRelease(config.launcherGithubRepo, tag, { title: tag, notes, draft: false, ...(windowsBuild ? { latest: true } : {}) }, log)
        } else if (!windowsBuild) {
            // a Release made only of Linux files must NOT become the "latest" one: Windows launchers read latest.yml from there. Linux launchers look through the recent Releases.
            log(`El Release ${tag} no existe: lo creo solo con los archivos de Linux, sin marcarlo como el ultimo (los launchers de Windows siguen con el suyo).`)
            await gh.createRelease(config.launcherGithubRepo, tag, tag, notes, log, files, branch, { latest: false })
        } else {
            await gh.createRelease(config.launcherGithubRepo, tag, tag, notes, log, files, branch)
        }
    } finally {
        fs.rmSync(staging, { recursive: true, force: true })
    }

    step('Comprobando que quedo publicado')
    const assets = (await gh.listAssets(config.launcherGithubRepo, tag)).map((asset) => asset.name)
    for (const build of builds) {
        for (const name of [build.assetName, ...(build.kind === 'linux' ? [] : [`${build.assetName}.blockmap`]), build.ymlName]) {
            if (!assets.includes(name)) throw new Error(`En GitHub falta ${name}. Vuelve a pulsar "Enviar".`)
        }
    }

    // What players' launchers read is the "latest release" copy of latest.yml. It is normally live right away; if GitHub still serves
    // the old one this says so instead of leaving a silent "published" that nobody is offered yet.
    if (windowsBuild) try {
        const response = await fetch(`https://github.com/${config.launcherGithubRepo}/releases/latest/download/latest.yml`, { headers: { 'User-Agent': 'EmpiPublisher' }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
        const served = response.ok ? (/^version:\s*(.+)$/m.exec(await response.text()) || [])[1] : null
        if (served && served.trim() === state.version) log(`Los launchers ya ven la version ${state.version} como la ultima.`)
        else log(`Aviso: GitHub todavia sirve ${served ? `la version ${served.trim()}` : 'otra cosa'} como ultima. Suele arreglarse en unos minutos; comprueba que el release no sea un borrador ni una prueba.`)
    } catch (err) {
        log(`No pude comprobar el canal de actualizacion (${err.message}); el release si se subio.`)
    }

    // Old installers pile up ~100 MB each; only the one just released is worth keeping.
    const dist = path.dirname(builds[0].exe)
    for (const name of fs.readdirSync(dist)) {
        if (/^Empi[ -]Launcher-(setup-.*\.exe(\.blockmap)?|[\d.]+-linux-x64\.tar\.gz)$/.test(name) && !builds.some((b) => name.startsWith(path.basename(b.exe)))) {
            fs.rmSync(path.join(dist, name), { force: true })
        }
    }

    saveState({ launcherBuild: { ...state, sentAt: new Date().toISOString() }, lastSentKind: windowsBuild ? (state.kind === 'linux' ? 'native' : state.kind || 'classic') : (loadState().lastSentKind || null) })
    log(`Publicado: https://github.com/${config.launcherGithubRepo}/releases/tag/${tag}`)
    return { version: state.version, url: `https://github.com/${config.launcherGithubRepo}/releases/tag/${tag}` }
}

module.exports = { info, compile, send, bump, readBuild }
