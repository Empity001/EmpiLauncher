const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, ipcMain, Menu, shell, Tray } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const fs                                = require('fs')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')
const DiscordWrapper                    = require('./app/assets/js/discordwrapper')
const { isLowMemorySystem }             = require('./app/assets/js/performancemode')

// A second Electron instance doubles the baseline memory and can race the
// shared config/temp directories. Reuse the existing window instead.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if(!hasSingleInstanceLock){
    app.quit()
}

// Setup Lang
function getSavedLanguage(){
    try {
        const configPath = path.join(
            app.getPath('userData'),
            'config.json'
        )

        if(fs.existsSync(configPath)){
            const config = JSON.parse(
                fs.readFileSync(configPath, 'utf8')
            )

            return config?.settings?.launcher?.language || 'auto'
        }
    } catch(error){
        console.error('No se pudo leer el idioma guardado.', error)
    }

    return 'auto'
}

// Igual que getSavedLanguage(): se lee el config.json directamente porque
// ConfigManager depende de '@electron/remote', que solo está disponible del
// lado del renderer. Esto corre antes de crear cualquier ventana.
function getSavedPerformanceMode(){
    try {
        const configPath = path.join(
            app.getPath('userData'),
            'config.json'
        )

        if(fs.existsSync(configPath)){
            const config = JSON.parse(
                fs.readFileSync(configPath, 'utf8')
            )

            const mode = config?.settings?.launcher?.performanceMode
            if(mode === 'on' || mode === 'off' || mode === 'auto'){
                return mode
            }
        }
    } catch(error){
        console.error('No se pudo leer el modo de optimización guardado.', error)
    }

    return 'auto'
}

// Prioridad: EMPILAUNCHER_FORCE_PERFORMANCE_MODE (env) > preferencia guardada
// por el botón "Ahorro de RAM" > detección automática por RAM (<6GB).
function isPerformanceModeEnabledAtStartup(){
    if(process.env.EMPILAUNCHER_FORCE_PERFORMANCE_MODE === '1'){
        return true
    }
    if(process.env.EMPILAUNCHER_FORCE_PERFORMANCE_MODE === '0'){
        return false
    }
    const stored = getSavedPerformanceMode()
    if(stored === 'on'){
        return true
    }
    if(stored === 'off'){
        return false
    }
    return isLowMemorySystem()
}

// Setup auto updater.
let autoUpdaterInitialized = false
let autoUpdaterSender = null

function sendAutoUpdaterEvent(channel, ...args){
    if(autoUpdaterSender == null || autoUpdaterSender.isDestroyed()){
        return
    }
    autoUpdaterSender.send(channel, ...args)
}

function initAutoUpdater(event, data) {
    autoUpdaterSender = event.sender

    if(data){
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components (e.g. 0.12.1-alpha.1)
        // autoUpdater.allowPrerelease = true
    }
    
    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }
    if(autoUpdaterInitialized){
        return
    }
    autoUpdaterInitialized = true

    autoUpdater.on('update-available', (info) => {
        sendAutoUpdaterEvent('autoUpdateNotification', 'update-available', info)
    })
    autoUpdater.on('download-progress', (progress) => {
        sendAutoUpdaterEvent('empiUpdateDownloadProgress', progress)
    })
    autoUpdater.on('update-downloaded', (info) => {
        sendAutoUpdaterEvent('autoUpdateNotification', 'update-downloaded', info)
    })
    autoUpdater.on('update-not-available', (info) => {
        sendAutoUpdaterEvent('autoUpdateNotification', 'update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        sendAutoUpdaterEvent('autoUpdateNotification', 'checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        sendAutoUpdaterEvent('autoUpdateNotification', 'realerror', err)
    }) 
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch(arg){
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event, data)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'checkForUpdate':
            autoUpdater.checkForUpdates()
                .catch(err => {
                    event.sender.send('autoUpdateNotification', 'realerror', err)
                })
            break
        case 'allowPrereleaseChange':
            if(!data){
                const preRelComp = semver.prerelease(app.getVersion())
                if(preRelComp != null && preRelComp.length > 0){
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            break
        case 'installUpdateNow':
            autoUpdater.quitAndInstall()
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})
// Redirect distribution index event from preloader to renderer.
ipcMain.on('distributionIndexDone', (event, res) => {
    event.sender.send('distributionIndexDone', res)
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch(error) {
        return {
            result: false,
            error: error
        }
    }
})

ipcMain.on('discord-presence-action', (_event, action, payload = {}) => {
    try {
        switch(action){
            case 'navigation':
                DiscordWrapper.setNavigationPresence(payload.settings, payload.server)
                break
            case 'playing':
                DiscordWrapper.setPlayingPresence(payload.settings, payload.server)
                break
            case 'legacy':
                DiscordWrapper.initRPC(payload.settings, payload.serverSettings, payload.initialDetails)
                break
            case 'details':
                DiscordWrapper.updateDetails(payload.details)
                break
            case 'shutdown':
                DiscordWrapper.shutdownRPC()
                break
            default:
                console.warn('Unknown Discord presence action.', action)
                break
        }
    } catch(error) {
        console.warn('Unable to process a Discord presence action.', error)
    }
})

ipcMain.on('discord-presence-status', event => {
    event.returnValue = DiscordWrapper.getStatus()
})

// Keep GPU acceleration enabled by default. The old Helios line disabled it
// globally, forcing animated backgrounds, GIF/APNG banners and CSS composition
// onto the CPU. A compatibility escape hatch remains for problematic drivers.
//
// El modo de optimización absoluta (RAM < 6GB, o forzado desde el botón
// "Ahorro de RAM" en la pantalla principal) también apaga la aceleración de
// GPU. En pruebas reales resultó ser, con diferencia, el mayor consumidor de
// RAM del launcher — muy por encima de fondos, banners y animaciones. Esto
// solo puede decidirse al arrancar: Chromium no permite cambiar la
// aceleración de GPU en caliente, por eso el botón pide reiniciar para que
// este ahorro se aplique.
if(process.env.EMPILAUNCHER_DISABLE_GPU === '0') {
    // Escape hatch to force GPU acceleration back on, even with performance
    // mode active (e.g. RAM under 6GB but a driver that behaves fine).
} else if(process.env.EMPILAUNCHER_DISABLE_GPU === '1' || isPerformanceModeEnabledAtStartup()) {
    app.disableHardwareAcceleration()
}


const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        if (uri.startsWith(REDIRECT_URI_PREFIX)) {
            let queryMap = {}
            
            new URL(uri).searchParams.forEach((v, k) => {
                queryMap[k] = v
            })

            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess)

            msftAuthSuccess = true
            msftAuthWindow.close()
            msftAuthWindow = null
        }
    })

    msftAuthWindow.removeMenu()
    msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
