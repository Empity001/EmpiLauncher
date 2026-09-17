/**
 * Script for landing.ejs
 */
// Requirements
const {
    URL,
    fileURLToPath: landingFileURLToPath,
    pathToFileURL: landingPathToFileURL
} = require('url')
const landingFs                = require('fs-extra')
const landingPath              = require('path')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')

// Internal Requirements
const PackIntegrity           = require('./assets/js/packintegrity')
const landingCrypto           = require('crypto')
const landingChildProcess     = require('child_process')
const landingHttp             = require('http')
const landingHttps            = require('https')
const { pipeline: landingPipeline } = require('stream/promises')

// Repair, Java discovery, process construction and Discord RPC are only needed
// when their feature is used. Keeping them out of the startup path reduces the
// renderer's baseline memory without removing any launcher capability.
let launchRuntime = null
let discordWrapper = null

function getLaunchRuntime(){
    if(launchRuntime == null){
        const dl = require('helios-core/dl')
        const java = require('helios-core/java')
        launchRuntime = {
            FullRepair: dl.FullRepair,
            DistributionIndexProcessor: dl.DistributionIndexProcessor,
            MojangIndexProcessor: dl.MojangIndexProcessor,
            downloadFile: dl.downloadFile,
            validateSelectedJvm: java.validateSelectedJvm,
            ensureJavaDirIsRoot: java.ensureJavaDirIsRoot,
            javaExecFromRoot: java.javaExecFromRoot,
            discoverBestJvmInstallation: java.discoverBestJvmInstallation,
            latestOpenJDK: java.latestOpenJDK,
            extractJdk: java.extractJdk,
            ProcessBuilder: require('./assets/js/processbuilder')
        }
    }
    return launchRuntime
}

function getDiscordWrapper(){
    discordWrapper ??= require('./assets/js/discordwrapper')
    return discordWrapper
}

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_button           = document.getElementById('launch_button')
const launch_button_label     = document.getElementById('launch_button_label')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const launch_progress_bytes   = document.getElementById('launch_progress_bytes')
const launch_progress_speed   = document.getElementById('launch_progress_speed')
const pack_integrity_status   = document.getElementById('pack_integrity_status')
const server_selection_button = document.getElementById('server_selection_button')
const landing_server_rail        = document.getElementById('landingServerRailList')
const landing_server_rail_section = document.getElementById('landingServerRail')
const user_text                  = document.getElementById('user_text')
const landing_version_banner     = document.getElementById('landingVersionBanner')
const landing_version_background = document.getElementById('landingVersionBackground')
const landing_version_banner_canvas = document.getElementById('landingVersionBannerCanvas')
const landing_version_background_canvas = document.getElementById('landingVersionBackgroundCanvas')

const loggerLanding = LoggerUtil.getLogger('Landing')

// Absolute performance mode. En pruebas reales, la aceleración de GPU
// resultó ser, con diferencia, el mayor consumidor de RAM del launcher —muy
// por encima de fondos, banners y sus animaciones (GIF/APNG/canvas)—, así
// que el modo también la desactiva. La GPU solo puede decidirse al iniciar
// el proceso (ver index.js); esta parte del ahorro pide reiniciar. Fondos y
// animaciones sí se aplican al instante, sin reiniciar.
//
// Prioridad: EMPILAUNCHER_FORCE_PERFORMANCE_MODE (env, para pruebas/CI) >
// preferencia guardada por el usuario (botón junto a Estado de Mojang) >
// detección automática por RAM (menos de 6 GB).
const { isLowMemorySystem } = require('./assets/js/performancemode')

function computeEffectivePerformanceMode(){
    if(process.env.EMPILAUNCHER_FORCE_PERFORMANCE_MODE === '1'){
        return true
    }
    if(process.env.EMPILAUNCHER_FORCE_PERFORMANCE_MODE === '0'){
        return false
    }
    const stored = ConfigManager.getPerformanceMode()
    if(stored === 'on'){
        return true
    }
    if(stored === 'off'){
        return false
    }
    return isLowMemorySystem()
}

// El proceso principal ya decidió, con la misma lógica, si la GPU está
// activa para esta sesión (no puede cambiar sin reiniciar). Se guarda para
// saber si un cambio del botón todavía necesita reinicio o no.
const empiGpuDisabledAtStartup = process.env.EMPILAUNCHER_DISABLE_GPU === '0'
    ? false
    : (process.env.EMPILAUNCHER_DISABLE_GPU === '1' || computeEffectivePerformanceMode())

let empiPerformanceModeActive = computeEffectivePerformanceMode()
let performanceModeRestartNoticeTimer = null
const performance_mode_toggle = document.getElementById('performance_mode_toggle')
const performance_mode_icon   = document.getElementById('performance_mode_icon')
const performance_mode_label  = document.getElementById('performance_mode_label')

function refreshPerformanceModeButton(){
    if(performance_mode_toggle == null){
        return
    }
    if(performanceModeRestartNoticeTimer != null){
        clearTimeout(performanceModeRestartNoticeTimer)
        performanceModeRestartNoticeTimer = null
    }
    performance_mode_toggle.setAttribute('aria-pressed', empiPerformanceModeActive ? 'true' : 'false')
    performance_mode_toggle.classList.toggle('active', empiPerformanceModeActive)
    if(performance_mode_label != null){
        performance_mode_label.textContent = empiPerformanceModeActive ? 'ON' : 'OFF'
    }
    performance_mode_toggle.title = empiPerformanceModeActive
        ? 'Modo de optimización absoluta activado. Clic para desactivarlo (vuelve a mostrar fondos y animaciones).'
        : 'Modo de optimización absoluta desactivado. Clic para activarlo (sin fondos, banners ni animaciones).'
}

/**
 * Muestra brevemente un aviso de "reiniciar" en el botón cuando el cambio
 * recién hecho todavía no apagó/prendió la GPU (eso solo pasa al reiniciar
 * el launcher). Los fondos/animaciones ya se aplicaron sin reiniciar.
 */
function flashPerformanceModeRestartNotice(){
    if(performance_mode_toggle == null){
        return
    }
    if(performanceModeRestartNoticeTimer != null){
        clearTimeout(performanceModeRestartNoticeTimer)
    }
    if(performance_mode_label != null){
        performance_mode_label.textContent = 'REINICIAR'
    }
    performance_mode_toggle.title = empiPerformanceModeActive
        ? 'Fondos y animaciones ya se apagaron. Para además liberar la RAM de la GPU (el ahorro más grande), reiniciá el launcher.'
        : 'Fondos y animaciones ya volvieron. Para además reactivar la GPU, reiniciá el launcher.'
    performanceModeRestartNoticeTimer = setTimeout(() => {
        performanceModeRestartNoticeTimer = null
        refreshPerformanceModeButton()
    }, 5000)
}

/**
 * Aplica el modo (o lo deshace) sin reiniciar el launcher: activa o
 * desactiva el atributo que apaga los fondos/animaciones en CSS y, según
 * corresponda, descarga los recursos actuales o vuelve a cargar el fondo y
 * el banner de la versión seleccionada. La GPU (el ahorro más grande) queda
 * pendiente hasta el próximo reinicio; ver flashPerformanceModeRestartNotice.
 */
async function setPerformanceModeActive(active, { persist = true } = {}){
    empiPerformanceModeActive = active
    // html[data-empi-performance-mode] apaga en CSS, con la máxima
    // especificidad posible, los fondos/banners y todas las animaciones y
    // transiciones del launcher. Ver launcher.css.
    document.documentElement.toggleAttribute('data-empi-performance-mode', active)

    if(persist){
        ConfigManager.setPerformanceMode(active ? 'on' : 'off')
        ConfigManager.save()
        if(active !== empiGpuDisabledAtStartup){
            flashPerformanceModeRestartNotice()
        } else {
            refreshPerformanceModeButton()
        }
    } else {
        refreshPerformanceModeButton()
    }

    try {
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(ConfigManager.getSelectedServer())
        await applyLandingTheme(server)
    } catch(err) {
        loggerLanding.debug('No se pudo actualizar el fondo/banner tras cambiar el modo de optimización.', err)
    }
}

if(performance_mode_toggle != null){
    performance_mode_toggle.onclick = () => {
        setPerformanceModeActive(!empiPerformanceModeActive)
            .catch(err => loggerLanding.warn('No se pudo cambiar el modo de optimización absoluta.', err))
    }
}
refreshPerformanceModeButton()

if(empiPerformanceModeActive){
    loggerLanding.info('Modo de optimización absoluta activado (sin fondos, banners ni animaciones).')
}
document.documentElement.toggleAttribute('data-empi-performance-mode', empiPerformanceModeActive)

const LAUNCH_BUTTON_STATES = Object.freeze({
    PLAY: 'play',
    UPDATE: 'update',
    RESTORE: 'restore',
    UPDATING: 'updating',
    RESTORING: 'restoring',
    LAUNCHING: 'launching',
    RUNNING: 'running',
    STOPPING: 'stopping',
    DISABLED: 'disabled'
})

const PACK_STATE_DIRECTORY = '.empilauncher'
const PACK_STATE_FILE = 'pack-state.json'
let launchButtonState = LAUNCH_BUTTON_STATES.PLAY
let selectedPackNeedsUpdate = false
let selectedPackModified = false
let selectedPackDifferences = []
let packIntegrityCheckSequence = 0
let packIntegrityStatusTimer = null
let gameLaunchFallbackTimer = null
let stopRequested = false
const finalizedGameProcesses = new WeakSet()

// Lightweight caches keep the animated landing page from being rebuilt or
// re-decoded when the remote distribution has not actually changed.
let lastLaunchProgressValue = -1
let lastWindowProgressValue = -1
let landingRailFadeFrame = null
let landingRailSignature = null
let landingThemeSignature = null
let remoteDistributionSignature = null
let lastSelectedServerId = null
const landingThemeCache = new Map()
let lastPackStateLogKey = null
let launchTransferStatsTimer = null
let pendingLaunchTransferStats = null

// Landing media cache. Heavy backgrounds and banners are downloaded once and
// then loaded from disk. The last visible pair is also restored immediately on
// the next launcher start so the landing page never waits on the network.
const LANDING_MEDIA_CACHE_VERSION = 'v1'
const LANDING_ANIMATION_CACHE_VERSION = 'v1'
const LANDING_LAST_VISUALS_KEY = 'empiLauncher.lastLandingVisuals.boundedPlayer.v2'
const LANDING_THEME_CACHE_LIMIT = 16
const LANDING_DECODE_CACHE_LIMIT = 16
const LANDING_ANIMATION_CACHE_FILE_LIMIT = 16
const LANDING_ANIMATION_CACHE_BYTE_LIMIT = 256 * 1024 * 1024
const landingImageDecodeCache = new Map()
const landingMediaCacheJobs = new Map()
const landingAnimationPlayers = new Map()
const landingAnimationOptimizationJobs = new Map()
// Sharp only creates a smaller on-disk copy after the original animation is
// already playing. Development copies may have an older node_modules folder,
// so the visual path must never depend on this optional optimizer.
let landingSharp
let landingAnimationOptimizationQueue = Promise.resolve()

function setBoundedLandingCache(cache, key, value, limit){
    if(!cache.has(key) && cache.size >= limit){
        cache.delete(cache.keys().next().value)
    }
    cache.set(key, value)
}

function getLandingMediaCacheDirectory(){
    return landingPath.resolve(
        ConfigManager.getDataDirectory(),
        '.empi-cache',
        'landing-media',
        LANDING_MEDIA_CACHE_VERSION
    )
}

function getLandingAnimationCacheDirectory(){
    return landingPath.resolve(
        ConfigManager.getDataDirectory(),
        '.empi-cache',
        'landing-animation',
        LANDING_ANIMATION_CACHE_VERSION
    )
}

function isLaunchBusy(){
    return launchButtonState === LAUNCH_BUTTON_STATES.UPDATING
        || launchButtonState === LAUNCH_BUTTON_STATES.RESTORING
        || launchButtonState === LAUNCH_BUTTON_STATES.LAUNCHING
        || launchButtonState === LAUNCH_BUTTON_STATES.STOPPING
}

