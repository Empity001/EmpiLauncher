// Generates the Publisher's halftone / dither / glitch artwork as small PNGs (paper-white marks on transparency).
// Zero dependencies: a tiny software rasteriser plus a PNG encoder on top of node:zlib. Deterministic (seeded).
//   node tools/publisher/scripts/make-art.js
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT = path.join(__dirname, '..', 'public', 'art')
const PAPER = [242, 240, 232]
const INK = [5, 5, 6]
const RED = [255, 42, 74]
const CYAN = [51, 230, 255]

// ---------------------------------------------------------------- helpers
function rng(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

class Canvas {
    constructor(width, height) {
        this.width = width
        this.height = height
        this.data = new Uint8ClampedArray(width * height * 4)
    }

    /** Source-over blend of one pixel; `alpha` is 0..1. */
    blend(x, y, color, alpha) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return
        const i = (y * this.width + x) * 4
        const dstA = this.data[i + 3] / 255
        const outA = alpha + dstA * (1 - alpha)
        for (let c = 0; c < 3; c++) this.data[i + c] = (color[c] * alpha + this.data[i + c] * dstA * (1 - alpha)) / outA
        this.data[i + 3] = outA * 255
    }

    /** Anti-aliased filled circle. */
    dot(cx, cy, radius, color = PAPER, alpha = 1) {
        const r = Math.ceil(radius + 1)
        for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) {
            for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
                const coverage = clamp(radius - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5)
                if (coverage > 0) this.blend(x, y, color, coverage * alpha)
            }
        }
    }

    rect(x, y, w, h, color = PAPER, alpha = 1) {
        for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.height, Math.round(y + h)); yy++) {
            for (let xx = Math.max(0, Math.round(x)); xx < Math.min(this.width, Math.round(x + w)); xx++) this.blend(xx, yy, color, alpha)
        }
    }

    /** Crops to the marks' bounding box (plus a margin) so the art carries no dead space. */
    trim(margin = 6) {
        let x0 = this.width, y0 = this.height, x1 = 0, y1 = 0
        for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.data[(y * this.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
        x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin); x1 = Math.min(this.width - 1, x1 + margin); y1 = Math.min(this.height - 1, y1 + margin)
        const out = new Canvas(x1 - x0 + 1, y1 - y0 + 1)
        for (let y = 0; y < out.height; y++) out.data.set(this.data.subarray(((y + y0) * this.width + x0) * 4, ((y + y0) * this.width + x1 + 1) * 4), y * out.width * 4)
        return out
    }

    png() {
        const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
        const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
        const chunk = (type, body) => {
            const head = Buffer.alloc(8)
            head.writeUInt32BE(body.length, 0)
            head.write(type, 4, 'ascii')
            const tail = Buffer.alloc(4)
            tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0)
            return Buffer.concat([head, body, tail])
        }
        const header = Buffer.alloc(13)
        header.writeUInt32BE(this.width, 0)
        header.writeUInt32BE(this.height, 4)
        header.set([8, 6, 0, 0, 0], 8)
        const rows = Buffer.alloc((this.width * 4 + 1) * this.height)
        for (let y = 0; y < this.height; y++) {
            rows[y * (this.width * 4 + 1)] = 0
            Buffer.from(this.data.buffer, y * this.width * 4, this.width * 4).copy(rows, y * (this.width * 4 + 1) + 1)
        }
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
    }
}

// value noise + fbm, for cloud turbulence
function noise2(seed) {
    const random = rng(seed)
    const lattice = Array.from({ length: 256 }, () => random())
    const at = (x, y) => lattice[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 256]
    const smooth = (t) => t * t * (3 - 2 * t)
    const value = (x, y) => {
        const x0 = Math.floor(x), y0 = Math.floor(y)
        const tx = smooth(x - x0), ty = smooth(y - y0)
        const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx
        const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx
        return top * (1 - ty) + bottom * ty
    }
    return (x, y) => value(x, y) * 0.55 + value(x * 2.1, y * 2.1) * 0.3 + value(x * 4.3, y * 4.3) * 0.15
}

