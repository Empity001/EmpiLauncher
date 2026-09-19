/**
 * Play / update / restore / stop, headless.
 *
 * This is the classic launcher's launch orchestration (landing.js: launch_button click handler, dlAsync, asyncSystemScan,
 * downloadJava, stopRunningGame) with every DOM call replaced by an event on the pipe. The heavy lifting is still done by
 * the same modules: helios-core FullRepair (in its receiver child process), MojangIndexProcessor, DistributionIndexProcessor,
 * ProcessBuilder and PackIntegrity. The UI decides how to show things; the engine decides what to do.
 *
 * Events (engine -> UI), all documented in docs/native/PROTOCOL.md:
 *   game.state     { phase, mode, serverId, pid? }        phase: idle | launching | updating | restoring | running | stopping
 *   game.progress  { stage, text?, percent?, received?, total?, bytesPerSecond?, pendingFiles? }   fields that changed
 *   game.failure   { code, title, message }
 *   game.needJava  { serverId, suggestedMajor, distribution }
 *   game.done      { mode, changed }                       an update or restore finished
 *   game.exit      { code, signal, stopped }
 *   pack.status    { ...pack status }                      what the launch button should offer
 *   distro.refreshed { ...distribution }                   the index was re-read during a launch
 */
const path = require('path')
const childProcess = require('child_process')
const { EngineError } = require('../ipc/server')
const { ensureCore } = require('./core')
const { describeDistribution, refreshWithoutCache } = require('./distro')
const { createPackState, getServerPackFingerprint } = require('../lib/packstate')
const { onDistroLoaded } = require('../lib/distrosync')
const profilesLib = require('../lib/profiles')
const offlineLib = require('../lib/offline')
const { currentAccount } = offlineLib
const skinLib = require('../lib/skin')
const { createJavaScan } = require('../lib/javascan')
const { startSkinServer } = require('../lib/skinserver')
const fsSync = require('fs')

const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000
const BUSY = new Set(['launching', 'updating', 'restoring', 'stopping'])

const TEXT = {
    loadingServer: 'Cargando información del servidor...',
    checkingUpdate: 'Buscando cambios del modpack...',
    preparingRestore: 'Preparando la restauración...',
    protecting: 'Protegiendo tus configuraciones personales...',
    cleaning: 'Preparando la actualización limpia...',
    cleaningRestore: 'Eliminando cambios no permitidos...',
    wait: 'Espera un momento...',
    verifyingInstalled: 'Comprobando archivos instalados...',
    verifyingRestore: 'Comprobando la versión original...',
    validating: 'Comprobando la integridad de los archivos...',
    comparing: 'Comparando tu instalación con la versión nueva...',
    comparingRestore: 'Comparando con la versión original...',
    downloading: 'Descargando archivos...',
    downloadingUpdate: 'Actualizando archivos del modpack...',
    downloadingRestore: 'Restaurando archivos originales...',
    recovering: 'Recuperando tus configuraciones personales...',
    preparingLaunch: 'Preparando el inicio...',
    launching: 'Iniciando el juego...',
    enjoy: 'Listo. ¡Disfruta del servidor!',
    checkingJava: 'Comprobando Java...',
    javaPrepare: 'Preparando la descarga de Java...',
    extractingJava: 'Extrayendo Java',
    javaInstalled: 'Java instalado.',
    searchingJava: 'Buscando Java en el equipo... puede tardar un poco.',
    stopping: 'Deteniendo Minecraft...'
}

