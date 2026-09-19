// node engine/test/skin-java.mjs [1.8.9 1.21.11 ...]
// The one thing unit tests cannot say: does the REAL Minecraft authlib of each game version, with the real authlib-injector agent, accept our
// skin server and hand back our skin as a signed texture? It uses the authlib jar (and libraries) each version ships, downloaded from Mojang
// into a temp folder, and a small Java program that asks for a profile and its skin the way the game does, through reflection so the same
// program works with every version's API (they differ a lot between 1.8 and 1.21). Needs a JDK (JAVA_HOME, or java/javac on PATH) and internet.
// Skips itself, saying why, when it cannot run.
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

// what the game does to show a skin, version-agnostic: a session service, a profile by UUID (asking for the signature to be checked), its textures
const source = `
import java.lang.reflect.*;
import java.net.Proxy;
import java.util.*;
public class SkinCheck {
  static Method find(Class<?> c, String name, Class<?>... types) { try { return c.getMethod(name, types); } catch (NoSuchMethodException e) { return null; } }
  public static void main(String[] args) throws Exception {
    UUID id = UUID.fromString(args[0]);
    Class<?> serviceClass = Class.forName("com.mojang.authlib.yggdrasil.YggdrasilAuthenticationService");
    Constructor<?> plain = null;
    try { plain = serviceClass.getConstructor(Proxy.class); } catch (NoSuchMethodException e) { /* 1.8 to 1.15 also want a client token */ }
    Object service = plain != null ? plain.newInstance(Proxy.NO_PROXY) : serviceClass.getConstructor(Proxy.class, String.class).newInstance(Proxy.NO_PROXY, "empi-test");
    Object sessions = serviceClass.getMethod("createMinecraftSessionService").invoke(service);
    Class<?> sessionsType = Class.forName("com.mojang.authlib.minecraft.MinecraftSessionService");
    Class<?> profileType = Class.forName("com.mojang.authlib.GameProfile");
    Object profile;
    Method fetch = find(sessionsType, "fetchProfile", UUID.class, boolean.class);            // 1.20.2 and newer
    if (fetch != null) {
      Object result = fetch.invoke(sessions, id, true);
      if (result == null) { System.out.println("profile: null"); return; }
      profile = result.getClass().getMethod("profile").invoke(result);
    } else {                                                                                   // older: fill a bare profile in
      Object bare = profileType.getConstructor(UUID.class, String.class).newInstance(id, null);
      profile = sessionsType.getMethod("fillProfileProperties", profileType, boolean.class).invoke(sessions, bare, true);
    }
    Method named = find(profileType, "getName");                                              // a record (name()) from 1.21.9 on
    Object name = (named != null ? named : profileType.getMethod("name")).invoke(profile);
    if (name == null) { System.out.println("profile: null"); return; }
    System.out.println("profile: " + name);
    Object skin;
    Method modern = find(sessionsType, "getTextures", profileType);
    if (modern != null) {
      Object textures = modern.invoke(sessions, profile);
      skin = textures.getClass().getMethod("skin").invoke(textures);
    } else {
      Class<?> kind = Class.forName("com.mojang.authlib.minecraft.MinecraftProfileTexture$Type");
      Map<?, ?> map = (Map<?, ?>) sessionsType.getMethod("getTextures", profileType, boolean.class).invoke(sessions, profile, true);
      skin = map.get(Enum.valueOf((Class) kind, "SKIN"));
    }
    if (skin == null) { System.out.println("skin: null"); return; }
    System.out.println("skin: " + skin.getClass().getMethod("getUrl").invoke(skin));
    System.out.println("model: " + skin.getClass().getMethod("getMetadata", String.class).invoke(skin, "model"));
  }
}`

const work = path.join(os.tmpdir(), 'empi-skin-java')
fs.mkdirSync(work, { recursive: true })
fs.writeFileSync(path.join(work, 'SkinCheck.java'), source)
const compiled = spawnSync(bin('javac'), ['-nowarn', '-d', work, path.join(work, 'SkinCheck.java')], { encoding: 'utf8' })
check('the test program compiles (it depends on no authlib)', compiled.status === 0, compiled.stderr?.slice(0, 300))
if (compiled.status !== 0) process.exit(1)

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['1.8.9', '1.12.2', '1.16.5', '1.18.2', '1.19.4', '1.20.1', '1.20.4', '1.21.1', '1.21.11']
const skip = /lwjgl|jtracy|oshi|jna|netty|lz4|icu|jopt|jorbis|joml|fastutil|httpcomponents|brigadier|datafixerupper|opengl|sound|text2speech|paulscode|jinput|javabridge|realms|argo|bcprov|tv\.twitch|java-objc|patchy|blocklist/i
const manifest = await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json()