// ---------------------------------------------------------------- artwork
/** A cumulus cloud printed as a 45-degree halftone screen: lumps lit from the top left, dots swell in light and shrink in shadow. */
function cloud() {
    const W = 760, H = 460, pitch = 8
    const canvas = new Canvas(W, H)
    const fbm = noise2(7)
    const random = rng(5)
    // lumps along a flat base, big in the middle, small toward the rim
    const lumps = []
    for (let i = 0; i < 46; i++) {
        const t = random()
        const x = 0.13 + 0.74 * t
        const body = Math.sin(Math.PI * t) ** 0.8
        const r = 0.035 + 0.11 * body * (0.35 + random() * 0.65)
        const y = 0.72 - r * (0.9 + random() * 1.1) - 0.34 * body * random() ** 1.6
        lumps.push([x, y, r])
    }
    const height = (x, y) => {
        let h = 0
        for (const [lx, ly, lr] of lumps) {
            const d2 = ((x - lx) ** 2 + (y - ly) ** 2) / (lr * lr)
            if (d2 < 1) h = Math.max(h, lr * Math.sqrt(1 - d2))
        }
        return h > 0 && y < 0.735 ? h + (fbm(x * 30, y * 30) - 0.5) * 0.012 : 0
    }
    const cos = Math.SQRT1_2
    const light = [-0.5, -0.72, 0.48]
    for (let u = -W; u < W * 2; u += pitch) {
        for (let v = -H; v < H * 2; v += pitch) {
            const x = u * cos - v * cos + W / 2, y = u * cos + v * cos - W / 2 + H / 2
            if (x < 0 || y < 0 || x >= W || y >= H) continue
            const nx = x / W, ny = y / H, e = 0.004
            const h = height(nx, ny)
            if (h === 0) continue
            const dx = (height(nx + e, ny) - height(nx - e, ny)) / (2 * e)
            const dy = (height(nx, ny + e) - height(nx, ny - e)) / (2 * e)
            const len = Math.hypot(dx, dy, 1)
            const lit = Math.max(0, (-dx * light[0] - dy * light[1] + light[2]) / len)
            const brightness = clamp(0.1 + 0.95 * lit ** 1.25 + (fbm(nx * 9, ny * 9) - 0.5) * 0.25)
            canvas.dot(x, y, pitch * 0.72 * Math.sqrt(brightness), PAPER)
        }
    }
    return canvas
}

/** An eight-petal flower printed as a stochastic stipple, dense at the heart. */
function flower() {
    const S = 700, cx = S / 2, cy = S / 2, R = S * 0.46
    const canvas = new Canvas(S, S)
    const random = rng(31)
    for (let gy = 0; gy < S; gy += 2.1) {
        for (let gx = 0; gx < S; gx += 2.1) {
            const x = gx + (random() - 0.5) * 3, y = gy + (random() - 0.5) * 3
            const dx = x - cx, dy = y - cy
            const r = Math.hypot(dx, dy), theta = Math.atan2(dy, dx)
            const petal = R * Math.abs(Math.cos(4 * theta)) ** 1.05
            const reach = Math.max(petal, R * 0.16)
            if (r > reach) continue
            const density = 0.1 + 0.9 * (1 - (r / reach) ** 1.3) ** 0.85
            if (random() < density) canvas.dot(x, y, 0.75 + random() * 0.55, PAPER)
        }
    }
    return canvas
}

/** A halftone plate whose dots swell toward one corner: the tone of the tool's empty ground. */
function field() {
    const W = 520, H = 760, pitch = 9
    const canvas = new Canvas(W, H)
    const fbm = noise2(21)
    const cos = Math.SQRT1_2
    for (let u = -W; u < W * 2; u += pitch) {
        for (let v = -H; v < H * 2; v += pitch) {
            const x = u * cos - v * cos + W / 2, y = u * cos + v * cos - W / 2 + H / 2
            if (x < 0 || y < 0 || x >= W || y >= H) continue
            const nx = x / W, ny = y / H
            const reach = 1 - Math.hypot(nx * 0.9, (1 - ny) * 0.75) / 1.05
            const density = clamp(reach * 1.35 + (fbm(nx * 4, ny * 4) - 0.5) * 0.7)
            if (density < 0.06) continue
            canvas.dot(x, y, pitch * 0.46 * Math.sqrt(density), PAPER)   // dots never touch, so the plate stays a screen of dots, not a grey slab
        }
    }
    return canvas
}

