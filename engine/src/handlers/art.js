/**
 * Modpack art for the native UI: the banner (logo) and the background, as small still images the UI can decode cheaply.
 *
 * The sources are not small: the main modpack's background is a 278 MB animated WebP that WPF cannot read at all. So the engine
 * (which already carries sharp, like the classic launcher) produces a first-frame preview once, caches it, and the UI only ever
 * sees a 1280 px JPEG or a 900 px PNG. Animation is a separate, optional layer on top of this and is not done here.
 *
 *   - installed modpack: the file on disk is the source;
 *   - not installed: a small remote image (up to 8 MB) is fetched once; a big one (the 278 MB WebP) is never downloaded just to look at;
 *   - a huge animated WebP is not handed to sharp whole (libvips would load 278 MB into memory): its first frame is cut out of the
 *     container and decoded on its own.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { ensureCore } = require('./core')
const { describeServer } = require('./distro')
const { EngineError } = require('../ipc/server')

const MAX_REMOTE = 8 * 1024 * 1024
const BIG_LOCAL = 24 * 1024 * 1024
const LIMITS = { banner: { width: 900, format: 'png' }, background: { width: 1280, format: 'jpeg' } }

const hash = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)

/**
 * The first frame of an animated WebP as a stand-alone still WebP, reading only the start of the file.
 * RIFF 'WEBP' > VP8X (canvas, flags) > ANIM > ANMF (16 bytes of frame header + the frame's own ALPH/VP8/VP8L chunks) > ...
 */
function firstWebpFrame(file) {
    const fd = fs.openSync(file, 'r')
    try {
        const head = Buffer.alloc(12 + 8 + 10)
        fs.readSync(fd, head, 0, head.length, 0)
        if (head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP' || head.toString('latin1', 12, 16) !== 'VP8X') return null
        const flags = head[20]
        if (!(flags & 0x02)) return null   // not animated: sharp can take it as it is
        const canvas = head.subarray(20, 30)
        let pos = 12 + 8 + head.readUInt32LE(16)   // after VP8X (payload padded to even)
        pos += pos & 1
        const chunk = Buffer.alloc(8)
        for (let i = 0; i < 6; i++) {
            fs.readSync(fd, chunk, 0, 8, pos)
            const tag = chunk.toString('latin1', 0, 4)
            const size = chunk.readUInt32LE(4)
            if (tag === 'ANMF') {
                if (size > 64 * 1024 * 1024) return null
                const payload = Buffer.alloc(size)
                fs.readSync(fd, payload, 0, size, pos + 8)
                const frame = payload.subarray(16)   // the image chunks of the frame
                const vp8x = Buffer.from(canvas)
                vp8x[0] = flags & ~0x02              // drop the animation flag, keep alpha
                const body = Buffer.concat([Buffer.from('WEBP'), Buffer.from('VP8X'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(10); return b })(), vp8x, frame])
                const riff = Buffer.alloc(8)
                riff.write('RIFF', 0, 'latin1'); riff.writeUInt32LE(body.length, 4)
                return Buffer.concat([riff, body])
            }
            pos += 8 + size + (size & 1)
        }
        return null
    } finally { fs.closeSync(fd) }
}

async function download(url, dest, limit) {
    const response = await fetch(url, { headers: { 'User-Agent': 'EmpiLauncher' }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const declared = Number(response.headers.get('content-length')) || 0
    if (declared > limit) throw new Error('remote image is too large to preview')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > limit) throw new Error('remote image is too large to preview')
    fs.writeFileSync(dest, bytes)
}

function register(handlers, state) {
    const sharpLib = () => {
        if (!state.sharp) {
            state.sharp = require('sharp')
            state.sharp.cache(false)       // the UI keeps what it shows; the engine keeps nothing
            state.sharp.concurrency(1)
        }
        return state.sharp
    }

    async function preview(kind, serverId, visual) {
        if (!visual) return null
        const { ConfigManager } = ensureCore(state)
        const dir = path.join(ConfigManager.getLauncherDirectory(), 'art-cache')
        fs.mkdirSync(dir, { recursive: true })
        const spec = LIMITS[kind]
        const ext = spec.format === 'png' ? 'png' : 'jpg'

        let source = null, identity = null, temp = null
        if (visual.local) {
            const stat = fs.statSync(visual.local)
            source = visual.local
            identity = `${visual.local}|${stat.size}|${Math.trunc(stat.mtimeMs)}`
        } else if (visual.url && (kind === 'banner' || (visual.size || 0) <= MAX_REMOTE)) {
            identity = `${visual.url}|${visual.md5 || visual.size || ''}`
        } else {
            return null   // remote and big: not worth downloading to draw a backdrop
        }

        const out = path.join(dir, `${serverId}-${kind}-${hash(identity)}.${ext}`)
        if (fs.existsSync(out)) return out

        try {
            if (!source) {
                temp = path.join(dir, `${hash(identity)}.download`)
                await download(visual.url, temp, MAX_REMOTE)
                source = temp
            }
            let input = source
            if (fs.statSync(source).size > BIG_LOCAL) {
                const frame = firstWebpFrame(source)
                if (frame) input = frame
            }
            let pipeline = sharpLib()(input, { animated: false, limitInputPixels: false }).rotate().resize({ width: spec.width, withoutEnlargement: true })
            pipeline = spec.format === 'png' ? pipeline.png({ compressionLevel: 9 }) : pipeline.flatten({ background: '#060607' }).jpeg({ quality: 82, mozjpeg: false })
            await pipeline.toFile(out + '.tmp')
            fs.renameSync(out + '.tmp', out)
            // old previews of this modpack and kind are stale now
            for (const name of fs.readdirSync(dir)) if (name.startsWith(`${serverId}-${kind}-`) && path.join(dir, name) !== out) fs.rmSync(path.join(dir, name), { force: true })
            return out
        } catch (err) {
            state.log.warn(`Unable to make the ${kind} preview for ${serverId}.`, err)
            return null
        } finally {
            if (temp) fs.rmSync(temp, { force: true })
        }
    }

    /** { banner, background }: absolute paths of small still images, or null where the modpack has none (or it is too big to fetch). */
    handlers.set('art.get', async ({ id } = {}) => {
        const { ConfigManager, DistroAPI } = ensureCore(state)
        const distro = await DistroAPI.getDistribution()
        const server = distro.getServerById(id || ConfigManager.getSelectedServer())
        if (!server) throw new EngineError('no_server', 'no such modpack')
        const visuals = describeServer(ConfigManager, server).visuals
        return {
            serverId: server.rawServer.id,
            banner: await preview('banner', server.rawServer.id, visuals.banner),
            background: await preview('background', server.rawServer.id, visuals.background || visuals.backgroundPreview)
        }
    })
}

module.exports = { register, firstWebpFrame }
