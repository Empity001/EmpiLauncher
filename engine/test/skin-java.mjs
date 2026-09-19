// node engine/test/skin-java.mjs
// The one thing unit tests cannot say: does the REAL Minecraft authlib (the jar 1.21.11 ships), with the real authlib-injector agent,
// accept the skin server and hand back our skin as a signed texture? Needs a JDK (JAVA_HOME or `java`/`javac` on PATH) and internet
// (Mojang's authlib and its libraries, plus the pinned authlib-injector; all cached in a temp folder). Skips itself, saying why, when it cannot run.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { check } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const sharp = require('sharp')
const { startSkinServer } = require(path.join(here, '..', 'src', 'lib', 'skinserver.js'))
const { ensureInjector } = require(path.join(here, '..', 'src', 'lib', 'skin.js'))

const javaHome = process.env.JAVA_HOME
const bin = (name) => (javaHome && fs.existsSync(path.join(javaHome, 'bin', `${name}.exe`)) ? path.join(javaHome, 'bin', `${name}.exe`) : name)
const has = (name) => { try { execFileSync(bin(name), ['-version'], { stdio: 'ignore' }); return true } catch { return false } }
if (!has('java') || !has('javac')) { console.log('SKIP  no JDK (java and javac) found: set JAVA_HOME'); process.exit(0) }

const work = path.join(os.tmpdir(), 'empi-skin-java')
const libs = path.join(work, 'libs')
fs.mkdirSync(libs, { recursive: true })

// Mojang's own libraries for 1.21.11: the authlib the game uses and what it needs to run
if (fs.readdirSync(libs).filter((f) => f.endsWith('.jar')).length < 10) {
    const manifest = await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json()
    const version = await (await fetch(manifest.versions.find((v) => v.id === '1.21.11').url)).json()
    const skip = /lwjgl|jtracy|oshi|jna|netty|lz4|icu|jopt|jorbis|joml|fastutil|commons-codec|httpcomponents|brigadier|datafixerupper|opengl|sound|text2speech|logging/i
    for (const lib of version.libraries) {
        const artifact = lib.downloads?.artifact
        if (!artifact || (skip.test(lib.name) && !/authlib/.test(lib.name))) continue
        if (lib.rules && !lib.rules.some((r) => r.action === 'allow' && (!r.os || r.os.name === 'windows'))) continue
        fs.writeFileSync(path.join(libs, path.basename(artifact.path)), Buffer.from(await (await fetch(artifact.url)).arrayBuffer()))
    }
}

const source = `
import com.mojang.authlib.minecraft.*;
import com.mojang.authlib.yggdrasil.*;
import java.net.Proxy;
import java.util.UUID;
public class SkinCheck {
  public static void main(String[] args) throws Exception {
    MinecraftSessionService sessions = new YggdrasilAuthenticationService(Proxy.NO_PROXY).createMinecraftSessionService();
    ProfileResult result = sessions.fetchProfile(UUID.fromString(args[0]), true);
    if (result == null) { System.out.println("profile: null"); return; }
    MinecraftProfileTextures t = sessions.getTextures(result.profile());
    System.out.println("profile: " + result.profile().name());
    System.out.println("skin: " + (t.skin() == null ? "null" : t.skin().getUrl()));
    System.out.println("model: " + (t.skin() == null ? "null" : t.skin().getMetadata("model")));
    System.out.println("signature: " + t.signatureState());
  }
}`
fs.writeFileSync(path.join(work, 'SkinCheck.java'), source)
const compiled = spawnSync(bin('javac'), ['-cp', path.join(libs, '*'), '-d', work, path.join(work, 'SkinCheck.java')], { encoding: 'utf8' })
check('the test program compiles against Mojang\'s authlib', compiled.status === 0, compiled.stderr?.slice(0, 300))
if (compiled.status !== 0) process.exit(1)

const injector = await ensureInjector(work)
const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } } }).png().toBuffer()
// asynchronous on purpose: the skin server lives in this same process and must be free to answer while Java asks
const run = (uuid, extra = []) => new Promise((resolve) => {
    const child = spawn(bin('java'), [...extra, '-cp', `${work}${path.delimiter}${path.join(libs, '*')}`, 'SkinCheck', uuid])
    let stdout = '', stderr = ''
    child.stdout.on('data', (d) => { stdout += d }); child.stderr.on('data', (d) => { stderr += d })
    const timer = setTimeout(() => child.kill(), 60000)
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }) })
})
const field = (out, name) => new RegExp(`^${name}: (.*)$`, 'm').exec(out)?.[1]

for (const model of ['default', 'slim']) {
    const uuid = '00000000-0000-3000-8000-577106275399'
    const server = await startSkinServer({ name: 'Juanito', uuid, png, model })
    try {
        const out = await run(uuid, [`-javaagent:${injector}=${server.url}`, '-Dauthlibinjector.noLogFile'])
        const text = out.stdout + out.stderr
        check(`[${model}] the game's authlib finds the profile through the injector`, field(out.stdout, 'profile') === 'Juanito', text.slice(0, 3000))
        check(`[${model}] and gets our picture, from our server`, (field(out.stdout, 'skin') || '').startsWith(`${server.url}/textures/`), field(out.stdout, 'skin'))
        check(`[${model}] with the right model`, field(out.stdout, 'model') === (model === 'slim' ? 'slim' : 'null'), field(out.stdout, 'model'))
        check(`[${model}] and the signature checks out against our key`, field(out.stdout, 'signature') === 'SIGNED', field(out.stdout, 'signature'))
        const texture = await fetch(field(out.stdout, 'skin'))
        check(`[${model}] the texture URL serves exactly the picture`, texture.ok && Buffer.compare(Buffer.from(await texture.arrayBuffer()), png) === 0)
        const other = await run('11111111-2222-3333-4444-555555555555', [`-javaagent:${injector}=${server.url}`, '-Dauthlibinjector.noLogFile'])
        check(`[${model}] another UUID gets nothing (no skin for strangers)`, field(other.stdout, 'profile') === 'null' || field(other.stdout, 'skin') === 'null', other.stdout)
    } finally { await server.close() }
}
const plain = await run('00000000-0000-3000-8000-577106275399')
check('without the injector the same UUID has no skin (so the skin above really came from us)', field(plain.stdout, 'profile') === 'null' || plain.status !== 0 || field(plain.stdout, 'skin') === 'null', (plain.stdout + plain.stderr).slice(0, 200))
