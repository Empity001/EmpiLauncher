// node engine/test/lifecycle.mjs
// The launch bookkeeping around a running game, with a stand-in process instead of Minecraft (see test.spawnFake in game.js):
// it is detected as running, keeps the engine alive, is stopped on request, and a crash is reported and cleaned up.
import { execFileSync } from 'node:child_process'
import { startEngine, check } from './harness.mjs'

const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const started = 'console.log("[00:00:01] [main/INFO]: Loading Minecraft 1.21.11 with Fabric Loader 0.16.9"); setInterval(() => {}, 1000)'
const crashes = 'console.log("about to fail"); setTimeout(() => process.exit(3), 800)'

const engine = await startEngine({ label: 'lifecycle', env: { EMPI_ENGINE_TEST: '1' } })
const phases = () => engine.events.filter((e) => e.event === 'game.state').map((e) => e.data.phase)
try {
    await engine.call('distro.load')

    // ---- a game that starts and is stopped by the player ----
    const first = await engine.call('test.spawnFake', { script: started })
    check('the stand-in game starts', first.ok && first.result.ok === true, JSON.stringify(first.result ?? first.error))
    const running = await engine.waitFor((e) => e.event === 'game.state' && e.data.phase === 'running', 15000)
    check('start-up line is recognised and the phase becomes running', running != null, phases().join(' > '))
    const pid = running?.data.pid
    check('the pid is reported', Number.isInteger(pid) && alive(pid), String(pid))
    const status = await engine.call('game.status')
    check('game.status reports running with the pid', status.ok && status.result.phase === 'running' && status.result.pid === pid, JSON.stringify(status.result))
    const again = await engine.call('game.start', { mode: 'play' })
    check('a second start while running is refused', again.ok === false && again.error.code === 'running', JSON.stringify(again.error))

    const stop = await engine.call('game.stop')
    check('game.stop stops it', stop.ok && stop.result.stopped === true)
    const exited = await engine.waitFor((e) => e.event === 'game.exit', 12000)
    check('game.exit says it was stopped by the player', exited != null && exited.data.stopped === true, JSON.stringify(exited?.data))
    await new Promise((r) => setTimeout(r, 600))
    check('the process is really gone', pid != null && !alive(pid))
    const after = await engine.call('game.status')
    check('back to idle', after.ok && after.result.phase === 'idle' && after.result.pid === null, JSON.stringify(after.result))
    check('phases went launching > running > stopping > idle', /launching.*running.*stopping.*idle/.test(phases().join(' ')), phases().join(' > '))

    // ---- a game that crashes by itself ----
    engine.events.length = 0
    await engine.call('test.spawnFake', { script: crashes })
    const crashed = await engine.waitFor((e) => e.event === 'game.exit', 15000)
    check('a crash is reported with its exit code and not as a stop', crashed != null && crashed.data.code === 3 && crashed.data.stopped === false, JSON.stringify(crashed?.data))
    await new Promise((r) => setTimeout(r, 400))
    const idle = await engine.call('game.status')
    check('after a crash the launcher is idle again', idle.ok && idle.result.phase === 'idle', JSON.stringify(idle.result))
} catch (err) {
    console.log('FAIL  ' + err.message)
    process.exitCode = 1
} finally {
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}
