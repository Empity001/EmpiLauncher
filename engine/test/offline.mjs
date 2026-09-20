// node engine/test/offline.mjs
// Playing without an account: the identity rule (pure), and how the offline player lives next to Microsoft accounts.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const offline = require(path.join(here, '..', 'src', 'lib', 'offline.js'))
require(path.join(here, '..', 'src', 'shim', 'install.js'))   // the classic modules need the electron stand-in before they load
const ProcessBuilder = require(path.join(here, '..', '..', 'app', 'assets', 'js', 'processbuilder.js'))

// ---- the rule -------------------------------------------------------------------------------------------------------
const id = (name) => offline.offlineId(name)
check('the id is 12 digits', /^\d{12}$/.test(id('juanito')), id('juanito'))
check('same name, same id', id('juanito') === id('juanito'))
check('case does not matter (Juanito = juanito = JUANITO)', id('Juanito') === id('juanito') && id('JUANITO') === id('juanito'))
check('different names, different ids', new Set(['steve', 'stevf', 'a_b', 'a_c', 'abc', 'cba', 'player1', 'player2'].map(id)).size === 8)
check('the rule gives the same numbers it always gave (pinned)', id('juanito') === '577106275399' && id('Steve') === '408301092836' && id('abc') === '162879559083', `${id('juanito')} ${id('Steve')} ${id('abc')}`)
check('short results are padded with zeros on the left', (() => {
    // find a name whose id starts with a zero, to see the padding really happens
    for (const a of 'abcdefghijklmnopqrstuvwxyz') for (const b of 'abcdefghijklmnopqrstuvwxyz') for (const c of 'abcdefghijklmnopqrstuvwxyz') {
        const value = id(a + b + c)
        if (value.startsWith('0')) return value.length === 12
    }
    return false
})())
check('the uuid the game gets is well formed and carries the id', offline.profile('juanito').uuid === `00000000-0000-3000-8000-${id('juanito')}` && /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(offline.profile('juanito').uuid))
for (const bad of ['', 'ab', 'a'.repeat(17), 'juan ito', 'ñandú', 'juan-ito', 'juan.ito', null]) {
    check(`refuses ${JSON.stringify(bad)}`, offline.profile(bad).valid === false && typeof offline.profile(bad).reason === 'string')
}
for (const good of ['abc', 'a'.repeat(16), 'Juan_123', '___']) check(`accepts ${JSON.stringify(good)}`, offline.profile(good).valid === true)
check('the account handed to the game has no token that means anything', (() => { const a = offline.authUser('Juanito'); return a.type === 'offline' && a.displayName === 'Juanito' && a.accessToken === 'offline' })())
check('and its uuid is undashed, like a Microsoft profile id, with the same 12 digits at the end', (() => { const a = offline.authUser('Juanito'); return /^[0-9a-f]{32}$/.test(a.uuid) && a.uuid === `0000000000003000` + `8000${id('juanito')}` })())
check('the game is told --userType legacy for it (msa for Microsoft)', ProcessBuilder.userType({ type: 'offline' }) === 'legacy' && ProcessBuilder.userType({ type: 'microsoft' }) === 'msa' && ProcessBuilder.userType({ type: 'mojang' }) === 'mojang')