/** Data-moshed scan slices with a red / cyan channel split: the texture of a tear. */
function tear() {
    const W = 960, H = 160
    const canvas = new Canvas(W, H)
    const random = rng(99)
    let y = 4
    while (y < H - 2) {
        const h = 1 + Math.floor(random() * random() * 7)
        const run = random() < 0.5 ? 2 + Math.floor(random() * 4) : 1
        const shift = Math.round((random() - 0.5) * 60)
        for (let k = 0; k < run; k++) {
            let x = Math.floor(random() * W * 0.55)
            while (x < W) {
                const w = Math.floor(6 + random() * random() * 260)
                const gap = Math.floor(4 + random() * 70)
                canvas.rect(x + shift - 4, y, w, h, RED, 0.55)
                canvas.rect(x + shift + 4, y, w, h, CYAN, 0.5)
                canvas.rect(x + shift, y, w, h, PAPER, 0.92)
                x += w + gap
            }
        }
        y += h + Math.floor(random() * 9)
    }
    for (let i = 0; i < 46; i++) canvas.rect(random() * W, random() * H, 2 + random() * 12, 1 + random() * 2, PAPER, 0.85)
    return canvas
}


/**
 * Launcher: a black 45-degree dot screen that darkens the modpack's artwork where the interface must be read.
 * Integer lattice (rows P/2 apart, alternate rows shifted P/2), so the strip tiles seamlessly along its long side.
 * `across` is the coordinate that runs from full black (the edge) to nothing.
 */
function screenStrip(long, deep, horizontal) {
    const P = 8
    const w = horizontal ? long : deep, h = horizontal ? deep : long
    const canvas = new Canvas(w, h)
    const fbm = noise2(horizontal ? 34 : 35)
    for (let row = 0; row * (P / 2) < h + P; row++) {
        for (let col = 0; col * P < w + P; col++) {
            const x = col * P + (row % 2) * (P / 2) + P / 4, y = row * (P / 2) + P / 4
            const across = horizontal ? y / deep : x / deep   // 1 at the edge that touches the frame (bottom / right), 0 at the far side
            const density = clamp(Math.pow(clamp(across), 1.6) * 1.25 + (fbm(x / 90, y / 90) - 0.5) * 0.35 - 0.04)
            if (density < 0.05) continue
            const r = P * 0.53 * Math.sqrt(density)
            // draw the four wrap copies so the seam carries whole dots
            for (const dx of horizontal ? [-w, 0, w] : [0]) for (const dy of horizontal ? [0] : [-h, 0, h]) canvas.dot(x + dx, y + dy, r, INK)
        }
    }
    return canvas
}
function screenBottom() { return screenStrip(640, 360, true) }
function screenRight() { return screenStrip(640, 300, false) }

fs.mkdirSync(OUT, { recursive: true })
for (const [name, make] of Object.entries({ cloud, flower, tear, field })) {
    const file = path.join(OUT, `${name}.png`)
    const art = make()
    fs.writeFileSync(file, (name === 'tear' || name === 'field' ? art : art.trim()).png())
    console.log(`${name}.png`, `${(fs.statSync(file).size / 1024).toFixed(1)} KB`)
}

// The launcher ships its own copy of what it uses: the plate from above, plus the two black screens.
const LAUNCHER = path.join(__dirname, '..', '..', '..', 'app', 'assets', 'images', 'identity')
fs.mkdirSync(LAUNCHER, { recursive: true })
for (const name of ['field']) fs.copyFileSync(path.join(OUT, `${name}.png`), path.join(LAUNCHER, `${name}.png`))
for (const [name, make] of Object.entries({ 'screen-bottom': screenBottom, 'screen-right': screenRight })) {
    const file = path.join(LAUNCHER, `${name}.png`)
    fs.writeFileSync(file, make().png())
    console.log(`launcher/${name}.png`, `${(fs.statSync(file).size / 1024).toFixed(1)} KB`)
}
