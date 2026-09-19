// node engine/test/repair.mjs [--seconds 12]
// Runs the real update pipeline (index refresh, pack check, helios-core FullRepair in its receiver child process, download)
// against an EMPTY isolated data folder, and stops after a few seconds of downloading. It proves the receiver process starts
// under this runtime and that progress events flow; it does not install the whole pack. Everything is deleted afterwards.
import { startEngine, check } from './harness.mjs'

const seconds = Number(process.argv[process.argv.indexOf('--seconds') + 1]) || 12
const engine = await startEngine({ label: 'repair' })
try {
    await engine.call('distro.load')
    const started = await engine.call('game.start', { mode: 'update' })
    check('update is accepted', started.ok && started.result.started === true, JSON.stringify(started.result ?? started.error))

    const verifying = await engine.waitFor((e) => e.event === 'game.progress' && e.data.stage === 'verify', 30000)
    check('verify stage reported', verifying != null)
    const downloading = await engine.waitFor((e) => e.event === 'game.progress' && e.data.stage === 'download', 120000)
    check('download stage reached (repair receiver worked)', downloading != null)
    const pending = engine.events.find((e) => e.event === 'game.progress' && e.data.pendingFiles)
    check('pending file count reported', pending != null, pending ? `${pending.data.pendingFiles} files` : '')

    await new Promise((r) => setTimeout(r, Math.max(2, seconds - 5) * 1000))
    // Optional: what the engine (and its repair receiver) cost while really downloading. --probe <path to native/tools/Probe/out/probe.exe>
    const probeAt = process.argv.indexOf('--probe')
    if (probeAt >= 0) {
        const { execFileSync } = await import('node:child_process')
        const label = `engine during download (${process.env.ENGINE_NODE ? 'Electron-as-Node' : 'Node'})`
        console.log(execFileSync(process.argv[probeAt + 1], ['--attach', String(engine.pid), '--tree', '--sample', '4', '--label', label], { encoding: 'utf8' }).trim())
    }
    await new Promise((r) => setTimeout(r, 1000))
    const transfers = engine.events.filter((e) => e.event === 'game.progress' && e.data.received != null && e.data.total != null)
    const last = transfers.at(-1)
    check('transfer stats flow while downloading', transfers.length > 0, last ? `${(last.data.received / 1048576).toFixed(1)} MB of ${(last.data.total / 1048576).toFixed(1)} MB, ${(last.data.bytesPerSecond / 1048576).toFixed(1)} MB/s` : 'none')
    const percents = engine.events.filter((e) => e.event === 'game.progress' && typeof e.data.percent === 'number').length
    check('progress events are throttled', percents > 0 && percents < 400, `${percents} percent events over ${(engine.events.length)} total events`)
    const status = await engine.call('game.status')
    check('still busy updating', status.ok && status.result.phase === 'updating', JSON.stringify(status.result))
} catch (err) {
    console.log('FAIL  ' + err.message)
    process.exitCode = 1
} finally {
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}
