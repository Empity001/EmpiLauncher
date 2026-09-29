// node engine/test/playtime.mjs
// Time played per modpack and day (lib/playtime.js), with a fake clock and a scratch file: sessions, midnight, the running session,
// the per-minute credit and a broken file.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { check } from './harness.mjs'

const require = createRequire(import.meta.url)
const { createPlaytime, dayKey } = require('../src/lib/playtime.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-playtime-'))
const file = path.join(dir, 'native-playtime.json')
let clock = new Date(2026, 8, 28, 22, 0, 0).getTime()   // 28 Sep 2026, 22:00 local
const pt = createPlaytime(() => file, () => clock)
const H = 3600 * 1000

// an hour of Panolis
pt.start('panolis'); clock += H; pt.stop()
let sum = pt.summary('panolis')
check('an hour of play counts as 3600 s on that day', sum.days.at(-1).date === '2026-09-28' && sum.days.at(-1).seconds === 3600 && sum.totalSeconds === 3600, JSON.stringify(sum.days.at(-1)))
check('seven days come back, oldest first', sum.days.length === 7 && sum.days[0].date === '2026-09-22')

// a session across midnight: 23:30 to 00:45 counts 30 min on the 28th and 45 on the 29th
clock = new Date(2026, 8, 28, 23, 30).getTime()
pt.start('panolis'); clock = new Date(2026, 8, 29, 0, 45).getTime(); pt.stop()
sum = pt.summary('panolis')
const day = (d) => sum.days.find((x) => x.date === d)?.seconds
check('a session past midnight is split between both days', day('2026-09-28') === 3600 + 1800 && day('2026-09-29') === 2700, JSON.stringify(sum.days.slice(-2)))

// another modpack, and everything together
pt.start('culones'); clock += H / 2; pt.stop()
check('each modpack keeps its own time', pt.summary('culones').totalSeconds === 1800 && pt.summary('panolis').totalSeconds === 3600 + 1800 + 2700)
check('without a modpack it is the sum of all', pt.summary(null).totalSeconds === 3600 + 1800 + 2700 + 1800)

// the running session counts up to now without being written, and it is on disk after stop
pt.start('culones'); clock += 10 * 60 * 1000
check('the session in progress already shows', pt.summary('culones').totalSeconds === 1800 + 600 && pt.summary('culones').playing === 'culones')
const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
check('but it is not on disk until a minute passes or it ends', (onDisk.total.culones || 0) === 1800)
pt.stop()
check('stopping writes it', JSON.parse(fs.readFileSync(file, 'utf8')).total.culones === 2400 && pt.playing === null)

// a broken file is a fresh start, not a crash
fs.writeFileSync(file, '{ not json')
const again = createPlaytime(() => file, () => clock)
check('a broken file starts over', again.summary('panolis').totalSeconds === 0)
again.start('panolis'); clock += 1000; again.stop()
check('and is written anew', JSON.parse(fs.readFileSync(file, 'utf8')).total.panolis === 1)

check('dates are local calendar days', dayKey(new Date(2026, 0, 5, 23, 59)) === '2026-01-05')
fs.rmSync(dir, { recursive: true, force: true })
