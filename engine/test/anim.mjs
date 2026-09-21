// node engine/test/anim.mjs
// Animated banners and backgrounds (lib/anim.js): GIF, animated WebP and APNG become a short list of small frames with their times and loops.
// Everything here is generated on the spot (no network, no real modpack).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { check } from './harness.mjs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const anim = require('../src/lib/anim.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empi-anim-'))
const spec = { maxWidth: 32, format: 'png', maxFrames: 120, minDelay: 40 }
const solid = (w, h, [r, g, b, a = 255]) => Buffer.from(Array.from({ length: w * h }, () => [r, g, b, a]).flat())
const stack = (frames, w, h) => Buffer.concat(frames.map((c) => solid(w, h, c)))
const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255]

try {
    // ---- which frames are kept ----
    const plain = anim.planFrames([40, 40, 50, 40], { maxFrames: 120, minDelay: 40 })
    check('frames that are far enough apart are all kept, with their own times', plain.keep.join() === '0,1,2,3' && plain.delays.join() === '40,40,50,40', JSON.stringify(plain))
    const thin = anim.planFrames(Array(10).fill(50), { maxFrames: 4, minDelay: 40 })
    check('too many frames: at most maxFrames are kept and the animation lasts exactly as long', thin.keep.length <= 4 && thin.delays.reduce((a, b) => a + b, 0) === 500, JSON.stringify(thin))
    const fast = anim.planFrames([10, 10, 10, 10, 10, 10, 10, 10], { maxFrames: 120, minDelay: 40 })
    check('a delay of 10 ms or less is shown for 100 ms, like browsers do', fast.delays.reduce((a, b) => a + b, 0) === 800 && fast.keep.length === 8, JSON.stringify(fast))
    const pause = anim.planFrames([40, 40, 9291, 40], { maxFrames: 120, minDelay: 40 })
    check('a long pause is kept as it is', pause.delays.includes(9291) && pause.keep.length === 4, JSON.stringify(pause))
    const dense = anim.planFrames(Array(235).fill(20), { maxFrames: 90, minDelay: 100 })
    check('a dense background is thinned to what a screen needs (no two frames under 100 ms)', dense.keep.length <= 90 && dense.delays.every((d) => d >= 100) && dense.delays.reduce((a, b) => a + b, 0) === 235 * 20, `${dense.keep.length} frames`)

    // ---- an animated GIF: order, times, loops, the same picture twice becomes one that stays longer ----
    const gifFile = path.join(dir, 'a.gif')
    fs.writeFileSync(gifFile, await sharp(stack([RED, RED, GREEN, BLUE], 64, 64), { raw: { width: 64, height: 256, channels: 4, pageHeight: 64 } }).gif({ loop: 2, delay: [100, 100, 200, 100] }).toBuffer())
    const gif = await anim.build(gifFile, path.join(dir, 'gif'), spec)
    check('a GIF gives its frames, without the repeated one', gif.animated && gif.frames.length === 3, JSON.stringify(gif))
    check('the repeated picture stays longer instead (100 + 100 ms)', gif.delays.join() === '200,200,100', gif.delays.join())
    check('the loop count is kept (2 times), and the size is the one asked for', gif.loops === 2 && gif.width === 32 && gif.height === 32)
    const px = async (file) => (await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data
    const first = await px(path.join(dir, 'gif', gif.frames[0])), last = await px(path.join(dir, 'gif', gif.frames[2]))
    check('and they are in order (red, green, blue)', first[0] > 200 && first[1] < 60 && last[2] > 200 && last[0] < 60)
    check('anim.json is written next to the frames', JSON.parse(fs.readFileSync(path.join(dir, 'gif', 'anim.json'), 'utf8')).frames.length === 3)

    // ---- an animated WebP, with transparency kept ----
    const clear = [0, 0, 0, 0]
    const webpFile = path.join(dir, 'a.webp')
    fs.writeFileSync(webpFile, await sharp(stack([[255, 0, 0, 255], clear, [0, 0, 255, 255]], 64, 64), { raw: { width: 64, height: 192, channels: 4, pageHeight: 64 } }).webp({ loop: 0, delay: [100, 100, 100], lossless: true }).toBuffer())
    const webp = await anim.build(webpFile, path.join(dir, 'webp'), spec)
    check('an animated WebP gives its frames, and loops for ever (0)', webp.animated && webp.frames.length === 3 && webp.loops === 0, JSON.stringify(webp))
    const alpha = await sharp(path.join(dir, 'webp', webp.frames[1])).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    check('a transparent frame stays transparent in the PNG', alpha.info.channels === 4 && alpha.data[3] < 20, `alpha ${alpha.data[3]}`)

    // ---- an APNG (built by hand: sharp does not write them): a full frame, then a small one drawn over it ----
    const idatOf = async (color, w, h) => {
        const png = await sharp(solid(w, h, color), { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer()
        const parts = []
        for (let pos = 8; pos < png.length;) { const len = png.readUInt32BE(pos); if (png.toString('latin1', pos + 4, pos + 8) === 'IDAT') parts.push(png.subarray(pos + 8, pos + 8 + len)); pos += 12 + len }
        return Buffer.concat(parts)
    }
    const u32 = (...n) => { const b = Buffer.alloc(4 * n.length); n.forEach((v, i) => b.writeUInt32BE(v, i * 4)); return b }
    const fctl = (seq, w, h, x, y, num, den, dispose, blend) => { const b = Buffer.alloc(26); b.writeUInt32BE(seq, 0); b.writeUInt32BE(w, 4); b.writeUInt32BE(h, 8); b.writeUInt32BE(x, 12); b.writeUInt32BE(y, 16); b.writeUInt16BE(num, 20); b.writeUInt16BE(den, 22); b[24] = dispose; b[25] = blend; return anim.chunk('fcTL', b) }
    const ihdr = Buffer.concat([u32(8, 8), Buffer.from([8, 6, 0, 0, 0])])
    const apngFile = path.join(dir, 'a.png')
    fs.writeFileSync(apngFile, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), anim.chunk('IHDR', ihdr), anim.chunk('acTL', u32(2, 3)),
        fctl(0, 8, 8, 0, 0, 10, 100, 0, 0), anim.chunk('IDAT', await idatOf(RED, 8, 8)),
        fctl(1, 4, 4, 2, 2, 30, 100, 0, 1), anim.chunk('fdAT', Buffer.concat([u32(2), await idatOf(BLUE, 4, 4)])),
        anim.chunk('IEND', Buffer.alloc(0))
    ]))
    const apng = await anim.build(apngFile, path.join(dir, 'apng'), { ...spec, maxWidth: 8 })
    check('an APNG gives its frames, its times (100 and 300 ms) and its loops (3)', apng.animated && apng.frames.length === 2 && apng.delays.join() === '100,300' && apng.loops === 3, JSON.stringify(apng))
    const one = await px(path.join(dir, 'apng', apng.frames[0])), two = await px(path.join(dir, 'apng', apng.frames[1]))
    const at = (data, x, y) => [data[(y * 8 + x) * 4], data[(y * 8 + x) * 4 + 1], data[(y * 8 + x) * 4 + 2]]
    check('the small second frame is drawn OVER the first (blue in the middle, red around it)', at(two, 4, 4)[2] > 200 && at(two, 4, 4)[0] < 60 && at(two, 0, 0)[0] > 200 && at(one, 4, 4)[0] > 200)

    // ---- what is not animated ----
    const still = path.join(dir, 'still.png')
    fs.writeFileSync(still, await sharp(solid(16, 16, RED), { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer())
    check('a plain PNG is not an animation', (await anim.build(still, path.join(dir, 'still'), spec)).animated === false)
    const oneFrame = path.join(dir, 'one.gif')
    fs.writeFileSync(oneFrame, await sharp(solid(16, 16, RED), { raw: { width: 16, height: 16, channels: 4 } }).gif().toBuffer())
    check('neither is a GIF with one frame', (await anim.build(oneFrame, path.join(dir, 'one'), spec)).animated === false)
    const same = path.join(dir, 'same.gif')
    fs.writeFileSync(same, await sharp(stack([RED, RED, RED], 16, 16), { raw: { width: 16, height: 48, channels: 4, pageHeight: 16 } }).gif({ delay: [100, 100, 100] }).toBuffer())
    check('nor one whose frames are all the same picture', (await anim.build(same, path.join(dir, 'same'), spec)).animated === false)

    // ---- a background: flat JPEG frames ----
    const bg = await anim.build(gifFile, path.join(dir, 'bg'), { maxWidth: 32, format: 'jpeg', quality: 68, maxFrames: 90, minDelay: 100 })
    const meta = await sharp(path.join(dir, 'bg', bg.frames[0])).metadata()
    check('a background gives JPEG frames without transparency', bg.animated && bg.frames[0].endsWith('.jpg') && meta.format === 'jpeg' && !meta.hasAlpha, JSON.stringify(bg))
} catch (err) {
    console.log('FAIL  ' + err.stack)
    process.exitCode = 1
} finally {
    fs.rmSync(dir, { recursive: true, force: true })
}
