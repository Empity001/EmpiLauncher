/**
 * Microsoft sign-in window, as a helper that exists only while it is needed.
 *
 * The launcher's login flow works with an embedded browser window, so this small Electron app opens exactly that window
 * (same URL, same redirect detection as the classic launcher's index.js), reports what happened as one JSON line on stdout
 * and quits. Chromium is alive for the seconds it takes to sign in and then it is gone; nothing else in the launcher
 * carries it. Tokens are not handled here: this only hands the one-time authorization code to the engine, which
 * exchanges it with helios-core and keeps the tokens.
 *
 *   electron engine/auth-helper --login  --client-id <azure app id> --user-data-dir=<folder>
 *   electron engine/auth-helper --logout --user-data-dir=<folder>
 *
 * stdout, one line: {"type":"result","query":{...}} | {"type":"loggedout"} | {"type":"cancelled"}
 */
const { app, BrowserWindow } = require('electron')

const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'
const LOGOUT_DONE_PREFIX = 'https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession'

const argAfter = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const mode = process.argv.includes('--logout') ? 'logout' : 'login'
const clientId = argAfter('--client-id')

let reported = false
const report = (message) => {
    if (reported) return
    reported = true
    process.stdout.write(JSON.stringify(message) + '\n')
}

// The sign-in pages are plain HTML: no need for a GPU process.
app.disableHardwareAcceleration()
if (!app.requestSingleInstanceLock()) app.quit()

app.whenReady().then(() => {
    const win = new BrowserWindow({
        title: mode === 'login' ? 'Iniciar sesión con Microsoft' : 'Cerrar sesión de Microsoft',
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    win.removeMenu()
    // Says "my window exists": if the helper ends without ever saying this, Electron itself failed to start, which is not the
    // same as the player closing the window (see lib/authhelper.js).
    process.stdout.write(JSON.stringify({ type: 'started' }) + '\n')

    win.on('closed', () => {
        report({ type: 'cancelled' })
        app.quit()
    })

    if (mode === 'login') {
        win.webContents.on('did-navigate', (_event, uri) => {
            if (!uri.startsWith(REDIRECT_URI_PREFIX)) return
            const query = {}
            new URL(uri).searchParams.forEach((value, key) => { query[key] = value })
            report({ type: 'result', query })
            win.close()
        })
        win.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${clientId}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
    } else {
        win.webContents.on('did-navigate', (_event, uri) => {
            if (!uri.startsWith(LOGOUT_DONE_PREFIX)) return
            // Same pause as the classic launcher: give Microsoft time to finish clearing the session.
            setTimeout(() => { report({ type: 'loggedout' }); if (!win.isDestroyed()) win.close() }, 5000)
        })
        win.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
    }
})

app.on('window-all-closed', () => app.quit())
