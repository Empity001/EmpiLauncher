// node engine/test/support.mjs
// "Enviar a soporte para revisión": the report that names the player (and still hides the secrets), where it may go, and the sending.
//   part 1  the pure parts (lib/notices.js support config, lib/support.js, lib/report.js)
//   part 2  the real engine: avisos.json says where reports go, a local server plays the mail service
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const notices = require('../src/lib/notices.js')
const supportLib = require('../src/lib/support.js')
const report = require('../src/lib/report.js')

const ACCOUNT = 'aaaaaaaabbbbccccddddeeeeeeeeeeee'
const PACK = 'Pack-1.21.11'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'

// ---- part 1 ---------------------------------------------------------------------------------------------------------------------------
{
    const doc = (support) => notices.sanitize({ version: 1, launcher: { support }, notices: [], modpacks: {} }).launcher.support
    check('a service with its key, and an address, is kept', JSON.stringify(doc({ service: 'appsscript', key: 'abc123-XYZ', email: 'soporte@example.com' })) === JSON.stringify({ service: 'appsscript', key: 'abc123-XYZ', email: 'soporte@example.com' }))
    check('a service nobody knows is not accepted (reports never go to an address avisos.json invents)', doc({ service: 'https://evil.example/collect', key: 'abc123-XYZ' }) === undefined && doc({ service: 'webhook', key: 'abc123-XYZ' }) === undefined)
    check('a key that is not the shape of one is dropped, and an address alone is kept as "write here"', doc({ service: 'formspree', key: 'x y/z' }) === undefined && JSON.stringify(doc({ service: 'formspree', key: 'x y/z', email: 'a@b.co' })) === JSON.stringify({ email: 'a@b.co' }))
    check('an address that is not one is dropped', doc({ email: 'no es un correo' }) === undefined)

    const web = supportLib.request({ service: 'appsscript', key: 'KEY12345' }, { subject: 'S', name: 'Ana', text: 'cuerpo' })
    const form = supportLib.request({ service: 'formspree', key: 'xyzabcde' }, { subject: 'S', name: 'Ana', text: 'cuerpo' })
    check('each service is spoken to in its own way, at its own address', web.url === 'https://script.google.com/macros/s/KEY12345/exec' && web.body.subject === 'S' && web.body.message === 'cuerpo' && form.url === 'https://formspree.io/f/xyzabcde' && form.body._subject === 'S' && supportLib.request({ service: 'otro', key: 'x' }, {}) === null)
    const long = 'A'.repeat(50 * 1024) + 'MEDIO' + 'B'.repeat(50 * 1024)
    const fitted = supportLib.fit(long)
    check('a report that is too long keeps its beginning and its end', Buffer.byteLength(fitted) < supportLib.MAX_BYTES + 200 && fitted.startsWith('AAAA') && fitted.endsWith('BBBB') && /se recortó el centro/.test(fitted))
    const answer = (status, json) => async () => ({ ok: status < 300, status, json: async () => json })
    check('an accepted report is ok', (await supportLib.send({ service: 'appsscript', key: 'KEY12345' }, { subject: 's', name: 'n', text: 't' }, { fetchImpl: answer(200, { success: true }) })).ok === true && (await supportLib.send({ service: 'formspree', key: 'xyzabcde' }, { subject: 's', name: 'n', text: 't' }, { fetchImpl: answer(200, { ok: true }) })).ok === true)
    const refused = await supportLib.send({ service: 'appsscript', key: 'KEY12345' }, { subject: 's', name: 'n', text: 't' }, { fetchImpl: answer(200, { success: false, message: 'Invalid key' }) })
    check('a refusal says why, in words, and an outage says so', refused.ok === false && refused.reason === 'rejected' && /Invalid key/.test(refused.message) && (await supportLib.send({ service: 'appsscript', key: 'KEY12345' }, { subject: 's', name: 'n', text: 't' }, { fetchImpl: async () => { throw new Error('down') } })).reason === 'offline')
    check('nothing configured is "no support"', (await supportLib.send(null, {})).reason === 'no_support')
    check('the codes are short, readable and different', /^EMPI-[A-HJKMNP-Z2-9]{6}$/.test(supportLib.newCode()) && supportLib.newCode() !== supportLib.newCode())

    // the report for support names the player, and keeps every secret out
    const text = report.build({
        appVersion: '3.5.2', server: { name: 'Pack', version: '1.0.0', minecraftVersion: '1.21.11', modules: [] }, id: PACK, instanceDir: path.join(process.env.TEMP || '/tmp', 'no-existe'),
        settings: { minRAM: '2G', maxRAM: '4G', java: 'C:\\Users\\Empi\\Java\\bin\\java.exe' }, exit: { code: 1, stopped: false }, accountType: 'microsoft', hide: ['Empi_Ty'],
        support: { code: 'EMPI-ABC234', player: { name: 'Empi_Ty', uuid: ACCOUNT, type: 'microsoft' }, installed: { version: '0.9.0' }, language: 'es', performance: 'auto', engineMb: 90 }
    })
    check('it says who it is from: name, account, id and the code to quote', /Código del informe: EMPI-ABC234/.test(text) && /Nombre: Empi_Ty/.test(text) && text.includes(ACCOUNT) && /Cuenta: Microsoft/.test(text))
    check('and what to look at: launcher, Windows, memory, what is installed against what is published', /Launcher: 3\.5\.2/.test(text) && /Windows: /.test(text) && /Memoria del equipo/.test(text) && /Instalado en este equipo: versión 0\.9\.0  \(distinta de la publicada\)/.test(text))
    const plain = report.build({ appVersion: '3.5.2', server: null, id: null, instanceDir: '/x', settings: {}, exit: null, accountType: 'microsoft', hide: ['Empi_Ty'] })
    check('the plain report does not name anybody', !/Jugador/.test(plain) && !plain.includes(ACCOUNT))
    check('the support report has no token, e-mail or Windows user name', !text.includes(TOKEN) && !/@example\.com/.test(text) && !text.includes('C:\\Users\\Empi\\'))
}

