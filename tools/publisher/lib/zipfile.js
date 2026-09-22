/**
 * Reads a .zip file: lists what is inside (central directory) and pulls a chosen entry out to disk. No dependency, by design (the
 * Publisher runs with none): the format is small enough to read by hand, the same way engine/src/lib/anim.js reads APNG chunks.
 *
 * Only what importzip.js needs: listing entries (name, size, whether it is a folder) and extracting one entry, streamed, to a path
 * the caller picks. Supports the two compression methods every zip tool writes (0 store, 8 deflate) and Zip64 (so a very large
 * modpack, or a machine whose 7-Zip defaults to it, still reads). Anything else (encryption, split archives, BZIP2/LZMA...) is
 * refused with a clear reason instead of silently reading garbage.
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { pipeline } = require('stream/promises')

const EOCD_SIG = 0x06054b50
const EOCD64_LOCATOR_SIG = 0x07064b50
const EOCD64_SIG = 0x06064b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
const EOCD_MIN = 22
const MAX_COMMENT = 0xffff

/** Where the end-of-central-directory record starts: scan backward from the end of the file (a comment, if any, can push it earlier). */
function findEocd(fd, fileSize) {
    const scan = Math.min(fileSize, EOCD_MIN + MAX_COMMENT)
    const buffer = Buffer.alloc(scan)
    fs.readSync(fd, buffer, 0, scan, fileSize - scan)
    for (let i = buffer.length - EOCD_MIN; i >= 0; i--) {
        if (buffer.readUInt32LE(i) === EOCD_SIG) return { offset: fileSize - scan + i, buffer, bufferOffset: i }
    }
    throw new Error('No es un archivo .zip válido (no encontré el final del índice).')
}

/** A name that cannot escape the folder it is extracted into: no "..", no drive letter, no leading slash. */
function safeRelative(name) {
    const posix = name.replace(/\\/g, '/')
    const normalized = path.posix.normalize(posix)
    if (normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) return null
    return normalized
}

/**
 * @param {string} zipPath
 * @returns {{ entries: Array<{name: string, dir: boolean, size: number, compressedSize: number, method: number, localHeaderOffset: number}>, close: () => void }}
 */
