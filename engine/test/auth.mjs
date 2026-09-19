// node engine/test/auth.mjs [--probe <probe.exe>] [--seconds 8]
// Opens the Microsoft sign-in helper (no credentials are entered), checks that it is a separate short-lived Electron process,
// optionally measures what it costs while open (--probe), then cancels it and checks that Chromium is gone again.
import { execFileSync } from 'node:child_process'
import { startEngine, check } from './harness.mjs'

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
