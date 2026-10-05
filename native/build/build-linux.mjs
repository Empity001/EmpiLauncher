// Builds the Linux package of the native launcher: one tar.gz of the whole program and latest-linux.yml (what the launcher's own update reads).
//
//   node native/build/build-linux.mjs [--version 3.9.0] [--out <folder>] [--stage-only]
//
// What goes into the package (all under one folder, "stage", which is the root of the tar):
//   EmpiLauncher                  the Avalonia interface (self-contained .NET: no runtime to install)
//   engine/, app/assets/js/       the headless engine and the classic modules it reuses
//   node_modules/                 only what those modules require
//   runtime-node/node             the official Node.js: it runs the engine (sharp, the image library, crashes inside Electron-as-node on Linux)
//   runtime/electron              Electron: only the Microsoft sign-in window
//   libraries/, assets            what the classic launcher shipped, the icon
//   .empi-install                 marks this folder as an installation the launcher may replace when it updates itself
//
// Output (default <repo>/dist):  Empi-Launcher-<v>-linux-x64.tar.gz, latest-linux.yml
//
// The Windows build (build.mjs) and this one share the staging idea; the Windows-only parts (NSIS, taskkill, .exe) are not here.
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

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback }

const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
const version = value('version', pkg.version)
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`The version must look like 3.9.0 (got "${version}").`)
const out = path.resolve(value('out', path.join(repo, 'dist')))
const stage = path.join(out, 'linux-stage')
const started = Date.now()
let stepNumber = 0

function fail(message) { console.error(`ERROR ${message}`); process.exit(1) }
function step(text) { console.log(`==> [${++stepNumber}] ${text}`) }
const seconds = () => `${((Date.now() - started) / 1000).toFixed(0)} s`

