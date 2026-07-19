import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  DirectInstanceResult,
  DirectInstanceStatus,
  InstallProgress,
  PackInfo,
} from '../../src/types/bridge.js'
import { installForgeBase } from '../curseforge/instanceService.js'
import { syncManagedFiles } from '../packs/managedFiles.js'
import { LauncherSettingsStore } from '../settings/launcherSettings.js'

const MANAGED_MARKER = path.join('.empilauncher', 'instance.json')

type ProgressReporter = (progress: InstallProgress) => void

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
  try {
    if (hadExistingFile) await rename(filePath, backupPath)
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (hadExistingFile && await pathExists(backupPath)) await rename(backupPath, filePath)
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
    launcher: 'custom',
    stage,
    message,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    currentFile,
  })
}

export class CustomInstanceService {
  readonly #packSourceDirectory: string
  readonly #settings: LauncherSettingsStore
  readonly #report: ProgressReporter
  #packInfo: PackInfo | null = null
  #installation: Promise<DirectInstanceResult> | null = null

  constructor(
    packSourceDirectory: string,
    settings: LauncherSettingsStore,
    report: ProgressReporter = () => undefined,
  ) {
    this.#packSourceDirectory = packSourceDirectory
    this.#settings = settings
    this.#report = report
  }

  async getPackInfo() {
    if (this.#packInfo) return this.#packInfo
    this.#packInfo = await readJson<PackInfo>(path.join(this.#packSourceDirectory, 'pack.json'))
    return this.#packInfo
  }

  async chooseLocation(parentDirectory: string) {
    const pack = await this.getPackInfo()
    const selectedMarker = path.join(parentDirectory, MANAGED_MARKER)
    let instancePath = path.join(parentDirectory, pack.name)
    if (await pathExists(selectedMarker)) {
      const marker = await readJson<ManagedMarker>(selectedMarker).catch(() => null)
      if (marker?.packId === pack.id) instancePath = parentDirectory
    }
    await this.#settings.rememberInstancePath('custom', instancePath)
  }

  async getStatus(): Promise<DirectInstanceStatus> {
    if (process.platform !== 'win32') return { state: 'unsupported' }
    const pack = await this.getPackInfo()
    const instancePath = await this.#settings.getInstancePath('custom')
    if (!instancePath) return { state: 'location-required' }
    if (!await pathExists(instancePath)) return { state: 'absent', path: instancePath }

    const markerPath = path.join(instancePath, MANAGED_MARKER)
    if (!await pathExists(markerPath)) return { state: 'conflict', path: instancePath }
    const marker = await readJson<ManagedMarker>(markerPath).catch(() => null)
    if (!marker || marker.packId !== pack.id) return { state: 'conflict', path: instancePath }
    return {
      state: marker.packVersion === pack.version ? 'installed' : 'update-available',
      path: instancePath,
      installedVersion: marker.packVersion,
    }
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
      return { ok: false, code: 'unsupported', message: 'La instalacion portable esta disponible en Windows.' }
    }

    try {
      const pack = await this.getPackInfo()
      const status = await this.getStatus()
      if (status.state === 'location-required') {
        return { ok: false, code: 'location-required', message: 'Elige primero donde guardar la instancia.' }
      }
      if (status.state === 'conflict') {
        return {
          ok: false,
          code: 'instance-conflict',
          message: `La carpeta ${status.path} ya contiene archivos ajenos. No se modifico.`,
        }
      }
      if (!('path' in status)) {
        throw new Error('No se pudo resolver la carpeta de la instancia.')
      }

      const instancePath = status.path
      const created = status.state === 'absent'
      const destination = created
        ? `${instancePath}.installing-${randomUUID()}`
        : instancePath
      if (created) {
        await rm(destination, { recursive: true, force: true })
        await mkdir(destination, { recursive: true })
      }

      try {
        const { installedForgeId } = await installForgeBase(
          pack,
          destination,
          this.#report,
          'custom',
        )
        for (const directory of ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', '.empilauncher']) {
          await mkdir(path.join(destination, directory), { recursive: true })
        }

        const previousMarkerPath = path.join(destination, MANAGED_MARKER)
        const previousMarker = await pathExists(previousMarkerPath)
          ? await readJson<ManagedMarker>(previousMarkerPath).catch(() => null)
          : null
        const managedFiles = await syncManagedFiles(
          path.join(this.#packSourceDirectory, 'overrides'),
          destination,
          previousMarker?.files ?? [],
          (file, completed, total) => {
            reportProgress(
              this.#report,
              'instance',
              'Aplicando archivos del modpack...',
              94 + ((completed / total) * 5),
              file,
            )
          },
        )
        await writeJsonAtomic(path.join(destination, MANAGED_MARKER), {
          packId: pack.id,
          packVersion: pack.version,
          forgeVersionId: installedForgeId,
          files: managedFiles,
        })
        if (created) await rename(destination, instancePath)
        reportProgress(this.#report, 'done', 'Instancia portable lista.', 100)
        return { ok: true, path: instancePath, created, forgeVersionId: installedForgeId }
      } catch (error) {
        if (created) await rm(destination, { recursive: true, force: true })
        throw error
      }
    } catch (error) {
      return {
        ok: false,
        code: 'installation-failed',
        message: error instanceof Error ? error.message : 'No se pudo crear la instancia portable.',
      }
    }
  }
}
