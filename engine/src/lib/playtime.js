/**
 * Time played, per modpack and per day, kept in <launcher dir>/native-playtime.json. Nothing runs in the background for it: the engine
 * already lives exactly as long as Minecraft does (keepAlive 'game'), so a session starts when the game's process starts and ends when it
 * closes. While it runs, the time is credited once a minute to the day it happened on (a session past midnight counts on both days) and
 * written, so a crash of the engine loses at most a minute.
 *
 *   { "version": 1, "days": { "2026-09-29": { "<serverId>": seconds } }, "total": { "<serverId>": seconds } }
 *
 * Only the last KEEP_DAYS days are kept day by day; the totals stay.
 */
const fs = require('fs')
const path = require('path')

const KEEP_DAYS = 60
const TICK_MS = 60 * 1000

function dayKey(date) {
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function createPlaytime(fileOf, now = () => Date.now()) {
    let session = null   // { serverId, creditedAt, timer }

    function read() {
        try {
            const data = JSON.parse(fs.readFileSync(fileOf(), 'utf8'))
            if (data && data.version === 1 && typeof data.days === 'object' && typeof data.total === 'object') return data
        } catch { /* missing or broken: start over */ }
        return { version: 1, days: {}, total: {} }
    }

    function write(data) {
        const keys = Object.keys(data.days).sort()
        for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete data.days[k]
        try {
            fs.mkdirSync(path.dirname(fileOf()), { recursive: true })
            const tmp = `${fileOf()}.tmp`
            fs.writeFileSync(tmp, JSON.stringify(data))
            fs.renameSync(tmp, fileOf())
        } catch { /* not saved this time: the next minute tries again */ }
    }

    /** Adds the seconds from `from` to `to` (ms) to the days they belong to. */
    function credit(serverId, from, to) {
        if (!(to > from)) return
        const data = read()
        let at = from
        while (at < to) {
            const start = new Date(at)
            const nextDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime()
            const until = Math.min(to, nextDay)
            const seconds = (until - at) / 1000
            const key = dayKey(start)
            data.days[key] = data.days[key] || {}
            data.days[key][serverId] = Math.round(((data.days[key][serverId] || 0) + seconds) * 10) / 10
            data.total[serverId] = Math.round(((data.total[serverId] || 0) + seconds) * 10) / 10
            at = until
        }
        write(data)
    }

    function flush() {
        if (!session) return
        const t = now()
        credit(session.serverId, session.creditedAt, t)
        session.creditedAt = t
    }

    return {
        /** Minecraft's process started for this modpack. */
        start(serverId) {
            this.stop()
            if (!serverId) return
            session = { serverId, creditedAt: now(), timer: setInterval(flush, TICK_MS) }
            if (session.timer.unref) session.timer.unref()
        },
        /** Minecraft closed (or the engine is going away): the rest of the session is credited. */
        stop() {
            if (!session) return
            flush()
            clearInterval(session.timer)
            session = null
        },
        get playing() { return session ? session.serverId : null },
        /**
         * The last `days` days, oldest first, in seconds; for one modpack, or for all of them when serverId is empty. The session in
         * progress counts up to now.
         */
        summary(serverId, days = 7) {
            const data = read()
            if (session) {
                // what the running session has played since its last credit, without writing it
                const extra = (now() - session.creditedAt) / 1000
                const key = dayKey(new Date(now()))
                data.days[key] = data.days[key] || {}
                data.days[key][session.serverId] = (data.days[key][session.serverId] || 0) + extra
                data.total[session.serverId] = (data.total[session.serverId] || 0) + extra
            }
            const pick = (bucket) => serverId ? (bucket[serverId] || 0) : Object.values(bucket).reduce((a, b) => a + b, 0)
            const today = new Date(now())
            const list = []
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
                const key = dayKey(d)
                list.push({ date: key, weekday: d.getDay(), seconds: Math.round(pick(data.days[key] || {})) })
            }
            return { days: list, totalSeconds: Math.round(pick(data.total)), playing: session ? session.serverId : null }
        }
    }
}

module.exports = { createPlaytime, dayKey }
