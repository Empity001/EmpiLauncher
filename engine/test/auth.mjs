// node engine/test/auth.mjs [--probe <probe.exe>] [--seconds 8]
// Opens the Microsoft sign-in helper (no credentials are entered), checks that it is a separate short-lived Electron process,
// optionally measures what it costs while open (--probe), then cancels it and checks that Chromium is gone again.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { startEngine, check } from './harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const { runAuthHelper } = createRequire(import.meta.url)(path.join(here, '..', 'src', 'lib', 'authhelper.js'))

// A helper that ends without ever opening its window (plain Node stands in for a broken Electron: it cannot run the helper) must be
// reported as a failure the player can read, never as "cancelled": that is what made adding an account or signing out look like it did
// nothing in an installer whose Electron had a file missing.
{
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-helper-'))
    const started = Date.now()
    const broken = await runAuthHelper('login', { electron: process.execPath, userDataDir: scratch, clientId: 'x' }).then((value) => ({ value }), (error) => ({ error }))
    check('a helper that dies before opening its window is an error, not a cancel', broken.error?.helperFailed === true && !broken.value, broken.error?.message ?? JSON.stringify(broken.value))
    check('and it is reported at once, not after the ten-minute timeout', Date.now() - started < 15000, `${Date.now() - started} ms`)
    fs.rmSync(scratch, { recursive: true, force: true })
}

const probeAt = process.argv.indexOf('--probe')
const seconds = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 8
const helperPids = () => {
    try {
        const out = execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -match 'auth-helper' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.ProcessId }"], { encoding: 'utf8' })
        return out.split(/\s+/).filter(Boolean).map(Number)
    } catch { return [] }
}

const engine = await startEngine({ label: 'auth' })
try {
    const none = await engine.call('auth.validate')
    check('validate with no account is a clean no', none.ok && none.result.valid === false && none.result.none === true, JSON.stringify(none.result))
    const missing = await engine.call('account.remove', { uuid: 'nope' })
    check('removing an unknown account is an error, not a crash', missing.ok === false && missing.error.code === 'no_account')

    check('no helper before signing in', helperPids().length === 0)
    const login = engine.call('auth.microsoft.login')
    await new Promise((r) => setTimeout(r, seconds * 1000))
    const pids = helperPids()
    check('the sign-in window is a separate Electron process', pids.length === 1, `pid ${pids.join(',')}`)
    check('the engine reported the window stage', engine.events.some((e) => e.event === 'auth.progress' && e.data.stage === 'window'))
    const second = await engine.call('auth.microsoft.login')
    check('a second sign-in while one is open is refused', second.ok === false && second.error.code === 'busy', JSON.stringify(second.error))

    if (probeAt >= 0 && pids[0]) {
        console.log(execFileSync(process.argv[probeAt + 1], ['--attach', String(pids[0]), '--tree', '--sample', '4', '--label', 'Electron sign-in window open'], { encoding: 'utf8' }).trim())
    }

    await engine.call('auth.cancel')
    const result = await login
    check('cancelling ends the sign-in as cancelled', result.ok === false && result.error.code === 'cancelled', JSON.stringify(result.error))
    await new Promise((r) => setTimeout(r, 1500))
    check('Chromium is gone after cancelling', helperPids().length === 0)
} catch (err) {
    console.log('FAIL  ' + err.message)
    process.exitCode = 1
} finally {
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}

