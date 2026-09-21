/**
 * Animated art (banner and background): GIF, animated WebP and APNG, turned into a short list of small still frames that the native
 * interface can play one after the other without holding them all in memory.
 *
 * The launcher's window cannot decode any of these itself (WPF plays no animation at all; it reads a WebP or an APNG as its first
 * frame only), and the originals are big (the Culones banner is a 7.6 MB GIF of 96 frames at 1920x1080). So, once per picture:
 *
 *   1. the whole animation is shrunk to the size it is shown at (libvips streams it, memory stays flat),
 *   2. the frames that are kept (see planFrames) are written as small PNG (banner: transparency kept) or JPEG (background) files,
 *   3. a list with each frame's time and how many times to loop goes next to them (anim.json).
 *
 * The result is cached for good (the engine's art handler names the folder after the source's identity). This runs in a child process
 * (anim-worker.js) so that everything libvips held goes back to the system when it ends, and the engine keeps its small footprint.
 *
 * A loop count of 0 means "for ever", as in the formats themselves. A frame with a delay of 10 ms or less is shown for 100 ms, as browsers do.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MAX_SOURCE_FRAMES = 700
const BATCH = 8   // frames pulled out of the shrunk animation at a time (raw RGBA: a few MB)

const normalizeDelay = (ms) => (!Number.isFinite(ms) || ms <= 10 ? 100 : Math.round(ms))

/**
 * Which frames to keep, and how long each one stays. At most `maxFrames`, no two closer than `minDelay` (a screen does not need more, and the
 * launcher decodes one file per frame): frames that come too soon after a kept one are dropped and their time goes to the kept one, so the
 * animation lasts exactly as long as before. A long pause (a frame of several seconds) is kept as it is.
 * @returns {{ keep: number[], delays: number[] }} keep: indexes of the source frames; delays: milliseconds each stays
 */
function planFrames(delays, { maxFrames = 120, minDelay = 40 } = {}) {
    const d = delays.map(normalizeDelay)
    const starts = []
    let total = 0
    for (const x of d) { starts.push(total); total += x }
    for (let step = minDelay; ; step += 10) {
        const keep = []
        let last = -Infinity
        for (let i = 0; i < d.length; i++) if (keep.length === 0 || starts[i] - last >= step - 1) { keep.push(i); last = starts[i] }
        if (keep.length <= maxFrames || step > 120000) {
            return { keep, delays: keep.map((index, n) => (n + 1 < keep.length ? starts[keep[n + 1]] : total) - starts[index]) }
        }
    }
}

// ---- APNG ------------------------------------------------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(...buffers) {
    let c = 0xffffffff
    for (const b of buffers) for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8), data), 8 + data.length)
    return out
}

/** Reads the structure of a PNG; returns null unless it is an animated one (an acTL chunk before the image data). */
function parseApng(buffer) {
    if (buffer.length < 40 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
    let pos = 8
    let ihdr = null, actl = null
    const extra = []   // PLTE / tRNS: needed to decode any frame
    const frames = []
    let current = null, sawIdat = false
    while (pos + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(pos)
        const type = buffer.toString('latin1', pos + 4, pos + 8)
        const data = buffer.subarray(pos + 8, pos + 8 + length)
        pos += 12 + length
        if (type === 'IHDR') ihdr = data
        else if (type === 'acTL') actl = { frames: data.readUInt32BE(0), plays: data.readUInt32BE(4) }
        else if (type === 'PLTE' || type === 'tRNS') extra.push(chunk(type, data))
        else if (type === 'fcTL') {
            // fcTL: sequence(4) width(4) height(4) x(4) y(4) delay numerator(2) denominator(2) dispose(1) blend(1)
            const den = data.readUInt16BE(22) || 100
            current = { width: data.readUInt32BE(4), height: data.readUInt32BE(8), x: data.readUInt32BE(12), y: data.readUInt32BE(16), delay: Math.round(data.readUInt16BE(20) * 1000 / den), dispose: data[24], blend: data[25], parts: [] }
            frames.push(current)
        } else if (type === 'IDAT') { sawIdat = true; if (current && frames.length === 1) current.parts.push(data) }   // the default image is frame 1 only when an fcTL came first
        else if (type === 'fdAT') { if (current) current.parts.push(data.subarray(4)) }
        else if (type === 'IEND') break
    }
    void sawIdat
    if (!ihdr || !actl || frames.length < 2 || frames.some((f) => f.parts.length === 0)) return null
    return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), ihdr, extra, frames, plays: actl.plays }
}

