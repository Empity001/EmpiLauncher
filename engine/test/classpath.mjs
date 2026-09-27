// node engine/test/classpath.mjs
// Which libraries stay OFF the game's classpath. NeoForge finds its own core jars (the patched Minecraft client and its own
// universal jar) itself, through a dedicated FML locator built from -DlibraryDirectory and the --fml.* arguments. Putting
// either of them on our own -cp too makes ModLauncher mark that file path "already located" before that locator runs, so it
// skips the jar instead of reading it - for the universal jar that means NeoForge's own "neoforge" mod never registers, and
// every mod that depends on it reports it as missing. Confirmed from a real player's debug.log (an older, 21.1.x NeoForge pack,
// so this is not only the newer FML 10 scheme): "Locator PathBasedLocator[name=neoforge] ... found 0 mods ... skipped 1
// candidates" right after "Skipping ...universal.jar because it was already located earlier".
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { check } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
require(path.join(here, '..', 'src', 'shim', 'install'))   // processbuilder wants electron's modules
const ProcessBuilder = require(path.join(here, '..', '..', 'app', 'assets', 'js', 'processbuilder'))
const mod = (id, extra = {}) => ({ rawModule: { id, ...extra } })

const patched = mod('net.neoforged:minecraft-client-patched:21.11.45')
const universal = mod('net.neoforged:neoforge:21.11.45:universal')
const loader = mod('net.neoforged.fancymodloader:loader:10.0.36')
const oldClient = mod('net.neoforged:neoforge:21.1.172:client')
const oldUniversal = mod('net.neoforged:neoforge:21.1.172:universal')

check('FML 10: the patched Minecraft jar stays off the classpath', ProcessBuilder.isOffClasspath(patched))
check('FML 10: NeoForge itself stays off the classpath', ProcessBuilder.isOffClasspath(universal))
check('FML 10: ordinary libraries stay on', !ProcessBuilder.isOffClasspath(loader))
check('older NeoForge (21.1.x) also finds itself: the universal jar stays off the classpath too', ProcessBuilder.isOffClasspath(oldUniversal))
check('older NeoForge: its patched client jar stays off', ProcessBuilder.isOffClasspath(oldClient))
check('an index published with classpath:false is honoured for any module', ProcessBuilder.isOffClasspath(mod('some:library:1.0', { classpath: false })))
check('a module with classpath:true or unset stays on', !ProcessBuilder.isOffClasspath(mod('some:library:1.0', { classpath: true })) && !ProcessBuilder.isOffClasspath(mod('some:library:1.0')))
check('Fabric and vanilla libraries are untouched', !ProcessBuilder.isOffClasspath(mod('net.fabricmc:fabric-loader:0.19.3')) && !ProcessBuilder.isOffClasspath(mod('org.lwjgl:lwjgl:3.3.3')))
