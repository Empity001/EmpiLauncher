// Builds the native Empi Launcher installer, the same three files the classic build produced (installer, .blockmap, latest.yml),
// so the classic launcher's auto-update can pick it up and replace itself with this one.
//
//   node native/build/build.mjs [--version 3.0.0] [--out <folder>] [--stage-only] [--test-id <guid>]
//
// What goes into the installer (all under one folder, "stage"):
//   Empi Launcher.exe + .NET      the WPF interface (self-contained: no runtime to install)
//   engine/, app/assets/js/       the headless engine and the classic modules it reuses
//   node_modules/                 only what those modules require (walked from their require() calls)
//   runtime/                      Electron, once: it runs the engine (ELECTRON_RUN_AS_NODE) and shows the Microsoft sign-in window
//   libraries/                    what the classic launcher shipped as extra resources
//
// Output (default <repo>/dist):  Empi-Launcher-setup-<v>.exe, <same>.blockmap, latest.yml  (dashes, not spaces: what GitHub serves)
// --test-id builds an installer with another registry identity, so it can be tried without touching a real installation.
import { spawn, spawnSync } from 'node:child_process'
import { builtinModules } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const MB = 1024 * 1024
const APP_GUID = '92d6aedd-bdac-570e-bceb-809ff607ae5b'   // the classic launcher's uninstall key (derived from its appId): one entry in "Apps" before and after

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback }

const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const version = value('version', pkg.version)
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`The version must look like 3.0.0 (got "${version}").`)
const out = path.resolve(value('out', path.join(repo, 'dist')))
const stage = path.join(out, 'native-stage')
const guid = value('test-id', APP_GUID)
const started = Date.now()
let stepNumber = 0

function fail(message) { console.error(`ERROR ${message}`); process.exit(1) }
function step(text) { console.log(`==> [${++stepNumber}] ${text}`) }
const seconds = () => `${((Date.now() - started) / 1000).toFixed(0)} s`