// ---- part 2 ---------------------------------------------------------------------------------------------------------------------------
const module_ = { id: 'x.pack:pack:1@jar', name: 'pack', type: 'FabricMod', artifact: { size: 1, MD5: 'd41d8cd98f00b204e9800998ecf8427e', url: 'http://127.0.0.1/pack.jar' } }
const distribution = { version: '1.0.0', servers: [{ id: PACK, name: 'Pack', description: '', version: '1.0.0', address: 'localhost:25565', minecraftVersion: '1.21.11', mainServer: true, autoconnect: false, whitelist: false, javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN' }, modules: [module_] }] }
const served = { doc: { version: 1, notices: [], modpacks: {}, launcher: {} } }
const received = []
const web = http.createServer((request, response) => {
    const route = request.url.split('?')[0]
    const chunks = []
    request.on('data', (c) => chunks.push(c))
    request.on('end', () => {
        if (route === '/distribution.json') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify(distribution)) }
        if (route === '/avisos.json') { response.setHeader('Content-Type', 'application/json'); response.setHeader('Date', 'Mon, 01 Jun 2026 12:00:00 GMT'); return response.end(JSON.stringify(served.doc)) }
        // like Apps Script: the script runs on the POST, then the answer is fetched from another address after a redirect
        if (route === '/submit') { received.push(JSON.parse(Buffer.concat(chunks).toString())); response.statusCode = 302; response.setHeader('Location', '/echo'); return response.end() }
        if (route === '/echo') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify({ success: true })) }
        response.statusCode = 404; response.end()
    })
})
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${web.address().port}`

const engine = await startEngine({
    label: 'support',
    env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: `${base}/distribution.json`, EMPI_SUPPORT_URL: `${base}/submit` },
    prepare: ({ userDir }) => {
        fs.mkdirSync(userDir, { recursive: true })
        const account = { type: 'microsoft', accessToken: TOKEN, username: 'Empi_Ty', uuid: ACCOUNT, displayName: 'Empi_Ty', expiresAt: 32503680000000, microsoft: { access_token: TOKEN, refresh_token: 'y', expires_at: 32503680000000 } }
        fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({ selectedAccount: ACCOUNT, authenticationDatabase: { [ACCOUNT]: account } }))
    }
})
try {
    await engine.call('distro.load')
    const none = await engine.call('notices.refresh')
    check('without support in avisos.json the view says it cannot send', none.ok && none.result.launcher.support.canSend === false && none.result.launcher.support.email === null)
    const refusedNoSupport = await engine.call('report.send', { text: 'INFORME ' + 'x'.repeat(50), code: 'EMPI-AAAAAA' })
    check('and report.send refuses in words', refusedNoSupport.ok === false && refusedNoSupport.error.code === 'no_support', JSON.stringify(refusedNoSupport.error))

    served.doc.launcher.support = { service: 'appsscript', key: 'KEY12345', email: 'soporte@example.com' }
    const withSupport = await engine.call('notices.refresh')
    check('with it, the view can send and gives the address, but never the key', withSupport.result.launcher.support.canSend === true && withSupport.result.launcher.support.email === 'soporte@example.com' && !JSON.stringify(withSupport.result).includes('KEY12345'))

    const built = await engine.call('report.build', { serverId: PACK, forSupport: true })
    check('the support report names the player, has a code to quote, and carries no token', built.ok && /^EMPI-[A-Z2-9]{6}$/.test(built.result.code) && built.result.text.includes(`Código del informe: ${built.result.code}`) && /Nombre: Empi_Ty/.test(built.result.text) && built.result.text.includes(ACCOUNT) && !built.result.text.includes(TOKEN), built.result.text.slice(0, 300))
    const plain = await engine.call('report.build', { serverId: PACK })
    check('the plain report still names nobody', plain.ok && !plain.result.text.includes('Empi_Ty') && !plain.result.text.includes(ACCOUNT) && plain.result.code === null)

    const sent = await engine.call('report.send', { text: built.result.text, code: built.result.code, note: 'Se cerró al entrar al mundo' })
    check('sending reaches the service (through its redirect), with a subject that has the code, and the note first', sent.ok && sent.result.sent === true && received.length === 1 && received[0].subject.includes(built.result.code) && received[0].subject.includes('Empi_Ty') && received[0].message.startsWith('Nota del jugador: Se cerró al entrar al mundo'), JSON.stringify(received[0] || {}).slice(0, 300))
    const again = await engine.call('report.send', { text: built.result.text, code: built.result.code })
    check('a second one right away waits (nobody can flood the inbox from here)', again.ok === false && again.error.code === 'too_soon' && received.length === 1)
    const junk = await engine.call('report.send', { text: 'corto' })
    check('an empty or tiny report is not sent', junk.ok === false && junk.error.code === 'bad_report')
} catch (err) {
    console.log('FAIL  ' + err.message)
    process.exitCode = 1
} finally {
    await engine.stop()
    await new Promise((resolve) => web.close(resolve))
}