function register(handlers, state) {
    const game = { phase: 'idle', mode: null, serverId: null, proc: null, stopRequested: false, fallbackTimer: null, pendingJava: null }
    state.game = game

    const emit = (event, data) => { if (state.ipc) state.ipc.broadcast(event, data) }
    const finalized = new WeakSet()
    let packState = null
    let runtime = null
    let hasRPC = false
    let lastPercent = -1
    let lastTransferAt = 0
    // The skin server of the running game (only for an offline player with a skin); it lives exactly as long as the game.
    let skinServer = null
    const stopSkinServer = () => { const running = skinServer; skinServer = null; if (running) running.close().catch(() => {}) }

    const core = () => ensureCore(state)
    const log = () => state.log
    const pack = () => (packState ??= createPackState({ ...core(), PackIntegrity: require(path.join(state.appJs, 'packintegrity')), log: state.log }))
    const appVersion = () => require('electron').app.getVersion()

    // Repair, Java discovery, process construction and Discord RPC are only needed when their feature is used.
    function rt() {
        if (runtime) return runtime
        const dl = require('helios-core/dl')
        const java = require('helios-core/java')
        runtime = {
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
            validateLocalFile: require('helios-core/common').validateLocalFile,
            ProcessBuilder: require(path.join(state.appJs, 'processbuilder'))
        }
        return runtime
    }

    // ---- state and progress ------------------------------------------------------------------------------------------

    function setPhase(phase, mode = game.mode, extra = {}) {
        game.phase = phase
        game.mode = phase === 'idle' ? null : mode
        emit('game.state', { phase, mode: game.mode, serverId: game.serverId, pid: game.proc?.pid ?? null, ...extra })
    }

    const detail = (stage, text) => { lastPercent = -1; emit('game.progress', { stage, text, percent: 0 }) }
    function percent(value) {
        const rounded = Math.trunc(Math.max(0, Math.min(100, Number(value) || 0)))
        if (rounded === lastPercent) return
        lastPercent = rounded
        emit('game.progress', { percent: rounded })
    }
    function transfer(received, total, bytesPerSecond = 0) {
        const now = Date.now()
        if (now - lastTransferAt < 100) return   // the classic launcher paints these every 100 ms at most
        lastTransferAt = now
        emit('game.progress', { received, total, bytesPerSecond })
    }
    const clearTransfer = () => { lastTransferAt = 0; emit('game.progress', { received: null, total: null, bytesPerSecond: null, pendingFiles: null }) }

    /** Ends an operation with a message for the player and puts the button back to what the pack needs. */
    function fail(code, title, message) {
        stopSkinServer()
        emit('game.failure', { code, title, message })
        if (game.proc == null) setPhase('idle')
        refreshPackStatus().catch((err) => log().warn('Unable to restore launch state after failure.', err))
        return false
    }

    async function currentServer() {
        const { ConfigManager, DistroAPI } = core()
        const distro = await DistroAPI.getDistribution()
        // Play reads the per-modpack Java and mod configuration: they must exist even if the UI never called distro.load.
        if (!state.distroSynced) { onDistroLoaded(ConfigManager, distro); state.distroSynced = true }
        const server = distro.getServerById(ConfigManager.getSelectedServer())
        return { distro, server }
    }

    async function refreshPackStatus(server = null) {
        if (!server) server = (await currentServer()).server
        if (!server) return null
        const status = await pack().status(server)
        emit('pack.status', status)
        return status
    }

    // ---- Discord ------------------------------------------------------------------------------------------------------

    function discord() {
        try { return (state.discord ??= require(path.join(state.appJs, 'discordwrapper'))) } catch (err) { log().debug('Discord RPC unavailable.', err); return null }
    }

    async function setNavigationPresence(server = null) {
        try {
            const { ConfigManager, DistroAPI } = core()
            const distro = await DistroAPI.getDistribution()
            const settings = distro?.rawDistribution?.discord
            const wrapper = discord()
            if (!wrapper) return
            if (settings == null) {
                if (hasRPC) { wrapper.shutdownRPC(); hasRPC = false }
                return
            }
            server ??= distro.getServerById(ConfigManager.getSelectedServer())
            hasRPC = wrapper.setNavigationPresence(settings, server)
        } catch (err) {
            log().debug('Unable to update Discord navigation presence.', err)
        }
    }

    function setPlayingPresence(distro, server) {
        try {
            const settings = distro?.rawDistribution?.discord
            const wrapper = discord()
            if (settings == null || !wrapper) return
            hasRPC = wrapper.setPlayingPresence(settings, server)
        } catch (err) {
            log().debug('Unable to update Discord playing presence.', err)
        }
    }

    // ---- Java ---------------------------------------------------------------------------------------------------------

    /** The bounded Java search (lib/javascan.js): cheap local places first, then helios-core's full search with a time limit. */
    function javaScan() {
        const { ConfigManager } = core()
        const { validateSelectedJvm, discoverBestJvmInstallation, javaExecFromRoot, ensureJavaDirIsRoot } = rt()
        return createJavaScan({ java: { validateSelectedJvm, discoverBestJvmInstallation, javaExecFromRoot, ensureJavaDirIsRoot }, dataDir: ConfigManager.getDataDirectory(), log: log() })
    }

    /** Finds a compatible Java (or asks the UI to offer installing one), then continues with the launch. */
    async function scanJava(server) {
        const { ConfigManager } = core()
        const options = server.effectiveJavaOptions
        detail('java-scan', TEXT.checkingJava)
        const jvm = await javaScan().find(options.supported, { onSlow: () => detail('java-scan', TEXT.searchingJava) })
        if (jvm == null) {
            game.pendingJava = { serverId: server.rawServer.id }
            setPhase('idle')
            emit('game.needJava', { serverId: server.rawServer.id, suggestedMajor: options.suggestedMajor, distribution: options.distribution || null })
            return false
        }
        const javaExec = rt().javaExecFromRoot(jvm.path)
        ConfigManager.setJavaExecutable(server.rawServer.id, javaExec)
        ConfigManager.save()
        emit('config.changed', { serverId: server.rawServer.id, key: 'javaExecutable', value: javaExec })
        return pipeline({ login: true })
    }

    async function downloadJava(server) {
        const { ConfigManager } = core()
        const options = server.effectiveJavaOptions
        detail('java-download', TEXT.javaPrepare)
        const asset = await rt().latestOpenJDK(options.suggestedMajor, ConfigManager.getDataDirectory(), options.distribution)
        if (asset == null) throw new Error('No se encontró una distribución de OpenJDK.')

        let received = 0
        const started = Date.now()
        await rt().downloadFile(asset.url, asset.path, ({ transferred }) => {
            received = transferred
            transfer(transferred, asset.size, transferred / Math.max((Date.now() - started) / 1000, 0.1))
            percent(Math.trunc((transferred / asset.size) * 100))
        })
        percent(100)

        if (received !== asset.size) {
            log().warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
            if (!await rt().validateLocalFile(asset.path, asset.algo, asset.hash)) {
                throw new Error('El JDK descargado no coincide con su huella: el archivo puede estar dañado.')
            }
        }

        clearTransfer()
        detail('java-extract', TEXT.extractingJava)
        const javaExec = await rt().extractJdk(asset.path)
        ConfigManager.setJavaExecutable(server.rawServer.id, javaExec)
        ConfigManager.save()
        emit('config.changed', { serverId: server.rawServer.id, key: 'javaExecutable', value: javaExec })
        emit('game.progress', { stage: 'java-installed', text: TEXT.javaInstalled })
    }

    // ---- the pipeline (dlAsync) ---------------------------------------------------------------------------------------

    async function pipeline({ login = true, restoring = false, protectedDifferences = null, cleanProtected = false }) {
        const { ConfigManager, DistroAPI } = core()
        const PackIntegrity = require(path.join(state.appJs, 'packintegrity'))
        let snapshot = null

        detail('refresh', login ? TEXT.loadingServer : restoring ? TEXT.preparingRestore : TEXT.checkingUpdate)

        let distro
        try {
            distro = await refreshWithoutCache(DistroAPI)
            onDistroLoaded(ConfigManager, distro)
            state.distroSynced = true
            emit('distro.refreshed', describeDistribution(ConfigManager, distro))
        } catch (err) {
            log().error('Unable to refresh distribution index.', err)
            return fail('distribution', 'Error grave', 'No se pudo cargar una copia del índice de distribución.')
        }

        const serv = distro.getServerById(ConfigManager.getSelectedServer())
        if (serv == null) return fail('distribution', 'Error grave', 'No se pudo cargar una copia del índice de distribución.')
        game.serverId = serv.rawServer.id

        if (login) {
            const installed = await pack().readState(serv)
            if (installed != null && installed.fingerprint !== getServerPackFingerprint(serv)) cleanProtected = true
        }

        // "Who plays" is the offline player when one is in use, otherwise the selected Microsoft account.
        if (login && currentAccount(ConfigManager) == null) {
            return fail('no_account', 'Cuenta necesaria', 'Inicia sesión con tu cuenta de Minecraft, o elige jugar sin conexión, antes de jugar.')
        }

        if (await pack().hasInstallation(serv)) {
            try {
                detail('protect', TEXT.protecting)
                snapshot = await pack().backupPersonalFiles(serv)
            } catch (err) {
                log().error('Unable to protect personal configuration files before repair.', err)
                return fail('protect', 'No se pudo preparar la comprobación', 'No se pudieron proteger tus configuraciones personales. No se realizó ningún cambio.')
            }
        }
        const restoreSnapshot = async (why) => {
            await pack().restorePersonalFiles(snapshot).catch((err) => log().error(`Unable to restore personal files after ${why}.`, err))
            snapshot = null
        }

        if (cleanProtected) {
            try {
                detail('clean', restoring ? TEXT.cleaningRestore : TEXT.cleaning)
                await PackIntegrity.cleanProtectedContent(ConfigManager.getInstanceDirectory(), serv.rawServer.id, restoring ? protectedDifferences : null)
                await PackIntegrity.removeManifest(ConfigManager.getInstanceDirectory(), serv.rawServer.id)
            } catch (err) {
                log().error('Unable to clean protected modpack folders.', err)
                await restoreSnapshot('cleanup failure')
                return fail('clean', 'No se pudo restaurar la versión', 'Cierra Minecraft y cualquier programa que esté usando los archivos del modpack, y vuelve a intentarlo.')
            }
        }

        detail('verify', login ? TEXT.wait : restoring ? TEXT.verifyingRestore : TEXT.verifyingInstalled)

        const repair = new (rt().FullRepair)(
            // the repair reads the distribution from a folder: for a modpack with profiles, one that holds the profile the player chose
            ConfigManager.getCommonDirectory(), ConfigManager.getInstanceDirectory(), profilesLib.repairDirectory(ConfigManager.getLauncherDirectory(), DistroAPI['rawDistribution']),
            ConfigManager.getSelectedServer(), DistroAPI.isDevMode()
        )
        let receiverDestroyed = false
        const destroyReceiver = () => {
            if (receiverDestroyed) return
            receiverDestroyed = true
            try { repair.destroyReceiver() } catch (err) { log().debug('Repair receiver was already closed.', err) }
        }
        repair.spawnReceiver()
        repair.childProcess.on('error', (err) => log().error('Error during pack repair', err))
        repair.childProcess.on('close', (code) => { if (code !== 0) log().error(`Full Repair Module exited with code ${code}, assuming error.`) })

        log().info('Validating files.')
        detail('verify', login ? TEXT.validating : restoring ? TEXT.comparingRestore : TEXT.comparing)
        clearTransfer()
        let invalidFileCount = 0
        try {
            invalidFileCount = await repair.verifyFiles((p) => percent(p))
            percent(100)
        } catch (err) {
            destroyReceiver()
            await restoreSnapshot('validation failure')
            log().error('Error during file validation.', err)
            return fail('verify', 'Error al verificar los archivos', err.displayable || 'Revisa el registro del launcher para más detalles.')
        }

        if (invalidFileCount > 0) {
            log().info('Downloading files.')
            detail('download', login ? TEXT.downloading : restoring ? TEXT.downloadingRestore : TEXT.downloadingUpdate)
            emit('game.progress', { pendingFiles: invalidFileCount })
            try {
                await repair.download((p, t) => {
                    if (t != null) transfer(t.received, t.total, t.bytesPerSecond)
                    percent(p)
                })
                percent(100)
            } catch (err) {
                destroyReceiver()
                await restoreSnapshot('download failure')
                log().error('Error during file download.', err)
                return fail('download', 'Error al descargar archivos', err.displayable || 'Revisa el registro del launcher para más detalles.')
            }
        } else {
            log().info('No invalid files, skipping download.')
            percent(100)
        }

        destroyReceiver()

        if (snapshot != null) {
            try {
                detail('restore-personal', TEXT.recovering)
                await pack().restorePersonalFiles(snapshot)
            } catch (err) {
                log().error('Unable to restore personal configuration files.', err)
                return fail('restore-personal', 'La versión fue reparada, pero ocurrió un problema con tus configuraciones', 'Revisa el registro del launcher antes de volver a abrir Minecraft.')
            } finally {
                snapshot = null
            }
        }

        try {
            await pack().writeState(serv)
        } catch (err) {
            log().warn('Unable to save the installed pack marker.', err)
        }

        if (!login) {
            clearTransfer()
            setPhase('idle')
            emit('game.done', { mode: restoring ? 'restore' : 'update', changed: invalidFileCount > 0 })
            await refreshPackStatus(serv).catch(() => {})
            return true
        }

        detail('prepare', TEXT.preparingLaunch)
        clearTransfer()
        percent(100)

        let modLoaderData
        let versionData
        try {
            const mojang = new (rt().MojangIndexProcessor)(ConfigManager.getCommonDirectory(), serv.rawServer.minecraftVersion)
            const distribution = new (rt().DistributionIndexProcessor)(ConfigManager.getCommonDirectory(), distro, serv.rawServer.id)
            modLoaderData = await distribution.loadModLoaderVersionJson(serv)
            versionData = await mojang.getVersionJson()
        } catch (err) {
            log().error('Unable to prepare Minecraft metadata.', err)
            return fail('metadata', 'Error al iniciar', 'Revisa el registro del launcher para más detalles.')
        }

        const authUser = currentAccount(ConfigManager)
        if (authUser == null) return fail('no_account', 'Cuenta necesaria', 'Inicia sesión con tu cuenta de Minecraft, o elige jugar sin conexión, antes de jugar.')
        log().info(`Sending ${authUser.type === 'offline' ? 'offline player' : 'selected account'} (${authUser.displayName}) to ProcessBuilder.`)
        const pb = new (rt().ProcessBuilder)(serv, versionData, modLoaderData, authUser, appVersion())
        if (authUser.type === 'offline') await attachSkin(pb, authUser, ConfigManager.getLauncherDirectory())
        detail('launch', TEXT.launching)

        return spawnGame(pb, distro, serv)
    }

    /**
     * An offline player that chose a skin: a small local server answers the game's skin lookup with it, and a Java agent
     * (authlib-injector, pinned by hash in lib/skin.js) points the game at that server. Both exist only for this launch. If anything
     * about it fails the game still starts, with the default skin, and the player is told why.
     */
    async function attachSkin(pb, authUser, dir) {
        const saved = offlineLib.read(dir)
        if (!saved || !saved.skin) return
        try {
            detail('skin', 'Preparando tu skin...')
            const skin = await skinLib.fetchSkin(dir, saved.skin.id)   // in the cache after the first time: no network
            const injector = await skinLib.ensureInjector(dir)
            skinServer = await startSkinServer({ name: authUser.displayName, uuid: authUser.uuid, png: fsSync.readFileSync(skin.png), model: saved.skin.model || skin.model })
            pb.extraJvmArgs.push(`-javaagent:${injector}=${skinServer.url}`, '-Dauthlibinjector.noLogFile')
        } catch (err) {
            stopSkinServer()
            log().warn('The skin was not applied.', err)
            emit('game.notice', { level: 'warning', text: `No se pudo preparar tu skin (${err.message}). Juegas con la skin por defecto.` })
        }
    }

    function spawnGame(pb, distro, serv) {
        let loadComplete = false
        let child = null

        const onGameError = (data) => {
            if (String(data).trim().includes('Could not find or load main class net.minecraft.launchwrapper.Launch')) {
                log().error('Game launch failed, LaunchWrapper was not downloaded properly.')
                emit('game.failure', {
                    code: 'launchwrapper', title: 'Error al iniciar',
                    message: 'El archivo principal, LaunchWrapper, no se descargó correctamente. Desactiva temporalmente tu antivirus y vuelve a iniciar el juego.'
                })
            }
        }
        const onLoadComplete = () => {
            if (loadComplete || game.proc == null) return
            loadComplete = true
            if (game.fallbackTimer != null) { clearTimeout(game.fallbackTimer); game.fallbackTimer = null }
            child.stdout.removeListener('data', onOutput)
            child.stderr.removeListener('data', onGameError)
            child.stdout.resume()
            child.stderr.resume()
            setPhase('running', 'play', { pid: child.pid })
        }
        const start = Date.now()
        const onOutput = (data) => {
            if (!GAME_LAUNCH_REGEX.test(String(data).trim())) return
            const elapsed = Date.now() - start
            if (elapsed < MIN_LINGER) setTimeout(onLoadComplete, MIN_LINGER - elapsed)
            else onLoadComplete()
        }

        try {
            child = pb.build()
            game.proc = child
            game.stopRequested = false
            state.keepAlive.add('game')

            // build() has just put the pack's mods into the instance's mods folder (Forge/NeoForge 1.20.3+), after the integrity
            // manifest was written. Record what the launcher itself placed, or the next check reports every mod as "added".
            pack().writeState(serv).catch((err) => log().warn('Unable to refresh the integrity manifest after syncing mods.', err))

            child.stdout.on('data', onOutput)
            child.stderr.on('data', onGameError)
            setPlayingPresence(distro, serv)

            child.once('error', (err) => {
                log().error('Minecraft process error.', err)
                if (game.stopRequested) finalizeGame(child, 'stop error')
            })
            child.once('close', (code, signal) => {
                log().info('Minecraft exited.', { code, signal, stopRequested: game.stopRequested })
                const stopped = game.stopRequested
                finalizeGame(child, stopped ? 'was stopped' : 'exited', { code, signal, stopped })
            })

            // Some modern loaders no longer print the original Helios startup lines: a process that stays alive is loaded.
            game.fallbackTimer = setTimeout(onLoadComplete, Math.max(MIN_LINGER + 1500, 6500))
            emit('game.progress', { stage: 'launched', text: TEXT.enjoy })
            setPhase('launching', 'play', { pid: child.pid })
            return true
        } catch (err) {
            log().error('Error during launch', err)
            game.proc = null
            state.keepAlive.delete('game')
            return fail('launch', 'Error al iniciar', 'Revisa el registro del launcher para más detalles.')
        }
    }

    function finalizeGame(child, source, exit = null) {
        if (child != null) {
            if (finalized.has(child)) return
            finalized.add(child)
        }
        log().info(`Restoring launcher after Minecraft ${source}.`)
        stopSkinServer()
        if (game.fallbackTimer != null) { clearTimeout(game.fallbackTimer); game.fallbackTimer = null }
        if (child == null || game.proc === child) game.proc = null
        game.stopRequested = false
        state.keepAlive.delete('game')
        clearTransfer()
        setPhase('idle')
        emit('game.exit', exit || { code: null, signal: null, stopped: source.includes('stop') })
        // Same grace period as the classic launcher before it re-reads the pack, so files the game just wrote are settled.
        setTimeout(() => refreshPackStatus().catch((err) => log().warn('Unable to restore launch state.', err)), 900)
        setNavigationPresence()
    }

    async function stopGame() {
        const child = game.proc
        if (child == null) { await refreshPackStatus().catch(() => {}); return { stopped: false } }
        game.stopRequested = true
        setPhase('stopping', 'play', { pid: child.pid })
        emit('game.progress', { stage: 'stop', text: TEXT.stopping, percent: 0 })

        const closed = new Promise((resolve) => child.once('close', () => resolve(true)))
        const closePromise = Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve(false), 4500))])
        const watchdog = setTimeout(() => {
            log().warn('Stop watchdog restored the launcher after Minecraft shutdown.')
            finalizeGame(child, 'stop watchdog')
        }, 7000)
        let stopCommandSucceeded = false

        try {
            if (process.platform === 'win32' && child.pid != null) {
                await Promise.race([
                    new Promise((resolve, reject) => childProcess.execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], (error) => (error ? reject(error) : resolve()))),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('taskkill timed out')), 5000))
                ])
                stopCommandSucceeded = true
            } else {
                stopCommandSucceeded = child.kill('SIGTERM')
            }
        } catch (err) {
            log().warn('Unable to stop Minecraft cleanly, using the process fallback.', err)
            try { stopCommandSucceeded = child.kill('SIGKILL') } catch (killErr) { log().error('Unable to stop Minecraft.', killErr) }
        }

        const closedNormally = await closePromise
        clearTimeout(watchdog)
        if (!closedNormally) {
            log().warn('Minecraft did not emit a close event after being stopped. Restoring the launcher manually.')
            if (!stopCommandSucceeded) { try { child.kill('SIGKILL') } catch (err) { log().debug('Final Minecraft kill fallback failed or was unnecessary.', err) } }
            finalizeGame(child, 'stop timeout')
        } else {
            finalizeGame(child, 'was stopped')
        }
        return { stopped: true }
    }

    // ---- methods ------------------------------------------------------------------------------------------------------

    handlers.set('game.status', async () => ({ phase: game.phase, mode: game.mode, serverId: game.serverId, pid: game.proc?.pid ?? null, pendingJava: game.pendingJava }))

    handlers.set('pack.status', async ({ id } = {}) => {
        const server = id ? (await core().DistroAPI.getDistribution()).getServerById(id) : (await currentServer()).server
        if (!server) throw new EngineError('no_server', 'no modpack is selected')
        return pack().status(server)
    })

    /**
     * mode: 'auto' (what the pack needs, like the classic button), 'play', 'update' or 'restore'.
     * Returns as soon as the operation is accepted; everything after that is events.
     */
    handlers.set('game.start', async ({ mode = 'auto' } = {}) => {
        if (BUSY.has(game.phase)) throw new EngineError('busy', 'there is already an operation in progress')
        if (game.phase === 'running' || game.proc != null) throw new EngineError('running', 'Minecraft is already running')

        const { server } = await currentServer()
        if (!server) throw new EngineError('no_server', 'no modpack is selected')
        game.serverId = server.rawServer.id
        game.pendingJava = null

        const status = await pack().status(server)
        const chosen = mode === 'auto' ? status.action : mode
        const run = (fn) => Promise.resolve().then(fn).catch((err) => {
            log().error('Unhandled error during launch/update process.', err)
            fail('unhandled', 'Error al iniciar', 'Revisa el registro del launcher para más detalles.')
        })

        if (chosen === 'restore') {
            setPhase('restoring', 'restore')
            run(() => pipeline({ login: false, restoring: true, cleanProtected: true, protectedDifferences: [...status.differences] }))
            return { started: true, mode: 'restore' }
        }
        if (chosen === 'update') {
            setPhase('updating', 'update')
            run(() => pipeline({ login: false, cleanProtected: true }))
            return { started: true, mode: 'update' }
        }

        const verdict = await pack().verifyBeforeLaunch(server)
        if (!verdict.ok) {
            emit('pack.status', { ...status, modified: true, action: 'restore', differences: verdict.differences })
            return { started: false, reason: 'modified', differences: verdict.differences }
        }
        if (verdict.warning) emit('game.notice', { level: 'warning', text: verdict.warning })

        setPhase('launching', 'play')
        run(async () => {
            const { ConfigManager } = core()
            const jExe = ConfigManager.getJavaExecutable(server.rawServer.id)
            if (jExe == null) return scanJava(server)
            const details = await javaScan().validate(rt().ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if (details != null) {
                log().info('Jvm Details', details)
                return pipeline({ login: true })
            }
            return scanJava(server)
        })
        return { started: true, mode: 'play' }
    })

    /** The player accepted the offer from game.needJava: fetch a JDK, then carry on with the launch. */
    handlers.set('java.install', async () => {
        if (game.pendingJava == null) throw new EngineError('no_request', 'there is no Java request pending')
        if (BUSY.has(game.phase)) throw new EngineError('busy', 'there is already an operation in progress')
        const { server } = await currentServer()
        if (!server) throw new EngineError('no_server', 'no modpack is selected')
        game.pendingJava = null
        setPhase('launching', 'play')
        Promise.resolve().then(async () => {
            try {
                await downloadJava(server)
                await scanJava(server)
            } catch (err) {
                log().error('Java installation failed.', err)
                fail('java', 'Error al instalar Java', err.message || 'Revisa el registro del launcher para más detalles.')
            }
        })
        return { started: true }
    })

    /** The player declined the offer (or will install Java themselves). */
    handlers.set('java.dismiss', async () => {
        game.pendingJava = null
        await refreshPackStatus().catch(() => {})
        return { dismissed: true }
    })

    handlers.set('game.stop', async () => stopGame())

    // Test hook (engine/test/lifecycle.mjs): runs the real launch bookkeeping around a stand-in process instead of Minecraft,
    // so start-up detection, stopping and crashes can be tested without a 1.2 GB pack and an account. Off unless the tests turn it on.
    if (process.env.EMPI_ENGINE_TEST === '1') {
        handlers.set('test.spawnFake', async ({ script }) => {
            const { distro, server } = await currentServer()
            const pb = { build: () => childProcess.spawn(process.execPath, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }) }
            setPhase('launching', 'play')
            return { ok: spawnGame(pb, distro, server) }
        })
    }

    handlers.set('discord.navigation', async ({ id } = {}) => {
        const { DistroAPI } = core()
        const server = id ? (await DistroAPI.getDistribution()).getServerById(id) : null
        await setNavigationPresence(server)
        return { ok: true }
    })
}

module.exports = { register }
