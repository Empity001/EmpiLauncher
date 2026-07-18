import { createWriteStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import type {
  DirectInstanceResult,
  DirectInstanceStatus,
  InstallProgress,
  PackInfo,
} from '../../src/types/bridge.js'
import { listManagedFiles, syncManagedFiles } from '../packs/managedFiles.js'
import { LauncherSettingsStore } from '../settings/launcherSettings.js'
import { defaultModrinthProfileRoots } from './detection.js'

const PACK_DIRECTORY_NAME = 'forge-1.20.1'
const MANAGED_MARKER = path.join('.empilauncher', 'instance.json')

type ProgressReporter = (progress: InstallProgress) => void
type PackOpener = (packPath: string) => Promise<string>

interface ManagedMarker {
  packId: string
  packVersion: string
  files?: string[]
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

async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const backupPath = `${filePath}.${randomUUID()}.backup`
  const hadExistingFile = await pathExists(filePath)
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  let backedUp = false
  try {
    if (hadExistingFile) {
      await rename(filePath, backupPath)
      backedUp = true
    }
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (backedUp) await rename(backupPath, filePath)
    throw error
  }
  await rm(backupPath, { force: true })
}

function reportProgress(
  report: ProgressReporter,
  stage: InstallProgress['stage'],
  message: string,
  percent: number,
  currentFile?: string,
) {
  report({
    launcher: 'modrinth',
    stage,
    message,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    currentFile,
  })
}

export class ModrinthInstanceService {
  readonly #packSourceDirectory: string
  readonly #installerDirectory: string
  readonly #settings: LauncherSettingsStore
  readonly #openPack: PackOpener
  readonly #report: ProgressReporter
  #packInfo: PackInfo | null = null
  #installation: Promise<DirectInstanceResult> | null = null

  constructor(
    resourcesDirectory: string,
    installerDirectory: string,
    settings: LauncherSettingsStore,
    openPack: PackOpener,
    report: ProgressReporter = () => undefined,
  ) {
    this.#packSourceDirectory = path.join(
      resourcesDirectory,
      'packs',
      PACK_DIRECTORY_NAME,
    )
    this.#installerDirectory = installerDirectory
    this.#settings = settings
    this.#openPack = openPack
    this.#report = report
  }

  async getPackInfo(): Promise<PackInfo> {
    if (this.#packInfo) return this.#packInfo
    this.#packInfo = await readJson<PackInfo>(
      path.join(this.#packSourceDirectory, 'pack.json'),
    )
    return this.#packInfo
  }

  async getStatus(): Promise<DirectInstanceStatus> {
    if (process.platform !== 'win32') return { state: 'unsupported' }

    const pack = await this.getPackInfo()
    const rememberedPath = await this.#settings.getInstancePath('modrinth')
    if (rememberedPath) {
      const status = await this.#statusForPath(rememberedPath, pack)
      if (status) return status
      await this.#settings.forgetInstancePath('modrinth')
    }

    for (const profileRoot of defaultModrinthProfileRoots()) {
      const located = await this.#findManagedInstance(profileRoot, pack.id)
      if (located) {
        await this.#settings.rememberInstancePath('modrinth', located)
        const status = await this.#statusForPath(located, pack)
        if (status) return status
      }
    }

    const profileRoots = defaultModrinthProfileRoots()
    return { state: 'absent', path: profileRoots[0] ?? 'Carpeta de perfiles de Modrinth' }
  }

  async locateInstance(selectedPath: string) {
    const pack = await this.getPackInfo()
    const directStatus = await this.#statusForPath(selectedPath, pack)
    const instancePath = directStatus
      ? selectedPath
      : await this.#findManagedInstance(selectedPath, pack.id)
    if (!instancePath) return false
    await this.#settings.rememberInstancePath('modrinth', instancePath)
    return true
  }

  installOrRepair() {
    if (this.#installation) return this.#installation
    this.#installation = this.#performInstallation().finally(() => {
      this.#installation = null
    })
    return this.#installation
  }

  async #performInstallation(): Promise<DirectInstanceResult> {
    if (process.platform !== 'win32') {
      return { ok: false, code: 'unsupported', message: 'Modrinth esta disponible en Windows por ahora.' }
    }

    try {
      const pack = await this.getPackInfo()
      const status = await this.getStatus()
      if (status.state === 'installed' || status.state === 'update-available') {
        reportProgress(this.#report, 'preparing', 'Comprobando archivos gestionados...', 5)
        const markerPath = path.join(status.path, MANAGED_MARKER)
        const marker = await readJson<ManagedMarker>(markerPath)
        const managedFiles = await syncManagedFiles(
          path.join(this.#packSourceDirectory, 'overrides'),
          status.path,
          marker.files ?? [],
          (file, completed, total) => {
            reportProgress(
              this.#report,
              'instance',
              'Actualizando la instancia de Modrinth...',
              10 + ((completed / total) * 88),
              file,
            )
          },
        )
        await writeJsonAtomic(markerPath, {
          packId: pack.id,
          packVersion: pack.version,
          files: managedFiles,
        } satisfies ManagedMarker)
        await this.#settings.rememberInstancePath('modrinth', status.path)
        reportProgress(this.#report, 'done', 'Instancia de Modrinth actualizada.', 100)
        return { ok: true, path: status.path, created: false }
      }

      const archivePath = await this.#createMrpack(pack)
      reportProgress(this.#report, 'handoff', 'Abriendo el instalador de Modrinth...', 96)
      const openError = await this.#openPack(archivePath)
      if (openError) {
        throw new Error(`No se pudo abrir Modrinth: ${openError}`)
      }
      reportProgress(this.#report, 'handoff', 'Termina la creacion en Modrinth.', 100)
      return {
        ok: true,
        path: status.state === 'absent' ? status.path : archivePath,
        created: true,
        requiresLauncher: true,
        message: 'Modrinth recibio el paquete. Confirma su creacion alli y vuelve a EmpiLauncher.',
      }
    } catch (error) {
      return {
        ok: false,
        code: 'installation-failed',
        message: error instanceof Error ? error.message : 'No se pudo preparar Modrinth.',
      }
    }
  }

  async #createMrpack(pack: PackInfo) {
    await mkdir(this.#installerDirectory, { recursive: true })
    const archivePath = path.join(
      this.#installerDirectory,
      `${pack.id}-${pack.version}.mrpack`,
    )
    const overridesRoot = path.join(this.#packSourceDirectory, 'overrides')
    const managedFiles = await listManagedFiles(overridesRoot)
    const zip = new ZipFile()
    const output = createWriteStream(archivePath)
    const manifest = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: pack.version,
      name: pack.name,
      summary: 'Instancia gestionada por EmpiLauncher.',
      files: [],
      dependencies: {
        minecraft: pack.minecraftVersion,
        forge: pack.loaderVersion,
      },
    }
    zip.addBuffer(
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      'modrinth.index.json',
    )

    const total = Math.max(managedFiles.length, 1)
    managedFiles.forEach((relativePath, index) => {
      zip.addFile(
        path.join(overridesRoot, relativePath),
        `overrides/${relativePath}`,
      )
      reportProgress(
        this.#report,
        'instance',
        'Preparando archivos para Modrinth...',
        10 + (((index + 1) / total) * 75),
        relativePath,
      )
    })
    zip.addBuffer(
      Buffer.from(`${JSON.stringify({
        packId: pack.id,
        packVersion: pack.version,
        files: managedFiles,
      } satisfies ManagedMarker, null, 2)}\n`),
      'overrides/.empilauncher/instance.json',
    )
    zip.end()
    await pipeline(zip.outputStream, output)
    reportProgress(this.#report, 'instance', 'Paquete de Modrinth preparado.', 92)
    return archivePath
  }

  async #statusForPath(instancePath: string, pack: PackInfo) {
    const markerPath = path.join(instancePath, MANAGED_MARKER)
    if (!await pathExists(markerPath)) return null
    try {
      const marker = await readJson<ManagedMarker>(markerPath)
      if (marker.packId !== pack.id) return null
      return {
        state: marker.packVersion === pack.version ? 'installed' : 'update-available',
        path: instancePath,
        installedVersion: marker.packVersion,
      } satisfies DirectInstanceStatus
    } catch {
      return null
    }
  }

  async #findManagedInstance(profileRoot: string, packId: string) {
    if (!await pathExists(profileRoot)) return null
    let entries
    try {
      entries = await readdir(profileRoot, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const instancePath = path.join(profileRoot, entry.name)
      try {
        const marker = await readJson<ManagedMarker>(path.join(instancePath, MANAGED_MARKER))
        if (marker.packId === packId) return instancePath
      } catch {
        continue
      }
    }
    return null
  }
}