function getLaunchButtonLabel(state){
    switch(state){
        case LAUNCH_BUTTON_STATES.UPDATE: return 'ACTUALIZAR'
        case LAUNCH_BUTTON_STATES.RESTORE: return 'RESTAURAR'
        case LAUNCH_BUTTON_STATES.UPDATING: return 'ACTUALIZANDO'
        case LAUNCH_BUTTON_STATES.RESTORING: return 'RESTAURANDO'
        case LAUNCH_BUTTON_STATES.LAUNCHING: return 'INICIANDO'
        case LAUNCH_BUTTON_STATES.RUNNING: return 'DETENER'
        case LAUNCH_BUTTON_STATES.STOPPING: return 'DETENIENDO'
        default: return 'JUGAR'
    }
}

function setLaunchButtonState(state, options = {}){
    launchButtonState = state
    launch_button.dataset.state = state
    launch_button_label.textContent = options.label || getLaunchButtonLabel(state)
    launch_button.toggleAttribute('attention', state === LAUNCH_BUTTON_STATES.UPDATE || state === LAUNCH_BUTTON_STATES.RESTORE)
    const disabled = state === LAUNCH_BUTTON_STATES.DISABLED || isLaunchBusy()
    launch_button.disabled = disabled
    launch_button.setAttribute('aria-busy', isLaunchBusy() ? 'true' : 'false')
    if(typeof options.progress === 'number'){
        setLaunchButtonProgress(options.progress)
    } else if(!isLaunchBusy()){
        setLaunchButtonProgress(0)
    }
    ipcRenderer.send('launcher-runtime-state', {
        busy: isLaunchBusy(),
        game: state === LAUNCH_BUTTON_STATES.RUNNING || state === LAUNCH_BUTTON_STATES.STOPPING
    })
}

function setLaunchButtonProgress(percent){
    const normalized = Math.max(0, Math.min(100, Number(percent) || 0))
    const rounded = Math.trunc(normalized)
    if(launch_button.dataset.progress === String(rounded)){
        return
    }
    launch_button.style.setProperty('--launch-fill', `${rounded}%`)
    launch_button.dataset.progress = String(rounded)
}

function setPackIntegrityStatus(message = '', tone = '', temporaryMs = 0){
    if(packIntegrityStatusTimer != null){
        clearTimeout(packIntegrityStatusTimer)
        packIntegrityStatusTimer = null
    }
    if(pack_integrity_status == null){
        return
    }
    pack_integrity_status.textContent = message
    pack_integrity_status.dataset.tone = tone
    pack_integrity_status.hidden = message.length === 0
    if(temporaryMs > 0 && message.length > 0){
        packIntegrityStatusTimer = setTimeout(() => {
            if(!selectedPackModified){
                pack_integrity_status.textContent = ''
                pack_integrity_status.dataset.tone = ''
                pack_integrity_status.hidden = true
            }
            packIntegrityStatusTimer = null
        }, temporaryMs)
    }
}

function applyModifiedPackState(differences = []){
    selectedPackModified = true
    selectedPackDifferences = Array.isArray(differences) ? [...differences] : []
    if(selectedPackDifferences.length > 0){
        loggerLanding.debug('Protected modpack changes detected.', selectedPackDifferences)
    }
    setPackIntegrityStatus('Versión modificada', 'warning')
    setLaunchButtonState(LAUNCH_BUTTON_STATES.RESTORE)
}

function stablePackStringify(value){
    if(value == null || typeof value !== 'object'){
        return JSON.stringify(value)
    }
    if(Array.isArray(value)){
        return `[${value.map(stablePackStringify).join(',')}]`
    }
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stablePackStringify(value[key])}`).join(',')}}`
}

function getServerPackFingerprint(server){
    const raw = server?.rawServer || server || {}
    const packDescriptor = {
        id: raw.id,
        version: raw.version,
        minecraftVersion: raw.minecraftVersion,
        javaOptions: raw.javaOptions || null,
        modules: raw.modules || []
    }
    return landingCrypto.createHash('sha256').update(stablePackStringify(packDescriptor)).digest('hex')
}


function getLandingModuleSignature(module){
    const raw = module?.rawModule || module || {}
    const artifact = raw.artifact || {}
    return [
        raw.id || '',
        artifact.path || '',
        artifact.url || '',
        artifact.sha1 || artifact.hash || '',
        artifact.size || ''
    ].join('|')
}

function getLandingDistributionSignature(distro){
    const raw = distro?.rawDistribution || {}
    const descriptor = {
        version: raw.version || null,
        rail: getLandingRailSignature(distro),
        servers: (distro?.servers || []).map(server => ({
            pack: getServerPackFingerprint(server),
            accent: server.rawServer?.accent || server.rawServer?.theme || null
        }))
    }
    return landingCrypto.createHash('sha256').update(stablePackStringify(descriptor)).digest('hex')
}

function getLandingRailSignature(distro){
    const descriptor = (distro?.servers || []).map(server => {
        const raw = server.rawServer
        return {
            id: raw.id,
            name: raw.name,
            description: raw.description,
            icon: raw.icon,
            minecraftVersion: raw.minecraftVersion,
            version: raw.version,
            mainServer: raw.mainServer,
            whitelist: isLandingServerWhitelisted(server)
        }
    })
    return landingCrypto.createHash('sha256').update(stablePackStringify(descriptor)).digest('hex')
}

function getServerPackStatePath(server){
    const id = server?.rawServer?.id || server?.id
    return id == null ? null : landingPath.join(
        ConfigManager.getInstanceDirectory(),
        id,
        PACK_STATE_DIRECTORY,
        PACK_STATE_FILE
    )
}

async function readServerPackState(server){
    const statePath = getServerPackStatePath(server)
    if(statePath == null || !(await landingFs.pathExists(statePath))){
        return null
    }
    try {
        return await landingFs.readJson(statePath)
    } catch(err) {
        loggerLanding.warn('Unable to read installed pack state.', err)
        return null
    }
}

async function writeServerPackState(server){
    const statePath = getServerPackStatePath(server)
    if(statePath == null){
        return
    }
    const fingerprint = getServerPackFingerprint(server)
    await landingFs.ensureDir(landingPath.dirname(statePath))
    await landingFs.writeJson(statePath, {
        serverId: server.rawServer.id,
        version: server.rawServer.version,
        fingerprint,
        updatedAt: new Date().toISOString()
    }, { spaces: 2 })
    await PackIntegrity.createManifest(
        ConfigManager.getInstanceDirectory(),
        server.rawServer.id,
        fingerprint
    )
}

async function hasExistingServerInstallation(server){
    const id = server?.rawServer?.id || server?.id
    if(id == null){
        return false
    }
    const instancePath = landingPath.join(ConfigManager.getInstanceDirectory(), id)
    if(!(await landingFs.pathExists(instancePath))){
        return false
    }
    try {
        const entries = await landingFs.readdir(instancePath)
        return entries.some(entry => entry !== PACK_STATE_DIRECTORY)
    } catch(err) {
        loggerLanding.debug('Unable to inspect the local modpack installation.', err)
        return false
    }
}

function isPathInside(parentPath, childPath){
    const relative = landingPath.relative(parentPath, childPath)
    return relative.length > 0
        && relative !== '..'
        && !relative.startsWith(`..${landingPath.sep}`)
        && !landingPath.isAbsolute(relative)
}

function getPersonalDistributionFiles(server){
    const serverId = server?.rawServer?.id || server?.id
    if(serverId == null){
        return []
    }

    const instancePath = landingPath.join(ConfigManager.getInstanceDirectory(), serverId)
    const protectedRoots = new Set(PackIntegrity.PROTECTED_ROOTS.map(root => root.toLowerCase()))
    const files = new Map()

    for(const module of flattenLandingModules(server?.modules)){
        const raw = module?.rawModule || module || {}
        if(String(raw.type) !== 'File' || typeof module?.getPath !== 'function'){
            continue
        }

        try {
            const modulePath = landingPath.resolve(module.getPath())
            if(!isPathInside(instancePath, modulePath)){
                continue
            }
            const relativePath = landingPath.relative(instancePath, modulePath)
            const firstPart = relativePath.split(landingPath.sep)[0].toLowerCase()
            if(protectedRoots.has(firstPart) || firstPart === PACK_STATE_DIRECTORY){
                continue
            }
            files.set(relativePath, modulePath)
        } catch(err) {
            loggerLanding.debug('Unable to resolve a personal pack file for backup.', err)
        }
    }

    return [...files.entries()].map(([relativePath, absolutePath]) => ({
        relativePath,
        absolutePath
    }))
}

async function backupPersonalDistributionFiles(server){
    const files = getPersonalDistributionFiles(server)
    if(files.length === 0){
        return null
    }

    const serverId = server.rawServer.id
    const backupRoot = landingPath.join(
        ConfigManager.getDataDirectory(),
        '.empi-cache',
        'restore-backups',
        `${serverId}-${Date.now()}-${landingCrypto.randomBytes(4).toString('hex')}`
    )
    const entries = []

    for(const file of files){
        if(!(await landingFs.pathExists(file.absolutePath))){
            continue
        }
        let stat
        try {
            stat = await landingFs.stat(file.absolutePath)
        } catch(err) {
            loggerLanding.debug('Unable to inspect a personal pack file before restore.', err)
            continue
        }
        if(!stat.isFile()){
            continue
        }

        const backupPath = landingPath.join(backupRoot, file.relativePath)
        await landingFs.ensureDir(landingPath.dirname(backupPath))
        await landingFs.copy(file.absolutePath, backupPath, {
            overwrite: true,
            preserveTimestamps: true
        })
        entries.push({
            relativePath: file.relativePath,
            originalPath: file.absolutePath,
            backupPath
        })
    }

    if(entries.length === 0){
        await landingFs.remove(backupRoot)
        return null
    }

    loggerLanding.info(`Protected ${entries.length} personal configuration files during modpack restore.`)
    return {
        backupRoot,
        entries
    }
}

async function restorePersonalDistributionFiles(snapshot){
    if(snapshot == null){
        return
    }

    try {
        for(const entry of snapshot.entries){
            if(!(await landingFs.pathExists(entry.backupPath))){
                continue
            }
            await landingFs.ensureDir(landingPath.dirname(entry.originalPath))
            await landingFs.copy(entry.backupPath, entry.originalPath, {
                overwrite: true,
                preserveTimestamps: true
            })
        }
        loggerLanding.info(`Restored ${snapshot.entries.length} personal configuration files after modpack repair.`)
    } finally {
        await landingFs.remove(snapshot.backupRoot).catch(err => {
            loggerLanding.debug('Unable to remove the temporary restore backup.', err)
        })
    }
}

async function refreshSelectedPackButton(server = null, force = false){
    if(proc != null || (!force && isLaunchBusy())){
        return
    }
    const checkSequence = ++packIntegrityCheckSequence
    if(server == null){
        const distro = await DistroAPI.getDistribution()
        server = distro.getServerById(ConfigManager.getSelectedServer())
    }
    if(server == null){
        selectedPackNeedsUpdate = false
        selectedPackModified = false
        selectedPackDifferences = []
        setPackIntegrityStatus()
        setLaunchButtonState(LAUNCH_BUTTON_STATES.DISABLED)
        return
    }

    const serverId = server.rawServer.id
    const fingerprint = getServerPackFingerprint(server)
    const installationExists = await hasExistingServerInstallation(server)
    const installedState = await readServerPackState(server)
    selectedPackNeedsUpdate = installedState == null
        ? installationExists
        : installedState.serverId !== serverId
            || installedState.fingerprint !== fingerprint

    let integrityResult = { status: 'clean', differences: [] }
    if(installationExists && !selectedPackNeedsUpdate){
        try {
            integrityResult = await PackIntegrity.checkIntegrity(
                ConfigManager.getInstanceDirectory(),
                serverId,
                fingerprint
            )
            if(integrityResult.status === 'uninitialized'){
                await PackIntegrity.createManifest(
                    ConfigManager.getInstanceDirectory(),
                    serverId,
                    fingerprint
                )
                integrityResult = { status: 'clean', differences: [] }
            }
        } catch(err) {
            loggerLanding.warn('Unable to verify the protected modpack folders.', err)
            integrityResult = { status: 'unknown', differences: [] }
        }
    } else if(installationExists && installedState == null){
        integrityResult = { status: 'uninitialized', differences: [] }
    }

    if(checkSequence !== packIntegrityCheckSequence || ConfigManager.getSelectedServer() !== serverId){
        return
    }

    selectedPackModified = installationExists
        && (integrityResult.status === 'modified'
            || integrityResult.status === 'uninitialized'
            || integrityResult.status === 'outdated' && !selectedPackNeedsUpdate)

    const logKey = `${serverId}|${installedState?.version || ''}|${server.rawServer.version}|${selectedPackNeedsUpdate}|${integrityResult.status}`
    if(logKey !== lastPackStateLogKey){
        lastPackStateLogKey = logKey
        loggerLanding.debug('Modpack state.', {
            serverId,
            installedVersion: installedState?.version || null,
            remoteVersion: server.rawServer.version,
            needsUpdate: selectedPackNeedsUpdate,
            integrity: integrityResult.status,
            differences: integrityResult.differences
        })
    }

    if(selectedPackModified){
        applyModifiedPackState(integrityResult.differences)
    } else {
        selectedPackDifferences = []
        setPackIntegrityStatus()
        setLaunchButtonState(selectedPackNeedsUpdate ? LAUNCH_BUTTON_STATES.UPDATE : LAUNCH_BUTTON_STATES.PLAY)
    }
}


