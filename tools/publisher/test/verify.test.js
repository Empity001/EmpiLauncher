// node --test tools/publisher/test/*.test.js
// "Verificar publicación": a local git remote stands for GitHub, a local web server for GitHub Pages and the releases.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const http = require('http')
const path = require('path')
const { execFileSync } = require('child_process')
const { Readable } = require('stream')

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-verify-'))
process.env.EMPI_PUBLISHER_HOME = home   // before anything loads lib/config.js
const notices = require('../lib/notices')
const { verify } = require('../lib/verify')

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const remote = path.join(home, 'remote.git')
const clone = path.join(home, 'EmpiPacks')
const pages = path.join(home, 'pages')          // what "GitHub Pages" serves: a checkout of the remote, updated on demand
const launcherRepo = path.join(home, 'launcher')
const JAR = Buffer.from('12345')
const INSTALLER = Buffer.from('installer-bytes')
let missing = new Set()                          // routes that answer 404, to break things on purpose

fs.mkdirSync(remote); git(remote, 'init', '--bare', '-b', 'main')
git(home, 'clone', remote, clone)
git(clone, 'config', 'user.email', 't@example.test'); git(clone, 'config', 'user.name', 'Test')
fs.writeFileSync(path.join(clone, 'README.md'), 'hola'); git(clone, 'add', '-A'); git(clone, 'commit', '-m', 'init'); git(clone, 'push', '-u', 'origin', 'main')
fs.mkdirSync(launcherRepo); fs.writeFileSync(path.join(launcherRepo, 'package.json'), JSON.stringify({ version: '9.9.9' }))

const web = http.createServer((request, response) => {
    const route = decodeURIComponent(request.url.split('?')[0])
    const send = (bytes, type = 'application/octet-stream') => { response.setHeader('Content-Type', type); response.setHeader('Content-Length', bytes.length); response.end(request.method === 'HEAD' ? undefined : bytes) }
    if (missing.has(route)) { response.statusCode = 404; return response.end('no') }
    if (route === '/files/a.jar') return send(JAR)
    if (route === '/Installer.exe') return send(INSTALLER)
    if (route === '/latest.yml') return send(Buffer.from('version: 9.9.9\nfiles:\n  - url: Installer.exe\n    sha512: x\n    size: ' + INSTALLER.length + '\npath: Installer.exe\n'), 'text/yaml')
    const file = path.join(pages, route)
    if (file.startsWith(pages) && fs.existsSync(file) && fs.statSync(file).isFile()) return send(fs.readFileSync(file), route.endsWith('.json') ? 'application/json' : undefined)
    response.statusCode = 404; response.end('no')
})
let base
let config
const syncPages = () => { if (!fs.existsSync(pages)) git(home, 'clone', remote, pages); else git(pages, 'pull', '--ff-only', '-q') }
const run = async () => { const lines = []; try { const result = await verify(config, (l) => lines.push(l), () => {}); return { result, lines } } catch (error) { return { error, lines } } }

test.before(async () => {
    await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${web.address().port}/`
    config = { empiPacksRepoPath: clone, empiPacksRepoUrl: remote, empiPacksGithubRepo: 'Owner/Repo', launcherGithubRepo: 'Owner/Launcher', launcherRepoPath: launcherRepo, pagesBaseUrl: base, launcherLatestYmlUrl: `${base}latest.yml`, nebulaRootPath: path.join(home, 'root'), nebulaProjectPath: path.join(home, 'nebula') }
    // published: one modpack whose file is on the server, and one notice with its page
    fs.writeFileSync(path.join(clone, 'distribution.json'), JSON.stringify({ version: '1.0.0', servers: [{ id: 'P', modules: [{ id: 'x', name: 'a.jar', artifact: { size: JAR.length, url: `${base}files/a.jar` } }] }] }))
    git(clone, 'add', '-A'); git(clone, 'commit', '-m', 'modpack'); git(clone, 'push', '-u', 'origin', 'main')
    const made = notices.saveNotice(config, null, { title: 'Aviso de prueba', published: true, editor: { blocks: [] } })
    await notices.saveImage(made.id, Readable.from([WEBP]))
    await notices.publish(config, {}, () => {}, () => {})
    syncPages()
})
test.after(() => { web.close(); web.closeAllConnections?.(); fs.rmSync(home, { recursive: true, force: true }) })

test('when everything published is where it should be, it says so', async () => {
    const { result, error, lines } = await run()
    assert.ok(result && !error, `${error && error.message}\n${lines.join('\n')}`)
    assert.ok(lines.some((l) => /avisos\.json abre y el launcher lo acepta/.test(l)))
    assert.ok(lines.some((l) => /La página del aviso «Aviso de prueba» abre/.test(l)))
    assert.ok(lines.some((l) => /Los 1 archivos de los modpacks están/.test(l)))
    assert.ok(lines.some((l) => /instalador abre/.test(l)))
})

test('a page of a notice that does not open is a problem, and it names the notice', async () => {
    const page = fs.readdirSync(path.join(pages, 'avisos'))[0]
    missing = new Set([`/avisos/${page}`])
    const { error } = await run()
    missing = new Set()
    assert.ok(error && /La página del aviso «Aviso de prueba» no abre/.test(error.message), error && error.message)
})

test('a modpack file that is missing is a problem', async () => {
    missing = new Set(['/files/a.jar'])
    const { error } = await run()
    missing = new Set()
    assert.ok(error && /Falta o está mal: a\.jar/.test(error.message), error && error.message)
})

test('what was saved but not sent is a problem', async () => {
    fs.writeFileSync(path.join(clone, 'nota.txt'), 'x'); git(clone, 'add', '-A'); git(clone, 'commit', '-m', 'sin subir')
    const { error } = await run()
    assert.ok(error && /todavía no están en GitHub/.test(error.message), error && error.message)
    git(clone, 'push', '-u', 'origin', 'main')
})

test('Pages still showing the old file right after a push is only a matter of waiting, not an error', async () => {
    // a new avisos.json is pushed, but "Pages" (the checkout it serves) has not caught up
    const state = notices.readState()
    notices.saveNotice(config, state.notices[0].id, { ...state.notices[0], title: 'Otro título', published: true })
    await notices.publish(config, {}, () => {}, () => {})
    const { result, error, lines } = await run()
    assert.ok(result && !error, `${error && error.message}\n${lines.join('\n')}`)
    assert.ok(lines.some((l) => /^! GitHub Pages todavía muestra un avisos\.json anterior/.test(l)), lines.join('\n'))
})
