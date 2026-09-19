// node engine/test/skin.mjs
// Skins for the offline player: reading a NameMC id or link, fetching and checking the picture, the local skin server, and how the skin lives
// in the account list. NameMC is a local stand-in here (EMPI_SKIN_BASE, honoured only in test mode); the real game side is skin-java.mjs.
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const sharp = require('sharp')
const skinLib = require(path.join(here, '..', 'src', 'lib', 'skin.js'))
const { startSkinServer, vanillaOfflineUuid } = require(path.join(here, '..', 'src', 'lib', 'skinserver.js'))

// ---- reading what the player pastes ----------------------------------------------------------------------------------------
const ID = '96cab59a8709ce31'
const parse = (text) => skinLib.parseSkinInput(text)
check('a bare id', parse(ID).id === ID)
check('an id in capitals, with spaces around', parse(`  ${ID.toUpperCase()} `).id === ID)
check('the NameMC link', parse(`https://namemc.com/skin/${ID}`).id === ID)
check('the link with www, another language, a query and a fragment', parse(`https://es.namemc.com/skin/${ID}?q=1#x`).id === ID && parse(`http://www.namemc.com/skin/${ID}`).id === ID)
check('the picture link', parse(`https://s.namemc.com/i/${ID}.png`).id === ID)
check('a link without the scheme', parse(`namemc.com/skin/${ID}`).id === ID)
for (const bad of ['', '   ', 'juanito', '96cab59a8709ce3', '96cab59a8709ce311', 'zzzzzzzzzzzzzzzz', 'https://example.com/skin/' + ID, 'https://namemc.com/profile/Notch', `https://evil.com/?u=namemc.com/skin/${ID}`, null]) {
    check(`does not take ${JSON.stringify(bad)}`, !parse(bad).id && typeof parse(bad).reason === 'string')
}