async function verifyPackBeforeLaunch(server){
    const installationExists = await hasExistingServerInstallation(server)
    if(!installationExists){
        return true
    }
    try {
        let result = await PackIntegrity.checkIntegrity(
            ConfigManager.getInstanceDirectory(),
            server.rawServer.id,
            getServerPackFingerprint(server)
        )
        if(result.status === 'uninitialized'){
            await PackIntegrity.createManifest(
                ConfigManager.getInstanceDirectory(),
                server.rawServer.id,
                getServerPackFingerprint(server)
            )
            result = { status: 'clean', differences: [] }
        }
        if(result.status !== 'clean'){
            applyModifiedPackState(result.differences)
            return false
        }
        selectedPackModified = false
        selectedPackDifferences = []
        setPackIntegrityStatus()
        return true
    } catch(err) {
        loggerLanding.warn('Unable to verify the modpack before launch.', err)
        setPackIntegrityStatus('No se pudo comprobar la versión', 'warning', 3000)
        return true
    }
}

function markGameRunning(){
    if(proc == null){
        return
    }
    if(gameLaunchFallbackTimer != null){
        clearTimeout(gameLaunchFallbackTimer)
        gameLaunchFallbackTimer = null
    }
    toggleLaunchArea(false)
    setLaunchButtonState(LAUNCH_BUTTON_STATES.RUNNING)
}

function finalizeGameProcess(activeProcess, source = 'exit'){
    if(activeProcess != null){
        if(finalizedGameProcesses.has(activeProcess)){
            return
        }
        finalizedGameProcesses.add(activeProcess)
    }

    loggerLanding.info(`Restoring launcher after Minecraft ${source}.`)
    if(gameLaunchFallbackTimer != null){
        clearTimeout(gameLaunchFallbackTimer)
        gameLaunchFallbackTimer = null
    }
    // Keep Rich Presence active after Minecraft closes and return it to
    // the launcher navigation state instead of destroying the RPC client.
    if(activeProcess == null || proc === activeProcess){
        proc = null
    }
    stopRequested = false
    remote.getCurrentWindow().setProgressBar(-1)
    lastWindowProgressValue = -1
    lastLaunchProgressValue = -1
    toggleLaunchArea(false)
    setLaunchDetails('')
    clearLaunchTransferStats()

    // Recover the interface immediately. Previously the button remained in
    // STOPPING, and refreshSelectedPackButton() refused to run because that
    // state is considered busy. That left the launcher stuck on DETENIENDO.
    setLaunchButtonState(selectedPackNeedsUpdate ? LAUNCH_BUTTON_STATES.UPDATE : LAUNCH_BUTTON_STATES.PLAY)
    setTimeout(() => {
        refreshSelectedPackButton(null, true).catch(err => loggerLanding.warn('Unable to restore launch button state.', err))
    }, 900)
    setDiscordNavigationPresence()
}

function waitForProcessClose(activeProcess, timeoutMs){
    return Promise.race([
        new Promise(resolve => activeProcess.once('close', () => resolve(true))),
        new Promise(resolve => setTimeout(() => resolve(false), timeoutMs))
    ])
}

async function stopRunningGame(){
    if(proc == null){
        await refreshSelectedPackButton()
        return
    }
    stopRequested = true
    setLaunchButtonState(LAUNCH_BUTTON_STATES.STOPPING)
    setLaunchDetails('Deteniendo Minecraft...')
    toggleLaunchArea(true)
    clearLaunchTransferStats()
    setLaunchPercentage(0)

    const activeProcess = proc
    const closePromise = waitForProcessClose(activeProcess, 4500)
    const stopWatchdog = setTimeout(() => {
        loggerLanding.warn('Stop watchdog restored the launcher after Minecraft shutdown.')
        finalizeGameProcess(activeProcess, 'stop watchdog')
    }, 7000)
    let stopCommandSucceeded = false

    try {
        if(process.platform === 'win32' && activeProcess.pid != null){
            await Promise.race([
                new Promise((resolve, reject) => {
                    landingChildProcess.execFile('taskkill', ['/PID', String(activeProcess.pid), '/T', '/F'], (error) => {
                        if(error){
                            reject(error)
                        } else {
                            resolve()
                        }
                    })
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('taskkill timed out')), 5000))
            ])
            stopCommandSucceeded = true
        } else {
            stopCommandSucceeded = activeProcess.kill('SIGTERM')
        }
    } catch(err) {
        loggerLanding.warn('Unable to stop Minecraft cleanly, using the process fallback.', err)
        try {
            stopCommandSucceeded = activeProcess.kill('SIGKILL')
        } catch(killErr) {
            loggerLanding.error('Unable to stop Minecraft.', killErr)
        }
    }

    const closedNormally = await closePromise
    clearTimeout(stopWatchdog)

    if(!closedNormally){
        loggerLanding.warn('Minecraft did not emit a close event after being stopped. Restoring the launcher manually.')
        if(!stopCommandSucceeded){
            try {
                activeProcess.kill('SIGKILL')
            } catch(err) {
                loggerLanding.debug('Final Minecraft kill fallback failed or was unnecessary.', err)
            }
        }
        finalizeGameProcess(activeProcess, 'stop timeout')
    } else {
        // The process close listener normally restores the UI. Calling this
        // again is safe because finalizeGameProcess guards duplicate calls.
        finalizeGameProcess(activeProcess, 'was stopped')
    }
}

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    // The button remains visible and becomes the progress bar itself.
    launch_content.style.display = 'flex'
    launch_details.style.display = loading ? 'flex' : 'none'
    if(!loading){
        clearLaunchTransferStats()
    }
    launch_content.toggleAttribute('loading', loading)
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

function formatLaunchBytes(bytes){
    const value = Number(bytes)
    if(!Number.isFinite(value) || value < 0){
        return ''
    }
    if(value < 1024){
        return `${Math.round(value)} B`
    }
    const units = ['KB', 'MB', 'GB', 'TB']
    let amount = value / 1024
    let unitIndex = 0
    while(amount >= 1024 && unitIndex < units.length - 1){
        amount /= 1024
        unitIndex++
    }
    const decimals = amount >= 100 ? 0 : amount >= 10 ? 1 : 2
    return `${amount.toFixed(decimals)} ${units[unitIndex]}`
}

function flushLaunchTransferStats(){
    launchTransferStatsTimer = null
    if(pendingLaunchTransferStats == null){
        return
    }
    const { received, total, bytesPerSecond } = pendingLaunchTransferStats
    pendingLaunchTransferStats = null
    const receivedText = formatLaunchBytes(received)
    const totalText = formatLaunchBytes(total)
    const bytesText = receivedText && totalText ? `${receivedText} / ${totalText}` : ''
    const speedText = formatLaunchBytes(bytesPerSecond)
    const formattedSpeed = speedText ? `${speedText}/s` : ''
    if(launch_progress_bytes.textContent !== bytesText){
        launch_progress_bytes.textContent = bytesText
    }
    if(launch_progress_speed.textContent !== formattedSpeed){
        launch_progress_speed.textContent = formattedSpeed
    }
}

function setLaunchTransferStats(received, total, bytesPerSecond = 0){
    pendingLaunchTransferStats = { received, total, bytesPerSecond }
    if(launchTransferStatsTimer == null){
        launchTransferStatsTimer = setTimeout(flushLaunchTransferStats, 100)
    }
}

function clearLaunchTransferStats(){
    if(launchTransferStatsTimer != null){
        clearTimeout(launchTransferStatsTimer)
        launchTransferStatsTimer = null
    }
    pendingLaunchTransferStats = null
    launch_progress_bytes.textContent = ''
    launch_progress_speed.textContent = ''
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    const normalized = Math.max(0, Math.min(100, Number(percent) || 0))
    const rounded = Math.trunc(normalized)
    if(lastLaunchProgressValue === rounded){
        return
    }
    lastLaunchProgressValue = rounded
    launch_progress.max = 100
    launch_progress.value = rounded
    launch_progress_label.textContent = `${rounded}%`
    setLaunchButtonProgress(rounded)
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    const normalized = Math.max(0, Math.min(100, Number(percent) || 0))
    const rounded = Math.trunc(normalized)
    if(lastWindowProgressValue !== rounded){
        lastWindowProgressValue = rounded
        remote.getCurrentWindow().setProgressBar(rounded/100)
    }
    setLaunchPercentage(rounded)
}

