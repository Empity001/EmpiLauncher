import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Version } from '@xmcl/core'
import {
  getVersionList,
  installDependenciesTask,
  installForgeTask,
  installJavaRuntimeTask,
  installTask,
  JavaRuntimeTargetType,
} from '@xmcl/installer'
import type { JavaRuntimeManifest, JavaRuntimes } from '@xmcl/installer'
import type {
  DirectInstanceResult,
  DirectInstanceStatus,
  InstallProgress,
  LauncherKind,
  PackInfo,
} from '../../src/types/bridge.js'
import { syncManagedFiles } from '../packs/managedFiles.js'
import { LauncherSettingsStore } from '../settings/launcherSettings.js'

const execFileAsync = promisify(execFile)
const INSTANCE_METADATA = 'minecraftinstance.json'
const MANAGED_MARKER = path.join('.empilauncher', 'instance.json')
const JAVA_RUNTIME_INDEX_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

type ProgressReporter = (progress: InstallProgress) => void

interface ManagedMarker {
  packId: string
  packVersion: string
  files?: string[]
}

interface TaskSnapshot {
  progress: number
  total: number
  from?: string
  to?: string
}

interface RunnableTask<T> extends TaskSnapshot {
  startAndWait(context: {
    onStart(task: TaskSnapshot): void
    onUpdate(task: TaskSnapshot): void
  }): Promise<T>
}

function reportProgress(
  report: ProgressReporter,
  launcher: LauncherKind,
  stage: InstallProgress['stage'],
  message: string,
  percent: number,
  currentFile?: string,
) {
  report({
    launcher,
    stage,
    message,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    currentFile,
  })
}

async function runProgressTask<T>(
  task: RunnableTask<T>,
  report: ProgressReporter,
  launcher: LauncherKind,
  stage: InstallProgress['stage'],
  message: string,
  fromPercent: number,
  toPercent: number,
) {
  let currentFile: string | undefined
  const update = (activeTask?: TaskSnapshot) => {
    const candidate = activeTask?.to ?? activeTask?.from
    if (candidate) currentFile = path.basename(candidate)
    const ratio = task.total > 0 ? task.progress / task.total : 0
    reportProgress(
      report,
      launcher,
      stage,
      message,
      fromPercent + ((toPercent - fromPercent) * ratio),
      currentFile,
    )
  }

  update()
  const result = await task.startAndWait({
    onStart: update,
    onUpdate: update,
  })
  reportProgress(report, launcher, stage, message, toPercent, currentFile)
  return result
}

async function fileExists(filePath: string) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`La descarga respondio con HTTP ${response.status}: ${url}`)
  }
  return await response.json() as T
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const backupPath = `${filePath}.${randomUUID()}.backup`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  const hadExistingFile = await pathExists(filePath)

  try {
    if (hadExistingFile) await rename(filePath, backupPath)
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (hadExistingFile && await pathExists(backupPath)) {
      await rename(backupPath, filePath)
    }
    throw error
  }
  await rm(backupPath, { force: true })
}

function minecraftPaths() {
  const minecraftRoot = path.join(homedir(), 'curseforge', 'minecraft')
  return {
    minecraftRoot,
    installRoot: path.join(minecraftRoot, 'Install'),
    instancesRoot: path.join(minecraftRoot, 'Instances'),
  }
}

function forgeArtifactVersion(pack: PackInfo) {
  return `${pack.minecraftVersion}-${pack.loaderVersion}`
}

function forgeInstallerPath(installRoot: string, pack: PackInfo) {
  const artifactVersion = forgeArtifactVersion(pack)
  return path.join(
    installRoot,
    'libraries',
    'net',
    'minecraftforge',
    'forge',
    artifactVersion,
    `forge-${artifactVersion}-installer.jar`,
  )
}