/** Mojang's own libraries for one game version: the authlib it uses and what that needs to run. */
async function libraries(version) {
    const dir = path.join(work, 'libs', version)
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /authlib/.test(f))) return dir
    fs.mkdirSync(dir, { recursive: true })
    const meta = await (await fetch(manifest.versions.find((v) => v.id === version).url)).json()
    for (const lib of meta.libraries) {
        const artifact = lib.downloads?.artifact
        if (!artifact || (skip.test(lib.name) && !/authlib/.test(lib.name))) continue
        if (lib.rules && !lib.rules.some((r) => r.action === 'allow' && (!r.os || r.os.name === 'windows'))) continue
        fs.writeFileSync(path.join(dir, path.basename(artifact.path)), Buffer.from(await (await fetch(artifact.url)).arrayBuffer()))
    }
    return dir
}

const injector = await ensureInjector(work)
const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } } }).png().toBuffer()
// asynchronous on purpose: the skin server lives in this same process and must be free to answer while Java asks
const run = (dir, uuid, extra = []) => new Promise((resolve) => {
    const child = spawn(bin('java'), [...extra, '-cp', `${work}${path.delimiter}${path.join(dir, '*')}`, 'SkinCheck', uuid])
    let stdout = '', stderr = ''
    child.stdout.on('data', (d) => { stdout += d }); child.stderr.on('data', (d) => { stderr += d })
    const timer = setTimeout(() => child.kill(), 60000)
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }) })
})
const field = (out, name) => new RegExp(`^${name}: (.*)$`, 'm').exec(out)?.[1]
const uuid = '00000000-0000-3000-8000-577106275399'
const agent = (server) => [`-javaagent:${injector}=${server.url}`, '-Dauthlibinjector.noLogFile']

for (const version of wanted) {
    if (!manifest.versions.some((v) => v.id === version)) { check(`[${version}] is a Minecraft version`, false); continue }
    const dir = await libraries(version)
    const authlib = fs.readdirSync(dir).find((f) => /authlib/.test(f))
    const label = `[${version} · ${authlib?.replace('.jar', '')}]`
    for (const model of ['default', 'slim']) {
        const server = await startSkinServer({ name: 'Juanito', uuid, png, model })
        try {
            const out = await run(dir, uuid, agent(server))
            const text = (out.stdout + out.stderr).slice(0, 1500)
            check(`${label} ${model}: the game's authlib finds the profile through the injector`, field(out.stdout, 'profile') === 'Juanito', text)
            check(`${label} ${model}: and gets our picture from our server`, (field(out.stdout, 'skin') || '').startsWith(`${server.url}/textures/`), field(out.stdout, 'skin'))
            check(`${label} ${model}: with the right model`, field(out.stdout, 'model') === (model === 'slim' ? 'slim' : 'null'), field(out.stdout, 'model'))
            const texture = await fetch(field(out.stdout, 'skin') || 'http://127.0.0.1:1/').catch(() => null)
            check(`${label} ${model}: the texture URL serves exactly the picture`, !!texture && texture.ok && Buffer.compare(Buffer.from(await texture.arrayBuffer()), png) === 0)
            if (model === 'default') {
                const other = await run(dir, '11111111-2222-3333-4444-555555555555', agent(server))
                check(`${label} another UUID gets nothing`, field(other.stdout, 'profile') === 'null' || field(other.stdout, 'skin') === 'null', other.stdout)
            }
        } finally { await server.close() }
    }
    const plain = await run(dir, uuid)
    check(`${label} without the injector the same UUID has no skin (so it really came from us)`, field(plain.stdout, 'profile') !== 'Juanito' || field(plain.stdout, 'skin') === 'null', (plain.stdout + plain.stderr).slice(0, 200))
}