// Bind the stateful launch/update/stop button.
launch_button.addEventListener('click', async () => {
    if(launchButtonState === LAUNCH_BUTTON_STATES.RUNNING){
        // Fire and forget: stopping Minecraft must never hold the UI handler.
        stopRunningGame().catch(err => {
            loggerLanding.error('Unable to stop Minecraft.', err)
            finalizeGameProcess(proc, 'stop failure')
        })
        return
    }
    if(isLaunchBusy() || launchButtonState === LAUNCH_BUTTON_STATES.DISABLED){
        return
    }

    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        if(server == null){
            return
        }

        if(launchButtonState === LAUNCH_BUTTON_STATES.RESTORE || selectedPackModified){
            loggerLanding.info('Restoring selected modpack..')
            setPackIntegrityStatus('Restaurando versión original...', 'working')
            setLaunchButtonState(LAUNCH_BUTTON_STATES.RESTORING, { progress: 0 })
            setLaunchDetails('Preparando la versión original...')
            toggleLaunchArea(true)
            await dlAsync(false, {
                restoring: true,
                cleanProtected: true,
                protectedDifferences: [...selectedPackDifferences]
            })
            return
        }

        if(launchButtonState === LAUNCH_BUTTON_STATES.UPDATE || selectedPackNeedsUpdate){
            loggerLanding.info('Updating selected modpack..')
            setLaunchButtonState(LAUNCH_BUTTON_STATES.UPDATING, { progress: 0 })
            setLaunchDetails('Comprobando actualización...')
            toggleLaunchArea(true)
            await dlAsync(false, { cleanProtected: true })
            return
        }

        if(!(await verifyPackBeforeLaunch(server))){
            return
        }

        loggerLanding.info('Launching game..')
        setLaunchButtonState(LAUNCH_BUTTON_STATES.LAUNCHING, { progress: 0 })
        setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
        toggleLaunchArea(true)

        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {
            const { validateSelectedJvm, ensureJavaDirIsRoot } = getLaunchRuntime()
            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()
            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error during launch/update process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = e => {
    switchView(getCurrentView(), VIEWS.settings)
    prepareSettings().catch(err => loggerLanding.warn('Unable to prepare Settings.', err))
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = e => {
    switchView(getCurrentView(), VIEWS.settings, 140, 140, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
    prepareSettings().catch(err => loggerLanding.warn('Unable to prepare Settings.', err))
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    const selectedId = serv != null ? serv.rawServer.id : null
    const selectionChanged = lastSelectedServerId !== selectedId

    if(selectionChanged && getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    if(ConfigManager.getSelectedServer() !== selectedId){
        ConfigManager.setSelectedServer(selectedId)
        ConfigManager.save()
    }
    lastSelectedServerId = selectedId

    applyLandingTheme(serv).catch(err => loggerLanding.warn('Unable to apply the selected version theme.', err))
    server_selection_button.innerHTML = '&#8226; ' + (serv != null ? serv.rawServer.name : Lang.queryJS('landing.selectedServer.noSelection'))
    syncLandingServerRailSelection(selectedId)
    populateLandingServerRail().catch(err => loggerLanding.warn('Unable to populate landing version list.', err))
    if(selectionChanged && getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    refreshSelectedPackButton(serv).catch(err => loggerLanding.warn('Unable to refresh selected pack state.', err))
    if(proc == null && launchButtonState !== LAUNCH_BUTTON_STATES.RUNNING && launchButtonState !== LAUNCH_BUTTON_STATES.STOPPING){
        setDiscordNavigationPresence(serv)
    }
}
/**
 * Keep the permanent version list on the left synchronized with the selected pack.
 * This replaces the need to open the selection modal from the play area.
 */
function syncLandingServerRailSelection(selectedId){
    if(landing_server_rail == null){
        return
    }
    const entries = landing_server_rail.querySelectorAll('.landingServerRailEntry')
    for(const entry of entries){
        const selected = entry.getAttribute('servid') === selectedId
        entry.toggleAttribute('selected', selected)
        entry.setAttribute('aria-selected', selected ? 'true' : 'false')
    }
}

/**
 * Show the soft fade only when the version list has more content below.
 */
function updateLandingServerRailFadeNow(){
    landingRailFadeFrame = null
    if(landing_server_rail == null || landing_server_rail_section == null){
        return
    }

    const hasOverflow = landing_server_rail.scrollHeight > landing_server_rail.clientHeight + 2
    const atBottom = !hasOverflow || (landing_server_rail.scrollTop + landing_server_rail.clientHeight >= landing_server_rail.scrollHeight - 3)
    landing_server_rail_section.toggleAttribute('scrollable', hasOverflow)
    landing_server_rail_section.toggleAttribute('at-bottom', atBottom)
}

function updateLandingServerRailFade(){
    if(landingRailFadeFrame != null){
        return
    }
    landingRailFadeFrame = requestAnimationFrame(updateLandingServerRailFadeNow)
}

if(landing_server_rail != null){
    landing_server_rail.addEventListener('scroll', updateLandingServerRailFade, { passive: true })
    window.addEventListener('resize', updateLandingServerRailFade, { passive: true })
    if(typeof ResizeObserver !== 'undefined'){
        const landingRailResizeObserver = new ResizeObserver(updateLandingServerRailFade)
        landingRailResizeObserver.observe(landing_server_rail)
    }
}

function escapeLandingText(value){
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#039;')
}


const DEFAULT_LANDING_ACCENT = '#ffffff'
let landingThemeRequest = 0

function normalizeAccentColor(value){
    if(typeof value !== 'string'){
        return null
    }

    let color = value.trim()
    if(/^#[0-9a-f]{3}$/i.test(color)){
        color = '#' + color.slice(1).split('').map(char => char + char).join('')
    }
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null
}

function accentDetails(color){
    const normalized = normalizeAccentColor(color) || DEFAULT_LANDING_ACCENT
    const red = Number.parseInt(normalized.slice(1, 3), 16)
    const green = Number.parseInt(normalized.slice(3, 5), 16)
    const blue = Number.parseInt(normalized.slice(5, 7), 16)
    const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
    return {
        color: normalized,
        rgb: `${red}, ${green}, ${blue}`,
        contrast: luminance > 158 ? '#050505' : '#ffffff'
    }
}

function applyAccentColor(color){
    const accent = accentDetails(color)
    const root = document.documentElement
    root.style.setProperty('--empi-accent', accent.color)
    root.style.setProperty('--empi-accent-rgb', accent.rgb)
    root.style.setProperty('--empi-accent-contrast', accent.contrast)
}

function flattenLandingModules(modules, accumulator = []){
    for(const module of modules || []){
        accumulator.push(module)
        if(module.subModules?.length){
            flattenLandingModules(module.subModules, accumulator)
        }
    }
    return accumulator
}

function getModuleRelativePath(module){
    const raw = module?.rawModule || module
    return String(raw?.artifact?.path || raw?.id || '').replaceAll('\\', '/').toLowerCase()
}

function findLandingFileModule(server, fileNames){
    const names = fileNames.map(name => name.toLowerCase())
    return flattenLandingModules(server?.modules).find(module => {
        const relativePath = getModuleRelativePath(module)
        return names.some(name => relativePath === name || relativePath.endsWith('/' + name))
    }) || null
}

function getLocalLandingAsset(server, module){
    const raw = module?.rawModule || module
    const relativePath = raw?.artifact?.path
    if(!relativePath || !server?.rawServer?.id){
        return null
    }

    const localPath = landingPath.resolve(
        ConfigManager.getInstanceDirectory(),
        server.rawServer.id,
        ...String(relativePath).replaceAll('\\', '/').split('/')
    )
    return landingFs.existsSync(localPath) ? localPath : null
}

async function readLandingTheme(server, themeModule){
    if(themeModule == null){
        return null
    }

    const cacheKey = `${server?.rawServer?.id || ''}|${server?.rawServer?.version || ''}|${getLandingModuleSignature(themeModule)}`
    if(landingThemeCache.has(cacheKey)){
        return await landingThemeCache.get(cacheKey)
    }

    const request = (async () => {
        const raw = themeModule.rawModule || themeModule
        const remoteUrl = raw?.artifact?.url

        if(remoteUrl){
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 1800)
            try {
                const artifact = raw?.artifact || {}
                const versionedThemeUrl = new URL(remoteUrl)
                versionedThemeUrl.searchParams.set('empiVersion', server?.rawServer?.version || '0')
                versionedThemeUrl.searchParams.set('empiHash', artifact.sha1 || artifact.hash || artifact.MD5 || artifact.size || 'theme')
                const response = await fetch(versionedThemeUrl.toString(), {
                    cache: 'no-store',
                    signal: controller.signal
                })
                if(response.ok){
                    return await response.json()
                }
            } catch(err) {
                loggerLanding.debug('Unable to load remote launcher theme, trying local copy.', err)
            } finally {
                clearTimeout(timeout)
            }
        }

        const localTheme = getLocalLandingAsset(server, themeModule)
        if(localTheme){
            try {
                return await landingFs.readJson(localTheme)
            } catch(err) {
                loggerLanding.warn('Unable to read local launcher theme.', err)
            }
        }

        return null
    })()

    setBoundedLandingCache(landingThemeCache, cacheKey, request, LANDING_THEME_CACHE_LIMIT)
    return await request
}

function resetLandingImage(element){
    if(element == null){
        return
    }

    element.onload = null
    element.onerror = null
    element.removeAttribute('loaded')
    element.removeAttribute('src')
    delete element.dataset.assetKey
    element.style.display = 'none'
}

function getLandingCachePath(server, imageModule){
    const raw = imageModule?.rawModule || imageModule || {}
    const artifact = raw.artifact || {}
    const sourcePath = String(artifact.path || '')
    let extension = landingPath.extname(sourcePath).toLowerCase()

    if(!extension && artifact.url){
        try {
            extension = landingPath.extname(new URL(artifact.url).pathname).toLowerCase()
        } catch(_) {
            extension = ''
        }
    }

    if(!/^\.(png|jpe?g|gif|apng|webp|avif)$/i.test(extension)){
        extension = '.img'
    }

    const digest = landingCrypto
        .createHash('sha256')
        .update(`${server?.rawServer?.id || ''}|${getLandingModuleSignature(imageModule)}`)
        .digest('hex')

    return landingPath.join(getLandingMediaCacheDirectory(), `${digest}${extension}`)
}

function getLandingCachedAsset(server, imageModule){
    if(server == null || imageModule == null){
        return null
    }

    const cachePath = getLandingCachePath(server, imageModule)
    try {
        if(landingFs.existsSync(cachePath)){
            const size = landingFs.statSync(cachePath).size
            const raw = imageModule?.rawModule || imageModule || {}
            const expectedSize = Number(raw?.artifact?.size)
            if(size > 0 && (!Number.isFinite(expectedSize) || expectedSize <= 0 || size === expectedSize)){
                return cachePath
            }
            landingFs.removeSync(cachePath)
        }
    } catch(_) {
        // Ignore stale cache entries and fall back to the remote asset.
    }
    return null
}

function requestLandingRemoteStream(remoteUrl, redirectCount = 0){
    if(redirectCount > 5){
        return Promise.reject(new Error('Too many redirects while caching landing media.'))
    }

    let parsed
    try {
        parsed = new URL(remoteUrl)
    } catch(error) {
        return Promise.reject(error)
    }

    const transport = parsed.protocol === 'https:'
        ? landingHttps
        : parsed.protocol === 'http:'
            ? landingHttp
            : null
    if(transport == null){
        return Promise.reject(new Error(`Unsupported landing media protocol: ${parsed.protocol}`))
    }

    return new Promise((resolve, reject) => {
        const request = transport.get(parsed, {
            headers: {
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'User-Agent': 'EmpiLauncher'
            }
        }, response => {
            const status = response.statusCode || 0
            const location = response.headers.location
            if(status >= 300 && status < 400 && location){
                response.resume()
                requestLandingRemoteStream(
                    new URL(location, parsed).href,
                    redirectCount + 1
                ).then(resolve, reject)
                return
            }
            if(status < 200 || status >= 300){
                response.resume()
                reject(new Error(`HTTP ${status}`))
                return
            }
            resolve(response)
        })
        request.setTimeout(20000, () => {
            request.destroy(new Error('Landing media cache request timed out.'))
        })
        request.on('error', reject)
    })
}

async function streamResponseToFile(response, destination, expectedSize){
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`
    await landingFs.ensureDir(landingPath.dirname(destination))

    try {
        await landingPipeline(
            response,
            landingFs.createWriteStream(temporary)
        )
        if(Number.isFinite(expectedSize) && expectedSize > 0){
            const downloadedSize = (await landingFs.stat(temporary)).size
            if(downloadedSize !== expectedSize){
                throw new Error(`Landing media size mismatch (${downloadedSize}/${expectedSize}).`)
            }
        }
        await landingFs.move(temporary, destination, { overwrite: true })
    } catch(err) {
        await landingFs.remove(temporary).catch(() => {})
        throw err
    }
}

async function cacheLandingRemoteAsset(server, imageModule){
    if(server == null || imageModule == null){
        return null
    }

    const localAsset = getLocalLandingAsset(server, imageModule)
    if(localAsset){
        return localAsset
    }

    const cachedAsset = getLandingCachedAsset(server, imageModule)
    if(cachedAsset){
        return cachedAsset
    }

    const raw = imageModule.rawModule || imageModule
    const remoteUrl = raw?.artifact?.url
    if(!remoteUrl){
        return null
    }

    const cachePath = getLandingCachePath(server, imageModule)
    const cacheKey = `${cachePath}|${remoteUrl}`
    if(landingMediaCacheJobs.has(cacheKey)){
        return await landingMediaCacheJobs.get(cacheKey)
    }

    const job = (async () => {
        try {
            // A file:// renderer cannot fetch GitHub Pages media because of
            // browser CORS rules. Stream the exact artifact URL through Node
            // into the local visual cache without changing the distribution.
            const response = await requestLandingRemoteStream(remoteUrl)
            await streamResponseToFile(response, cachePath, Number(raw?.artifact?.size))
            return cachePath
        } catch(err) {
            loggerLanding.debug('Unable to cache landing media.', err)
            return null
        } finally {
            landingMediaCacheJobs.delete(cacheKey)
        }
    })()

    landingMediaCacheJobs.set(cacheKey, job)
    return await job
}

function getLandingImageMimeType(filePath){
    switch(landingPath.extname(filePath).toLowerCase()){
        case '.gif': return 'image/gif'
        case '.png':
        case '.apng': return 'image/png'
        case '.jpg':
        case '.jpeg': return 'image/jpeg'
        case '.avif': return 'image/avif'
        case '.webp':
        default: return 'image/webp'
    }
}

function getLandingImageExtension(url){
    try {
        return landingPath.extname(new URL(url).pathname).toLowerCase()
    } catch(_) {
        return landingPath.extname(String(url).split(/[?#]/, 1)[0]).toLowerCase()
    }
}

function canContainLandingAnimation(url){
    return ['.gif', '.png', '.apng', '.webp', '.avif'].includes(getLandingImageExtension(url))
}

function getLandingAnimationCanvas(kind){
    return kind === 'background'
        ? landing_version_background_canvas
        : landing_version_banner_canvas
}

function stopLandingAnimation(canvas, clearVisual = true){
    if(canvas == null){
        return
    }
    const player = landingAnimationPlayers.get(canvas)
    if(player){
        player.cancelled = true
        if(player.timer != null){
            clearTimeout(player.timer)
        }
        try {
            player.decoder.close()
        } catch(_) {
            // A decoder can already be closed after reaching its final frame.
        }
        landingAnimationPlayers.delete(canvas)
    }
    if(clearVisual){
        canvas.removeAttribute('loaded')
        canvas.style.display = 'none'
        delete canvas.dataset.assetKey
        canvas.width = 1
        canvas.height = 1
    }
}

function getLandingCanvasSize(canvas, kind, frame){
    const sourceWidth = Math.max(1, frame.displayWidth)
    const sourceHeight = Math.max(1, frame.displayHeight)

    if(kind === 'background'){
        const parentWidth = canvas.parentElement?.clientWidth || window.innerWidth || 1180
        const parentHeight = canvas.parentElement?.clientHeight || window.innerHeight || 638
        const scale = Math.min(1, 1280 / parentWidth, 720 / parentHeight)
        return {
            width: Math.max(1, Math.round(parentWidth * scale)),
            height: Math.max(1, Math.round(parentHeight * scale))
        }
    }

    const scale = Math.min(1, 820 / sourceWidth, 445 / sourceHeight)
    return {
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale))
    }
}

function drawLandingAnimationFrame(canvas, kind, frame){
    const target = getLandingCanvasSize(canvas, kind, frame)
    if(canvas.width !== target.width || canvas.height !== target.height){
        canvas.width = target.width
        canvas.height = target.height
    }

    // A desynchronized/software context can retain valid pixels without being
    // composed by some Electron/Windows GPU combinations. The normal 2D
    // context remains memory-bounded and reliably reaches the visible surface.
    const context = canvas.getContext('2d', {
        alpha: kind !== 'background'
    })
    if(context == null){
        return false
    }

    const sourceWidth = Math.max(1, frame.displayWidth)
    const sourceHeight = Math.max(1, frame.displayHeight)
    context.clearRect(0, 0, canvas.width, canvas.height)

    if(kind === 'background'){
        const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
        const width = sourceWidth * scale
        const height = sourceHeight * scale
        context.drawImage(
            frame,
            (canvas.width - width) / 2,
            (canvas.height - height) / 2,
            width,
            height
        )
    } else {
        context.drawImage(frame, 0, 0, canvas.width, canvas.height)
    }
    return true
}

function isLandingAnimationVisible(canvas){
    const landingContainer = document.getElementById('landingContainer')
    return !document.hidden
        && !document.documentElement.hasAttribute('data-empi-inactive')
        && canvas.isConnected
        && landingContainer?.style.display !== 'none'
}

async function getLandingAnimationFile(server, imageModule, source){
    if(source.local && source.url.startsWith('file:')){
        return landingFileURLToPath(source.url)
    }
    return await cacheLandingRemoteAsset(server, imageModule)
}

function getLandingAnimationCachePath(server, imageModule, kind){
    const digest = landingCrypto
        .createHash('sha256')
        .update([
            LANDING_ANIMATION_CACHE_VERSION,
            kind,
            server?.rawServer?.id || '',
            getLandingModuleSignature(imageModule)
        ].join('|'))
        .digest('hex')
    return landingPath.join(getLandingAnimationCacheDirectory(), `${digest}.webp`)
}

function getCachedLandingAnimation(server, imageModule, kind){
    const cachePath = getLandingAnimationCachePath(server, imageModule, kind)
    try {
        if(landingFs.existsSync(cachePath) && landingFs.statSync(cachePath).size > 0){
            return cachePath
        }
    } catch(_) {
        // A partial cache entry is regenerated below.
    }
    return null
}

function getLandingSharp(){
    if(landingSharp === false){
        return null
    }
    if(landingSharp == null){
        try {
            landingSharp = require('sharp')
            landingSharp.cache({ memory: 64, files: 20, items: 100 })
            landingSharp.concurrency(1)
        } catch(_error) {
            landingSharp = false
            loggerLanding.info('Optional landing animation optimization is unavailable; original animations remain enabled.')
            return null
        }
    }
    return landingSharp
}

async function pruneLandingAnimationCache(){
    const directory = getLandingAnimationCacheDirectory()
    try {
        const names = (await landingFs.readdir(directory)).filter(name => name.endsWith('.webp'))
        const files = await Promise.all(names.map(async name => {
            const filePath = landingPath.join(directory, name)
            const stats = await landingFs.stat(filePath)
            return { filePath, modified: stats.mtimeMs, size: stats.size }
        }))
        files.sort((left, right) => right.modified - left.modified)

        let retainedBytes = 0
        for(const [index, file] of files.entries()){
            retainedBytes += file.size
            if(
                index >= LANDING_ANIMATION_CACHE_FILE_LIMIT
                || retainedBytes > LANDING_ANIMATION_CACHE_BYTE_LIMIT
            ){
                await landingFs.remove(file.filePath)
            }
        }
    } catch(err) {
        loggerLanding.debug('Unable to prune the optimized landing animation cache.', err)
    }
}

async function createOptimizedLandingAnimation(server, imageModule, kind, sourcePath){
    const cachePath = getLandingAnimationCachePath(server, imageModule, kind)
    if(getCachedLandingAnimation(server, imageModule, kind)){
        return cachePath
    }
    if(landingAnimationOptimizationJobs.has(cachePath)){
        return await landingAnimationOptimizationJobs.get(cachePath)
    }

    const job = landingAnimationOptimizationQueue.catch(() => {}).then(async () => {
        const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`
        try {
            const sharp = getLandingSharp()
            if(sharp == null){
                return null
            }
            const inputOptions = {
                animated: true,
                sequentialRead: true,
                limitInputPixels: false
            }
            const metadata = await sharp(sourcePath, inputOptions).metadata()
            if(!Number.isFinite(metadata.pages) || metadata.pages <= 1){
                return null
            }

            const width = kind === 'background' ? 1280 : 820
            const height = kind === 'background' ? 720 : 445
            await landingFs.ensureDir(landingPath.dirname(cachePath))
            await sharp(sourcePath, inputOptions)
                .resize({
                    width,
                    height,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({
                    quality: 90,
                    alphaQuality: 100,
                    effort: 0,
                    loop: metadata.loop ?? 0,
                    delay: metadata.delay,
                    mixed: true,
                    exact: true,
                    keepDuplicateFrames: true
                })
                .toFile(temporary)
            await landingFs.move(temporary, cachePath, { overwrite: true })
            await pruneLandingAnimationCache()
            return cachePath
        } catch(err) {
            await landingFs.remove(temporary).catch(() => {})
            loggerLanding.debug('Unable to create the optimized animated landing copy.', err)
            return null
        } finally {
            landingAnimationOptimizationJobs.delete(cachePath)
        }
    })

    landingAnimationOptimizationJobs.set(cachePath, job)
    landingAnimationOptimizationQueue = job
    return await job
}

/**
 * Chromium's native <img> animation path may retain hundreds of decoded
 * full-resolution frames. ImageDecoder lets the launcher keep the original
 * animation and timing while closing every VideoFrame immediately after it is
 * painted. Static and unsupported formats continue through the native <img>
 * path, so no accepted format loses compatibility.
 */
async function startBoundedLandingAnimation(element, canvas, kind, server, imageModule, source, assetKey, requestId){
    if(
        canvas == null
        || typeof ImageDecoder === 'undefined'
        || !canContainLandingAnimation(source.url)
    ){
        return false
    }

    let decoder
    try {
        const originalFile = await getLandingAnimationFile(server, imageModule, source)
        if(!originalFile || requestId !== landingThemeRequest){
            return false
        }

        const cachedAnimation = getCachedLandingAnimation(server, imageModule, kind)
        const localFile = cachedAnimation || originalFile
        const type = getLandingImageMimeType(localFile)
        if(!await ImageDecoder.isTypeSupported(type)){
            return false
        }

        const bytes = await landingFs.readFile(localFile)
        decoder = new ImageDecoder({
            data: bytes,
            type,
            preferAnimation: true
        })
        await decoder.tracks.ready
        const track = decoder.tracks.selectedTrack
        if(track == null || track.frameCount <= 1 || requestId !== landingThemeRequest){
            decoder.close()
            return false
        }

        const firstResult = await decoder.decode({ frameIndex: 0 })
        const firstFrame = firstResult.image
        let firstFrameDrawn = false
        let initialDuration = 40
        try {
            firstFrameDrawn = drawLandingAnimationFrame(canvas, kind, firstFrame)
            initialDuration = Number.isFinite(firstFrame.duration)
                ? Math.min(1000, Math.max(20, firstFrame.duration / 1000))
                : 40
        } finally {
            firstFrame.close()
        }
        if(!firstFrameDrawn || requestId !== landingThemeRequest){
            decoder.close()
            return false
        }

        stopLandingAnimation(canvas, false)
        resetLandingImage(element)
        canvas.dataset.assetKey = assetKey
        canvas.style.display = 'block'
        canvas.setAttribute('loaded', '')
        if(kind === 'background'){
            clearLandingBodyFallback()
        }

        const player = {
            decoder,
            canvas,
            kind,
            frameCount: track.frameCount,
            frameIndex: 1,
            completedLoops: 0,
            repetitionCount: track.repetitionCount,
            sourceFile: localFile,
            requestId,
            timer: null,
            cancelled: false,
            paused: false,
            resume: null
        }
        landingAnimationPlayers.set(canvas, player)

        const renderNextFrame = async () => {
            if(player.cancelled || landingAnimationPlayers.get(canvas) !== player){
                return
            }
            if(player.requestId !== landingThemeRequest){
                stopLandingAnimation(canvas)
                return
            }
            if(!isLandingAnimationVisible(canvas)){
                // Stay completely idle until focus/visibility explicitly
                // resumes the player. Polling here kept waking the background
                // renderer four times per second.
                player.paused = true
                player.timer = null
                return
            }
            player.paused = false

            const started = performance.now()
            try {
                const result = await player.decoder.decode({ frameIndex: player.frameIndex })
                const frame = result.image
                let duration = 40
                try {
                    drawLandingAnimationFrame(canvas, kind, frame)
                    duration = Number.isFinite(frame.duration)
                        ? Math.min(1000, Math.max(20, frame.duration / 1000))
                        : 40
                } finally {
                    frame.close()
                }

                player.frameIndex++
                if(player.frameIndex >= player.frameCount){
                    player.frameIndex = 0
                    player.completedLoops++
                    if(
                        Number.isFinite(player.repetitionCount)
                        && player.repetitionCount > 0
                        && player.completedLoops > player.repetitionCount
                    ){
                        try {
                            player.decoder.close()
                        } catch(_) {
                            // Keep the final frame visible.
                        }
                        landingAnimationPlayers.delete(canvas)
                        return
                    }
                }

                const remaining = Math.max(0, duration - (performance.now() - started))
                player.timer = setTimeout(renderNextFrame, remaining)
            } catch(err) {
                if(player.cancelled || landingAnimationPlayers.get(canvas) !== player){
                    return
                }
                loggerLanding.debug('Unable to decode the next landing animation frame.', err)
                stopLandingAnimation(canvas, false)
                canvas.style.display = 'block'
                canvas.setAttribute('loaded', '')
            }
        }

        player.resume = renderNextFrame
        player.timer = setTimeout(renderNextFrame, initialDuration)
        if(cachedAnimation == null){
            setTimeout(async () => {
                const optimized = await createOptimizedLandingAnimation(
                    server,
                    imageModule,
                    kind,
                    originalFile
                )
                if(
                    !optimized
                    || requestId !== landingThemeRequest
                    || canvas.dataset.assetKey !== assetKey
                ){
                    return
                }
                await startBoundedLandingAnimation(
                    element,
                    canvas,
                    kind,
                    server,
                    imageModule,
                    { url: landingPathToFileURL(optimized).href, local: true },
                    assetKey,
                    requestId
                )
            }, 0)
        }
        return true
    } catch(err) {
        if(decoder){
            try {
                decoder.close()
            } catch(_) {
                // Ignore a decoder that failed while closing.
            }
        }
        loggerLanding.debug('Unable to start the bounded landing animation; using native image playback.', err)
        return false
    }
}

function getImmediateLandingSource(server, imageModule){
    const localAsset = getLocalLandingAsset(server, imageModule)
    if(localAsset){
        return {
            url: landingPathToFileURL(localAsset).href,
            local: true
        }
    }

    const cachedAsset = getLandingCachedAsset(server, imageModule)
    if(cachedAsset){
        return {
            url: landingPathToFileURL(cachedAsset).href,
            local: true
        }
    }

    const raw = imageModule?.rawModule || imageModule
    const remoteUrl = raw?.artifact?.url || null
    return remoteUrl ? { url: remoteUrl, local: false } : null
}

function preloadLandingImage(url, cacheKey){
    if(!url){
        return Promise.resolve(null)
    }
    if(landingImageDecodeCache.has(cacheKey)){
        return landingImageDecodeCache.get(cacheKey)
    }

    const promise = new Promise(resolve => {
        const image = new Image()
        image.decoding = 'async'
        image.fetchPriority = 'high'
        image.onload = async () => {
            try {
                if(typeof image.decode === 'function'){
                    await image.decode()
                }
            } catch(_) {
                // The first frame is already usable even if decode() rejects.
            }
            resolve(url)
        }
        image.onerror = () => resolve(null)
        image.src = url
    })

    setBoundedLandingCache(landingImageDecodeCache, cacheKey, promise, LANDING_DECODE_CACHE_LIMIT)
    promise.then(result => {
        // A transient network/decode failure must be retryable later.
        if(result == null && landingImageDecodeCache.get(cacheKey) === promise){
            landingImageDecodeCache.delete(cacheKey)
        }
    })
    return promise
}

function clearLandingBodyFallback(){
    document.body.style.backgroundImage = 'none'
    document.body.removeAttribute('data-empi-landing-fallback')
}

function saveLastLandingVisual(kind, url, assetKey){
    try {
        const current = JSON.parse(localStorage.getItem(LANDING_LAST_VISUALS_KEY) || '{}')
        current[kind] = { url, assetKey, savedAt: Date.now() }
        localStorage.setItem(LANDING_LAST_VISUALS_KEY, JSON.stringify(current))
    } catch(_) {
        // Storage is only a visual fast path. Never block the launcher on it.
    }
}

function restoreLastLandingVisual(element, kind){
    if(element == null){
        return
    }
    try {
        const saved = JSON.parse(localStorage.getItem(LANDING_LAST_VISUALS_KEY) || '{}')[kind]
        if(!saved?.url){
            return
        }
        if(kind === 'background'){
            document.body.style.backgroundImage = `url("${String(saved.url).replaceAll('"', '%22')}")`
            document.body.style.backgroundSize = 'cover'
            document.body.style.backgroundPosition = 'center'
            document.body.setAttribute('data-empi-landing-fallback', '')
        }
        element.onload = () => {
            element.style.display = 'block'
            element.setAttribute('loaded', '')
            if(kind === 'background'){
                clearLandingBodyFallback()
            }
        }
        element.onerror = () => {
            element.onload = null
            element.onerror = null
        }
        element.dataset.assetKey = saved.assetKey || `bootstrap-${kind}`
        element.src = saved.url
    } catch(_) {
        // Ignore malformed or obsolete local storage values.
    }
}

function commitLandingImage(element, kind, url, assetKey, requestId, persist = true){
    if(element == null || requestId !== landingThemeRequest){
        return false
    }

    stopLandingAnimation(getLandingAnimationCanvas(kind))
    element.onload = () => {
        if(requestId !== landingThemeRequest){
            return
        }
        element.style.display = 'block'
        requestAnimationFrame(() => element.setAttribute('loaded', ''))
        if(kind === 'background'){
            clearLandingBodyFallback()
        }
    }
    element.onerror = null
    element.dataset.assetKey = assetKey
    element.src = url

    // The image was already decoded by preloadLandingImage(), therefore the
    // source swap is normally painted in the same frame.
    element.style.display = 'block'
    element.setAttribute('loaded', '')
    if(persist){
        saveLastLandingVisual(kind, url, assetKey)
    }
    if(kind === 'background'){
        clearLandingBodyFallback()
    }
    return true
}

/**
 * Prepare a visual before replacing the current one. This avoids the black gap
 * which previously appeared while a heavy GIF/APNG was downloading or decoding.
 */
async function showLandingImage(element, kind, server, imageModule, previewModule, requestId){
    const canvas = getLandingAnimationCanvas(kind)
    if(element == null || imageModule == null){
        resetLandingImage(element)
        stopLandingAnimation(canvas)
        return
    }

    const assetKey = `${server?.rawServer?.id || ''}|${getLandingModuleSignature(imageModule)}`
    if(canvas?.dataset.assetKey === assetKey){
        canvas.style.display = 'block'
        canvas.setAttribute('loaded', '')
        return
    }
    if(element.dataset.assetKey === assetKey && element.getAttribute('src')){
        element.style.display = 'block'
        element.setAttribute('loaded', '')
        // A restored native GIF/WebP is only the immediate fallback. Continue
        // below so it can be replaced by the bounded canvas player once the
        // local or cached file is ready.
        if(
            canvas == null
            || typeof ImageDecoder === 'undefined'
            || !canContainLandingAnimation(element.getAttribute('src'))
        ){
            return
        }
    }

    // Optional tiny preview files can be included as background-preview.webp
    // and banner-preview.webp. They are displayed while the full animation is
    // still arriving, without being required for normal packs.
    if(previewModule){
        const previewSource = getImmediateLandingSource(server, previewModule)
        if(previewSource){
            const previewKey = `${server.rawServer.id}|preview|${getLandingModuleSignature(previewModule)}`
            const preparedPreview = await preloadLandingImage(previewSource.url, previewKey)
            if(preparedPreview && requestId === landingThemeRequest){
                commitLandingImage(element, kind, preparedPreview, previewKey, requestId)
                if(!previewSource.local){
                    setTimeout(() => cacheLandingRemoteAsset(server, previewModule), 0)
                }
            }
        }
    }

    let source = getImmediateLandingSource(server, imageModule)
    if(source == null){
        resetLandingImage(element)
        stopLandingAnimation(canvas)
        return
    }

    // Remote EmpiPacks media should appear immediately while its exact file is
    // streamed into the local cache. The native element is released as soon as
    // the one-frame-at-a-time canvas player is ready.
    if(!source.local){
        commitLandingImage(
            element,
            kind,
            source.url,
            assetKey,
            requestId,
            false
        )
    }

    if(await startBoundedLandingAnimation(
        element,
        canvas,
        kind,
        server,
        imageModule,
        source,
        assetKey,
        requestId
    )){
        return
    }

    // Animation probing may have populated the disk cache. Prefer that local
    // copy for the native fallback and for all static formats.
    source = getImmediateLandingSource(server, imageModule) || source

    let prepared = await preloadLandingImage(source.url, assetKey)

    // A remote URL can fail temporarily while a downloaded or cached copy is
    // still available. Re-evaluate local sources before giving up.
    if(prepared == null && !source.local){
        const cachedPath = await cacheLandingRemoteAsset(server, imageModule)
        if(cachedPath){
            source = { url: landingPathToFileURL(cachedPath).href, local: true }
            prepared = await preloadLandingImage(source.url, `${assetKey}|disk`)
        }
    }

    if(prepared == null || requestId !== landingThemeRequest){
        return
    }

    commitLandingImage(
        element,
        kind,
        prepared,
        assetKey,
        requestId
    )

    // Cache the remote source after it is already visible. This does not delay
    // the first paint and makes every later launch/switch use a local file.
    if(!source.local){
        setTimeout(async () => {
            const cachedPath = await cacheLandingRemoteAsset(server, imageModule)
            if(!cachedPath || requestId !== landingThemeRequest){
                return
            }
            const cachedUrl = landingPathToFileURL(cachedPath).href
            saveLastLandingVisual(kind, cachedUrl, assetKey)
        }, 0)
    }
}

function findLandingPreviewModule(server, kind){
    if(kind === 'banner'){
        return findLandingFileModule(server, [
            'banner-preview.webp', 'banner-preview.png', 'banner-preview.jpg',
            'logo-preview.webp', 'logo-preview.png', 'logo-preview.jpg'
        ])
    }
    return findLandingFileModule(server, [
        'background-preview.webp', 'background-preview.png', 'background-preview.jpg'
    ])
}

function getLandingVisualModules(server){
    return {
        banner: findLandingFileModule(server, [
            'banner.png', 'banner.gif', 'banner.apng', 'banner.webp',
            'banner.jpg', 'banner.jpeg', 'banner.avif', 'logo.png',
            'logo.gif', 'logo.apng', 'logo.webp'
        ]),
        background: findLandingFileModule(server, [
            'background.png', 'background.gif', 'background.apng',
            'background.webp', 'background.jpg', 'background.jpeg',
            'background.avif'
        ]),
        bannerPreview: findLandingPreviewModule(server, 'banner'),
        backgroundPreview: findLandingPreviewModule(server, 'background'),
        theme: findLandingFileModule(server, ['theme.json', 'launcher-theme.json'])
    }
}

async function applyLandingTheme(server){
    if(empiPerformanceModeActive){
        // No se descarga, decodifica ni muestra ningún fondo o banner (ni
        // siquiera el theme.json remoto), y no se inicia ningún reproductor
        // de animación. El resto del launcher (rail de versiones, botón de
        // juego, barra de progreso) sigue funcionando con normalidad.
        ++landingThemeRequest
        landingThemeSignature = null
        applyAccentColor(DEFAULT_LANDING_ACCENT)
        resetLandingImage(landing_version_banner)
        resetLandingImage(landing_version_background)
        stopLandingAnimation(landing_version_banner_canvas)
        stopLandingAnimation(landing_version_background_canvas)
        clearLandingBodyFallback()
        return
    }
    if(server == null){
        ++landingThemeRequest
        landingThemeSignature = null
        applyAccentColor(DEFAULT_LANDING_ACCENT)
        resetLandingImage(landing_version_banner)
        resetLandingImage(landing_version_background)
        stopLandingAnimation(landing_version_banner_canvas)
        stopLandingAnimation(landing_version_background_canvas)
        return
    }

    const modules = getLandingVisualModules(server)
    const rawTheme = server.rawServer?.theme || {}
    const directAccent = server.rawServer?.accent || rawTheme.accent || rawTheme.color
    const signature = [
        server.rawServer.id,
        getLandingModuleSignature(modules.banner),
        getLandingModuleSignature(modules.background),
        getLandingModuleSignature(modules.theme),
        directAccent || ''
    ].join('||')

    if(signature === landingThemeSignature){
        return
    }
    const requestId = ++landingThemeRequest
    landingThemeSignature = signature
    applyAccentColor(directAccent || DEFAULT_LANDING_ACCENT)

    // Start both heavy assets at the same time. The previous visual remains on
    // screen until each replacement is completely ready.
    const visualLoads = Promise.allSettled([
        showLandingImage(
            landing_version_background,
            'background',
            server,
            modules.background,
            modules.backgroundPreview,
            requestId
        ),
        showLandingImage(
            landing_version_banner,
            'banner',
            server,
            modules.banner,
            modules.bannerPreview,
            requestId
        )
    ])

    const theme = await readLandingTheme(server, modules.theme)
    if(requestId === landingThemeRequest && theme != null){
        applyAccentColor(theme.accent || theme.accentColor || theme.color || directAccent || DEFAULT_LANDING_ACCENT)
    }

    await visualLoads
}

// Restore the previous landing visuals before the distribution request finishes.
// This makes startup feel immediate even with very large animated assets.
// Skipped entirely in performance mode: nothing decorative should ever touch
// the DOM, not even the cached image from the previous session.
if(!empiPerformanceModeActive){
    restoreLastLandingVisual(landing_version_background, 'background')
    restoreLastLandingVisual(landing_version_banner, 'banner')
}

function isLandingServerWhitelisted(server){
    const raw = server?.rawServer || server || {}
    const candidates = [
        raw.whitelist,
        raw.meta?.whitelist,
        raw.metadata?.whitelist,
        raw.serverMeta?.whitelist
    ]

    return candidates.some(value => value === true || String(value).toLowerCase() === 'true')
}

async function populateLandingServerRail(){
    if(landing_server_rail == null){
        return
    }

    const distro = await DistroAPI.getDistribution()
    const selectedId = ConfigManager.getSelectedServer()
    const nextSignature = getLandingRailSignature(distro)
    remoteDistributionSignature ??= getLandingDistributionSignature(distro)

    if(nextSignature === landingRailSignature){
        syncLandingServerRailSelection(selectedId)
        updateLandingServerRailFade()
        return
    }
    landingRailSignature = nextSignature

    const previousScrollTop = landing_server_rail.scrollTop
    const entries = distro.servers.map(serv => {
        const raw = serv.rawServer
        const selected = raw.id === selectedId
        const icon = escapeLandingText(raw.icon)
        const name = escapeLandingText(raw.name)
        const description = escapeLandingText(raw.description)
        const minecraftVersion = escapeLandingText(raw.minecraftVersion)
        const packVersion = escapeLandingText(raw.version)
        return `<button class="landingServerRailEntry" servid="${escapeLandingText(raw.id)}" role="option" aria-selected="${selected ? 'true' : 'false'}" ${selected ? 'selected' : ''} title="${name}">
            <img class="landingServerRailIcon" src="${icon}" alt="" loading="lazy" decoding="async"/>
            <span class="landingServerRailDetails">
                <span class="landingServerRailName">${name}</span>
                <span class="landingServerRailDescription">${description}</span>
                <span class="landingServerRailMeta">
                    <span>${minecraftVersion}</span>
                    <span>${packVersion}</span>
                    ${raw.mainServer ? '<span class="landingServerRailMain">Principal</span>' : ''}
                    ${isLandingServerWhitelisted(serv) ? '<span class="landingServerRailWhitelist">Whitelist</span>' : ''}
                </span>
            </span>
        </button>`
    }).join('')

    landing_server_rail.innerHTML = entries || '<div class="landingServerRailEmpty">No hay versiones disponibles.</div>'
    landing_server_rail.scrollTop = Math.min(previousScrollTop, Math.max(0, landing_server_rail.scrollHeight - landing_server_rail.clientHeight))

    const selectedEntry = landing_server_rail.querySelector('.landingServerRailEntry[selected]')
    if(previousScrollTop === 0 && selectedEntry != null && selectedEntry.offsetTop + selectedEntry.offsetHeight > landing_server_rail.clientHeight){
        landing_server_rail.scrollTop = Math.max(0, selectedEntry.offsetTop - 8)
    }

    updateLandingServerRailFade()
}

if(landing_server_rail != null && landing_server_rail.dataset.selectionBound !== 'true'){
    landing_server_rail.dataset.selectionBound = 'true'
    landing_server_rail.addEventListener('click', async event => {
        const entry = event.target.closest('.landingServerRailEntry')
        if(entry == null || !landing_server_rail.contains(entry)){
            return
        }
        if(proc != null || isLaunchBusy()){
            entry.blur()
            return
        }
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(entry.getAttribute('servid'))
        if(server == null){
            return
        }
        updateSelectedServer(server)
        refreshServerStatus(true)
        entry.blur()
    })
}

// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' + Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update Mojang/Microsoft service status.
// A grey response means the public status endpoint did not provide a definite
// result. It should not make a signed-in account look broken, so the summary
// stays green unless a service explicitly reports yellow or red.
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'green'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    let statuses
    try {
        const response = await MojangRestAPI.status()
        if(response.responseStatus === RestResponseStatus.SUCCESS) {
            statuses = response.data
        } else {
            loggerLanding.warn('Unable to refresh Mojang service status.')
            statuses = MojangRestAPI.getDefaultStatuses()
        }
    } catch(err) {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        loggerLanding.debug(err)
        statuses = MojangRestAPI.getDefaultStatuses()
    }

    let hasYellow = false
    let hasRed = false

    for(const service of statuses){
        const serviceStatus = service.status || 'grey'
        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" data-status="${serviceStatus}" style="color: ${MojangRestAPI.statusToHex(serviceStatus)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`

        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        hasYellow ||= serviceStatus === 'yellow'
        hasRed ||= serviceStatus === 'red'
    }

    if(hasRed){
        status = 'red'
    } else if(hasYellow){
        status = 'yellow'
    }

    const essentialContainer = document.getElementById('mojangStatusEssentialContainer')
    const nonEssentialContainer = document.getElementById('mojangStatusNonEssentialContainer')
    const summaryIcon = document.getElementById('mojang_status_icon')

    if(essentialContainer != null){
        essentialContainer.innerHTML = tooltipEssentialHTML
    }
    if(nonEssentialContainer != null){
        nonEssentialContainer.innerHTML = tooltipNonEssentialHTML
    }
    if(summaryIcon != null){
        summaryIcon.dataset.status = status
        summaryIcon.style.color = MojangRestAPI.statusToHex(status)
    }
}

function delayServerStatusRetry(milliseconds){
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function getServerStatusWithRetry(server, attempts = 2){
    let lastError
    for(let attempt = 0; attempt < attempts; attempt++){
        try {
            return await getServerStatus(47, server.hostname, server.port)
        } catch(err) {
            lastError = err
            if(attempt < attempts - 1){
                await delayServerStatusRetry(650)
            }
        }
    }
    throw lastError
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const distro = await DistroAPI.getDistribution()
    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    if(serv != null){
        try {
            const servStat = await getServerStatusWithRetry(serv)
            pLabel = Lang.queryJS('landing.serverStatus.players')
            pVal = `${servStat.players.online}/${servStat.players.max}`
        } catch(err) {
            loggerLanding.warn('Unable to refresh server status after retry, assuming offline.')
            loggerLanding.debug(err)
        }
    }

    const applyStatus = () => {
        const label = document.getElementById('landingPlayerLabel')
        const count = document.getElementById('player_count')
        if(label != null){
            label.innerHTML = pLabel
        }
        if(count != null){
            count.innerHTML = pVal
        }
    }

    if(fade){
        $('#server_status_wrapper').stop(true, true).fadeOut(160, () => {
            applyStatus()
            $('#server_status_wrapper').fadeIn(240)
        })
    } else {
        applyStatus()
    }
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour.
const mojangStatusListener = setInterval(() => {
    if(!document.hidden){
        refreshMojangStatuses().catch(err => loggerLanding.debug('Unable to refresh Mojang status in background.', err))
    }
}, 60*60*1000)
// Refresh the selected Minecraft server every five minutes.
const serverStatusListener = setInterval(() => {
    if(!document.hidden){
        refreshServerStatus(true).catch(err => loggerLanding.debug('Unable to refresh server status in background.', err))
    }
}, 300000)

async function refreshDistributionWithoutCache(){
    const originalUrl = DistroAPI['remoteUrl']
    if(typeof originalUrl !== 'string' || originalUrl.length === 0){
        return await DistroAPI.refreshDistributionOrFallback()
    }
    const cleanUrl = originalUrl.replace(/([?&])_empiRefresh=\d+(&?)/, (_match, prefix, suffix) => suffix ? prefix : '')
    DistroAPI['remoteUrl'] = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}_empiRefresh=${Date.now()}`
    try {
        return await DistroAPI.refreshDistributionOrFallback()
    } finally {
        DistroAPI['remoteUrl'] = cleanUrl
    }
}

let packUpdateRefreshInFlight = false
const PACK_REMOTE_REFRESH_INTERVAL = 5 * 60 * 1000
const PACK_FOCUS_REFRESH_COOLDOWN = 30 * 1000
let lastPackUpdateRefresh = Date.now()
let packFocusRefreshTimer = null
async function refreshPackUpdateFromRemote(force = false){
    const elapsed = Date.now() - lastPackUpdateRefresh
    const cooldown = force ? PACK_FOCUS_REFRESH_COOLDOWN : PACK_REMOTE_REFRESH_INTERVAL
    if(document.hidden || packUpdateRefreshInFlight || proc != null || isLaunchBusy() || elapsed < cooldown){
        return
    }
    packUpdateRefreshInFlight = true
    lastPackUpdateRefresh = Date.now()
    try {
        const distro = await refreshDistributionWithoutCache()
        const nextSignature = getLandingDistributionSignature(distro)
        const distributionChanged = remoteDistributionSignature != null && nextSignature !== remoteDistributionSignature
        remoteDistributionSignature = nextSignature

        if(distributionChanged){
            // Only rebuild the rail/theme/settings when the remote metadata changed.
            landingRailSignature = null
            landingThemeSignature = null
            onDistroRefresh(distro)
        }
        // Local integrity is verified before every launch and after focus. A
        // periodic unchanged remote response must not hash the whole modpack.
        if(force && !distributionChanged){
            await refreshSelectedPackButton(distro.getServerById(ConfigManager.getSelectedServer()))
        }
    } catch(err) {
        loggerLanding.debug('Unable to refresh modpack update state.', err)
    } finally {
        packUpdateRefreshInFlight = false
    }
}

let landingVisualsSuspended = false

function suspendLandingVisuals(){
    if(landingVisualsSuspended){
        return
    }
    landingVisualsSuspended = true
    ++landingThemeRequest
    landingThemeSignature = null
    resetLandingImage(landing_version_banner)
    resetLandingImage(landing_version_background)
    stopLandingAnimation(landing_version_banner_canvas)
    stopLandingAnimation(landing_version_background_canvas)
    clearLandingBodyFallback()
}

async function restoreLandingVisuals(){
    if(!landingVisualsSuspended || document.hidden){
        return
    }
    landingVisualsSuspended = false
    try {
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(ConfigManager.getSelectedServer())
        await applyLandingTheme(server)
    } catch(error) {
        landingVisualsSuspended = true
        loggerLanding.debug('Unable to restore the landing visuals after background mode.', error)
    }
}

function pauseLandingAnimations(){
    for(const player of landingAnimationPlayers.values()){
        if(player.timer != null){
            clearTimeout(player.timer)
            player.timer = null
        }
        player.paused = true
    }
}

function resumeLandingAnimations(){
    for(const player of landingAnimationPlayers.values()){
        if(
            player.cancelled
            || !player.paused
            || typeof player.resume !== 'function'
            || !isLandingAnimationVisible(player.canvas)
        ){
            continue
        }
        player.paused = false
        player.timer = setTimeout(player.resume, 0)
    }
}

function scheduleFocusedPackRefresh(){
    document.documentElement.removeAttribute('data-empi-inactive')
    resumeLandingAnimations()
    restoreLandingVisuals()
    if(packFocusRefreshTimer != null){
        clearTimeout(packFocusRefreshTimer)
    }
    packFocusRefreshTimer = setTimeout(() => {
        packFocusRefreshTimer = null
        refreshPackUpdateFromRemote(true)
    }, 350)
}

window.addEventListener('focus', scheduleFocusedPackRefresh, { passive: true })
document.addEventListener('visibilitychange', () => {
    document.documentElement.toggleAttribute('data-empi-inactive', document.hidden)
    if(document.hidden){
        pauseLandingAnimations()
        suspendLandingVisuals()
    } else {
        resumeLandingAnimations()
        restoreLandingVisuals()
        scheduleFocusedPackRefresh()
    }
})
window.addEventListener('blur', () => {
    document.documentElement.setAttribute('data-empi-inactive', '')
    pauseLandingAnimations()
}, { passive: true })
window.addEventListener('empi-background-state', event => {
    if(event.detail?.inBackground){
        pauseLandingAnimations()
        suspendLandingVisuals()
    } else {
        resumeLandingAnimations()
        restoreLandingVisuals()
    }
})
const packUpdateStatusListener = setInterval(
    () => refreshPackUpdateFromRemote(false),
    PACK_REMOTE_REFRESH_INTERVAL
)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
    if(proc == null){
        setLaunchButtonState(LAUNCH_BUTTON_STATES.DISABLED)
        refreshSelectedPackButton().catch(err => loggerLanding.warn('Unable to restore launch button after failure.', err))
    }
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const { discoverBestJvmInstallation } = getLaunchRuntime()
    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                    setLaunchButtonState(LAUNCH_BUTTON_STATES.DISABLED)
                    refreshSelectedPackButton().catch(err => loggerLanding.warn('Unable to restore launch button.', err))
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = getLaunchRuntime().javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await getLaunchRuntime().latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    const javaDownloadStarted = Date.now()
    await getLaunchRuntime().downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        const elapsedSeconds = Math.max((Date.now() - javaDownloadStarted) / 1000, 0.1)
        setLaunchTransferStats(transferred, asset.size, transferred / elapsedSeconds)
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    clearLaunchTransferStats()
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    let newJavaExec
    try {
        newJavaExec = await getLaunchRuntime().extractJdk(asset.path)
    } finally {
        // Never leave the animation or taskbar progress alive after a failed
        // extraction.
        clearInterval(extractListener)
        remote.getCurrentWindow().setProgressBar(-1)
    }

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false

async function setDiscordNavigationPresence(server = null){
    try {
        const distro = await DistroAPI.getDistribution()
        const settings = distro?.rawDistribution?.discord
        if(settings == null){
            if(hasRPC){
                getDiscordWrapper().shutdownRPC()
                hasRPC = false
            }
            return
        }

        if(server == null){
            server = distro.getServerById(ConfigManager.getSelectedServer())
        }

        hasRPC = getDiscordWrapper().setNavigationPresence(settings, server)
    } catch(err) {
        loggerLanding.debug('Unable to update Discord navigation presence.', err)
    }
}

function setDiscordPlayingPresence(distro, server){
    try {
        const settings = distro?.rawDistribution?.discord
        if(settings == null){
            return
        }
        hasRPC = getDiscordWrapper().setPlayingPresence(settings, server)
    } catch(err) {
        loggerLanding.debug('Unable to update Discord playing presence.', err)
    }
}

const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

async function dlAsync(login = true, options = {}) {

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')
    const restoring = options.restoring === true
    const protectedDifferences = Array.isArray(options.protectedDifferences)
        ? options.protectedDifferences
        : null
    let cleanProtected = options.cleanProtected === true
    let personalFileSnapshot = null
    setLaunchButtonState(
        login
            ? LAUNCH_BUTTON_STATES.LAUNCHING
            : restoring
                ? LAUNCH_BUTTON_STATES.RESTORING
                : LAUNCH_BUTTON_STATES.UPDATING,
        { progress: 0 }
    )
    setLaunchDetails(
        login
            ? Lang.queryJS('landing.dlAsync.loadingServerInfo')
            : restoring
                ? 'Preparando la restauración...'
                : 'Buscando cambios del modpack...'
    )
    toggleLaunchArea(true)

    let distro

    try {
        distro = await refreshDistributionWithoutCache()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return false
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())
    if(serv == null){
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return false
    }

    if(login){
        const installedState = await readServerPackState(serv)
        if(installedState != null && installedState.fingerprint !== getServerPackFingerprint(serv)){
            cleanProtected = true
        }
    }

    if(login && ConfigManager.getSelectedAccount() == null){
        loggerLanding.error('You must be logged into an account.')
        showLaunchFailure('Cuenta necesaria', 'Inicia sesión con tu cuenta de Minecraft antes de jugar.')
        return false
    }

    const installationExistedBeforeRepair = await hasExistingServerInstallation(serv)
    if(installationExistedBeforeRepair){
        try {
            setLaunchDetails('Protegiendo tus configuraciones personales...')
            personalFileSnapshot = await backupPersonalDistributionFiles(serv)
        } catch(err) {
            loggerLaunchSuite.error('Unable to protect personal configuration files before repair.', err)
            showLaunchFailure('No se pudo preparar la comprobación', 'No se pudieron proteger tus configuraciones personales. No se realizó ningún cambio.')
            return false
        }
    }

    if(cleanProtected){
        try {
            setLaunchDetails(restoring ? 'Eliminando cambios no permitidos...' : 'Preparando la actualización limpia...')
            setLaunchPercentage(0)
            await PackIntegrity.cleanProtectedContent(
                ConfigManager.getInstanceDirectory(),
                serv.rawServer.id,
                restoring ? protectedDifferences : null
            )
            await PackIntegrity.removeManifest(
                ConfigManager.getInstanceDirectory(),
                serv.rawServer.id
            )
        } catch(err) {
            loggerLaunchSuite.error('Unable to clean protected modpack folders.', err)
            await restorePersonalDistributionFiles(personalFileSnapshot).catch(restoreErr => {
                loggerLaunchSuite.error('Unable to restore personal files after cleanup failure.', restoreErr)
            })
            personalFileSnapshot = null
            showLaunchFailure('No se pudo restaurar la versión', 'Cierra Minecraft y cualquier programa que esté usando los archivos del modpack, y vuelve a intentarlo.')
            return false
        }
    }

    setLaunchDetails(
        login
            ? Lang.queryJS('landing.dlAsync.pleaseWait')
            : restoring
                ? 'Comprobando la versión original...'
                : 'Comprobando archivos instalados...'
    )
    setLaunchPercentage(0)

    const fullRepairModule = new (getLaunchRuntime().FullRepair)(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    let receiverDestroyed = false
    const destroyRepairReceiver = () => {
        if(!receiverDestroyed){
            receiverDestroyed = true
            try {
                fullRepairModule.destroyReceiver()
            } catch(err) {
                loggerLaunchSuite.debug('Repair receiver was already closed.', err)
            }
        }
    }

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during pack repair', err)
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(login ? Lang.queryJS('landing.dlAsync.validatingFileIntegrity') : restoring ? 'Comparando con la versión original...' : 'Comparando tu instalación con la versión nueva...')
    clearLaunchTransferStats()
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        destroyRepairReceiver()
        await restorePersonalDistributionFiles(personalFileSnapshot).catch(restoreErr => {
            loggerLaunchSuite.error('Unable to restore personal files after validation failure.', restoreErr)
        })
        personalFileSnapshot = null
        loggerLaunchSuite.error('Error during file validation.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return false
    }

    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(login ? Lang.queryJS('landing.dlAsync.downloadingFiles') : restoring ? 'Restaurando archivos originales...' : 'Actualizando archivos del modpack...')
        setLaunchPercentage(0)
        launch_progress_bytes.textContent = `${invalidFileCount} archivos pendientes`
        launch_progress_speed.textContent = ''
        try {
            await fullRepairModule.download((percent, transfer) => {
                if(transfer != null){
                    setLaunchTransferStats(transfer.received, transfer.total, transfer.bytesPerSecond)
                }
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            destroyRepairReceiver()
            await restorePersonalDistributionFiles(personalFileSnapshot).catch(restoreErr => {
                loggerLaunchSuite.error('Unable to restore personal files after download failure.', restoreErr)
            })
            personalFileSnapshot = null
            loggerLaunchSuite.error('Error during file download.', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return false
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
        setLaunchPercentage(100)
    }

    remote.getCurrentWindow().setProgressBar(-1)
    destroyRepairReceiver()

    if(personalFileSnapshot != null){
        try {
            setLaunchDetails('Recuperando tus configuraciones personales...')
            await restorePersonalDistributionFiles(personalFileSnapshot)
        } catch(err) {
            loggerLaunchSuite.error('Unable to restore personal configuration files.', err)
            showLaunchFailure('La versión fue reparada, pero ocurrió un problema con tus configuraciones', 'Revisa la consola antes de volver a abrir Minecraft.')
            return false
        } finally {
            personalFileSnapshot = null
        }
    }

    try {
        await writeServerPackState(serv)
        selectedPackNeedsUpdate = false
        selectedPackModified = false
        selectedPackDifferences = []
    } catch(err) {
        loggerLaunchSuite.warn('Unable to save the installed pack marker.', err)
    }

    if(!login){
        setLaunchDetails(
            restoring
                ? 'Versión restaurada.'
                : invalidFileCount > 0
                    ? 'Actualización completada.'
                    : 'La versión ya estaba actualizada.'
        )
        clearLaunchTransferStats()
        toggleLaunchArea(false)
        setLaunchButtonState(LAUNCH_BUTTON_STATES.PLAY)
        setPackIntegrityStatus(
            restoring ? 'Versión restaurada' : 'Versión actualizada',
            'success',
            2600
        )
        return true
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))
    clearLaunchTransferStats()
    setLaunchPercentage(100)

    let modLoaderData
    let versionData
    try {
        const mojangIndexProcessor = new (getLaunchRuntime().MojangIndexProcessor)(
            ConfigManager.getCommonDirectory(),
            serv.rawServer.minecraftVersion)
        const distributionIndexProcessor = new (getLaunchRuntime().DistributionIndexProcessor)(
            ConfigManager.getCommonDirectory(),
            distro,
            serv.rawServer.id
        )
        modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
        versionData = await mojangIndexProcessor.getVersionJson()
    } catch(err) {
        loggerLaunchSuite.error('Unable to prepare Minecraft metadata.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))
        return false
    }

    const authUser = ConfigManager.getSelectedAccount()
    loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
    const pb = new (getLaunchRuntime().ProcessBuilder)(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
    setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

    let loadComplete = false

    const gameErrorListener = function(data){
        data = data.trim()
        if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
            loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
        }
    }

    const onLoadComplete = () => {
        if(loadComplete || proc == null){
            return
        }
        loadComplete = true
        markGameRunning()
        proc.stdout.removeListener('data', tempListener)
        proc.stderr.removeListener('data', gameErrorListener)
    }

    const start = Date.now()
    const tempListener = function(data){
        if(GAME_LAUNCH_REGEX.test(data.trim())){
            const diff = Date.now()-start
            if(diff < MIN_LINGER) {
                setTimeout(onLoadComplete, MIN_LINGER-diff)
            } else {
                onLoadComplete()
            }
        }
    }

    try {
        proc = pb.build()
        stopRequested = false

        proc.stdout.on('data', tempListener)
        proc.stderr.on('data', gameErrorListener)

        if(distro.rawDistribution.discord != null){
            setDiscordPlayingPresence(distro, serv)
        }

        const launchedProcess = proc
        launchedProcess.once('error', err => {
            loggerLaunchSuite.error('Minecraft process error.', err)
            if(stopRequested){
                finalizeGameProcess(launchedProcess, 'stop error')
            }
        })
        launchedProcess.once('close', (code, signal) => {
            loggerLaunchSuite.info('Minecraft exited.', { code, signal, stopRequested })
            finalizeGameProcess(launchedProcess, stopRequested ? 'was stopped' : 'exited')
        })

        // Some modern loaders no longer print the original Helios startup lines.
        // This fallback exposes the red DETENER button once the process has stayed alive.
        gameLaunchFallbackTimer = setTimeout(onLoadComplete, Math.max(MIN_LINGER + 1500, 6500))
        setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))
        return true

    } catch(err) {
        loggerLaunchSuite.error('Error during launch', err)
        proc = null
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))
        return false
    }
}

/**
 * News has intentionally been removed from EmpiLauncher.
 * Keep a tiny stub because older startup code may still call initNews().
 */
async function initNews(){
    return null
}

window.addEventListener('beforeunload', () => {
    clearInterval(mojangStatusListener)
    clearInterval(serverStatusListener)
    clearInterval(packUpdateStatusListener)
    if(packFocusRefreshTimer != null){
        clearTimeout(packFocusRefreshTimer)
        packFocusRefreshTimer = null
    }
    if(packIntegrityStatusTimer != null){
        clearTimeout(packIntegrityStatusTimer)
        packIntegrityStatusTimer = null
    }
    stopLandingAnimation(landing_version_background_canvas)
    stopLandingAnimation(landing_version_banner_canvas)
    clearLaunchTransferStats()
})