// ---- in the engine ----------------------------------------------------------------------------------------------------
const microsoft = { type: 'microsoft', accessToken: 'x', username: 'someone@example.com', uuid: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', displayName: 'RealPlayer', expiresAt: 1, microsoft: { access_token: 'x', refresh_token: 'y', expires_at: 1 } }
const engine = await startEngine({
    label: 'offline',
    env: { EMPI_ENGINE_TEST: '1', EMPI_FORCE_OFFLINE: '1' },
    prepare: ({ userDir }) => {
        fs.mkdirSync(userDir, { recursive: true })
        fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({ selectedAccount: microsoft.uuid, authenticationDatabase: { [microsoft.uuid]: microsoft } }))
    }
})
try {
    const preview = await engine.call('offline.preview', { name: 'Juanito' })
    check('offline.preview says what a name becomes', preview.ok && preview.result.valid && preview.result.id === id('juanito') && preview.result.name === 'Juanito', JSON.stringify(preview.result))
    const bad = await engine.call('offline.preview', { name: 'no valido!' })
    check('and why a name cannot be used', bad.ok && bad.result.valid === false && bad.result.reason.length > 0)

    const first = await engine.call('account.list')
    check('before choosing, only the Microsoft account is there and it plays', first.ok && first.result.accounts.length === 1 && first.result.selected === microsoft.uuid)

    const set = await engine.call('offline.set', { name: 'Juanito' })
    const offlineAccount = set.ok && set.result.accounts.find((a) => a.type === 'offline')
    check('offline.set adds the offline player, in use', !!offlineAccount && set.result.selected === offlineAccount.uuid && offlineAccount.displayName === 'Juanito' && offlineAccount.offlineId === id('juanito'), JSON.stringify(set.result ?? set.error))
    check('the Microsoft account is still listed', set.ok && set.result.accounts.some((a) => a.uuid === microsoft.uuid))
    check('the offline player is not written into the shared config.json', !fs.readFileSync(path.join(engine.root, 'user', 'config.json'), 'utf8').includes('Juanito'))

    const wrong = await engine.call('offline.set', { name: 'x' })
    check('a bad name is refused with a reason', wrong.ok === false && wrong.error.code === 'bad_name', JSON.stringify(wrong.error))

    const validated = await engine.call('auth.validate')
    check('nothing to renew while the offline player is in use', validated.ok && validated.result.valid === true && validated.result.offline === true, JSON.stringify(validated.result))

    const back = await engine.call('account.select', { uuid: microsoft.uuid })
    check('selecting the Microsoft account makes it the one that plays again', back.ok && back.result.selected === microsoft.uuid && back.result.accounts.some((a) => a.type === 'offline'), JSON.stringify(back.result ?? back.error))

    const noNetwork = await engine.call('auth.validate')
    check('with no network a Microsoft session is kept, not deleted', noNetwork.ok && noNetwork.result.valid === true && noNetwork.result.skipped === 'offline' && noNetwork.result.accounts.accounts.some((a) => a.uuid === microsoft.uuid), JSON.stringify(noNetwork.result ?? noNetwork.error))

    const again = await engine.call('account.select', { uuid: offlineAccount.uuid })
    check('and the offline player can be selected again', again.ok && again.result.selected === offlineAccount.uuid)

    const rename = await engine.call('offline.set', { name: 'Maria_99' })
    check('offline.set with another name renames the one player', rename.ok && rename.result.accounts.filter((a) => a.type === 'offline').length === 1 && rename.result.accounts.find((a) => a.type === 'offline').displayName === 'Maria_99')

    const removed = await engine.call('account.remove', { uuid: rename.result.accounts.find((a) => a.type === 'offline').uuid })
    check('removing it needs no sign-out window and leaves the Microsoft account playing', removed.ok && !removed.result.accounts.some((a) => a.type === 'offline') && removed.result.selected === microsoft.uuid, JSON.stringify(removed.result ?? removed.error))

    // ---- "Cerrar sesión": nobody plays until an account is chosen again, and no account is deleted ----
    const configOnDisk = () => JSON.parse(fs.readFileSync(path.join(engine.root, 'user', 'config.json'), 'utf8'))
    const out = await engine.call('account.signout')
    check('signing out leaves nobody in use and deletes no account', out.ok && out.result.selected === null && out.result.accounts.some((a) => a.uuid === microsoft.uuid), JSON.stringify(out.result ?? out.error))
    check('it is saved: the account stays in config.json, the selection is empty', configOnDisk().selectedAccount == null && !!configOnDisk().authenticationDatabase[microsoft.uuid])
    const nobody = await engine.call('auth.validate')
    check('with nobody signed in there is nothing to renew (a clean no, not an error)', nobody.ok && nobody.result.valid === false && nobody.result.none === true, JSON.stringify(nobody.result ?? nobody.error))
    const listedOut = await engine.call('account.list')
    check('the list still offers the account, and nobody is selected', listedOut.ok && listedOut.result.selected === null && listedOut.result.accounts.length === 1)
    const enter = await engine.call('account.select', { uuid: microsoft.uuid })
    check('choosing it from there signs it in again', enter.ok && enter.result.selected === microsoft.uuid)

    const player = await engine.call('offline.set', { name: 'Juanito' })
    const playerUuid = player.result.accounts.find((a) => a.type === 'offline').uuid
    const outOffline = await engine.call('account.signout')
    check('signing out of the offline player keeps it saved, not in use', outOffline.ok && outOffline.result.selected === null && outOffline.result.accounts.some((a) => a.uuid === playerUuid), JSON.stringify(outOffline.result ?? outOffline.error))
    check('and the Microsoft account it was chosen over does not take its place', outOffline.result.selected !== microsoft.uuid)
    const gone = await engine.call('account.remove', { uuid: playerUuid })
    check('deleting a saved account from the sign-in screen signs nobody in', gone.ok && gone.result.selected === null && gone.result.accounts.length === 1, JSON.stringify(gone.result ?? gone.error))
} finally {
    await engine.stop()
}
