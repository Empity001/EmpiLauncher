/**
 * "Verificar publicación": is what you published really what players get? Sending is one thing (git push worked), being served is another:
 * GitHub Pages can lag, a file can be missing, an upload can be cut short. Nothing is changed here; it only looks, and says in words.
 *
 *   1. what is saved on this PC but not sent
 *   2. distribution.json on GitHub Pages is the one that was pushed
 *   3. avisos.json on GitHub Pages is the one that was pushed, the launcher accepts it, and every page it names opens
 *   4. every file the modpacks name is there, with its size
 *   5. the launcher's latest release: its update file and its installer are there
 *
 * Marks: ✔ fine, ! could not be told or is only a matter of waiting, ✘ wrong (the job ends in error, listing them).
 */
const fs = require('fs')
const path = require('path')
const git = require('./git')
const { checkLinks } = require('./links')

const RECENT = 15 * 60   // seconds: a push this recent explains a Pages that still shows the old file
const CHECK = { concurrency: 8, limit: 3000 }

/** https://<owner>.github.io/<repo>/ for "Owner/Repo" (tests point it at a local server). */
function pagesBase(config) {
    if (config.pagesBaseUrl) return config.pagesBaseUrl.replace(/\/?$/, '/')
    const [owner, repo] = String(config.empiPacksGithubRepo || '').split('/')
    return `https://${owner.toLowerCase()}.github.io/${repo}/`
}