function run(command, commandArgs, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] })
        const forward = (chunk) => { for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) console.log(`    ${line}`) }
        child.stdout.on('data', forward)
        child.stderr.on('data', forward)
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(command)} ended with code ${code}`))))
    })
}

/**
 * The bundled Electron has to be able to open the Microsoft window: a runtime pruned too far starts and dies at once, and the launcher
 * cannot tell that from "the player closed it". So the build opens the helper for real and refuses to go on if it does not stay up.
 */
async function checkSignInWindow(stageDir) {
    const electron = path.join(stageDir, 'runtime', 'electron')
    const helper = path.join(stageDir, 'engine', 'auth-helper')
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-signin-check-'))
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electron, [helper, '--login', `--user-data-dir=${profile}`, '--client-id', 'build-check'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let output = ''
    let exited = null
    child.stdout.on('data', (chunk) => { output += chunk })
    child.on('exit', (code) => { exited = code ?? 'signal' })
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    for (const deadline = Date.now() + 20000; Date.now() < deadline && !output.includes('"started"') && exited === null;) await sleep(100)
    const started = output.includes('"started"')
    if (started) await sleep(1500)
    const alive = exited === null
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
    await sleep(400)
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    if (!started || !alive) fail(`El Electron empaquetado no llega a abrir la ventana de inicio de sesion (${started ? 'se cerro solo' : exited === null ? 'no arranco en 20 s' : `salio con ${exited} sin abrirla`}).`)
    console.log('    la ventana se abre y se mantiene')
}

function findDotnet() {
    if (process.env.DOTNET) return process.env.DOTNET
    const probe = spawnSync('dotnet', ['--list-sdks'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim()) return 'dotnet'
    return fail('The .NET SDK was not found (install it, for example "brew install dotnet", or set DOTNET).')
}

const SKIP_FILE = /\.(map|md|markdown|tsbuildinfo)$|\.d\.[cm]?ts$/i

function copyTree(from, to, { skip = () => false } = {}) {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name)
        if (skip(source, entry)) continue
        const target = path.join(to, entry.name)
        if (entry.isDirectory()) copyTree(source, target, { skip })
        else if (entry.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(source), target) } catch { /* a dangling link is not needed */ } }
        else if (entry.isFile()) { fs.copyFileSync(source, target); fs.chmodSync(target, fs.statSync(source).mode) }
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
    scan(path.join(repo, 'app', 'assets', 'js'), false)
    return [...found].sort()
}

/** Every package those need, at runtime: dependencies and the optional ones that are installed (sharp's platform binaries). */
function dependencyClosure(roots) {
    const packages = new Map()
    const locate = (name, fromDir) => {
        for (let dir = fromDir; ; dir = path.dirname(dir)) {
            const candidate = path.join(dir, 'node_modules', name)
            if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
            if (dir === path.dirname(dir)) return null
        }
    }
    const visit = (name, fromDir, optional) => {
        const dir = locate(name, fromDir)
        if (!dir) { if (!optional) fail(`Dependency "${name}" is not installed (needed from ${fromDir}). Run npm ci.`); return }
        if (packages.has(dir)) return
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        packages.set(dir, manifest)
        for (const dep of Object.keys(manifest.dependencies || {})) visit(dep, dir, false)
        for (const dep of Object.keys(manifest.optionalDependencies || {})) visit(dep, dir, true)
    }
    for (const root of roots) visit(root, repo, false)
    return packages
}

/** The official Node.js (the same major as Electron's), downloaded once and checked against nodejs.org's SHASUMS256.txt; only bin/node is kept. */
async function fetchNode() {
    const cache = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'empi-build')
    fs.mkdirSync(cache, { recursive: true })
    const major = 22
    const base = `https://nodejs.org/dist/latest-v${major}.x/`
    const sums = await (await fetch(`${base}SHASUMS256.txt`)).text()
    const line = sums.split('\n').find((l) => /node-v[\d.]+-linux-x64\.tar\.xz$/.test(l))
    if (!line) fail('No encontre el Node de Linux en nodejs.org.')
    const [sha, name] = line.trim().split(/\s+/)
    const archive = path.join(cache, name)
    const good = () => fs.existsSync(archive) && crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') === sha
    if (!good()) {
        console.log(`    bajando ${name}`)
        fs.writeFileSync(archive, Buffer.from(await (await fetch(base + name)).arrayBuffer()))
        if (!good()) fail('El Node descargado no coincide con su huella sha256.')
    }
    return { archive, name: name.replace(/\.tar\.xz$/, '') }
}