function forgeInstallerUrl(pack: PackInfo) {
  const artifactVersion = forgeArtifactVersion(pack)
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${artifactVersion}/forge-${artifactVersion}-installer.jar`
}

async function javaMajorVersion(executable: string) {
  try {
    const { stdout, stderr } = await execFileAsync(executable, ['-version'], {
      windowsHide: true,
      timeout: 15_000,
    })
    const match = `${stdout}\n${stderr}`.match(/version "(?:1\.)?(\d+)/i)
    return match ? Number.parseInt(match[1], 10) : null
  } catch {
    return null
  }
}

async function findJava17(installRoot: string) {
  const appData = process.env.APPDATA
  const programFilesX86 = process.env['PROGRAMFILES(X86)']
  const runtimeSuffix = path.join(
    'runtime',
    'java-runtime-gamma',
    'windows-x64',
    'java-runtime-gamma',
    'bin',
    'java.exe',
  )
  const candidates = [
    path.join(installRoot, runtimeSuffix),
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : null,
    appData ? path.join(appData, '.minecraft', runtimeSuffix) : null,
    programFilesX86
      ? path.join(programFilesX86, 'Minecraft Launcher', runtimeSuffix)
      : null,
    'java',
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    const major = await javaMajorVersion(candidate)
    if (major === 17) return candidate
  }

  return null
}

async function ensureJava17(
  installRoot: string,
  report: ProgressReporter,
  launcher: LauncherKind,
) {
  const existingJava = await findJava17(installRoot)
  if (existingJava) {
    reportProgress(report, launcher, 'java', 'Java 17 ya esta listo.', 20)
    return existingJava
  }

  reportProgress(report, launcher, 'java', 'Preparando Java 17 de Minecraft...', 3)
  const destination = path.join(
    installRoot,
    'runtime',
    'java-runtime-gamma',
    'windows-x64',
    'java-runtime-gamma',
  )
  const runtimeIndex = await fetchJson<JavaRuntimes>(JAVA_RUNTIME_INDEX_URL)
  const target = runtimeIndex['windows-x64']?.[JavaRuntimeTargetType.Gamma]?.[0]
  if (!target) {
    throw new Error('Mojang no publico un Java 17 compatible con Windows x64.')
  }
  const runtimeFiles = await fetchJson<Pick<JavaRuntimeManifest, 'files'>>(
    target.manifest.url,
  )
  const manifest: JavaRuntimeManifest = {
    target: JavaRuntimeTargetType.Gamma,
    version: target.version,
    files: runtimeFiles.files,
  }
  await mkdir(destination, { recursive: true })
  await runProgressTask(
    installJavaRuntimeTask({ destination, manifest }),
    report,
    launcher,
    'java',
    'Instalando Java 17 de Minecraft...',
    3,
    20,
  )

  const executable = path.join(destination, 'bin', 'java.exe')
  const major = await javaMajorVersion(executable)
  if (major !== 17) {
    throw new Error('Java 17 se descargo, pero no se pudo ejecutar correctamente.')
  }
  return executable
}

export async function installForgeBase(
  pack: PackInfo,
  installRoot: string,
  report: ProgressReporter,
  launcher: LauncherKind,
) {
  await mkdir(installRoot, { recursive: true })
  reportProgress(report, launcher, 'preparing', 'Preparando la instalacion...', 2)
  const java = await ensureJava17(installRoot, report, launcher)
  reportProgress(
    report,
    launcher,
    'minecraft',
    `Comprobando Minecraft ${pack.minecraftVersion}...`,
    20,
  )
  const versionList = await getVersionList()
  const minecraftVersion = versionList.versions.find(
    (version) => version.id === pack.minecraftVersion,
  )
  if (!minecraftVersion) {
    throw new Error(`Minecraft ${pack.minecraftVersion} no aparece en el manifiesto oficial.`)
  }
  await runProgressTask(
    installTask(minecraftVersion, installRoot),
    report,
    launcher,
    'minecraft',
    `Instalando Minecraft ${pack.minecraftVersion}...`,
    22,
    55,
  )

  const installedForgeId = await runProgressTask(
    installForgeTask(
      {
        mcversion: pack.minecraftVersion,
        version: pack.loaderVersion,
        installer: { path: forgeInstallerUrl(pack) },
      },
      installRoot,
      {
        java,
        mavenHost: ['https://maven.minecraftforge.net'],
      },
    ),
    report,
    launcher,
    'forge',
    `Instalando Forge ${pack.loaderVersion}...`,
    55,
    80,
  )
  const resolvedForge = await Version.parse(installRoot, installedForgeId)
  await runProgressTask(
    installDependenciesTask(resolvedForge, {
      mavenHost: ['https://maven.minecraftforge.net'],
    }),
    report,
    launcher,
    'forge',
    'Comprobando librerias de Forge...',
    80,
    94,
  )

  const versionRoot = path.join(installRoot, 'versions', installedForgeId)
  const versionJson = await readJson<unknown>(
    path.join(versionRoot, `${installedForgeId}.json`),
  )
  const installProfile = await readJson<unknown>(
    path.join(versionRoot, 'install_profile.json'),
  )
  if (!await fileExists(forgeInstallerPath(installRoot, pack))) {
    throw new Error('Forge se instalo, pero falta su instalador compartido.')
  }

  return { installedForgeId, versionJson, installProfile }
}

function createBaseModLoader(
  pack: PackInfo,
  versionJson: unknown,
  installProfile: unknown,
) {
  return {
    forgeVersion: pack.loaderVersion,
    name: `forge-${pack.loaderVersion}`,
    type: 1,
    downloadUrl: forgeInstallerUrl(pack),
    filename: path.basename(forgeInstallerUrl(pack)),
    installMethod: 1,
    latest: false,
    recommended: true,
    versionJson: JSON.stringify(versionJson),
    librariesInstallLocation:
      `{0}\\libraries\\net\\minecraftforge\\forge\\${forgeArtifactVersion(pack)}`,
    minecraftVersion: pack.minecraftVersion,
    installProfileJson: JSON.stringify(installProfile),
  }
}

function createInstanceMetadata(
  existing: Record<string, unknown>,
  pack: PackInfo,
  instancePath: string,
  versionJson: unknown,
  installProfile: unknown,
) {
  const now = new Date().toISOString()
  const existingGuid = typeof existing.guid === 'string' ? existing.guid : randomUUID()
  const installDate = typeof existing.installDate === 'string'
    ? existing.installDate
    : now

  return {
    isUnlocked: true,
    javaArgsOverride: null,
    lastPlayed: '0001-01-01T00:00:00',
    playedCount: 0,
    timePlayed: 0,
    manifest: null,
    fileDate: '0001-01-01T00:00:00',
    installedModpack: null,
    projectID: 0,
    fileID: 0,
    customAuthor: null,
    modpackOverrides: [],
    isMemoryOverride: false,
    allocatedMemory: 4096,
    memoryAllocatedType: 0,
    profileImagePath: null,
    groupId: null,
    isVanilla: false,
    gameVersionFlavor: null,
    gameVersionTypeId: null,
    cachedScans: [],
    lastPreviousMatchUpdate: now,
    preferenceAlternateFile: false,
    preferenceAutoInstallUpdates: false,
    preferenceDeleteOrphanedDependencies: false,
    preferenceDeleteSavedVariables: false,
    preferenceReleaseType: 3,
    preferenceModdingFolderPath: null,
    syncProfile: {
      PreferenceEnabled: false,
      PreferenceAutoSync: false,
      PreferenceAutoDelete: false,
      PreferenceBackupSavedVariables: false,
      GameInstanceGuid: '00000000-0000-0000-0000-000000000000',
      SyncProfileID: 0,
      SavedVariablesProfile: null,
      LastSyncDate: '0001-01-01T00:00:00',
    },
    installedAddons: [],
    installedGamePrerequisites: [],
    wasNameManuallyChanged: false,
    wasGameVersionTypeIdManuallyChanged: false,
    ...existing,
    baseModLoader: createBaseModLoader(pack, versionJson, installProfile),
    guid: existingGuid,
    gameTypeID: 432,
    installPath: instancePath.endsWith(path.sep) ? instancePath : `${instancePath}${path.sep}`,
    name: pack.name,
    isValid: true,
    isEnabled: true,
    gameVersion: pack.minecraftVersion,
    installDate,
    lastRefreshAttempt: now,
  }
}

export class CurseForgeInstanceService {
  readonly #packSourceDirectory: string
  readonly #report: ProgressReporter
  readonly #settings: LauncherSettingsStore
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
    const { instancesRoot } = minecraftPaths()
    const rememberedPath = await this.#settings.getInstancePath('curseforge')
    const instancePath = rememberedPath ?? path.join(instancesRoot, pack.name)
    const markerPath = path.join(instancePath, MANAGED_MARKER)

    if (!await pathExists(instancePath)) {
      return { state: 'absent', path: instancePath }
    }
    if (
      !await fileExists(path.join(instancePath, INSTANCE_METADATA))
      || !await fileExists(markerPath)
    ) {
      return { state: 'conflict', path: instancePath }
    }

    let marker: ManagedMarker
    try {
      marker = await readJson<ManagedMarker>(markerPath)
    } catch {
      return { state: 'conflict', path: instancePath }
    }
    if (marker.packId !== pack.id) {
      return { state: 'conflict', path: instancePath }
    }
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
      return { ok: false, code: 'unsupported', message: 'La instalacion directa esta disponible en Windows.' }
    }

    try {
      const pack = await this.getPackInfo()
      const { installRoot, instancesRoot } = minecraftPaths()
      const status = await this.getStatus()
      const instancePath = 'path' in status
        ? status.path
        : path.join(instancesRoot, pack.name)
      if (status.state === 'conflict') {
        return {
          ok: false,
          code: 'instance-conflict',
          message: `Ya existe una instancia ajena a EmpiLauncher en ${instancePath}. No se modifico.`,
        }
      }

      await mkdir(installRoot, { recursive: true })
      await mkdir(instancesRoot, { recursive: true })
      const { installedForgeId, versionJson, installProfile } = await installForgeBase(
        pack,
        installRoot,
        this.#report,
        'curseforge',
      )

      reportProgress(
        this.#report,
        'curseforge',
        'instance',
        'Creando la instancia de CurseForge...',
        94,
      )
      const created = status.state === 'absent'
      await this.#writeInstance(pack, instancePath, versionJson, installProfile, created)
      await this.#settings.rememberInstancePath('curseforge', instancePath)
      reportProgress(
        this.#report,
        'curseforge',
        'done',
        'Instancia lista para abrir en CurseForge.',
        100,
      )

      return { ok: true, path: instancePath, created, forgeVersionId: installedForgeId }
    } catch (error) {
      return {
        ok: false,
        code: 'installation-failed',
        message: error instanceof Error ? error.message : 'No se pudo crear la instancia.',
      }
    }
  }

  async #writeInstance(
    pack: PackInfo,
    instancePath: string,
    versionJson: unknown,
    installProfile: unknown,
    created: boolean,
  ) {
    const destination = created
      ? `${instancePath}.installing-${randomUUID()}`
      : instancePath

    if (created) {
      await rm(destination, { recursive: true, force: true })
      await mkdir(destination, { recursive: true })
    }

    try {
      for (const directory of ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', '.empilauncher']) {
        await mkdir(path.join(destination, directory), { recursive: true })
      }

      const overrides = path.join(this.#packSourceDirectory, 'overrides')
      const previousMarkerPath = path.join(destination, MANAGED_MARKER)
      const previousMarker = await fileExists(previousMarkerPath)
        ? await readJson<ManagedMarker>(previousMarkerPath).catch(() => null)
        : null
      const managedFiles = await syncManagedFiles(
        overrides,
        destination,
        previousMarker?.files ?? [],
        (file, completed, total) => {
          reportProgress(
            this.#report,
            'curseforge',
            'instance',
            'Actualizando archivos del paquete...',
            94 + ((completed / total) * 5),
            file,
          )
        },
      )

      const metadataPath = path.join(destination, INSTANCE_METADATA)
      const existingMetadata = await fileExists(metadataPath)
        ? await readJson<Record<string, unknown>>(metadataPath)
        : {}
      const metadata = createInstanceMetadata(
        existingMetadata,
        pack,
        created ? instancePath : destination,
        versionJson,
        installProfile,
      )

      await writeJsonAtomic(metadataPath, metadata)
      await writeJsonAtomic(path.join(destination, MANAGED_MARKER), {
        packId: pack.id,
        packVersion: pack.version,
        files: managedFiles,
      } satisfies ManagedMarker)

      if (created) await rename(destination, instancePath)
    } catch (error) {
      if (created) await rm(destination, { recursive: true, force: true })
      throw error
    }
  }
}