function run(command, commandArgs, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        const forward = (chunk) => { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) console.log(`    ${line}`) }
        child.stdout.on('data', forward)
        child.stderr.on('data', forward)
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(command)} ended with code ${code}`))))
    })
}

/**
 * The bundled Electron has to be able to open the Microsoft window: a runtime pruned too far starts and dies at once, and the
 * launcher cannot tell that from "the player closed it". So the build opens the helper for real (its window exists for a second and a
 * half) and refuses to go on if it does not stay up. The helper prints {"type":"started"} once its window exists.
 */
async function checkSignInWindow(stageDir) {
    const electron = path.join(stageDir, 'runtime', 'electron.exe')
    const helper = path.join(stageDir, 'engine', 'auth-helper')
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-signin-check-'))
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electron, [helper, '--login', `--user-data-dir=${profile}`, '--client-id', 'build-check'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let exited = null
    child.stdout.on('data', (chunk) => { out += chunk })
    child.on('exit', (code) => { exited = code ?? 'signal' })
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    for (const deadline = Date.now() + 15000; Date.now() < deadline && !out.includes('"started"') && exited === null;) await sleep(100)
    const started = out.includes('"started"')
    if (started) await sleep(1500)
    const alive = exited === null
    if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    await sleep(300)
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    if (!started || !alive) fail(`El Electron empaquetado no llega a abrir la ventana de inicio de sesion (${started ? 'se cerro solo' : exited === null ? 'no arranco en 15 s' : `salio con ${exited} sin abrirla`}). Sin ella el launcher no podria anadir ni cerrar cuentas de Microsoft.`)
    console.log('    la ventana se abre y se mantiene')
}

function findDotnet() {
    if (process.env.DOTNET) return process.env.DOTNET
    const user = path.join(os.homedir(), '.dotnet', 'dotnet.exe')
    if (fs.existsSync(user)) return user
    const system = 'C:\\Program Files\\dotnet\\dotnet.exe'
    const probe = spawnSync(fs.existsSync(system) ? system : 'dotnet', ['--list-sdks'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim()) return fs.existsSync(system) ? system : 'dotnet'
    return fail('The .NET SDK was not found (set DOTNET to dotnet.exe).')
}

function findMakensis() {
    if (process.env.MAKENSIS && fs.existsSync(process.env.MAKENSIS)) return process.env.MAKENSIS
    // electron-builder downloads NSIS the first time it builds an installer; the Publisher's classic build already did.
    const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'nsis')
    if (fs.existsSync(cache)) {
        for (const dir of fs.readdirSync(cache).filter((d) => d.startsWith('nsis-3')).sort().reverse()) {
            const candidate = path.join(cache, dir, 'makensis.exe')
            if (fs.existsSync(candidate)) return candidate
        }
    }
    return fail('makensis.exe was not found. Build the classic installer once (npm run dist:win) so electron-builder downloads NSIS, or set MAKENSIS.')
}

const SKIP_FILE = /\.(map|md|markdown|tsbuildinfo)$|\.d\.[cm]?ts$/i

function copyTree(from, to, { skip = () => false } = {}) {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name)
        if (skip(source, entry)) continue
        const target = path.join(to, entry.name)
        if (entry.isDirectory()) copyTree(source, target, { skip })
        else if (entry.isFile()) fs.copyFileSync(source, target)
    }
}

/** External packages the engine and the classic modules it loads actually require (electron and @electron/remote are the shim's). */
function requiredPackages() {
    const found = new Set()
    const builtin = new Set(builtinModules.concat(builtinModules.map((m) => `node:${m}`)))
    const scan = (dir, recurse) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) { if (recurse && entry.name !== 'node_modules') scan(full, recurse); continue }
            if (!entry.name.endsWith('.js')) continue
            for (const match of fs.readFileSync(full, 'utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
                const spec = match[1]
                if (spec.startsWith('.') || builtin.has(spec) || spec === 'electron' || spec === '@electron/remote') continue
                const parts = spec.split('/')
                found.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
            }
        }
    }
    scan(path.join(repo, 'engine', 'src'), true)
    scan(path.join(repo, 'engine', 'auth-helper'), false)
    scan(path.join(repo, 'app', 'assets', 'js'), false)   // the launcher's own modules; scripts/ is the classic renderer and stays out
    return [...found].sort()
}

/** Every package those need, at runtime: dependencies and the optional ones that are installed (sharp's platform binaries). */
function dependencyClosure(roots) {
    const packages = new Map()   // real directory -> package.json
    const locate = (name, fromDir) => {
        for (let dir = fromDir; ; dir = path.dirname(dir)) {
            const candidate = path.join(dir, 'node_modules', name)
            if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
            if (dir === path.dirname(dir)) return null
        }
    }
    const visit = (name, fromDir, optional) => {
        const dir = locate(name, fromDir)
        if (!dir) { if (!optional) fail(`Dependency "${name}" is not installed (needed from ${fromDir}). Run npm install.`); return }
        if (packages.has(dir)) return
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        packages.set(dir, manifest)
        for (const dep of Object.keys(manifest.dependencies || {})) visit(dep, dir, false)
        for (const dep of Object.keys(manifest.optionalDependencies || {})) visit(dep, dir, true)
    }
    for (const root of roots) visit(root, repo, false)
    return packages
}

async function main() {
    console.log(`Empi Launcher ${version}  (native build)  ->  ${out}`)

    step('Preparando la carpeta de trabajo')
    fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    fs.mkdirSync(stage, { recursive: true })
    // A build that dies half way must not leave the previous latest.yml (or blockmap) looking like the result of this one.
    fs.mkdirSync(out, { recursive: true })
    for (const stale of ['latest.yml', `Empi-Launcher-setup-${version}.exe`, `Empi-Launcher-setup-${version}.exe.blockmap`]) fs.rmSync(path.join(out, stale), { force: true })

    step('Compilando la interfaz WPF (autocontenida)')
    const dotnet = findDotnet()
    const project = path.join(repo, 'native', 'src', 'EmpiLauncher.App', 'EmpiLauncher.App.csproj')
    await run(dotnet, ['publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', stage,
        `-p:Version=${version}`, `-p:InformationalVersion=${version}`, '-p:DebugType=none', '-p:DebugSymbols=false',
        '-p:SatelliteResourceLanguages=en', '-nologo', '-v:minimal'], { env: { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } })
    // Same file name the classic launcher had, so shortcuts and taskbar pins made for it keep pointing at the launcher.
    fs.renameSync(path.join(stage, 'EmpiLauncher.App.exe'), path.join(stage, 'Empi Launcher.exe'))

    step('Copiando el motor y los modulos del launcher')
    copyTree(path.join(repo, 'engine', 'src'), path.join(stage, 'engine', 'src'))
    copyTree(path.join(repo, 'engine', 'auth-helper'), path.join(stage, 'engine', 'auth-helper'))
    const jsDir = path.join(repo, 'app', 'assets', 'js')
    fs.mkdirSync(path.join(stage, 'app', 'assets', 'js'), { recursive: true })
    for (const file of fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'))) fs.copyFileSync(path.join(jsDir, file), path.join(stage, 'app', 'assets', 'js', file))
    if (fs.existsSync(path.join(repo, 'app', 'assets', 'lang'))) copyTree(path.join(repo, 'app', 'assets', 'lang'), path.join(stage, 'app', 'assets', 'lang'))
    if (fs.existsSync(path.join(repo, 'libraries'))) copyTree(path.join(repo, 'libraries'), path.join(stage, 'libraries'))
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'empilauncher', productName: 'Empi Launcher', version, private: true, description: pkg.description }, null, 2))

    step('Copiando solo los paquetes que hacen falta')
    const roots = requiredPackages()
    console.log(`    roots: ${roots.join(', ')}`)
    const closure = dependencyClosure(roots)
    const modulesRoot = path.join(repo, 'node_modules')
    for (const dir of closure.keys()) {
        const relative = path.relative(modulesRoot, dir)
        if (relative.startsWith('..')) fail(`A dependency lives outside node_modules: ${dir}`)
        copyTree(dir, path.join(stage, 'node_modules', relative), { skip: (source, entry) => (entry.isDirectory() ? entry.name === 'node_modules' : SKIP_FILE.test(entry.name)) })
    }
    console.log(`    ${closure.size} packages`)

    step('Copiando Electron (motor y ventana de inicio de sesion)')
    const electronDist = path.join(repo, 'node_modules', 'electron', 'dist')
    if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) fail('node_modules/electron is missing. Run npm install.')
    // Only the languages the launcher speaks. resources/default_app.asar STAYS: without it this Electron starts and dies at once when
    // it is asked to run the sign-in helper, so adding an account or signing out "did nothing" in the installed launcher (found in
    // 3.3.0; the development launcher runs the full Electron from node_modules, which is why it never showed there).
    const keepLocales = new Set(['en-US.pak', 'es.pak', 'es-419.pak'])
    copyTree(electronDist, path.join(stage, 'runtime'), {
        skip: (source, entry) => entry.isFile() && path.basename(path.dirname(source)) === 'locales' && !keepLocales.has(entry.name)
    })

    step('Comprobando que la ventana de inicio de sesion abre con el Electron empaquetado')
    await checkSignInWindow(stage)

    const size = (dir) => { let total = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); total += e.isDirectory() ? size(p) : fs.statSync(p).size } return total }
    const stageBytes = size(stage)
    console.log(`    staged: ${(stageBytes / MB).toFixed(0)} MB (${seconds()})`)
    if (flag('stage-only')) { console.log(`Stage ready: ${stage}`); return }

    step('Creando el instalador (NSIS, comprime unos minutos)')
    const installerName = `Empi-Launcher-setup-${version}.exe`
    const installer = path.join(out, installerName)
    fs.mkdirSync(out, { recursive: true })
    fs.rmSync(installer, { force: true })
    await run(findMakensis(), ['/V2', `/DVERSION=${version}`, `/DSTAGE=${stage}`, `/DOUTFILE=${installer}`, `/DAPP_GUID=${guid}`, ...(guid === APP_GUID ? [] : [`/DSHORTCUT_NAME=Empi Launcher (prueba ${guid.slice(-6)})`]),
        `/DICON=${path.join(repo, 'build', 'icon.ico')}`, `/DESTIMATED_KB=${Math.round(stageBytes / 1024)}`, path.join(here, 'installer.nsi')])
    const installerBytes = fs.statSync(installer).size
    console.log(`    ${installerName}: ${(installerBytes / MB).toFixed(0)} MB (${seconds()})`)

    step('Escribiendo el blockmap y latest.yml')
    const appBuilder = path.join(repo, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe')
    if (!fs.existsSync(appBuilder)) fail('app-builder-bin is missing (npm install). It writes the .blockmap electron-updater looks for.')
    await run(appBuilder, ['blockmap', '--input', installer, '--output', `${installer}.blockmap`])
    const sha512 = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64')
    const yml = [
        `version: ${version}`,
        'files:',
        `  - url: ${installerName}`,
        `    sha512: ${sha512}`,
        `    size: ${installerBytes}`,
        `path: ${installerName}`,
        `sha512: ${sha512}`,
        `releaseDate: '${new Date().toISOString()}'`,
        ''
    ].join('\n')
    fs.writeFileSync(path.join(out, 'latest.yml'), yml)
    console.log(`DONE ${installerName} ${installerBytes} bytes  (${seconds()})`)
}

main().catch((err) => fail(err.message))