async function main() {
    console.log(`Empi Launcher ${version}  (native Linux build)  ->  ${out}`)
    const archiveName = `Empi-Launcher-${version}-linux-x64.tar.gz`

    step('Preparando la carpeta de trabajo')
    fs.rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    fs.mkdirSync(stage, { recursive: true })
    fs.mkdirSync(out, { recursive: true })
    for (const stale of ['latest-linux.yml', archiveName]) fs.rmSync(path.join(out, stale), { force: true })

    step('Compilando la interfaz Avalonia (autocontenida)')
    const project = path.join(repo, 'native', 'src', 'EmpiLauncher.Linux', 'EmpiLauncher.Linux.csproj')
    await run(findDotnet(), ['publish', project, '-c', 'Release', '-r', 'linux-x64', '--self-contained', 'true', '-o', stage,
        `-p:Version=${version}`, `-p:InformationalVersion=${version}`, '-p:DebugType=none', '-p:DebugSymbols=false',
        '-p:SatelliteResourceLanguages=en', '-nologo', '-v:minimal'], { env: { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } })
    if (!fs.existsSync(path.join(stage, 'EmpiLauncher'))) fail('dotnet publish did not produce the EmpiLauncher program.')
    fs.chmodSync(path.join(stage, 'EmpiLauncher'), 0o755)

    step('Copiando el motor y los modulos del launcher')
    copyTree(path.join(repo, 'engine', 'src'), path.join(stage, 'engine', 'src'))
    copyTree(path.join(repo, 'engine', 'auth-helper'), path.join(stage, 'engine', 'auth-helper'))
    const jsDir = path.join(repo, 'app', 'assets', 'js')
    fs.mkdirSync(path.join(stage, 'app', 'assets', 'js'), { recursive: true })
    for (const file of fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'))) fs.copyFileSync(path.join(jsDir, file), path.join(stage, 'app', 'assets', 'js', file))
    if (fs.existsSync(path.join(repo, 'app', 'assets', 'lang'))) copyTree(path.join(repo, 'app', 'assets', 'lang'), path.join(stage, 'app', 'assets', 'lang'))
    if (fs.existsSync(path.join(repo, 'libraries'))) copyTree(path.join(repo, 'libraries'), path.join(stage, 'libraries'))
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'empilauncher', productName: 'Empi Launcher', version, private: true, description: pkg.description }, null, 2))
    fs.copyFileSync(path.join(repo, 'build', 'icon.png'), path.join(stage, 'empi-launcher.png'))
    fs.writeFileSync(path.join(stage, '.empi-install'), `${version}\n`)
    fs.copyFileSync(path.join(here, 'linux', 'instalar.sh'), path.join(stage, 'instalar.sh'))
    fs.chmodSync(path.join(stage, 'instalar.sh'), 0o755)

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
    if (!fs.existsSync(path.join(electronDist, 'electron'))) fail('node_modules/electron is missing. Run npm ci and node node_modules/electron/install.js.')
    // Only the languages the launcher speaks; resources/default_app.asar STAYS (without it Electron dies at once when it is asked to run the helper).
    const keepLocales = new Set(['en-US.pak', 'es.pak', 'es-419.pak'])
    copyTree(electronDist, path.join(stage, 'runtime'), {
        skip: (source, entry) => entry.isFile() && path.basename(path.dirname(source)) === 'locales' && !keepLocales.has(entry.name)
    })

    step('Copiando Node (motor)')
    const node = await fetchNode()
    fs.mkdirSync(path.join(stage, 'runtime-node'), { recursive: true })
    await run('tar', ['-xJf', node.archive, '-C', path.join(stage, 'runtime-node'), '--strip-components=2', `${node.name}/bin/node`])
    fs.chmodSync(path.join(stage, 'runtime-node', 'node'), 0o755)
    // the engine's image library must load and work with exactly this Node (it did not inside Electron on Linux)
    await run(path.join(stage, 'runtime-node', 'node'), ['-e', "require('sharp')({ create: { width: 8, height: 8, channels: 3, background: 'red' } }).png().toBuffer().then((b) => { if (!b.length) process.exit(1) })"], { cwd: stage })
    console.log('    sharp funciona con este Node')

    step('Comprobando que la ventana de inicio de sesion abre con el Electron empaquetado')
    await checkSignInWindow(stage)

    const size = (dir) => { let total = 0; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); total += e.isDirectory() ? size(p) : fs.lstatSync(p).size } return total }
    console.log(`    staged: ${(size(stage) / MB).toFixed(0)} MB (${seconds()})`)
    if (flag('stage-only')) { console.log(`Stage ready: ${stage}`); return }

    step('Empaquetando (tar.gz)')
    const archive = path.join(out, archiveName)
    await run('tar', ['-czf', archive, '-C', stage, '.'])
    const bytes = fs.statSync(archive).size
    console.log(`    ${archiveName}: ${(bytes / MB).toFixed(0)} MB (${seconds()})`)

    step('Escribiendo latest-linux.yml')
    const sha512 = crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64')
    fs.writeFileSync(path.join(out, 'latest-linux.yml'), [
        `version: ${version}`,
        'files:',
        `  - url: ${archiveName}`,
        `    sha512: ${sha512}`,
        `    size: ${bytes}`,
        `path: ${archiveName}`,
        `sha512: ${sha512}`,
        `releaseDate: '${new Date().toISOString()}'`,
        ''
    ].join('\n'))
    console.log(`DONE ${archiveName} ${bytes} bytes  (${seconds()})`)
}

main().catch((err) => fail(err.message))