function open(zipPath) {
    const fd = fs.openSync(zipPath, 'r')
    const fileSize = fs.statSync(zipPath).size
    if (fileSize < EOCD_MIN) { fs.closeSync(fd); throw new Error('El .zip está vacío o incompleto.') }

    const { offset: eocdOffset, buffer: tail, bufferOffset } = findEocd(fd, fileSize)
    let centralDirOffset = tail.readUInt32LE(bufferOffset + 16)
    let centralDirSize = tail.readUInt32LE(bufferOffset + 12)
    let totalEntries = tail.readUInt16LE(bufferOffset + 10)

    // Zip64: the 32-bit fields above are 0xFFFFFFFF/0xFFFF and the real ones are in a locator + record just before the EOCD.
    if (totalEntries === 0xffff || centralDirOffset === 0xffffffff || centralDirSize === 0xffffffff) {
        const locatorOffset = eocdOffset - 20
        if (locatorOffset >= 0) {
            const locator = Buffer.alloc(20)
            fs.readSync(fd, locator, 0, 20, locatorOffset)
            if (locator.readUInt32LE(0) === EOCD64_LOCATOR_SIG) {
                const eocd64Offset = Number(locator.readBigUInt64LE(8))
                const record = Buffer.alloc(56)
                fs.readSync(fd, record, 0, 56, eocd64Offset)
                if (record.readUInt32LE(0) === EOCD64_SIG) {
                    totalEntries = Number(record.readBigUInt64LE(32))
                    centralDirSize = Number(record.readBigUInt64LE(40))
                    centralDirOffset = Number(record.readBigUInt64LE(48))
                }
            }
        }
    }
    if (totalEntries > 500000) { fs.closeSync(fd); throw new Error('Este .zip dice tener demasiadas cosas dentro; parece dañado.') }

    const central = Buffer.alloc(centralDirSize)
    fs.readSync(fd, central, 0, centralDirSize, centralDirOffset)

    const entries = []
    let pos = 0
    for (let i = 0; i < totalEntries; i++) {
        if (pos + 46 > central.length || central.readUInt32LE(pos) !== CENTRAL_SIG) throw new Error('El índice del .zip no cuadra; puede estar dañado.')
        const method = central.readUInt16LE(pos + 10)
        const crc32 = central.readUInt32LE(pos + 16)
        let compressedSize = central.readUInt32LE(pos + 20)
        let size = central.readUInt32LE(pos + 24)
        const nameLen = central.readUInt16LE(pos + 28)
        const extraLen = central.readUInt16LE(pos + 30)
        const commentLen = central.readUInt16LE(pos + 32)
        let localHeaderOffset = central.readUInt32LE(pos + 42)
        const generalPurpose = central.readUInt16LE(pos + 8)
        const nameBytes = central.subarray(pos + 46, pos + 46 + nameLen)
        const name = (generalPurpose & 0x0800) ? nameBytes.toString('utf8') : nameBytes.toString('latin1')

        // Zip64 extra field (id 0x0001): the 64-bit values replace the 32-bit ones above, in this fixed order, only where those were 0xFFFFFFFF.
        if (size === 0xffffffff || compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
            let extraPos = pos + 46 + nameLen
            const extraEnd = extraPos + extraLen
            while (extraPos + 4 <= extraEnd) {
                const id = central.readUInt16LE(extraPos)
                const len = central.readUInt16LE(extraPos + 2)
                if (id === 0x0001) {
                    let field = extraPos + 4
                    if (size === 0xffffffff) { size = Number(central.readBigUInt64LE(field)); field += 8 }
                    if (compressedSize === 0xffffffff) { compressedSize = Number(central.readBigUInt64LE(field)); field += 8 }
                    if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(central.readBigUInt64LE(field)); field += 8 }
                    break
                }
                extraPos += 4 + len
            }
        }

        const safe = safeRelative(name)
        if (safe && safe !== '' && !(name.endsWith('/') && safe === '.')) {
            entries.push({ name: safe, dir: name.endsWith('/'), size, compressedSize, method, localHeaderOffset })
        }
        pos += 46 + nameLen + extraLen + commentLen
    }

    return {
        entries,
        /** Streams one entry's decompressed bytes to `destPath` (parent folders are created). Rejects on an unsupported method. */
        async extractTo(entry, destPath) {
            if (entry.dir) { fs.mkdirSync(destPath, { recursive: true }); return }
            fs.mkdirSync(path.dirname(destPath), { recursive: true })
            if (entry.compressedSize === 0) { fs.writeFileSync(destPath, Buffer.alloc(0)); return }   // an empty file: no range to read
            const local = Buffer.alloc(30)
            fs.readSync(fd, local, 0, 30, entry.localHeaderOffset)
            if (local.readUInt32LE(0) !== LOCAL_SIG) throw new Error(`El .zip está dañado en "${entry.name}".`)
            const nameLen = local.readUInt16LE(26)
            const extraLen = local.readUInt16LE(28)
            const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen
            const source = fs.createReadStream(zipPath, { fd, start: dataStart, end: dataStart + entry.compressedSize - 1, autoClose: false })
            const dest = fs.createWriteStream(destPath)
            if (entry.method === 0) await pipeline(source, dest)
            else if (entry.method === 8) await pipeline(source, zlib.createInflateRaw(), dest)
            else throw new Error(`"${entry.name}" usa una compresión que no sé leer (método ${entry.method}). Vuelve a comprimir el zip con las opciones normales (sin cifrar).`)
        },
        close() { fs.closeSync(fd) }
    }
}

module.exports = { open, safeRelative }
