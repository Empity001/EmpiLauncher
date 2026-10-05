// node --test tools/publisher/test/*.test.js
// Importing a modpack from a zip (lib/zipfile.js + lib/importzip.js): reading a real .zip by hand (no dependency, the Publisher has
// none), detecting the Minecraft version and loader from what a played instance leaves behind, and sorting a zip's files into a
// modpack's mods/config/resourcepacks/shaderpacks while leaving saves, screenshots, logs and the rest out.
//
// The Forge detection line below is the real first line of a played modpack's logs/latest.log (Minecraft 1.20.1, Forge 47.4.10,
// 144 mods; player and machine details replaced). The filenames in FABRIC_NAMES and FORGE_NAMES are a real subset of that modpack's
// mod list. Nothing from the actual save, screenshots or player account is used anywhere here.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const zipfile = require('../lib/zipfile')
const iz = require('../lib/importzip')
const nebula = require('../lib/nebula')


/** A zip made by the OS's own tool (Compress-Archive on Windows, zip elsewhere), not by our writer. `contentsOnly` leaves the folder itself out. */
function makeZip(folder, zipPath, contentsOnly) {
    if (process.platform === 'win32') {
        const target = contentsOnly ? `${folder}\\*` : folder
        execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path "${target}" -DestinationPath "${zipPath}" -Force`])
    } else if (contentsOnly) {
        execFileSync('zip', ['-rqD', zipPath, '.'], { cwd: folder })
    } else {
        execFileSync('zip', ['-rqD', zipPath, path.basename(folder)], { cwd: path.dirname(folder) })
    }
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-importzip-'))

// ------------------------------------------------------------ zipfile.js: reading the format itself

test('a real zip (built by Windows, not by us) reads back byte for byte, store and deflate alike', async () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, 'src', 'mods'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'src', 'config', 'sub'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'mods', 'small.jar'), 'not really a jar')
    fs.writeFileSync(path.join(dir, 'src', 'mods', 'big.jar'), require('crypto').randomBytes(400000))   // big enough that deflate actually compresses it
    fs.writeFileSync(path.join(dir, 'src', 'config', 'sub', 'settings.json'), '{"ok":true}')
    const zipPath = path.join(dir, 'out.zip')
    makeZip(path.join(dir, 'src'), zipPath, true)

    const zip = zipfile.open(zipPath)
    try {
        const names = zip.entries.map((entry) => entry.name).sort()
        assert.deepStrictEqual(names, ['config/sub/settings.json', 'mods/big.jar', 'mods/small.jar'])
        for (const rel of ['mods/small.jar', 'mods/big.jar', 'config/sub/settings.json']) {
            const entry = zip.entries.find((candidate) => candidate.name === rel)
            const dest = path.join(dir, 'extracted', rel)
            await zip.extractTo(entry, dest)
            assert.ok(Buffer.compare(fs.readFileSync(dest), fs.readFileSync(path.join(dir, 'src', rel))) === 0, rel)
        }
    } finally {
        zip.close()
    }
})

test('a hand-built "store" (uncompressed) entry reads back too', async () => {
    // Building the bytes ourselves here (method 0, no compression) checks the branch a deflate-only tool like Compress-Archive never exercises.
    const dir = tmp()
    const data = Buffer.from('stored, not deflated')
    const name = Buffer.from('plain.txt')
    const crc = require('zlib').crc32 ? require('zlib').crc32(data) : crc32(data)
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    const centralStart = local.length + data.length
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42)
    name.copy(central, 46)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(centralStart, 16); eocd.writeUInt16LE(0, 20)
    const zipPath = path.join(dir, 'store.zip')
    fs.writeFileSync(zipPath, Buffer.concat([local, data, central, eocd]))

    const zip = zipfile.open(zipPath)
    assert.strictEqual(zip.entries.length, 1)
    assert.strictEqual(zip.entries[0].method, 0)
    const dest = path.join(dir, 'plain.txt')
    await zip.extractTo(zip.entries[0], dest)
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'stored, not deflated')
    zip.close()
})

function crc32(buf) {
    let table = crc32.table
    if (!table) {
        table = crc32.table = new Uint32Array(256)
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c }
    }
    let crc = 0xffffffff
    for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

test('a name trying to climb out of the zip ("..", an absolute path) is refused, not followed', () => {
    assert.strictEqual(zipfile.safeRelative('../../evil.txt'), null)
    assert.strictEqual(zipfile.safeRelative('/etc/passwd'), null)
    assert.strictEqual(zipfile.safeRelative('C:\\Windows\\system.ini'), null)
    assert.strictEqual(zipfile.safeRelative('mods/../../evil.txt'), null)
    assert.strictEqual(zipfile.safeRelative('mods/ok.jar'), 'mods/ok.jar')
})

// ------------------------------------------------------------ detecting the Minecraft version and loader

// The real first line of a played "Zombie Invade 100 Days" modpack's logs/latest.log (player name, uuid, token and machine paths replaced).
const REAL_FORGE_LOG = '[03:06:05] [main/INFO]: ModLauncher running: args [--username, Player, --version, 1.20.1, --gameDir, ., ' +
    '--assetsDir, ., --assetIndex, 5, --uuid, 0, --accessToken, ????????, --clientId, 0, --xuid, 0, --userType, msa, ' +
    '--versionType, release, --width, 854, --height, 480, --launchTarget, forgeclient, --fml.forgeVersion, 47.4.10, ' +
    '--fml.mcVersion, 1.20.1, --fml.forgeGroup, net.minecraftforge, --fml.mcpVersion, 20230612.114412]'
// NeoForge kept ModLauncher's argument style when it split from Forge; modelled on the line above (not read from a real NeoForge log).
const MODELLED_NEOFORGE_LOG = '[main/INFO]: ModLauncher running: args [--launchTarget, neoforgeclient, --fml.neoForgeVersion, 21.1.62, --fml.mcVersion, 1.21.1]'
const FABRIC_LOG = '[main/INFO]: Loading Minecraft 1.20.1 with Fabric Loader 0.15.7'

test('the exact Minecraft version, loader and loader version come from the log when there is one', () => {
    assert.deepStrictEqual(iz.detectFromLog(REAL_FORGE_LOG), { minecraft: '1.20.1', loader: 'forge', loaderVersion: '47.4.10', source: 'log' })
    assert.deepStrictEqual(iz.detectFromLog(MODELLED_NEOFORGE_LOG), { minecraft: '1.21.1', loader: 'neoforge', loaderVersion: '21.1.62', source: 'log' })
    assert.deepStrictEqual(iz.detectFromLog(FABRIC_LOG), { minecraft: '1.20.1', loader: 'fabric', loaderVersion: '0.15.7', source: 'log' })
    assert.strictEqual(iz.detectFromLog('[main/INFO]: Setting user: Player'), null)
})

// A real subset of that modpack's 144 mod filenames (Forge, Minecraft 1.20.1), and a small Fabric-only list for the other branch.
const FORGE_NAMES = [
    'AttributeFix-Forge-1.20.1-21.0.4.jar', 'BadMobs-1.20.1-19.0.4.jar', 'BiomesOPlenty-forge-1.20.1-19.0.0.96.jar',
    'CreativeCore_FORGE_v2.12.32_mc1.20.1.jar', 'CustomSkinLoader_ForgeV2-14.26.1.jar', 'appleskin-forge-mc1.20.1-2.5.1.jar',
    'architectury-9.2.14-forge.jar', 'balm-forge-1.20.1-7.3.37-all.jar', 'curios-forge-5.14.1+1.20.1.jar', 'collective-1.20.1-8.13.jar'
]
const FABRIC_NAMES = ['sodium-fabric-mc1.20.1-0.5.3.jar', 'lithium-fabric-mc1.20.1-0.11.2.jar', 'fabric-api-0.91.0+1.20.1.jar']

test('with no log, the mod filenames still guess the Minecraft version and loader (never a loader version)', () => {
    assert.deepStrictEqual(iz.detectFromFilenames(FORGE_NAMES), { minecraft: '1.20.1', loader: 'forge', loaderVersion: null, source: 'guess' })
    assert.deepStrictEqual(iz.detectFromFilenames(FABRIC_NAMES), { minecraft: '1.20.1', loader: 'fabric', loaderVersion: null, source: 'guess' })
})

test('too few names agreeing, or an equal split between loaders, is not worth a guess', () => {
    assert.strictEqual(iz.detectFromFilenames([]), null)
    assert.strictEqual(iz.detectFromFilenames(['one-1.20.1.jar', 'two-1.19.2.jar', 'three-1.18.jar', 'four-no-version.jar', 'five-also-none.jar']), null)
    const tie = iz.detectFromFilenames(['a-forge-1.20.1.jar', 'b-fabric-1.20.1.jar'])
    assert.strictEqual(tie.minecraft, '1.20.1')
    assert.strictEqual(tie.loader, null)
})

// ------------------------------------------------------------ sorting entries: what comes in, what is left out

const entry = (name, size = 10) => ({ name, dir: name.endsWith('/'), size })

test('a zip of the profile folder itself (one wrapping folder) has that folder stripped; one zipped from inside it does not', () => {
    const wrapped = [entry('MyPack/mods/a.jar'), entry('MyPack/config/x.json'), entry('MyPack/saves/World/level.dat')]
    assert.deepStrictEqual(iz.stripCommonRoot(wrapped).map((e) => e.name).sort(), ['config/x.json', 'mods/a.jar', 'saves/World/level.dat'])

    const bare = [entry('mods/a.jar'), entry('config/x.json')]
    assert.deepStrictEqual(iz.stripCommonRoot(bare).map((e) => e.name).sort(), ['config/x.json', 'mods/a.jar'])

    // zipping only the mods folder: its single top segment ("mods") is itself a known folder, so it must not be stripped away
    const modsOnly = [entry('mods/a.jar'), entry('mods/b.jar')]
    assert.deepStrictEqual(iz.stripCommonRoot(modsOnly).map((e) => e.name).sort(), ['mods/a.jar', 'mods/b.jar'])
})

test('classify keeps enabled mods, config, and zipped resource/shader packs; leaves the rest out and counted', () => {
    const entries = [
        entry('mods/Sodium.jar'), entry('mods/Old.jar.disabled'), entry('mods/readme.txt'),   // a stray non-jar in mods/ is not a mod
        entry('config/client.toml'), entry('config/sub/nested.json'),
        entry('resourcepacks/Faithful.zip'), entry('resourcepacks/loose-pack/pack.mcmeta'),   // an unzipped resource pack: left out
        entry('shaderpacks/Complementary.zip'),
        entry('saves/World1/level.dat', 900), entry('screenshots/pic.png', 300), entry('logs/latest.log', 200), entry('options.txt', 50)
    ]
    const plan = iz.classify(entries)
    assert.deepStrictEqual(plan.mods.map((e) => e.name), ['mods/Sodium.jar'])
    assert.strictEqual(plan.disabledMods, 1)
    assert.deepStrictEqual(plan.config.map((e) => e.name).sort(), ['config/client.toml', 'config/sub/nested.json'])
    assert.deepStrictEqual(plan.resourcepacks.map((e) => e.name), ['resourcepacks/Faithful.zip'])
    assert.deepStrictEqual(plan.shaderpacks.map((e) => e.name), ['shaderpacks/Complementary.zip'])
    const skippedNames = plan.skipped.map((e) => e.name).sort()
    assert.deepStrictEqual(skippedNames, ['logs', 'mods', 'options.txt', 'resourcepacks', 'saves', 'screenshots'])
    // "mods" is only in "skipped" for the stray readme.txt (10 bytes), not for the disabled mod, which has its own count above
    assert.strictEqual(plan.skipped.find((e) => e.name === 'mods').size, 10)
})

// ------------------------------------------------------------ inspect() and copyInto() against a real zip

function buildRealZip(dir) {
    const root = path.join(dir, 'Zombie Invade 100 Days')
    fs.mkdirSync(path.join(root, 'mods'), { recursive: true })
    fs.mkdirSync(path.join(root, 'config', 'sub'), { recursive: true })
    fs.mkdirSync(path.join(root, 'resourcepacks'), { recursive: true })
    fs.mkdirSync(path.join(root, 'shaderpacks', 'UnzippedShader'), { recursive: true })
    fs.mkdirSync(path.join(root, 'saves', 'World1'), { recursive: true })
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    for (const name of FORGE_NAMES) fs.writeFileSync(path.join(root, 'mods', name), `jar bytes for ${name}`)
    fs.writeFileSync(path.join(root, 'mods', 'Retired.jar.disabled'), 'disabled')
    fs.writeFileSync(path.join(root, 'config', 'client.toml'), 'enabled = true')
    fs.writeFileSync(path.join(root, 'config', 'sub', 'nested.json'), '{}')
    fs.writeFileSync(path.join(root, 'resourcepacks', 'Faithful.zip'), 'not a real zip, just bytes')
    fs.writeFileSync(path.join(root, 'shaderpacks', 'UnzippedShader', 'shader.fsh'), 'glsl-ish')
    fs.writeFileSync(path.join(root, 'saves', 'World1', 'level.dat'), 'a save nobody should ship')
    fs.writeFileSync(path.join(root, 'logs', 'latest.log'), REAL_FORGE_LOG)
    fs.writeFileSync(path.join(root, 'options.txt'), 'fov:90')
    const zipPath = path.join(dir, 'profile.zip')
    makeZip(root, zipPath, false)
    return zipPath
}

test('inspect() reads a real zipped profile folder and proposes the exact Forge version from its log', async () => {
    const dir = tmp()
    const zipPath = buildRealZip(dir)
    const result = await iz.inspect(zipPath)
    assert.deepStrictEqual(result.proposal, { minecraft: '1.20.1', loader: 'forge', loaderVersion: '47.4.10', source: 'log' })
    assert.deepStrictEqual(result.counts, { mods: FORGE_NAMES.length, disabledMods: 1, configFiles: 2, resourcepacks: 1, shaderpacks: 0 })
    const skippedNames = result.skipped.map((entry_) => entry_.name).sort()
    assert.deepStrictEqual(skippedNames, ['logs', 'options.txt', 'saves', 'shaderpacks'])
    assert.ok(fs.existsSync(path.join(iz.stagingRoot(), result.importId, 'upload.zip')), 'the upload is kept staged until apply() or a sweep')
})

test('copyInto() puts each kind where the modpack expects it, and touches nothing else', async () => {
    const dir = tmp()
    const zipPath = buildRealZip(dir)
    const { importId } = await iz.inspect(zipPath)

    const root = tmp()
    const config = { nebulaProjectPath: path.join(root, 'no-nebula'), nebulaRootPath: root }
    const id = 'Zombie-1.20.1'
    const packDir = path.join(root, 'servers', id)
    fs.mkdirSync(path.join(packDir, 'forgemods', 'required'), { recursive: true })
    fs.mkdirSync(path.join(packDir, 'files'), { recursive: true })
    fs.writeFileSync(path.join(packDir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: id, address: 'localhost:25565' }, forge: { version: '47.4.10' } }))

    const logs = []
    const counts = await iz.copyInto(config, id, importId, (line) => logs.push(line))
    assert.deepStrictEqual(counts, { mods: FORGE_NAMES.length, disabledMods: 1, config: 2, resourcepacks: 1, shaderpacks: 0 })

    const modFiles = fs.readdirSync(path.join(packDir, 'forgemods', 'required')).sort()
    assert.deepStrictEqual(modFiles, [...FORGE_NAMES].sort())
    assert.strictEqual(fs.readFileSync(path.join(packDir, 'forgemods', 'required', FORGE_NAMES[0]), 'utf8'), `jar bytes for ${FORGE_NAMES[0]}`)
    assert.ok(!modFiles.includes('Retired.jar.disabled'), 'the disabled mod did not come along')

    assert.strictEqual(fs.readFileSync(path.join(packDir, 'files', 'config', 'client.toml'), 'utf8'), 'enabled = true')
    assert.strictEqual(fs.readFileSync(path.join(packDir, 'files', 'config', 'sub', 'nested.json'), 'utf8'), '{}')
    assert.deepStrictEqual(fs.readdirSync(path.join(packDir, 'files', 'resourcepacks')), ['Faithful.zip'])
    assert.ok(!fs.existsSync(path.join(packDir, 'files', 'shaderpacks')), 'the unzipped shader folder was not a .zip, so it was left out')

    assert.ok(!fs.existsSync(path.join(packDir, 'saves')), 'saves are never copied into a modpack')
    assert.ok(logs.some((line) => line.includes('desactivados')), 'the disabled count is mentioned in the log')
})

test('apply() creates the pack (via a stand-in for Nebula) then copies the zip in, and always clears the staged upload', async () => {
    const dir = tmp()
    const zipPath = buildRealZip(dir)
    const root = tmp()
    const config = { nebulaProjectPath: path.join(root, 'no-nebula'), nebulaRootPath: root }
    const id = 'Zombie-1.20.1'

    const realCreatePack = nebula.createPack
    nebula.createPack = async (_config, options) => {
        const packDir = path.join(root, 'servers', id)
        fs.mkdirSync(path.join(packDir, 'forgemods', 'required'), { recursive: true })
        fs.mkdirSync(path.join(packDir, 'files'), { recursive: true })
        fs.writeFileSync(path.join(packDir, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: options.displayName, address: 'localhost:25565' }, forge: { version: options.loaderVersion } }))
        return { id }
    }
    try {
        const { importId } = await iz.inspect(zipPath)
        const logs = []
        const result = await iz.apply(config, importId, { id, minecraft: '1.20.1', loader: 'forge', loaderVersion: '47.4.10', displayName: 'Zombie' }, (line) => logs.push(line), () => {})
        assert.strictEqual(result.id, id)
        assert.strictEqual(result.counts.mods, FORGE_NAMES.length)
        assert.ok(fs.readdirSync(path.join(root, 'servers', id, 'forgemods', 'required')).length === FORGE_NAMES.length)
        assert.ok(!fs.existsSync(path.join(iz.stagingRoot(), importId)), 'the staged upload is removed once applied')
    } finally {
        nebula.createPack = realCreatePack
    }
})

test('apply() still clears the staged upload when copying fails partway (a pack with no mod folder yet)', async () => {
    const dir = tmp()
    const zipPath = buildRealZip(dir)
    const root = tmp()
    const config = { nebulaProjectPath: path.join(root, 'no-nebula'), nebulaRootPath: root }
    const id = 'Broken-1.20.1'

    const realCreatePack = nebula.createPack
    nebula.createPack = async () => {
        // no forgemods/required folder created: copyInto must fail on the first mod
        fs.mkdirSync(path.join(root, 'servers', id, 'files'), { recursive: true })
        fs.writeFileSync(path.join(root, 'servers', id, 'servermeta.json'), JSON.stringify({ meta: { version: '1.0.0', name: id, address: 'localhost:25565' }, forge: { version: '47.4.10' } }))
        return { id }
    }
    try {
        const { importId } = await iz.inspect(zipPath)
        await assert.rejects(() => iz.apply(config, importId, { id, minecraft: '1.20.1', loader: 'forge', loaderVersion: '47.4.10', displayName: 'Broken' }, () => {}, () => {}))
        assert.ok(!fs.existsSync(path.join(iz.stagingRoot(), importId)), 'cleared even though copying failed')
    } finally {
        nebula.createPack = realCreatePack
    }
})

test('an import that is never confirmed is swept after its time is up; a fresh one survives', async () => {
    const dir = tmp()
    const zipPath = buildRealZip(dir)
    const { importId } = await iz.inspect(zipPath)
    const stagedDir = path.join(iz.stagingRoot(), importId)
    assert.ok(fs.existsSync(stagedDir))

    const old = Date.now() / 1000 - 4 * 60 * 60   // 4 hours ago: past the 3-hour cutoff
    fs.utimesSync(stagedDir, old, old)
    iz.sweepStaleImports()
    assert.ok(!fs.existsSync(stagedDir), 'an abandoned import older than the cutoff is gone')

    const { importId: fresh } = await iz.inspect(buildRealZip(tmp()))
    iz.sweepStaleImports()
    assert.ok(fs.existsSync(path.join(iz.stagingRoot(), fresh)), 'a fresh import survives the same sweep')
})

test('a crafted importId cannot make apply() delete anything outside the staging folder', async () => {
    // a canary just next to (not inside) stagingRoot(): if "../canary" in importId ever reached fs.rmSync unvalidated, this would vanish
    fs.mkdirSync(iz.stagingRoot(), { recursive: true })
    const canary = path.join(iz.stagingRoot(), '..', 'canary-do-not-delete.txt')
    fs.writeFileSync(canary, 'still here')
    try {
        for (const evil of ['../canary-do-not-delete.txt', '..\\canary-do-not-delete.txt', '../../../../Windows', 'not-a-uuid-at-all', '']) {
            await assert.rejects(() => iz.apply({}, evil, {}, () => {}, () => {}), /no válida/, `importId ${JSON.stringify(evil)} must be refused before anything runs`)
        }
        assert.strictEqual(fs.readFileSync(canary, 'utf8'), 'still here')
    } finally {
        fs.rmSync(canary, { force: true })
    }
})
