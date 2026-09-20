// node engine/test/notices.mjs
// Avisos, mantenimiento, agenda y versión mínima (lib/notices.js + handlers/notices.js).
//   part 1  the pure rules
//   part 2  the real engine, served avisos.json over HTTP (scratch folders only)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const lib = require('../src/lib/notices.js')

const ACCOUNT = 'aaaaaaaabbbbccccddddeeeeeeeeeeee'
const PACK = 'Pack-1.21.11'
const at = (iso) => Date.parse(iso)

// ---- part 1 ---------------------------------------------------------------------------------------------------------------------------
{
    const doc = lib.sanitize({
        version: 1,
        launcher: { minVersion: '3.4.0', novedades: 'https://discord.gg/x' },
        notices: [
            { id: 'a1', title: 'Reinicio', severity: 'critical', targets: [PACK], page: 'avisos/a1.webp', pageHash: 'abc', publishedAt: '2026-09-20T10:00:00Z', button: { label: 'Ver', url: 'https://discord.gg/y' } },
            { id: 'a2', title: 'General', severity: 'nonsense', targets: ['*'], publishedAt: '2026-09-21T10:00:00Z', expiresAt: '2026-09-22T00:00:00Z' },
            { id: '../bad', title: 'x' }, { id: 'a3', title: '' },
            { id: 'a4', title: 'Con enlace malo', page: 'avisos/../../etc/passwd.webp', button: { label: 'Abrir', url: 'javascript:alert(1)' } },
            { id: 'a5', title: 'Con http', button: { label: 'Abrir', url: 'http://example.com' } }
        ],
        modpacks: {
            [PACK]: { maintenance: { active: true, message: 'Volvemos pronto', until: '2026-09-21T20:00:00Z', allow: [`aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`, 'no-es-uuid'] }, novedades: 'https://discord.gg/z' },
            Later: { schedule: { from: '2026-10-01T00:00:00Z' } },
            Gone: { schedule: { until: '2026-09-01T00:00:00Z' } },
            Empty: { maintenance: { active: false } }
        }
    })
    check('an unknown version is refused', lib.sanitize({ version: 2, notices: [] }) === null && lib.sanitize(null) === null && lib.sanitize('x') === null)
    check('unsafe ids and titles are dropped, the rest kept', doc.notices.map((n) => n.id).join() === 'a1,a2,a4,a5')
    check('a severity nobody knows becomes plain information', doc.notices.find((n) => n.id === 'a2').severity === 'info')
    check('a page outside avisos/ is dropped, and so is a link that is not https', doc.notices.find((n) => n.id === 'a4').page === null && !doc.notices.find((n) => n.id === 'a4').button && !doc.notices.find((n) => n.id === 'a5').button)
    check('a good button is kept', doc.notices.find((n) => n.id === 'a1').button.url === 'https://discord.gg/y')
    check('the allow list keeps only real ids, without dashes', JSON.stringify(doc.modpacks[PACK].maintenance.allow) === JSON.stringify([ACCOUNT]))
    check('a modpack with nothing to say is not listed', !('Empty' in doc.modpacks) && 'Later' in doc.modpacks)

    check('expired notices go, the newest comes first', lib.activeNotices(doc, at('2026-09-23T00:00:00Z')).map((n) => n.id).join() === 'a1,a4,a5' && lib.activeNotices(doc, at('2026-09-21T12:00:00Z'))[0].id === 'a2')
    check('a notice for "*" is general, one that names a modpack belongs to it', lib.isGeneral(doc.notices[1]) && !lib.isGeneral(doc.notices[0]) && lib.targetsModpack(doc.notices[0], PACK))

    const ctx = (over = {}) => ({ nowMs: at('2026-09-21T12:00:00Z'), uuid: ACCOUNT, type: 'microsoft', appVersion: '3.5.0', ...over })
    check('maintenance blocks, with its message', lib.accessOf(doc, PACK, ctx({ uuid: 'ffffffffffffffffffffffffffffffff' })).state === 'maintenance' && lib.blockingMessage(lib.accessOf(doc, PACK, ctx({ uuid: 'f'.repeat(32) }))) === 'Volvemos pronto')
    check('an account on the allow list gets in', lib.accessOf(doc, PACK, ctx()).allowed === true && lib.blockingMessage(lib.accessOf(doc, PACK, ctx())) === null)
    check('the offline player never does, even with the same id', lib.accessOf(doc, PACK, ctx({ type: 'offline' })).allowed === false)
    check('maintenance that has an end ends by itself', lib.accessOf(doc, PACK, ctx({ nowMs: at('2026-09-21T20:00:01Z') })).state === 'ok')
    check('upcoming until its date, retired after its date', lib.accessOf(doc, 'Later', ctx()).state === 'upcoming' && lib.accessOf(doc, 'Later', ctx({ nowMs: at('2026-10-01T00:00:01Z') })).state === 'ok' && lib.accessOf(doc, 'Gone', ctx()).state === 'retired')
    check('a launcher below the minimum plays nothing, and one at it does', lib.accessOf(doc, 'Whatever', ctx({ appVersion: '3.3.1' })).state === 'launcher' && lib.accessOf(doc, 'Whatever', ctx({ appVersion: '3.4.0' })).state === 'ok')
    check('a launcher whose version is unknown is not blocked', lib.accessOf(doc, 'Whatever', ctx({ appVersion: null })).state === 'ok')
    check('without a file nothing is blocked', lib.accessOf(null, PACK, ctx()).state === 'ok')
}

