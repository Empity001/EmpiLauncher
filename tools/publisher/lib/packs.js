const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const git = require('./git')
const nebula = require('./nebula')
const largeAssets = require('./largeAssets')
const profiles = require('./profiles')
const { loadState, saveState } = require('./config')

const MIRRORED = ['repo', 'servers', 'images']

async function ensureRepoReady(config, log) {
    const repoRoot = config.empiPacksRepoPath
    if (!fs.existsSync(repoRoot) || !(await git.isRepo(repoRoot))) {
        log(`Todavia no existe ${repoRoot}, clonando EmpiPacks...`)
        await git.clone(config.empiPacksRepoUrl, repoRoot, log)
    }
    await git.ensureByteExact(repoRoot)
}

/**
 * A cheap fingerprint of everything Nebula would publish (names, sizes, dates). If it differs
 * from the one taken when compiling, something changed afterwards and "Enviar" must wait for a new compile.
 */
function fingerprint(config) {
    const root = nebula.rootPath(config)
    const hash = crypto.createHash('sha1')
    const files = largeAssets.collect(path.join(root, 'servers'), root)
    for (const file of files.sort((a, b) => a.rel.localeCompare(b.rel))) {
        hash.update(`${file.rel}|${file.size}|${Math.round(file.mtimeMs)}\n`)
    }
    return hash.digest('hex')
}

/** Makes `destTop` an exact copy of `srcTop`, touching only what differs and skipping files that will live in a Release. */
function mirror(srcTop, destTop, root, thresholdBytes) {
    const stats = { copied: 0, removed: 0, large: [] }
    const keep = new Set()

    for (const file of largeAssets.collect(srcTop, root)) {
        if (file.size > thresholdBytes) {
            stats.large.push(file)
            continue
        }
        keep.add(file.rel)
        const target = path.join(destTop, path.relative(root, file.abs).split(path.sep).slice(1).join(path.sep))
        let current = null
        try { current = fs.statSync(target) } catch { /* not there yet */ }
        if (!current || current.size !== file.size || Math.abs(current.mtimeMs - file.mtimeMs) > 2000) {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(file.abs, target)
            fs.utimesSync(target, new Date(), new Date(file.mtimeMs))
            stats.copied++
        }
    }

    const destRoot = path.dirname(destTop)
    for (const existing of largeAssets.collect(destTop, destRoot)) {
        if (!keep.has(existing.rel)) {
            fs.rmSync(existing.abs, { force: true })
            stats.removed++
        }
    }
    pruneEmptyDirs(destTop)
    return stats
}

function pruneEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name))
    }
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}

