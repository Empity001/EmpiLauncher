/**
 * Local IPC between the native UI (C#) and the engine: newline-delimited JSON over a Windows named pipe.
 *
 *   UI -> engine   {"id":1,"method":"distro.load","params":{...}}
 *   engine -> UI   {"id":1,"ok":true,"result":{...}}        or  {"id":1,"ok":false,"error":{"code":"...","message":"..."}}
 *   engine -> UI   {"event":"game.progress","data":{...}}     (no id: things the UI did not ask for right now)
 *
 * The first request on a connection must be `engine.hello` carrying the token the UI generated and passed on the
 * command line; anything else is dropped. Only one UI is served at a time (a second connection replaces nothing: it is refused).
 * The full contract is in docs/native/PROTOCOL.md.
 */
const net = require('net')

const MAX_LINE = 8 * 1024 * 1024   // a single message above 8 MB is a bug or an attack, not a message

class EngineError extends Error {
    constructor(code, message) {
        super(message)
        this.code = code
    }
}

function createServer({ pipeName, token, handlers, log, onIdle }) {
    let client = null
    let idleTimer = null

    const server = net.createServer((socket) => {
        if (client) {
            socket.end(JSON.stringify({ event: 'engine.busy', data: { message: 'another UI is already connected' } }) + '\n')
            return
        }
        client = socket
        clearTimeout(idleTimer)
        socket.setEncoding('utf8')
        let buffer = ''
        let greeted = false

        const send = (message) => {
            if (socket.destroyed) return
            socket.write(JSON.stringify(message) + '\n')
        }
        const emit = (event, data) => send({ event, data })
        const ctx = { emit, log }

        socket.on('data', async (chunk) => {
            buffer += chunk
            if (buffer.length > MAX_LINE) { log.error('IPC line too long, closing.'); socket.destroy(); return }
            let newline
            while ((newline = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newline).trim()
                buffer = buffer.slice(newline + 1)
                if (!line) continue
                let request
                try { request = JSON.parse(line) } catch { send({ ok: false, error: { code: 'bad_json', message: 'not valid JSON' } }); continue }
                const { id, method, params } = request

                if (!greeted) {
                    if (method !== 'engine.hello' || !params || params.token !== token) { socket.destroy(); return }
                    greeted = true
                }
                const handler = handlers.get(method)
                if (!handler) { send({ id, ok: false, error: { code: 'unknown_method', message: `no such method: ${method}` } }); continue }
                try {
                    send({ id, ok: true, result: (await handler(params || {}, ctx)) ?? null })
                } catch (err) {
                    log.error(`method ${method} failed`, err)
                    send({ id, ok: false, error: { code: err.code || 'internal', message: err.displayable || err.message || String(err), title: err.title } })
                }
            }
        })
        socket.on('error', (err) => log.debug('IPC socket error', err))
        socket.on('close', () => {
            client = null
            // the UI went away: the engine follows unless something (a running game) asked it to stay
            idleTimer = setTimeout(() => onIdle && onIdle(), 2000)
        })
    })

    return {
        listen: () => new Promise((resolve, reject) => {
            server.once('error', reject)
            server.listen(`\\\\.\\pipe\\${pipeName}`, () => resolve())
        }),
        close: () => new Promise((resolve) => server.close(() => resolve())),
        broadcast: (event, data) => { if (client && !client.destroyed) client.write(JSON.stringify({ event, data }) + '\n') },
        hasClient: () => client != null
    }
}

module.exports = { createServer, EngineError }
