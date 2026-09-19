// node engine/test/classpath.mjs
// Which libraries stay OFF the game's classpath. This is the NeoForge 21.11 fix: with NeoForge or the patched Minecraft jar on
// the classpath FML believes it is in a development environment and Minecraft never starts.
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

check('FML 10: the patched Minecraft jar stays off the classpath', ProcessBuilder.isOffClasspath(patched, true))
check('FML 10: NeoForge itself stays off the classpath', ProcessBuilder.isOffClasspath(universal, true))
check('FML 10: ordinary libraries stay on', !ProcessBuilder.isOffClasspath(loader, true))
check('older NeoForge: the universal jar stays on the classpath (its own launch scheme)', !ProcessBuilder.isOffClasspath(oldUniversal, false))
check('older NeoForge: its patched client jar stays off', ProcessBuilder.isOffClasspath(oldClient, false))
check('an index published with classpath:false is honoured for any module', ProcessBuilder.isOffClasspath(mod('some:library:1.0', { classpath: false })))
check('a module with classpath:true or unset stays on', !ProcessBuilder.isOffClasspath(mod('some:library:1.0', { classpath: true })) && !ProcessBuilder.isOffClasspath(mod('some:library:1.0')))
check('Fabric and vanilla libraries are untouched', !ProcessBuilder.isOffClasspath(mod('net.fabricmc:fabric-loader:0.19.3'), true) && !ProcessBuilder.isOffClasspath(mod('org.lwjgl:lwjgl:3.3.3'), true))
