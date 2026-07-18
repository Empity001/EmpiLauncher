import { ZipArchive } from 'archiver'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { PackInfo, PreparePackResult } from '../../src/types/bridge.js'

const PACK_DIRECTORY_NAME = 'forge-1.20.1'

export class CurseForgePackService {
  readonly #packSourceDirectory: string
  readonly #outputDirectory: string
  #packInfo: PackInfo | null = null
  #preparation: Promise<PreparePackResult> | null = null
  #preparedPath: string | null = null

  constructor(resourcesDirectory: string, downloadsDirectory: string) {
    this.#packSourceDirectory = path.join(
      resourcesDirectory,
      'packs',
      PACK_DIRECTORY_NAME,
    )
    this.#outputDirectory = path.join(downloadsDirectory, 'EmpiLauncher Packs')
  }

  async getPackInfo(): Promise<PackInfo> {
    if (this.#packInfo) return this.#packInfo

    const contents = await readFile(
      path.join(this.#packSourceDirectory, 'pack.json'),
      'utf8',
    )
    this.#packInfo = JSON.parse(contents) as PackInfo
    return this.#packInfo
  }

  preparePack(): Promise<PreparePackResult> {
    if (this.#preparation) return this.#preparation

    this.#preparation = this.#createPack().finally(() => {
      this.#preparation = null
    })
    return this.#preparation
  }

  getPreparedPath() {
    return this.#preparedPath
  }

  async #createPack(): Promise<PreparePackResult> {
    try {
      const pack = await this.getPackInfo()
      await mkdir(this.#outputDirectory, { recursive: true })

      const fileName = `${pack.name.replaceAll(' ', '-')}-${pack.version}.zip`
      const destination = path.join(this.#outputDirectory, fileName)
      const temporaryDestination = `${destination}.part`

      await rm(temporaryDestination, { force: true })
      await this.#writeArchive(temporaryDestination)
      await rm(destination, { force: true })
      await rename(temporaryDestination, destination)

      const sha256 = createHash('sha256')
        .update(await readFile(destination))
        .digest('hex')

      this.#preparedPath = destination
      return { ok: true, fileName, path: destination, sha256 }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error
          ? error.message
          : 'No se pudo preparar el paquete de CurseForge.',
      }
    }
  }

  async #writeArchive(destination: string) {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destination)
      const archive = new ZipArchive({ zlib: { level: 9 } })

      output.on('close', resolve)
      output.on('error', reject)
      archive.on('error', reject)
      archive.pipe(output)

      archive.file(path.join(this.#packSourceDirectory, 'manifest.json'), {
        name: 'manifest.json',
      })
      archive.directory(
        path.join(this.#packSourceDirectory, 'overrides'),
        'overrides',
      )

      void archive.finalize().catch(reject)
    })
  }
}