/** A frame's own image data as a stand-alone PNG (its size, the palette and transparency of the file). */
function frameAsPng(apng, frame) {
    const ihdr = Buffer.from(apng.ihdr)
    ihdr.writeUInt32BE(frame.width, 0); ihdr.writeUInt32BE(frame.height, 4)
    return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), ...apng.extra, ...frame.parts.map((p) => chunk('IDAT', p)), chunk('IEND', Buffer.alloc(0))])
}

/** Calls `each(canvasRGBA, index)` with the whole picture after each frame is drawn (dispose and blend as the format says). */
async function composeApng(sharp, apng, each) {
    const W = apng.width, H = apng.height
    const canvas = Buffer.alloc(W * H * 4)
    let previous = null
    for (let i = 0; i < apng.frames.length; i++) {
        const f = apng.frames[i]
        if (previous) {
            if (previous.frame.dispose === 1) for (let y = 0; y < previous.frame.height; y++) canvas.fill(0, ((previous.frame.y + y) * W + previous.frame.x) * 4, ((previous.frame.y + y) * W + previous.frame.x + previous.frame.width) * 4)
            else if (previous.frame.dispose === 2 && previous.snapshot) for (let y = 0; y < previous.frame.height; y++) previous.snapshot.copy(canvas, ((previous.frame.y + y) * W + previous.frame.x) * 4, y * previous.frame.width * 4, (y + 1) * previous.frame.width * 4)
        }
        let snapshot = null
        if (f.dispose === 2 && i > 0) {
            snapshot = Buffer.alloc(f.width * f.height * 4)
            for (let y = 0; y < f.height; y++) canvas.copy(snapshot, y * f.width * 4, ((f.y + y) * W + f.x) * 4, ((f.y + y) * W + f.x + f.width) * 4)
        }
        const { data } = await sharp(frameAsPng(apng, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        for (let y = 0; y < f.height; y++) {
            for (let x = 0; x < f.width; x++) {
                const s = (y * f.width + x) * 4, d = ((f.y + y) * W + f.x + x) * 4
                const sa = data[s + 3]
                if (f.blend === 0 || sa === 255 || canvas[d + 3] === 0) { canvas[d] = data[s]; canvas[d + 1] = data[s + 1]; canvas[d + 2] = data[s + 2]; canvas[d + 3] = sa }
                else if (sa !== 0) {
                    const da = canvas[d + 3]
                    const outA = sa + Math.round(da * (255 - sa) / 255)
                    for (let c = 0; c < 3; c++) canvas[d + c] = Math.round((data[s + c] * sa + canvas[d + c] * da * (255 - sa) / 255) / outA)
                    canvas[d + 3] = outA
                }
            }
        }
        await each(canvas, i)
        previous = { frame: f.dispose === 2 && i === 0 ? { ...f, dispose: 1 } : f, snapshot }
    }
}

// ---- the whole job ---------------------------------------------------------------------------------------------------------------------

/** Encodes one frame (raw RGBA) for the kind of art: PNG with transparency (palette, small) or a flat JPEG. */
function encode(sharp, raw, width, height, spec) {
    const image = sharp(raw, { raw: { width, height, channels: 4 } })
    return spec.format === 'png'
        ? image.png({ palette: true, quality: spec.quality || 90, effort: 3 })
        : image.flatten({ background: '#060607' }).jpeg({ quality: spec.quality || 68 })
}

/**
 * @param {string} file     the picture (GIF, WebP or APNG)
 * @param {string} outDir   where the frames and anim.json go (created)
 * @param {{ maxWidth: number, format: 'png'|'jpeg', quality?: number, maxFrames: number, minDelay: number }} spec
 * @returns {Promise<{ animated: false, reason: string } | { animated: true, frames: string[], delays: number[], loops: number, width: number, height: number }>}
 */
async function build(file, outDir, spec) {
    const sharp = require('sharp')
    sharp.cache(false)
    sharp.concurrency(1)
    const ext = spec.format === 'png' ? 'png' : 'jpg'
    const names = [], delays = []
    let width = 0, height = 0, loops = 0
    let lastHash = null

    const keepFrame = async (raw, W, H, plannedDelay, index) => {
        const hash = crypto.createHash('md5').update(raw).digest('hex')
        if (hash === lastHash && names.length) { delays[delays.length - 1] += plannedDelay; return }   // the same picture again: it just stays longer
        lastHash = hash
        const name = `f${String(index).padStart(3, '0')}.${ext}`
        fs.mkdirSync(outDir, { recursive: true })
        await encode(sharp, raw, W, H, spec).toFile(path.join(outDir, name))
        names.push(name); delays.push(plannedDelay)
    }

    const head = Buffer.alloc(65536)
    const fd = fs.openSync(file, 'r')
    let headLength
    try { headLength = fs.readSync(fd, head, 0, head.length, 0) } finally { fs.closeSync(fd) }
    const isPng = head.subarray(0, 8).equals(PNG_SIGNATURE)

    if (isPng) {
        const apng = parseApng(fs.readFileSync(file))
        if (!apng) return { animated: false, reason: 'still' }
        if (apng.frames.length > MAX_SOURCE_FRAMES) return { animated: false, reason: 'too_many_frames' }
        const plan = planFrames(apng.frames.map((f) => f.delay), spec)
        const wanted = new Map(plan.keep.map((index, n) => [index, plan.delays[n]]))
        const outWidth = Math.min(spec.maxWidth, apng.width), outHeight = Math.max(1, Math.round(apng.height * outWidth / apng.width))
        width = outWidth; height = outHeight; loops = apng.plays
        await composeApng(sharp, apng, async (canvas, index) => {
            if (!wanted.has(index)) return
            const small = await sharp(canvas, { raw: { width: apng.width, height: apng.height, channels: 4 } }).resize({ width: outWidth, height: outHeight }).raw().toBuffer()
            await keepFrame(small, outWidth, outHeight, wanted.get(index), index)
        })
    } else {
        void headLength
        const meta = await sharp(file, { animated: true, limitInputPixels: false }).metadata()
        if (!meta.pages || meta.pages < 2) return { animated: false, reason: 'still' }
        if (meta.pages > MAX_SOURCE_FRAMES) return { animated: false, reason: 'too_many_frames' }
        const plan = planFrames(Array.from({ length: meta.pages }, (_, i) => (meta.delay && meta.delay[i]) || 100), spec)
        const wanted = new Map(plan.keep.map((index, n) => [index, plan.delays[n]]))
        loops = meta.loop || 0
        // 1) the whole animation at the size it is shown at (still animated, still with transparency)
        const small = await sharp(file, { animated: true, limitInputPixels: false }).resize({ width: spec.maxWidth, withoutEnlargement: true }).webp({ quality: spec.format === 'png' ? 92 : 82, alphaQuality: 100, effort: 0 }).toBuffer()
        const shrunk = await sharp(small, { animated: true }).metadata()
        width = shrunk.width; height = shrunk.pageHeight
        // 2) the frames that are kept, a few at a time
        for (let start = 0; start < meta.pages; start += BATCH) {
            const count = Math.min(BATCH, meta.pages - start)
            if (![...Array(count).keys()].some((k) => wanted.has(start + k))) continue
            const tall = await sharp(small, { page: start, pages: count }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
            const frameBytes = width * height * 4
            for (let k = 0; k < count; k++) {
                if (wanted.has(start + k)) await keepFrame(tall.data.subarray(k * frameBytes, (k + 1) * frameBytes), width, height, wanted.get(start + k), start + k)
            }
        }
    }

    if (names.length < 2) {
        fs.rmSync(outDir, { recursive: true, force: true })
        return { animated: false, reason: 'still' }   // every frame was the same picture
    }
    const result = { animated: true, frames: names, delays, loops, width, height }
    fs.writeFileSync(path.join(outDir, 'anim.json'), JSON.stringify(result))
    return result
}

module.exports = { build, planFrames, parseApng, composeApng, frameAsPng, chunk, normalizeDelay, MAX_SOURCE_FRAMES }