// ---- part 2 ---------------------------------------------------------------------------------------------------------------------------
const module = { id: 'x.pack:pack:1@jar', name: 'pack', type: 'FabricMod', artifact: { size: 1, MD5: 'd41d8cd98f00b204e9800998ecf8427e', url: 'http://127.0.0.1/pack.jar' } }
const distribution = { version: '1.0.0', servers: [{ id: PACK, name: 'Pack', description: '', version: '1.0.0', address: 'localhost:25565', minecraftVersion: '1.21.11', mainServer: true, autoconnect: false, whitelist: false, javaOptions: { supported: '>=21 <22', suggestedMajor: 21, distribution: 'TEMURIN' }, modules: [module] }] }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

let served = { doc: null, date: 'Mon, 01 Jun 2026 12:00:00 GMT', requests: 0, missing: false }
const web = http.createServer((request, response) => {
    const route = request.url.split('?')[0]
    if (route === '/distribution.json') { response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify(distribution)) }
    if (route === '/avisos.json') {
        served.requests++
        if (served.missing) { response.statusCode = 404; return response.end('no') }
        response.setHeader('Date', served.date)
        response.setHeader('Content-Type', 'application/json')
        return response.end(JSON.stringify(served.doc))
    }
    if (route.startsWith('/avisos/')) { response.setHeader('Content-Type', 'image/png'); return response.end(PNG) }
    response.statusCode = 404; response.end()
})
await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${web.address().port}`

const engine = await startEngine({
    label: 'notices',
    env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: `${base}/distribution.json` },
    prepare: ({ userDir }) => {
        fs.mkdirSync(userDir, { recursive: true })
        const account = { type: 'microsoft', accessToken: 'x', username: 'Empi', uuid: ACCOUNT, displayName: 'Empi', expiresAt: 32503680000000, microsoft: { access_token: 'x', refresh_token: 'y', expires_at: 32503680000000 } }
        fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({ selectedAccount: ACCOUNT, authenticationDatabase: { [ACCOUNT]: account } }))
    }
})
try {
    const empty = await engine.call('notices.get')
    check('before any read there is nothing to show and nothing blocked', empty.ok && empty.result.notices.length === 0 && empty.result.launcher.blocked === false && empty.result.online === false, JSON.stringify(empty.result))

    served.doc = {
        version: 1,
        notices: [
            { id: 'n1', title: 'Reinicio a las 20:00', severity: 'critical', targets: [PACK], page: 'avisos/n1.png', pageHash: 'h1', publishedAt: '2026-05-31T10:00:00Z', button: { label: 'Ver', url: 'https://discord.gg/x' } },
            { id: 'n2', title: 'Nueva versión', severity: 'important', targets: ['*'], publishedAt: '2026-06-01T09:00:00Z' }
        ],
        modpacks: { [PACK]: { maintenance: { active: true, message: 'Migramos el mundo', until: '2030-06-01T11:00:00Z', allow: [] }, novedades: 'https://discord.gg/n' } }
    }
    served.date = 'Mon, 01 Jun 2026 12:00:00 GMT'
    const first = await engine.call('notices.refresh')
    const view = first.result
    check('refresh reads the file: newest first, general and per modpack told apart', first.ok && view.online === true && view.notices.map((n) => n.id).join() === 'n2,n1' && view.notices[0].general === true && view.notices[1].general === false, JSON.stringify(first.error ?? view.notices.map((n) => n.id)))
    check('the page of a notice is downloaded once and kept on disk', !!view.notices[1].image && fs.existsSync(view.notices[1].image) && view.notices[0].image === null)
    check('the time is the server\'s, not the PC\'s', view.serverNow.startsWith('2026-06-01T12:00:0'), view.serverNow)
    check('maintenance is reported for its modpack, with the message and the link', view.modpacks[PACK].access.state === 'maintenance' && view.modpacks[PACK].access.message === 'Migramos el mundo' && view.modpacks[PACK].novedades === 'https://discord.gg/n')

    const blocked = await engine.call('game.start')
    check('the engine refuses to start (or update) a modpack in maintenance', blocked.ok === false && blocked.error.code === 'blocked' && /Migramos el mundo/.test(blocked.error.message), JSON.stringify(blocked.error ?? blocked.result))

    // what the player does with a notice is remembered, and an edited notice starts unread again
    const read = await engine.call('notices.mark', { id: 'n1', state: 'read' })
    check('marking a notice as read is remembered', read.ok && read.result.notices.find((n) => n.id === 'n1').state === 'read' && read.result.notices.find((n) => n.id === 'n2').state === 'unread')
    const later = await engine.call('notices.mark', { id: 'n2', state: 'later' })
    check('"remind me later" keeps it', later.result.notices.find((n) => n.id === 'n2').state === 'later')
    const closed = await engine.call('notices.mark', { id: 'n2', state: 'closed' })
    check('closing it is remembered too', closed.result.notices.find((n) => n.id === 'n2').state === 'closed')
    const badMark = await engine.call('notices.mark', { id: 'n1', state: 'deleted' })
    const noMark = await engine.call('notices.mark', { id: 'zzz', state: 'read' })
    check('a state that does not exist, or a notice that does not, is an error', badMark.ok === false && noMark.ok === false && noMark.error.code === 'no_notice')
    served.doc.notices[0].pageHash = 'h2'
    const edited = await engine.call('notices.refresh')
    check('an edited notice is unread again', edited.result.notices.find((n) => n.id === 'n1').state === 'unread')

    // the allow list: this account is on it
    served.doc.modpacks[PACK].maintenance.allow = [ACCOUNT]
    const allowed = await engine.call('notices.refresh')
    check('an account on the allow list is let in, and still sees the notice', allowed.result.modpacks[PACK].access.allowed === true && allowed.result.modpacks[PACK].access.state === 'maintenance')

    // the server\'s clock decides: this maintenance ended by it, and this schedule has not started, whatever the PC says
    served.doc.modpacks[PACK] = { maintenance: { active: true, message: 'x', until: '2026-06-01T11:00:00Z', allow: [] } }
    const ended = await engine.call('notices.refresh')
    check('maintenance that ended by the server\'s clock is over', ended.result.modpacks[PACK]?.access.state === 'ok')
    served.doc.modpacks[PACK] = { schedule: { from: '2026-06-02T00:00:00Z' } }
    check('a modpack that is not out yet by the server\'s clock is upcoming', (await engine.call('notices.refresh')).result.modpacks[PACK].access.state === 'upcoming')
    served.doc.modpacks[PACK] = { schedule: { until: '2026-05-31T00:00:00Z' } }
    check('and one whose date passed is retired', (await engine.call('notices.refresh')).result.modpacks[PACK].access.state === 'retired')

    // without a network what was blocked stays blocked, and time does not move
    served.doc.modpacks[PACK] = { maintenance: { active: true, message: 'Sigue cerrado', until: '2026-06-01T12:00:05Z', allow: [] } }
    const online = await engine.call('notices.refresh')
    check('maintenance with an end still ahead blocks', online.result.modpacks[PACK].access.state === 'maintenance')
    await new Promise((resolve) => web.close(resolve))
    web.closeAllConnections?.()
    const off = await engine.call('notices.refresh')
    check('with no network the view says so and keeps what it knew', off.ok && off.result.online === false && off.result.modpacks[PACK].access.state === 'maintenance' && off.result.notices.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 6500))   // past the maintenance's end by the real clock: it must not lift while nobody could check
    const frozen = await engine.call('notices.get')
    check('and it stays blocked past its end until the next successful read', frozen.result.modpacks[PACK].access.state === 'maintenance' && frozen.result.serverNow === off.result.serverNow, frozen.result.serverNow)
    const stillBlocked = await engine.call('game.start')
    check('the engine keeps refusing to start it', stillBlocked.ok === false && stillBlocked.error.code === 'blocked')
} finally {
    await engine.stop()
    web.close()
}

// ---- the minimum launcher version, on a fresh engine ---------------------------------------------------------------------------------
const web2 = http.createServer((request, response) => {
    const route = request.url.split('?')[0]
    response.setHeader('Content-Type', 'application/json')
    if (route === '/distribution.json') return response.end(JSON.stringify(distribution))
    if (route === '/avisos.json') return response.end(JSON.stringify({ version: 1, launcher: { minVersion: '3.4.0', novedades: 'https://discord.gg/l' }, notices: [], modpacks: {} }))
    response.statusCode = 404; response.end()
})
await new Promise((resolve) => web2.listen(0, '127.0.0.1', resolve))
const engine2 = await startEngine({ label: 'notices-min', env: { EMPI_ENGINE_TEST: '1', EMPI_DISTRO_URL: `http://127.0.0.1:${web2.address().port}/distribution.json` } })
try {
    const view = (await engine2.call('notices.refresh')).result
    check('a launcher below the minimum is blocked, with a sentence that says what to do', view.launcher.blocked === true && view.launcher.minVersion === '3.4.0' && /3\.4\.0/.test(view.launcher.message), JSON.stringify(view.launcher))
    const start = await engine2.call('game.start')
    check('and the engine will not start anything until it is updated', start.ok === false && start.error.code === 'blocked' && /3\.4\.0/.test(start.error.message))
} finally {
    await engine2.stop()
    web2.close()
}
