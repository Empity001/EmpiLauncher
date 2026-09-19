/**
 * Stand-in for `electron` and `@electron/remote` when the launcher's own modules run headless in plain Node.
 *
 * The classic launcher's modules (configmanager, dropinmodutil, discordwrapper, processbuilder...) only need a
 * handful of Electron calls: where the user-data folder is, the app version, and a few UI no-ops. Those are
 * provided here, so the modules that already work are reused as they are instead of being rewritten.
 * Nothing in this file talks to a window: there is no window.
 */
const os = require('os')
const path = require('path')

const APP_NAME = 'Empi Launcher'          // package.json "productName": Electron's userData folder is %APPDATA%\<productName>
let userData = process.env.EMPI_ENGINE_USER_DATA || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME)
let appVersion = process.env.EMPI_ENGINE_APP_VERSION || '0.0.0'

const app = {
    getName: () => APP_NAME,
    getVersion: () => appVersion,
    isPackaged: true,
    getPath(name) {
        switch (name) {
            case 'userData': return userData
            case 'appData': return path.dirname(userData)
            case 'temp': return os.tmpdir()
            case 'home': return os.homedir()
            default: throw new Error(`electron shim: getPath('${name}') is not provided`)
        }
    }
}

const noopWindow = {
    setProgressBar() {},
    isDestroyed: () => false,
    webContents: { send() {}, isDestroyed: () => false }
}

// The one renderer feature the drop-in mods helper uses is moving a file to the recycle bin; the engine reports it unsupported.
const ipcRenderer = {
    invoke: async () => ({ result: false, error: new Error('recycle bin is not available from the engine') }),
    send() {}, on() {}, once() {}, removeListener() {}
}
const shell = { beep() {}, openPath: async () => '', openExternal: async () => {}, trashItem: async () => { throw new Error('unsupported in the engine') } }

module.exports = {
    app,
    getCurrentWindow: () => noopWindow,
    ipcRenderer,
    shell,
    /** Test and startup hooks: the engine can point the shim at another data folder or version. */
    __configure({ userDataDir, version } = {}) {
        if (userDataDir) userData = userDataDir
        if (version) appVersion = version
    }
}
