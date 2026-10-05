// Empi Publisher como app: arranca server.js (el mismo de siempre) y lo muestra en una ventana propia, sin navegador.
// Al cerrar la ventana el servidor se va con ella, asi que no queda nada gastando recursos en segundo plano.
const { app, BrowserWindow, dialog, shell, Menu } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

const PORT = Number(process.env.PUBLISHER_PORT) || 4848
const URL = `http://localhost:${PORT}`
const SERVER = path.join(__dirname, '..', 'server.js')
const ICON = path.join(__dirname, '..', '..', '..', 'build', 'icon.png')

let server = null
let ownsServer = false
let win = null
let closing = false

function request(method, route, timeout = 1500) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: PORT, path: route, method, headers: { Host: `localhost:${PORT}` }, timeout }, (res) => {
            res.resume()
            res.on('end', () => resolve(res.statusCode))
        })
        req.on('timeout', () => req.destroy(new Error('timeout')))
        req.on('error', reject)
        req.end()
    })
}

async function waitForServer(limitMs = 20000) {
    const until = Date.now() + limitMs
    while (Date.now() < until) {
        try { if (await request('GET', '/api/health') === 200) return true } catch { /* todavia no */ }
        if (server && server.exitCode != null) return false
        await new Promise((resolve) => setTimeout(resolve, 150))
    }
    return false
}

/** El Node del sistema si existe (lo que usaba Publicar.bat); si no, el propio Electron haciendo de Node. */
function startServer() {
    const log = fs.openSync(path.join(require('os').homedir(), '.empilauncher-publisher.log'), 'a')
    const options = { cwd: path.dirname(SERVER), stdio: ['ignore', log, log], env: { ...process.env } }
    server = spawn('node', [SERVER, '--no-open'], options)
    server.on('error', () => {
        options.env.ELECTRON_RUN_AS_NODE = '1'
        server = spawn(process.execPath, [SERVER, '--no-open'], options)
    })
    ownsServer = true
}

async function stopServer() {
    if (!ownsServer) return
    try { await request('POST', '/api/quit') } catch { /* ya no estaba */ }
    setTimeout(() => { try { server && server.kill('SIGTERM') } catch { /* ya salio */ } }, 600)
}

async function createWindow() {
    win = new BrowserWindow({
        width: 1320, height: 880, minWidth: 900, minHeight: 600,
        title: 'Empi Publisher', icon: ICON, backgroundColor: '#0e0e10', autoHideMenuBar: true, show: false
    })
    win.once('ready-to-show', () => win.show())
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(URL)) { event.preventDefault(); shell.openExternal(url) } })
    win.on('close', async (event) => {
        if (closing) return
        event.preventDefault()
        let busy = false
        try { busy = ownsServer && await request('POST', '/api/quit') === 409 } catch { /* sin servidor: se cierra */ }
        if (busy) {
            const { response } = await dialog.showMessageBox(win, {
                type: 'warning', buttons: ['Seguir esperando', 'Cerrar igual'], defaultId: 0, cancelId: 0,
                message: 'Todavia hay una tarea en marcha.', detail: 'Si cierras ahora se corta a la mitad.'
            })
            if (response === 0) return
        }
        closing = true
        if (busy) { try { server && server.kill('SIGTERM') } catch { /* ya salio */ } }
        win.destroy()
    })
    win.on('closed', () => { win = null; app.quit() })
    await win.loadURL(URL)
}

if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
    app.whenReady().then(async () => {
        Menu.setApplicationMenu(null)
        let running = false
        try { running = await request('GET', '/api/health') === 200 } catch { /* nadie escucha */ }
        if (!running) startServer()
        if (!(await waitForServer())) {
            dialog.showErrorBox('Empi Publisher', `No pude arrancar el servidor local (puerto ${PORT}). Detalle en ~/.empilauncher-publisher.log`)
            return app.quit()
        }
        await createWindow()
    })
    app.on('will-quit', () => { stopServer() })
    app.on('window-all-closed', () => app.quit())
}
