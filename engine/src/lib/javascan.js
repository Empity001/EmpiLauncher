/**
 * Finding a Java to launch with, without ever leaving the player waiting on "Comprobando Java...".
 *
 * helios-core's search has no time limit anywhere: it asks PowerShell for every drive (mapped and disconnected network drives included,
 * which can take minutes to answer), reads the registry, and runs `java -XshowSettings:properties -version` on every candidate,
 * one after the other. One Java that does not answer, a slow PowerShell or a dead network drive and the launch stays there forever
 * (the classic launcher's "Checking system info.." that never moves on).
 *
 * This keeps helios-core's rules (64-bit, version range, ranking) but:
 *   1. looks first in the few places that are on this PC's own disk and cheap (the Java the launcher installed itself, JAVA_HOME and the
 *      usual Program Files folders of the system drive), four candidates at a time, each with its own time limit;
 *   2. only if none of those has a usable Java does it fall back to helios-core's full search, with an overall time limit;
 *   3. a search that gives up reports "no Java found", which makes the launcher offer to install one: the player is never stuck.
 * Every step that takes long says so, and what it skipped goes to the log.
 */
const fs = require('fs')
const path = require('path')

const DEFAULT_LIMITS = { validateMs: 12000, scanMs: 45000, slowNoticeMs: 8000, parallel: 4 }

/** Rejects if `promise` has not settled within `ms`. A late result (or failure) of the abandoned promise is ignored. */
function withTimeout(promise, ms, what) {
    let timer
    const gate = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: sin respuesta tras ${Math.round(ms / 1000)} s`)), ms) })
    Promise.resolve(promise).catch(() => {})
    return Promise.race([promise, gate]).finally(() => clearTimeout(timer))
}

/** helios-core's own order: newest version first; among equal versions a JRE before a JDK. */
function compare(a, b) {
    for (const part of ['major', 'minor', 'patch']) if (a.semver[part] !== b.semver[part]) return b.semver[part] - a.semver[part]
    const jdk = (d) => d.path.toLowerCase().includes('jdk')
    return jdk(a) === jdk(b) ? 0 : jdk(a) ? 1 : -1
}

/**
 * @param {{ java: { validateSelectedJvm, discoverBestJvmInstallation, javaExecFromRoot, ensureJavaDirIsRoot }, dataDir: string, log: { warn, info }, limits?: object }} options
 */
function createJavaScan({ java, dataDir, log, limits = {} }) {
    const cfg = { ...DEFAULT_LIMITS, ...limits }

    /** Details of the Java at `root` if it is usable for `range`, otherwise null. Never waits longer than the limit and never throws. */
    async function validate(root, range) {
        try {
            return await withTimeout(java.validateSelectedJvm(root, range), cfg.validateMs, `El Java de ${root}`)
        } catch (err) {
            log.warn(`Java candidate skipped: ${err.message}`)
            return null
        }
    }

    const subfolders = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name)) } catch { return [] } }

    /** The cheap places: this launcher's own runtime folder, JAVA_HOME and friends, and Program Files on the system drive only. */
    function quickRoots() {
        const roots = new Set()
        const add = (root) => { if (root && fs.existsSync(java.javaExecFromRoot(root))) roots.add(root) }
        for (const folder of subfolders(path.join(dataDir, 'runtime', process.arch))) add(folder)
        for (const key of ['JAVA_HOME', 'JRE_HOME', 'JDK_HOME']) if (process.env[key]) add(java.ensureJavaDirIsRoot(process.env[key]))
        if (process.platform === 'win32') {
            const drive = process.env.SystemDrive || 'C:'
            for (const dir of ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'AdoptOpenJDK', 'Amazon Corretto', 'Microsoft', 'Zulu', 'BellSoft'])
                for (const folder of subfolders(path.join(`${drive}\\`, 'Program Files', dir))) add(folder)
        }
        return [...roots]
    }

    /** The best usable Java among the cheap places, or null. */
    async function quick(range) {
        const roots = quickRoots()
        const found = []
        for (let i = 0; i < roots.length; i += cfg.parallel) {
            const batch = await Promise.all(roots.slice(i, i + cfg.parallel).map((root) => validate(root, range)))
            found.push(...batch.filter(Boolean))
        }
        return found.sort(compare)[0] ?? null
    }

    /**
     * The best Java for `range`, or null when there is none (or looking gave up). onSlow is called once if it is taking long,
     * so the player can be told it is still looking.
     */
    async function find(range, { onSlow } = {}) {
        const fast = await quick(range)
        if (fast) return fast
        const notice = setTimeout(() => { if (onSlow) onSlow() }, cfg.slowNoticeMs)
        try {
            return await withTimeout(java.discoverBestJvmInstallation(dataDir, range), cfg.scanMs, 'La búsqueda de Java por todo el equipo')
        } catch (err) {
            log.warn(`${err.message}. Treating it as "no Java found".`)
            return null
        } finally {
            clearTimeout(notice)
        }
    }

    return { validate, quick, find }
}

module.exports = { createJavaScan, withTimeout }