function describeChanges(changes) {
    const summary = { added: 0, modified: 0, removed: 0, total: changes.length, servers: [] }
    const servers = new Set()
    for (const change of changes) {
        if (change.code === 'D') summary.removed++
        else if (change.code === 'A') summary.added++
        else summary.modified++
        const match = change.file.replace(/^"/, '').match(/^servers\/([^/]+)\//)
        if (match) servers.add(match[1])
    }
    summary.servers = [...servers]
    return summary
}

async function compile(config, options, log, step) {
    const repoRoot = config.empiPacksRepoPath
    const root = nebula.rootPath(config)
    const threshold = config.largeFileThresholdMb * largeAssets.MB

    step('Actualizando el repositorio local')
    await ensureRepoReady(config, log)
    try {
        await git.pull(repoRoot, log)
    } catch (err) {
        log(`Aviso: no pude traer lo ultimo de GitHub (${err.message}). Sigo con lo que hay.`)
    }

    step('Generando distribution.json con Nebula')
    log('Si es la primera vez con un Forge/NeoForge nuevo, se instala en segundo plano y tarda unos minutos.')
    await nebula.generateDistro(config, log)

    step('Copiando los archivos al repositorio')
    const large = []
    for (const name of MIRRORED) {
        const source = path.join(root, name)
        const destination = path.join(repoRoot, name)
        if (!fs.existsSync(source)) {
            fs.rmSync(destination, { recursive: true, force: true })
            continue
        }
        const stats = mirror(source, destination, root, threshold)
        large.push(...stats.large)
        log(`${name}: ${stats.copied} archivo(s) copiados, ${stats.removed} retirados.`)
    }

    step('Preparando los archivos grandes')
    const planned = await largeAssets.plan(config, large)
    const urlMap = Object.fromEntries(planned.map((file) => [file.rel, file.url]))

    const distribution = JSON.parse(fs.readFileSync(path.join(root, 'distribution.json'), 'utf8').replace(/^﻿/, ''))
    // profiles: modpacks that list others as their profiles, and the ones that are somebody's profile, say so in the index
    for (const line of profiles.applyLinks(distribution, (id) => { try { return nebula.readServerMeta(config, id) } catch { return null } }).lines) log(line)
    const rewritten = largeAssets.rewriteDistributionUrls(distribution, urlMap, nebula.baseUrl(config))
    fs.writeFileSync(path.join(repoRoot, 'distribution.json'), JSON.stringify(distribution, null, 2) + '\n', 'utf8')
    if (planned.length > 0) {
        const toUpload = planned.filter((file) => file.needsUpload)
        log(`${planned.length} archivo(s) grandes van a un Release (${rewritten} enlaces ajustados); ${toUpload.length} por subir.`)
    }

    await git.stage(repoRoot)
    const summary = describeChanges(await git.stagedChanges(repoRoot))
    const compiled = {
        at: new Date().toISOString(),
        fingerprint: fingerprint(config),
        changes: summary,
        large: planned.map(({ rel, size, needsUpload }) => ({ rel, size, needsUpload })),
        suggestedMessage: summary.servers.length === 1 ? `Actualizar ${summary.servers[0]}` : summary.servers.length > 1 ? `Actualizar ${summary.servers.length} modpacks` : 'Actualizar EmpiPacks'
    }
    saveState({ packsCompile: compiled })

    log(summary.total === 0
        ? 'Compilado. Todo estaba ya al dia: no hay nada nuevo que enviar.'
        : `Compilado. Cambios: ${summary.added} nuevos, ${summary.modified} modificados, ${summary.removed} eliminados.`)
    return compiled
}

async function send(config, options, log, step) {
    const repoRoot = config.empiPacksRepoPath
    const compiled = loadState().packsCompile
    if (!compiled) throw new Error('Primero pulsa "Compilar".')
    if (compiled.fingerprint !== fingerprint(config)) throw new Error('Hiciste cambios después de compilar. Vuelve a pulsar "Compilar".')

    step('Subiendo los archivos grandes a Releases')
    const root = nebula.rootPath(config)
    const large = MIRRORED
        .flatMap((name) => largeAssets.collect(path.join(root, name), root))
        .filter((file) => file.size > config.largeFileThresholdMb * largeAssets.MB)
    await largeAssets.upload(config, await largeAssets.plan(config, large), log)

    step('Guardando los cambios')
    await git.stage(repoRoot)
    const staged = await git.stagedChanges(repoRoot)
    if (staged.length === 0 && (await git.unpushedCount(repoRoot)) === 0) {
        log('No hay nada nuevo que publicar.')
        return { published: false }
    }
    if (staged.length > 0) {
        const message = options.message && options.message.trim() ? options.message.trim() : compiled.suggestedMessage
        await git.commit(repoRoot, message, log)
    }

    step('Publicando en GitHub')
    await git.push(repoRoot, log)
    saveState({ packsCompile: { ...compiled, sentAt: new Date().toISOString() } })
    log('Publicado. GitHub Pages tarda 1-2 minutos en mostrar los cambios.')
    return { published: true }
}

function status(config) {
    const compiled = loadState().packsCompile || null
    let stale = false
    if (compiled) {
        try { stale = compiled.fingerprint !== fingerprint(config) } catch { stale = true }
    }
    return { compiled, stale }
}

module.exports = { compile, send, status }
