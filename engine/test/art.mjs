// node engine/test/art.mjs
// Modpack art: first-frame previews of banner and background, the giant-animated-WebP shortcut, and the native-only preferences.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { startEngine, check } from './harness.mjs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const { firstWebpFrame } = require('../src/handlers/art.js')

const engine = await startEngine({ label: 'art' })
try {
    // ---- the first frame of an animated WebP is cut out without loading the whole file ----
    const frames = Buffer.concat([[255, 0, 0], [0, 255, 0], [0, 0, 255]].map(([r, g, b]) => Buffer.from(Array.from({ length: 64 * 64 }, () => [r, g, b]).flat())))
    const animated = await sharp(frames, { raw: { width: 64, height: 192, channels: 3, pageHeight: 64 } }).webp({ loop: 0, delay: [100, 100, 100] }).toBuffer()
    const file = path.join(engine.root, 'animated.webp')
    fs.writeFileSync(file, animated)
    const meta = await sharp(animated, { animated: true }).metadata()
    check('the test file really is an animated WebP', (meta.pages || 1) === 3, `${meta.pages} frames`)
    const still = firstWebpFrame(file)
    check('firstWebpFrame returns a still image', still != null && still.length < animated.length)
    const px = await sharp(still).raw().toBuffer({ resolveWithObject: true })
    check('and it is the FIRST frame (red)', px.info.width === 64 && px.info.height === 64 && px.data[0] > 200 && px.data[1] < 60 && px.data[2] < 60, `${px.info.width}x${px.info.height} rgb ${px.data[0]},${px.data[1]},${px.data[2]}`)

    // ---- art.get against the real index ----
    const distro = await engine.call('distro.load')
    const byName = (n) => distro.result.servers.find((s) => s.name === n)
    const main = byName('PanolisSMP'), lite = byName('PanolisSMP Lite')

    let t = Date.now()
    const mainArt = await engine.call('art.get', { id: main.id })
    const mainMs = Date.now() - t
    check('main modpack: banner preview is made', mainArt.ok && mainArt.result.banner && fs.existsSync(mainArt.result.banner), JSON.stringify(mainArt.result))
    check('main modpack: the 278 MB remote background is NOT downloaded', mainArt.ok && mainArt.result.background === null, `${mainMs} ms`)
    const bannerMeta = mainArt.ok ? await sharp(mainArt.result.banner).metadata() : {}
    check('banner is a PNG no wider than 900 px, transparency kept', bannerMeta.format === 'png' && bannerMeta.width <= 900 && bannerMeta.hasAlpha === true, `${bannerMeta.width}x${bannerMeta.height} alpha ${bannerMeta.hasAlpha}`)

    const liteArt = await engine.call('art.get', { id: lite.id })
    check('lite modpack: small remote background becomes a JPEG preview', liteArt.ok && liteArt.result.background && liteArt.result.background.endsWith('.jpg') && fs.existsSync(liteArt.result.background), JSON.stringify(liteArt.result))
    if (liteArt.ok && liteArt.result.background) {
        const m = await sharp(liteArt.result.background).metadata()
        check('the preview is small (at most 1280 px wide, a few hundred KB)', m.width <= 1280 && fs.statSync(liteArt.result.background).size < 1024 * 1024, `${m.width}x${m.height}, ${(fs.statSync(liteArt.result.background).size / 1024).toFixed(0)} KB`)
    }
    t = Date.now()
    const again = await engine.call('art.get', { id: lite.id })
    check('a second request is served from the cache', again.ok && again.result.background === liteArt.result.background && Date.now() - t < 500, `${Date.now() - t} ms`)

    // ---- an installed animated background: the file on disk is the source ----
    const instance = path.join(engine.root, 'data', 'instances', main.id)
    fs.mkdirSync(instance, { recursive: true })
    fs.copyFileSync(file, path.join(instance, 'background.webp'))
    const local = await engine.call('art.get', { id: main.id })
    check('installed animated WebP background gives a still JPEG preview', local.ok && local.result.background && fs.existsSync(local.result.background), JSON.stringify(local.result))

    // ---- native-only preferences ----
    const prefs = await engine.call('ui.get')
    check('ui.get defaults the field to auto', prefs.ok && prefs.result.fieldMode === 'auto', JSON.stringify(prefs.result))
    const set = await engine.call('ui.set', { key: 'fieldMode', value: 'always' })
    check('ui.set persists a valid value', set.ok && (await engine.call('ui.get')).result.fieldMode === 'always')
    const bad = await engine.call('ui.set', { key: 'fieldMode', value: 'sometimes' })
    check('ui.set refuses an invalid value', bad.ok === false && bad.error.code === 'bad_key')
    check('ui.get defaults the background to full intensity', prefs.result.dotOpacity === 1, JSON.stringify(prefs.result))
    const dim = await engine.call('ui.set', { key: 'dotOpacity', value: 0.334 })
    check('ui.set keeps the background intensity to two decimals', dim.ok && (await engine.call('ui.get')).result.dotOpacity === 0.33, JSON.stringify(dim.result))
    for (const value of [0.05, 1.5, '0.5', null, Number.NaN]) {
        const refused = await engine.call('ui.set', { key: 'dotOpacity', value })
        check(`ui.set refuses a background intensity of ${JSON.stringify(value)}`, refused.ok === false && refused.error.code === 'bad_key')
    }
    check('the other preferences are untouched by it', (await engine.call('ui.get')).result.fieldMode === 'always')
} catch (err) {
    console.log('FAIL  ' + err.message)
    process.exitCode = 1
} finally {
    if (process.exitCode) console.log('\n--- engine output (tail) ---\n' + engine.output().slice(-3000))
    await engine.stop()
}
