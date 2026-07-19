import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { open, openEntryReadStream, walkEntriesGenerator } from '@xmcl/unzip'
import type { PackInfo } from '../../src/types/bridge.js'

const PACK_DIRECTORY_NAME = 'forge-1.20.1'
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/Empity001/EmpiPacks/main/catalog.json'

interface RemotePack extends PackInfo {
  archiveUrl: string
  sha256: string
  size?: number
}

interface PackCatalog {
  schemaVersion: 1
  packs: RemotePack[]
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

function versionParts(version: string) {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function isNewer(candidate: string, current: string) {
  const next = versionParts(candidate)
  const installed = versionParts(current)
  const length = Math.max(next.length, installed.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (next[index] ?? 0) - (installed[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

async function digest(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function safeArchivePath(root: string, entryName: string) {
  const normalized = entryName.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`El paquete contiene una ruta no valida: ${entryName}`)
  }
  const destination = path.resolve(root, normalized)
  const resolvedRoot = path.resolve(root)
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`El paquete intenta salir de su carpeta: ${entryName}`)
  }
  return destination
}

async function extractArchive(archivePath: string, destination: string) {
  const zip = await open(archivePath, { lazyEntries: true })
  for await (const entry of walkEntriesGenerator(zip)) {
    const target = safeArchivePath(destination, entry.fileName)
    const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
    if (unixMode === 0o120000) throw new Error('Los enlaces simbolicos no estan permitidos.')
    if (entry.fileName.endsWith('/')) {
      await mkdir(target, { recursive: true })
      continue
    }
    await mkdir(path.dirname(target), { recursive: true })
    await pipeline(await openEntryReadStream(zip, entry), createWriteStream(target))
  }
}

export class PackRepository {
  readonly #localDirectory: string
  readonly #cacheDirectory: string
  readonly #catalogUrl: string
  #resolvedDirectory: Promise<string> | null = null

  constructor(resourcesDirectory: string, cacheDirectory: string, catalogUrl = DEFAULT_CATALOG_URL) {
    this.#localDirectory = path.join(resourcesDirectory, 'packs', PACK_DIRECTORY_NAME)
    this.#cacheDirectory = cacheDirectory
    this.#catalogUrl = catalogUrl
  }

  getDirectory() {
    if (!this.#resolvedDirectory) this.#resolvedDirectory = this.#resolveDirectory()
    return this.#resolvedDirectory
  }

  async getPackInfo() {
    return await readJson<PackInfo>(path.join(await this.getDirectory(), 'pack.json'))
  }

  async #resolveDirectory() {
    const localPack = await readJson<PackInfo>(path.join(this.#localDirectory, 'pack.json'))
    try {
      const response = await fetch(this.#catalogUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(4_000),
      })
      if (!response.ok) return this.#localDirectory
      const catalog = await response.json() as PackCatalog
      if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.packs)) {
        return this.#localDirectory
      }
      const remotePack = catalog.packs
        .filter((candidate) => candidate.id === localPack.id)
        .sort((left, right) => isNewer(left.version, right.version) ? -1 : 1)[0]
      if (!remotePack || !isNewer(remotePack.version, localPack.version)) {
        return this.#localDirectory
      }
      return await this.#prepareRemotePack(remotePack)
    } catch {
      return this.#localDirectory
    }
  }

  async #prepareRemotePack(pack: RemotePack) {
    const packRoot = path.join(this.#cacheDirectory, pack.id)
    const finalDirectory = path.join(packRoot, pack.version)
    const existingManifest = path.join(finalDirectory, 'pack.json')
    if (await pathExists(existingManifest)) {
      const cached = await readJson<PackInfo>(existingManifest).catch(() => null)
      if (cached?.id === pack.id && cached.version === pack.version) return finalDirectory
    }

    await mkdir(packRoot, { recursive: true })
    const temporaryDirectory = path.join(packRoot, `${pack.version}.installing`)
    const archivePath = path.join(packRoot, `${pack.version}.empipack.download`)
    await rm(temporaryDirectory, { recursive: true, force: true })
    await rm(archivePath, { force: true })

    const response = await fetch(pack.archiveUrl, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok || !response.body) {
      throw new Error(`No se pudo descargar ${pack.name}: HTTP ${response.status}`)
    }
    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(archivePath),
    )
    const archiveHash = await digest(archivePath)
    if (archiveHash !== pack.sha256.toLowerCase()) {
      await rm(archivePath, { force: true })
      throw new Error(`La descarga de ${pack.name} no coincide con su SHA-256.`)
    }

    await mkdir(temporaryDirectory, { recursive: true })
    try {
      await extractArchive(archivePath, temporaryDirectory)
      const extracted = await readJson<PackInfo>(path.join(temporaryDirectory, 'pack.json'))
      if (extracted.id !== pack.id || extracted.version !== pack.version) {
        throw new Error('El manifiesto interno no coincide con el catalogo.')
      }
      await rm(finalDirectory, { recursive: true, force: true })
      await rename(temporaryDirectory, finalDirectory)
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true })
      throw error
    } finally {
      await rm(archivePath, { force: true })
    }
    return finalDirectory
  }
}