let tray
let isQuitting = false
let rendererRuntimeState = {
    busy: false,
    game: false
}
let backgroundUnloadTimer = null

function canUnloadRenderer(){
    return !rendererRuntimeState.busy && !rendererRuntimeState.game
}

function unloadIdleBackgroundWindow(){
    backgroundUnloadTimer = null
    if(
        win == null
        || win.isDestroyed()
        || win.isVisible()
        || !canUnloadRenderer()
    ){
        return
    }
    win.destroy()
}

function scheduleIdleBackgroundUnload(){
    if(backgroundUnloadTimer != null){
        clearTimeout(backgroundUnloadTimer)
    }
    // Give the renderer a brief chance to close ImageDecoders, shrink canvas
    // surfaces and clear Chromium's in-memory image cache before it exits.
    backgroundUnloadTimer = setTimeout(unloadIdleBackgroundWindow, 250)
}

ipcMain.on('launcher-runtime-state', (_event, state = {}) => {
    rendererRuntimeState = {
        busy: state.busy === true,
        game: state.game === true
    }
    if(canUnloadRenderer()){
        scheduleIdleBackgroundUnload()
    }
})

function notifyRendererBackgroundState(inBackground){
    if(win == null || win.isDestroyed() || win.webContents.isDestroyed()){
        return
    }
    win.webContents.send('launcher-background-state', inBackground)
}

function showMainWindow(){
    if(backgroundUnloadTimer != null){
        clearTimeout(backgroundUnloadTimer)
        backgroundUnloadTimer = null
    }
    if(win == null || win.isDestroyed()){
        createWindow()
        return
    }
    win.setSkipTaskbar(false)
    if(win.isMinimized()){
        win.restore()
    }
    win.show()
    win.focus()
    notifyRendererBackgroundState(false)
}

function hideMainWindow(){
    if(win == null || win.isDestroyed()){
        return
    }
    // Stop visual work before Chromium applies its own background throttling.
    // Discord RPC remains connected in the main process.
    notifyRendererBackgroundState(true)
    win.setSkipTaskbar(true)
    win.hide()
    if(canUnloadRenderer()){
        // With Discord owned by the main process, an idle Chromium renderer is
        // unnecessary in the tray. Destroying it releases the large baseline
        // working set; opening the tray icon creates a fresh interface.
        scheduleIdleBackgroundUnload()
    }
    // Active repairs/downloads and the Minecraft child-process listener remain
    // hidden. The runtime-state event schedules unloading when they finish.
}

function createTray(){
    if(tray != null){
        return
    }
    tray = new Tray(getPlatformIcon('SealCircle'))
    tray.setToolTip('Empi Launcher')
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: 'Abrir Empi Launcher',
            click: showMainWindow
        },
        {
            type: 'separator'
        },
        {
            label: 'Salir',
            click: () => {
                isQuitting = true
                app.quit()
            }
        }
    ]))
    tray.on('click', showMainWindow)
    tray.on('double-click', showMainWindow)
}

app.on('second-instance', () => {
    showMainWindow()
})

function createWindow() {

    LangLoader.setupLanguage(getSavedLanguage())
    rendererRuntimeState = {
        busy: false,
        game: false
    }
    
    win = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1180,
        minHeight: 660,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: true,
            spellcheck: false
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    const data = {
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    win.removeMenu()

    win.resizable = true
    win.setMinimumSize(1180, 660)

    win.on('close', event => {
        if(!isQuitting){
            event.preventDefault()
            hideMainWindow()
        }
    })

    win.on('show', () => {
        win.setSkipTaskbar(false)
        notifyRendererBackgroundState(false)
    })

    win.on('closed', () => {
        if(backgroundUnloadTimer != null){
            clearTimeout(backgroundUnloadTimer)
            backgroundUnloadTimer = null
        }
        win = null
    })
}


function createMenu() {
    
    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

if(hasSingleInstanceLock){
    app.on('ready', createWindow)
    app.on('ready', createMenu)
    app.on('ready', createTray)

    app.on('before-quit', () => {
        isQuitting = true
        DiscordWrapper.shutdownRPC()
    })

    app.on('window-all-closed', () => {
        // The tray owns the background lifecycle. A real quit is explicit.
        if(isQuitting){
            app.quit()
        }
    })

    app.on('activate', () => {
        showMainWindow()
    })
}