// (Microsoft finishes a sign-out about 6 s after its page loads, so these steps look and cancel at 3 s, not later.)
const holdMs = 3000
// ---- a launcher that already has a Microsoft account: signing out of it and adding another one, and being able to try again ----
// The account is invented (never a real session) and only ever exists in a scratch folder.
const fakeUuid = '11111111222233334444555555555555'
const far = '2999-01-01T00:00:00.000Z'
const seeded = await startEngine({
    label: 'auth-existing',
    prepare: ({ userDir }) => {
        fs.mkdirSync(userDir, { recursive: true })
        fs.writeFileSync(path.join(userDir, 'config.json'), JSON.stringify({
            authenticationDatabase: { [fakeUuid]: { type: 'microsoft', accessToken: 'x', username: 'fake@example.test', uuid: fakeUuid, displayName: 'CuentaDePrueba', expiresAt: far, microsoft: { access_token: 'x', refresh_token: 'y', expires_at: far, redirect_uri: 'https://login.microsoftonline.com/common/oauth2/nativeclient' } } },
            selectedAccount: fakeUuid
        }))
    }
})
try {
    const listed = await seeded.call('account.list')
    check('the seeded Microsoft account is there', listed.ok && listed.result.accounts.some((a) => a.uuid === fakeUuid), JSON.stringify(listed.result))

    const signOut = seeded.call('account.remove', { uuid: fakeUuid })
    await new Promise((r) => setTimeout(r, holdMs))
    check('signing out opens the Microsoft window', helperPids().length === 1, `pids ${helperPids().join(',')}`)
    await seeded.call('auth.cancel')
    const cancelledOut = await signOut
    check('cancelling that window is "cancelled", not a failure', cancelledOut.ok === false && cancelledOut.error.code === 'cancelled', JSON.stringify(cancelledOut.error))
    check('and the account is still there (nothing was removed)', (await seeded.call('account.list')).result.accounts.some((a) => a.uuid === fakeUuid))
    await new Promise((r) => setTimeout(r, 1500))
    check('no window is left behind', helperPids().length === 0)

    const addAnother = seeded.call('auth.microsoft.login')
    await new Promise((r) => setTimeout(r, holdMs))
    check('adding another account opens the Microsoft window even with one already saved', helperPids().length === 1, `pids ${helperPids().join(',')}`)
    await seeded.call('auth.cancel')
    const cancelledAdd = await addAnother
    check('cancelling it is "cancelled"', cancelledAdd.ok === false && cancelledAdd.error.code === 'cancelled', JSON.stringify(cancelledAdd.error))
    await new Promise((r) => setTimeout(r, 1500))

    const again = seeded.call('account.remove', { uuid: fakeUuid })
    await new Promise((r) => setTimeout(r, holdMs))
    check('after cancelling, signing out can be tried again (the engine is not stuck as busy)', helperPids().length === 1, `pids ${helperPids().join(',')}`)
    await seeded.call('auth.cancel')
    await again
    await new Promise((r) => setTimeout(r, 1500))
    check('and again nothing is left behind', helperPids().length === 0)

    // The player signs out in Microsoft's window and closes it themselves (the X) before it closes on its own: that is them being done, so
    // the account must leave the launcher too. Before, only the window closing by itself did it, and the profile stayed after a sign-out.
    const closedByPlayer = seeded.call('account.remove', { uuid: fakeUuid })
    await new Promise((r) => setTimeout(r, holdMs))
    const [pid] = helperPids()
    check('signing out opens the window once more', helperPids().length === 1, `pids ${helperPids().join(',')}`)
    execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).CloseMainWindow() | Out-Null`])   // what clicking the X does
    const doneByPlayer = await closedByPlayer
    check('closing the Microsoft window yourself finishes the sign-out', doneByPlayer.ok === true, JSON.stringify(doneByPlayer.error ?? doneByPlayer.result))
    const afterClose = (await seeded.call('account.list')).result
    check('and the account is gone from the launcher, with nobody left selected', !afterClose.accounts.some((a) => a.uuid === fakeUuid) && afterClose.selected === null, JSON.stringify(afterClose))
    await new Promise((r) => setTimeout(r, 1500))
    check('no window is left behind', helperPids().length === 0)
} catch (err) {
    console.log('FAIL  ' + err.message)
    process.exitCode = 1
} finally {
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + seeded.output().slice(-3000))
    await seeded.stop()
}
