// node engine/test/javascan.mjs
// The Java search must never leave a launch waiting: cheap local places first, a full search only if they have nothing, and every step with a
// time limit. Stand-ins for helios-core make "a Java that never answers" and "a search that never ends" reproducible; one check runs the real
// thing against the JDK on this machine when there is one.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { check } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { createJavaScan, withTimeout } = require(path.join(here, '..', 'src', 'lib', 'javascan.js'))

const log = { warn() {}, info() {} }
const semverOf = (text) => { const [major, minor, patch] = text.split('.').map(Number); return { major, minor, patch } }
const detailsFor = (root, version) => ({ semver: semverOf(version), semverStr: version, vendor: 'Test', path: root })

// a data folder with two "installed" Javas (a folder with bin/javaw.exe is enough for the search to consider it)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-javascan-'))
const runtime = path.join(dataDir, 'runtime', process.arch)
const make = (name) => { const root = path.join(runtime, name); fs.mkdirSync(path.join(root, 'bin'), { recursive: true }); fs.writeFileSync(path.join(root, 'bin', 'javaw.exe'), ''); return root }
const jdk21 = make('jdk-21.0.1'), jre21 = make('jre-21.0.1'), jdk17 = make('jdk-17.0.9')
const facts = { [jdk21]: '21.0.1', [jre21]: '21.0.1', [jdk17]: '17.0.9' }
const savedEnv = { JAVA_HOME: process.env.JAVA_HOME, JRE_HOME: process.env.JRE_HOME, JDK_HOME: process.env.JDK_HOME }
for (const key of Object.keys(savedEnv)) delete process.env[key]

const java = (overrides = {}) => ({
    javaExecFromRoot: (root) => path.join(root, 'bin', 'javaw.exe'),
    ensureJavaDirIsRoot: (dir) => dir,
    validateSelectedJvm: async (root, range) => (facts[root] && (range === '>=17' || facts[root].startsWith('21')) ? detailsFor(root, facts[root]) : null),
    discoverBestJvmInstallation: async () => { throw new Error('the full search must not be needed here') },
    ...overrides
})
const fast = { validateMs: 250, scanMs: 400, slowNoticeMs: 100, parallel: 4 }

try {
    // ---- the cheap places ----
    let scan = createJavaScan({ java: java(), dataDir, log, limits: fast })
    const best = await scan.find('>=17')
    check('the Java the launcher installed itself is found without the full search', best?.path === jre21, best?.path)
    check('and the best one wins: newest version, and a JRE before a JDK of the same version', best?.semverStr === '21.0.1' && best.path === jre21)
    check('a range only the older one satisfies picks that one', (await createJavaScan({ java: java({ validateSelectedJvm: async (root) => (root === jdk17 ? detailsFor(root, '17.0.9') : null) }), dataDir, log, limits: fast }).find('>=17 <18'))?.path === jdk17)

    const elsewhere = path.join(dataDir, 'elsewhere', 'my-java')
    fs.mkdirSync(path.join(elsewhere, 'bin'), { recursive: true }); fs.writeFileSync(path.join(elsewhere, 'bin', 'javaw.exe'), '')
    facts[elsewhere] = '21.0.1'
    fs.rmSync(runtime, { recursive: true, force: true })
    process.env.JAVA_HOME = elsewhere
    scan = createJavaScan({ java: java(), dataDir, log, limits: fast })
    check('JAVA_HOME counts as a cheap place', (await scan.find('>=17'))?.path === elsewhere)
    delete process.env.JAVA_HOME

    // ---- a Java that never answers ----
    make('jdk-21.0.1'); make('jre-21.0.1')
    const hangs = { [jre21]: true }
    scan = createJavaScan({ java: java({ validateSelectedJvm: (root, range) => (hangs[root] ? new Promise(() => {}) : Promise.resolve(detailsFor(root, '21.0.1'))) }), dataDir, log, limits: fast })
    const started = Date.now()
    const skipped = await scan.find('>=17')
    check('one Java that never answers is skipped after its own limit, and the others are still considered', skipped?.path === jdk21 && Date.now() - started < 1500, `${skipped?.path} in ${Date.now() - started} ms`)
    check('validate() alone gives null for a Java that never answers', await scan.validate(jre21, '>=17') === null)
    check('validate() gives null, not an exception, when helios-core throws', await createJavaScan({ java: java({ validateSelectedJvm: async () => { throw new Error('boom') } }), dataDir, log, limits: fast }).validate(jdk21, '>=17') === null)

    // ---- nothing cheap: the full search, with a limit ----
    fs.rmSync(runtime, { recursive: true, force: true })
    let asked = 0
    scan = createJavaScan({ java: java({ discoverBestJvmInstallation: async () => { asked++; return detailsFor('C:\\Other\\jdk', '21.0.2') } }), dataDir, log, limits: fast })
    check('with nothing in the cheap places the full search is used', (await scan.find('>=17'))?.path === 'C:\\Other\\jdk' && asked === 1)

    let told = 0
    const neverEnds = createJavaScan({ java: java({ discoverBestJvmInstallation: () => new Promise(() => {}) }), dataDir, log, limits: fast })
    const t0 = Date.now()
    const gaveUp = await neverEnds.find('>=17', { onSlow: () => { told++ } })
    check('a full search that never ends gives up as "no Java found" (so the launcher offers to install one)', gaveUp === null && Date.now() - t0 < 1500, `${Date.now() - t0} ms`)
    check('and told the player it was still looking', told === 1)
    const fails = createJavaScan({ java: java({ discoverBestJvmInstallation: async () => { throw new Error('powershell failed') } }), dataDir, log, limits: fast })
    check('a full search that fails is also "no Java found", not a crash', await fails.find('>=17') === null)

    // ---- the helper ----
    check('withTimeout passes a result through', await withTimeout(Promise.resolve(7), 100, 'x') === 7)
    check('withTimeout rejects when it takes too long, saying what', await withTimeout(new Promise(() => {}), 50, 'algo').then(() => null, (err) => err.message))
    let unhandled = 0
    process.once('unhandledRejection', () => { unhandled++ })
    await withTimeout(new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 120)), 30, 'y').catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 250))
    check('a result that arrives after the limit does not surface as an unhandled error', unhandled === 0)

    // ---- the real thing, when this machine has a JDK: found from the cheap places, in about a second, without touching drives or the registry ----
    const home = process.env.EMPI_TEST_JAVA_HOME || 'C:\\Program Files\\Eclipse Adoptium'
    if (process.platform === 'win32' && fs.existsSync(home)) {
        const real = require('helios-core/java')
        let fullSearches = 0
        const wrapped = { ...real, discoverBestJvmInstallation: async (...args) => { fullSearches++; return real.discoverBestJvmInstallation(...args) } }
        const range = `>=${process.versions.node ? 8 : 8}`
        const t1 = Date.now()
        const found = await createJavaScan({ java: wrapped, dataDir, log }).find(range)
        check('real machine: a Java is found from the cheap places, without the full search', !!found && fullSearches === 0, found ? `${found.semverStr} ${found.path} in ${Date.now() - t1} ms` : 'none')
    } else console.log('SKIP  real machine check (no Eclipse Adoptium folder)')
} finally {
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    fs.rmSync(dataDir, { recursive: true, force: true })
}