// ---- pictures ----------------------------------------------------------------------------------------------------------------
async function skinPng({ slim = false, width = 64, height = 64, color = [40, 140, 210] } = {}) {
    const raw = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) { raw[i * 4] = color[0]; raw[i * 4 + 1] = color[1]; raw[i * 4 + 2] = color[2]; raw[i * 4 + 3] = 255 }
    if (slim && height === 64) for (let y = 20; y < 32; y++) raw[(y * width + 47) * 4 + 3] = 0
    return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()
}
const classic = await skinPng()
const alex = await skinPng({ slim: true })
const legacy = await skinPng({ height: 32 })
check('a classic skin is detected as such', await skinLib.detectModel(classic, 64) === 'default')
check('a slim (Alex) skin is detected as such', await skinLib.detectModel(alex, 64) === 'slim')
check('an old 64x32 skin is always classic', await skinLib.detectModel(legacy, 32) === 'default')
check('a real skin passes validation', (await skinLib.validateSkin(classic)).height === 64 && (await skinLib.validateSkin(legacy)).height === 32)
for (const [label, buffer] of [['a 100x100 picture', await skinPng({ width: 100, height: 100 })], ['a JPEG', await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123456' } }).jpeg().toBuffer()], ['text', Buffer.from('not an image at all')], ['something huge', Buffer.alloc(70 * 1024, 1)]]) {
    check(`validation refuses ${label}`, await skinLib.validateSkin(buffer).then(() => false, () => true))
}

// ---- fetching from a NameMC stand-in ---------------------------------------------------------------------------------------
const ids = { classic: '1111111111111111', slim: '2222222222222222', legacy: '3333333333333333', wrong: '4444444444444444', huge: '5555555555555555', text: '6666666666666666' }
const served = { [ids.classic]: classic, [ids.slim]: alex, [ids.legacy]: legacy, [ids.wrong]: await skinPng({ width: 100, height: 100 }), [ids.huge]: Buffer.alloc(200 * 1024, 1), [ids.text]: Buffer.from('<html>Just a moment...</html>') }
let hits = 0
const injectorJar = crypto.randomBytes(2048)
const fake = http.createServer((req, res) => {
    const match = /^\/i\/([0-9a-f]{16})\.png$/.exec(req.url)
    if (match) { hits++; return served[match[1]] ? (res.setHeader('content-type', 'image/png'), res.end(served[match[1]])) : (res.statusCode = 404, res.end()) }
    if (req.url === '/injector.jar') return res.end(injectorJar)
    res.statusCode = 404; res.end()
})
await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${fake.address().port}`
process.env.EMPI_ENGINE_TEST = '1'; process.env.EMPI_SKIN_BASE = base

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-skin-'))
const fetched = await skinLib.fetchSkin(dir, ids.classic)
check('fetching downloads, checks and caches the picture', fs.existsSync(fetched.png) && fetched.model === 'default' && fetched.height === 64 && hits === 1)
check('and draws the front view and the head', (await sharp(fetched.front).metadata()).width === 96 && (await sharp(fetched.front).metadata()).height === 192 && (await sharp(fetched.head).metadata()).width === 64)
// the pictures must actually show the character (a size check alone missed a preview that was a tiny sprite in a big empty picture)
const alphaAt = async (file, x, y) => { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return data[(y * info.width + x) * info.channels + 3] }
check('the front view is filled where the body is, and empty in the corners', await alphaAt(fetched.front, 48, 100) === 255 && await alphaAt(fetched.front, 3, 3) === 0 && await alphaAt(fetched.front, 92, 188) === 0)
check('the head picture is filled edge to edge', await alphaAt(fetched.head, 2, 2) === 255 && await alphaAt(fetched.head, 61, 61) === 255)
const again = await skinLib.fetchSkin(dir, ids.classic)
check('the second time it comes from the cache, without network', again.png === fetched.png && hits === 1)
check('a slim skin comes back slim', (await skinLib.fetchSkin(dir, ids.slim)).model === 'slim')
check('an old 64x32 skin is fetched and drawn too', (await skinLib.fetchSkin(dir, ids.legacy)).height === 32)
const failure = (id) => skinLib.fetchSkin(dir, id).then(() => null, (err) => err.message)
check('an id NameMC does not have is said so', /no tiene/.test(await failure('7777777777777777')))
check('a wrong-sized picture is refused, with its size', /100×100/.test(await failure(ids.wrong)))
check('a file that is too big is refused', /pesa demasiado/.test(await failure(ids.huge)))
check('a page that is not a picture (a bot challenge) is refused', /PNG/.test(await failure(ids.text)))
check('a refused download leaves nothing in the cache', !skinLib.cached(dir, ids.wrong) && !skinLib.cached(dir, ids.huge) && !skinLib.cached(dir, ids.text))
process.env.EMPI_SKIN_BASE = 'http://127.0.0.1:1'
check('with no connection it says so', /conexión/.test(await failure('8888888888888888')))
process.env.EMPI_SKIN_BASE = base

// ---- the skin component (authlib-injector) ---------------------------------------------------------------------------------
process.env.EMPI_INJECTOR_URL = `${base}/injector.jar`
process.env.EMPI_INJECTOR_SHA256 = crypto.createHash('sha256').update(injectorJar).digest('hex')
const jar = await skinLib.ensureInjector(dir)
check('the component is downloaded once, into the launcher folder, and checked by hash', fs.existsSync(jar) && jar.startsWith(dir) && fs.readFileSync(jar).equals(injectorJar))
process.env.EMPI_INJECTOR_URL = 'http://127.0.0.1:1/none.jar'
check('and afterwards it is there without internet', await skinLib.ensureInjector(dir) === jar)
fs.writeFileSync(jar, 'tampered')
check('a tampered copy is not trusted (it is fetched again, and refused if that fails)', await skinLib.ensureInjector(dir).then(() => false, () => true))
process.env.EMPI_INJECTOR_URL = `${base}/injector.jar`; process.env.EMPI_INJECTOR_SHA256 = '0'.repeat(64)
fs.rmSync(jar)
check('a download that is not the pinned file is refused', await skinLib.ensureInjector(dir).then(() => false, (err) => /no es el esperado/.test(err.message)))
check('the real pinned hash is the one GitHub lists for authlib-injector 1.2.8', skinLib.INJECTOR.sha256 === '9c7f4343e6c82034958ffb48c14a2cb0c85928be7283103ce17da00c6d5a7b10' && skinLib.INJECTOR.url.includes('/v1.2.8/'))

// ---- the local skin server ----------------------------------------------------------------------------------------------------
const uuid = '00000000-0000-3000-8000-577106275399'
const server = await startSkinServer({ name: 'Juanito', uuid, png: alex, model: 'slim' })
try {
    const get = (p, options) => fetch(server.url + p, options)
    check('it listens on this PC only', server.url.startsWith('http://127.0.0.1:'))
    const meta = await (await get('/')).json()
    check('the metadata whitelists only our host and carries a public key', JSON.stringify(meta.skinDomains) === '["127.0.0.1"]' && meta.signaturePublickey.startsWith('-----BEGIN PUBLIC KEY-----'))
    const undashedId = uuid.replace(/-/g, '')
    const signed = await (await get(`/sessionserver/session/minecraft/profile/${undashedId}?unsigned=false`)).json()
    const property = signed.properties[0]
    check('the profile carries a textures property', signed.id === undashedId && signed.name === 'Juanito' && property.name === 'textures')
    check('signed with SHA1withRSA, verifiable with the published key', crypto.verify('sha1', Buffer.from(property.value), crypto.createPublicKey(meta.signaturePublickey), Buffer.from(property.signature, 'base64')))
    const textures = JSON.parse(Buffer.from(property.value, 'base64').toString('utf8'))
    check('the texture is a slim skin on our host', textures.textures.SKIN.metadata.model === 'slim' && textures.textures.SKIN.url.startsWith(`${server.url}/textures/`) && textures.profileName === 'Juanito')
    const unsigned = await (await get(`/sessionserver/session/minecraft/profile/${undashedId}`)).json()
    check('without asking for a signature there is none', unsigned.properties[0].signature === undefined)
    const dashed = await get(`/sessionserver/session/minecraft/profile/${uuid}`)
    check('the dashed form of the UUID works too', (await dashed.json()).id === undashedId)
    const picture = await get(new URL(textures.textures.SKIN.url).pathname)
    check('the texture URL serves exactly the picture', picture.ok && picture.headers.get('content-type') === 'image/png' && Buffer.from(await picture.arrayBuffer()).equals(alex))
    const vanilla = vanillaOfflineUuid('Juanito')
    check('the UUID a vanilla offline server gives the name gets the skin as well (and it is the known MD5 form)', /^[0-9a-f]{12}3[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(vanilla) && (await get(`/sessionserver/session/minecraft/profile/${vanilla}`)).status === 200)
    check('a vanilla offline UUID is what Minecraft computes (Notch)', vanillaOfflineUuid('Notch') === 'b50ad385829d3141a2167e7d7539ba7f')
    check('anybody else has no profile (204)', (await get('/sessionserver/session/minecraft/profile/11111111222233334444555555555555')).status === 204)
    check('joining a server is accepted, hasJoined is not', (await get('/sessionserver/session/minecraft/join', { method: 'POST', body: '{}' })).status === 204 && (await get('/sessionserver/session/minecraft/hasJoined')).status === 204)
    const byName = await (await get('/api/profiles/minecraft', { method: 'POST', body: JSON.stringify(['juanito', 'Steve']) })).json()
    check('a lookup by name only ever finds this player', byName.length >= 1 && byName.every((p) => p.name === 'Juanito'))
    check('everything else is 404', (await get('/etc/passwd')).status === 404 && (await get('/textures/../../secret')).status === 404)
} finally {
    await server.close()
}
check('the server is gone once the game is', await fetch(server.url + '/', { signal: AbortSignal.timeout(1500) }).then(() => false, () => true))

// ---- in the engine ------------------------------------------------------------------------------------------------------------
const engine = await startEngine({ label: 'skin', env: { EMPI_ENGINE_TEST: '1', EMPI_SKIN_BASE: base, EMPI_INJECTOR_URL: `${base}/injector.jar`, EMPI_INJECTOR_SHA256: crypto.createHash('sha256').update(injectorJar).digest('hex') } })
try {
    const offlineAccount = (r) => r.result?.accounts?.find((a) => a.type === 'offline')
    const parsed = await engine.call('skin.parse', { input: `https://namemc.com/skin/${ids.slim}` })
    check('skin.parse reads a link without the network', parsed.ok && parsed.result.valid && parsed.result.id === ids.slim)
    check('and says why it cannot read something', (await engine.call('skin.parse', { input: 'hola' })).result.valid === false)

    const before = hits
    const preview = await engine.call('skin.fetch', { input: ids.slim })
    check('skin.fetch gives the preview and the detected model, and changes nothing', preview.ok && preview.result.model === 'slim' && fs.existsSync(preview.result.front) && fs.existsSync(preview.result.head) && hits === before + 1)
    check('skin.fetch explains a failure', (await engine.call('skin.fetch', { input: ids.wrong })).error?.code === 'skin_failed')

    const noPlayer = await engine.call('skin.set', { id: ids.slim })
    check('a skin needs an offline player first', noPlayer.ok === false && noPlayer.error.code === 'no_offline')

    await engine.call('offline.set', { name: 'Juanito' })
    const set = await engine.call('skin.set', { id: ids.slim })
    check('skin.set puts the skin on the offline player', offlineAccount(set)?.skin?.id === ids.slim && offlineAccount(set).skin.model === 'slim', JSON.stringify(set.result ?? set.error))
    check('and the account list carries its head and front view for the interface', fs.existsSync(offlineAccount(set).skin.head) && fs.existsSync(offlineAccount(set).skin.front))
    check('the component the game needs is now in the launcher folder', fs.existsSync(path.join(engine.root, 'user', 'tools', 'authlib-injector-1.2.8.jar')))
    check('the skin is kept in the offline file, not in the shared config.json', JSON.parse(fs.readFileSync(path.join(engine.root, 'user', 'native-offline.json'), 'utf8')).skin.id === ids.slim && !fs.readFileSync(path.join(engine.root, 'user', 'config.json'), 'utf8').includes(ids.slim))

    const renamed = await engine.call('offline.set', { name: 'Maria_99' })
    check('renaming the player keeps the skin', offlineAccount(renamed).displayName === 'Maria_99' && offlineAccount(renamed).skin?.id === ids.slim)
    const forced = await engine.call('skin.set', { id: ids.classic, model: 'slim' })
    check('the model can be forced when the picture does not say', offlineAccount(forced).skin.id === ids.classic && offlineAccount(forced).skin.model === 'slim')
    const cleared = await engine.call('skin.clear')
    check('skin.clear goes back to the default skin', offlineAccount(cleared) && offlineAccount(cleared).skin === undefined)
    const bad = await engine.call('skin.set', { id: 'nothexadecimal!!' })
    check('a bad id is refused', bad.ok === false)
} finally {
    await engine.stop()
    fake.close()
    fs.rmSync(dir, { recursive: true, force: true })
}
