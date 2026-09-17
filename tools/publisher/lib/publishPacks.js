const fs = require('fs')
const path = require('path')
const { run } = require('./exec')
const git = require('./git')
const largeAssets = require('./largeAssets')

async function ensureRepoReady(config, log) {
    const repoRoot = config.empiPacksRepoPath
    if (!fs.existsSync(repoRoot) || !(await git.isRepo(repoRoot))) {
        log(`No existe ${repoRoot} todavia, clonando EmpiPacks...`)
        await git.clone(config.empiPacksRepoUrl, repoRoot, log)
    }
}

async function publishPacks(config, options, log) {
    const repoRoot = config.empiPacksRepoPath
    await ensureRepoReady(config, log)

    try {
        await git.pull(repoRoot, log)
    } catch (err) {
        log(`Aviso: no se pudo hacer git pull (${err.message}). Sigo igual.`)
    }

    if (config.nebulaCommand && config.nebulaCommand.trim()) {
        log('Regenerando distribution.json con Nebula...')
        const [cmd, ...args] = config.nebulaCommand.trim().split(/\s+/)
        await run(cmd, args, { cwd: repoRoot }, log)
    } else {
        log('(No hay comando de Nebula configurado; se asume que el repo ya esta al dia.)')
    }

    log(`Buscando archivos de mas de ${config.largeFileThresholdMb}MB para subir a un Release...`)
    const urlMap = await largeAssets.processLargeFiles(repoRoot, config, log)

    const distributionPath = path.join(repoRoot, 'distribution.json')
    if (Object.keys(urlMap).length > 0 && fs.existsSync(distributionPath)) {
        const distribution = JSON.parse(fs.readFileSync(distributionPath, 'utf8'))
        const pagesBaseUrl = `https://${config.empiPacksGithubRepo.split('/')[0].toLowerCase()}.github.io/${config.empiPacksGithubRepo.split('/')[1]}/`
        const changed = largeAssets.rewriteDistributionUrls(distribution, urlMap, pagesBaseUrl)
        if (changed > 0) {
            fs.writeFileSync(distributionPath, JSON.stringify(distribution, null, 2) + '\n', 'utf8')
            log(`distribution.json actualizado: ${changed} url(s) apuntando ahora al Release.`)
        }
    }

    await git.addAll(repoRoot, log)
    const status = await git.status(repoRoot)
    if (!status) {
        log('No hay cambios para publicar.')
        return { published: false }
    }

    log('Cambios a publicar:')
    log(status)

    const message = options.commitMessage && options.commitMessage.trim()
        ? options.commitMessage.trim()
        : 'Actualizar EmpiPacks'
    await git.commit(repoRoot, message, log)
    await git.push(repoRoot, log)

    return { published: true }
}

module.exports = { publishPacks }