async function getText(fetchImpl, url) {
    const response = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}_empi=${Date.now()}`, { cache: 'no-store', headers: { 'User-Agent': 'EmpiPublisher' }, signal: AbortSignal.timeout(15000) })
    return { status: response.status, text: response.status === 200 ? await response.text() : '' }
}

/** Does this file open, and is it the size it should be? (HEAD; some servers only answer GET.) */
async function fileStatus(fetchImpl, url, expectedSize) {
    const attempt = async (method) => {
        // identity: the size of the file itself; a server that compresses text answers with the compressed size, which is not the file's
        const response = await fetchImpl(url, { method, redirect: 'follow', headers: { 'User-Agent': 'EmpiPublisher', 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(20000) })
        const compressed = !!response.headers.get('content-encoding')
        const length = compressed ? 0 : Number(response.headers.get('content-length')) || 0
        if (method === 'GET') { try { await response.body?.cancel() } catch { /* nothing to read */ } }
        return { status: response.status, length }
    }
    try {
        let got = await attempt('HEAD')
        if (got.status === 405 || got.status === 403) got = await attempt('GET')
        if (got.status !== 200) return { ok: false, note: `responde ${got.status}` }
        if (expectedSize && got.length && got.length !== expectedSize) return { ok: false, note: `pesa ${got.length} bytes y debería pesar ${expectedSize}` }
        return { ok: true }
    } catch (err) {
        return { ok: null, note: err && err.name === 'TimeoutError' ? 'tardó demasiado' : 'no se pudo conectar' }
    }
}

function moduleFiles(modules, into = []) {
    for (const m of modules || []) {
        if (m && m.artifact && typeof m.artifact.url === 'string') into.push({ name: m.name || m.id, url: m.artifact.url, size: Number(m.artifact.size) || 0 })
        moduleFiles(m && m.subModules, into)
    }
    return into
}

async function verify(config, log, step, { fetchImpl = fetch, sleep } = {}) {
    const repo = config.empiPacksRepoPath
    const problems = []
    const mark = (kind, text) => {
        log(`${kind === 'ok' ? '✔' : kind === 'wait' ? '!' : '✘'} ${text}`)
        if (kind === 'bad') problems.push(text)
    }
    const base = pagesBase(config)
    const notices = require('./notices')

    step('Lo que está guardado en tu PC')
    let pushedAt = 0
    if (!fs.existsSync(repo) || !(await git.isRepo(repo))) {
        mark('bad', `Todavía no existe la carpeta de EmpiPacks en tu PC (${repo}).`)
    } else {
        try { await git.online(repo, ['fetch', 'origin', '--quiet'], () => {}) } catch (err) { mark('wait', `No pude preguntarle a GitHub qué hay subido: ${err.message}`) }
        const unpushed = await git.unpushedCount(repo)
        if (unpushed > 0) mark('bad', `Hay ${unpushed} cambio(s) guardados en tu PC que todavía no están en GitHub. Pulsa «Enviar» o «Publicar avisos» otra vez.`)
        else mark('ok', 'Todo lo guardado ya está subido a GitHub.')
        const pending = (await git.changes(repo)).length
        if (pending > 0) mark('wait', `Hay ${pending} archivo(s) compilados sin enviar (no se ven todavía; pulsa «Enviar» en Modpacks cuando quieras).`)
        pushedAt = await git.lastPushAt(repo)
    }
    const recentPush = pushedAt > 0 && Date.now() / 1000 - pushedAt < RECENT
    const lagging = (what) => (recentPush
        ? mark('wait', `GitHub Pages todavía muestra ${what} anterior: se subió hace poco y tarda hasta 10 minutos. Vuelve a verificar en un rato.`)
        : mark('bad', `GitHub Pages muestra ${what} distinto al que subiste, y ya pasó bastante tiempo. Revisa que Pages esté activado en el repositorio (Settings > Pages).`))

    // ---- distribution.json
    step('distribution.json en GitHub Pages')
    let distribution = null
    try {
        const online = await getText(fetchImpl, `${base}distribution.json`)
        const pushed = fs.existsSync(repo) ? await git.pushedFile(repo, 'distribution.json') : null
        if (online.status !== 200) mark('bad', `No se puede abrir ${base}distribution.json (responde ${online.status}).`)
        else {
            distribution = JSON.parse(online.text)
            if (pushed && JSON.stringify(JSON.parse(pushed)) !== JSON.stringify(distribution)) lagging('un distribution.json')
            else mark('ok', `distribution.json abre y es el que subiste (${(distribution.servers || []).length} modpack(s)).`)
        }
    } catch (err) { mark('bad', `distribution.json no se pudo leer: ${err.message}`) }

    // ---- avisos.json and its pages
    step('avisos.json en GitHub Pages')
    try {
        const online = await getText(fetchImpl, `${base}avisos.json`)
        const pushed = fs.existsSync(repo) ? await git.pushedFile(repo, 'avisos.json') : null
        if (online.status === 404 && !pushed) mark('ok', 'No hay avisos publicados (y no tiene que haberlos).')
        else if (online.status !== 200) mark('bad', `No se puede abrir ${base}avisos.json (responde ${online.status}).`)
        else {
            const doc = JSON.parse(online.text)
            if (pushed && JSON.stringify(JSON.parse(pushed)) !== JSON.stringify(doc)) lagging('un avisos.json')
            else {
                const wrong = notices.problems(doc)
                if (wrong.length) for (const w of wrong) mark('bad', `avisos.json publicado: ${w}`)
                else mark('ok', `avisos.json abre y el launcher lo acepta entero (${doc.notices.length} aviso(s)).`)
                for (const n of doc.notices) {
                    if (!n.page) continue
                    const status = await fileStatus(fetchImpl, `${base}${n.page}`, 0)
                    if (status.ok === true) mark('ok', `La página del aviso «${n.title}» abre.`)
                    else if (status.ok === null) mark('wait', `No pude comprobar la página del aviso «${n.title}» (${status.note}).`)
                    else mark('bad', `La página del aviso «${n.title}» no abre (${status.note}).`)
                }
            }
        }
    } catch (err) { mark('bad', `avisos.json no se pudo leer: ${err.message}`) }

    // ---- the files of the modpacks
    step('Archivos de los modpacks')
    if (distribution) {
        const files = []
        for (const server of distribution.servers || []) moduleFiles(server.modules, files)
        const unique = [...new Map(files.map((f) => [f.url, f])).values()]
        const list = unique.slice(0, CHECK.limit)
        log(`${unique.length} archivo(s) que los jugadores bajan${unique.length > list.length ? ` (compruebo los primeros ${list.length})` : ''}...`)
        let next = 0, fine = 0
        const missing = [], unknown = []
        const worker = async () => {
            while (next < list.length) {
                const file = list[next++]
                const status = await fileStatus(fetchImpl, file.url, file.size)
                if (status.ok === true) fine++
                else if (status.ok === null) unknown.push(`${file.name} (${status.note})`)
                else missing.push(`${file.name} (${status.note})`)
            }
        }
        await Promise.all(Array.from({ length: Math.min(CHECK.concurrency, list.length) }, worker))
        if (fine === list.length) mark('ok', `Los ${fine} archivos de los modpacks están y pesan lo que deben.`)
        for (const m of missing.slice(0, 15)) mark('bad', `Falta o está mal: ${m}`)
        if (missing.length > 15) mark('bad', `...y ${missing.length - 15} archivo(s) más con problemas.`)
        // every one of them is a file that is there but a little smaller: the line breaks that Git converted when it was uploaded
        if (missing.length > 0 && missing.every((m) => /pesa d+ bytes y debería pesar d+/.test(m))) {
            mark('bad', `Esos ${missing.length} archivos existen pero pesan menos de lo debido: casi seguro Git les cambió los saltos de línea al subirlos, y los jugadores no podrían bajarlos (fallaría su comprobación). Pulsa «Enviar» en Modpacks: el Publisher ya los vuelve a subir tal cual son, y luego verifica otra vez.`)
        }
        if (unknown.length) mark('wait', `${unknown.length} archivo(s) no se pudieron comprobar ahora (por ejemplo ${unknown[0]}).`)
    } else mark('wait', 'Sin distribution.json no se pueden comprobar los archivos de los modpacks.')

    // ---- the launcher's release
    step('Launcher')
    try {
        const yml = config.launcherLatestYmlUrl || `https://github.com/${config.launcherGithubRepo}/releases/latest/download/latest.yml`
        const online = await getText(fetchImpl, yml)
        if (online.status !== 200) mark('bad', `No se puede abrir el archivo de actualización del launcher (responde ${online.status}).`)
        else {
            const version = (/^version:\s*['"]?([^'"\r\n]+)/m.exec(online.text) || [])[1]
            const installer = (/^\s*-?\s*url:\s*['"]?([^'"\r\n]+)/m.exec(online.text) || [])[1]
            const size = Number((/^\s*size:\s*(\d+)/m.exec(online.text) || [])[1]) || 0
            if (!version) mark('bad', 'El archivo de actualización del launcher no dice qué versión es.')
            else {
                mark('ok', `La última versión del launcher publicada es la ${version}.`)
                let local = null
                try { local = JSON.parse(fs.readFileSync(path.join(config.launcherRepoPath, 'package.json'), 'utf8')).version } catch { /* no launcher checkout */ }
                if (local && local !== version) mark('wait', `Tu código del launcher está en la ${local}, y lo publicado es la ${version}.`)
                if (installer) {
                    const target = /^https?:/.test(installer) ? installer : new URL(installer, yml).toString()
                    const status = await fileStatus(fetchImpl, target, size)
                    if (status.ok === true) mark('ok', 'El instalador abre y pesa lo que dice el archivo de actualización.')
                    else if (status.ok === null) mark('wait', `No pude comprobar el instalador (${status.note}).`)
                    else mark('bad', `El instalador de la ${version} no está bien (${status.note}). Los jugadores no podrían actualizar.`)
                }
            }
        }
    } catch (err) { mark('bad', `No se pudo comprobar el launcher: ${err.message}`) }

    // ---- the links of published notices
    step('Enlaces de los avisos')
    const results = await checkLinks(notices.linksToCheck())
    for (const r of results) {
        if (r.ok === true) mark('ok', `${r.where}: abre.`)
        else if (r.ok === null) mark('wait', `${r.where}: no pude confirmarlo (${r.note}).`)
        else mark('bad', `${r.where}: ${r.note}.`)
    }
    if (!results.length) log('No hay enlaces que comprobar.')

    if (problems.length) throw new Error(`Hay ${problems.length} problema(s) con lo publicado:\n- ${problems.join('\n- ')}`)
    log('Todo lo publicado está donde debe.')
    return { ok: true }
}

module.exports = { verify, pagesBase }
