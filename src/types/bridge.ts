export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface PackInfo {
  id: string
  name: string
  version: string
  minecraftVersion: string
  loader: string
  loaderVersion: string
}

export type LauncherKind = 'curseforge' | 'modrinth' | 'custom'

export type CurseForgeStatus =
  | { state: 'loading' }
  | { state: 'detected'; variant: 'standalone' | 'overwolf' }
  | { state: 'not-found' }
  | { state: 'unsupported' }

export type ModrinthStatus =
  | { state: 'loading' }
  | { state: 'detected' }
  | { state: 'not-found' }
  | { state: 'unsupported' }

export type DirectInstanceStatus =
  | { state: 'loading' }
  | { state: 'absent'; path: string }
  | { state: 'installed'; path: string; installedVersion: string }
  | { state: 'update-available'; path: string; installedVersion: string }
  | { state: 'conflict'; path: string }
  | { state: 'location-required' }
  | { state: 'unsupported' }

export type DirectInstanceResult =
  | {
      ok: true
      path: string
      created: boolean
      forgeVersionId?: string
      requiresLauncher?: boolean
      message?: string
    }
  | {
      ok: false
      code: 'unsupported' | 'instance-conflict' | 'installation-failed' | 'location-required'
      message: string
    }

export interface InstallProgress {
  launcher: LauncherKind
  stage: 'preparing' | 'java' | 'minecraft' | 'forge' | 'instance' | 'handoff' | 'done'
  message: string
  percent: number
  currentFile?: string
}

export type LauncherActionResult =
  | { ok: true }
  | { ok: false; message: string }

export interface EmpiBridge {
  getAppInfo(): Promise<AppInfo>
  getPackInfo(): Promise<PackInfo>
  curseForge: {
    getStatus(): Promise<CurseForgeStatus>
    getInstanceStatus(): Promise<DirectInstanceStatus>
    installOrRepair(): Promise<DirectInstanceResult>
    open(): Promise<LauncherActionResult>
    openInstance(): Promise<LauncherActionResult>
  }
  modrinth: {
    getStatus(): Promise<ModrinthStatus>
    getInstanceStatus(): Promise<DirectInstanceStatus>
    installOrRepair(): Promise<DirectInstanceResult>
    locateInstance(): Promise<LauncherActionResult>
    open(): Promise<LauncherActionResult>
    openInstance(): Promise<LauncherActionResult>
  }
  custom: {
    getInstanceStatus(): Promise<DirectInstanceStatus>
    chooseLocation(): Promise<LauncherActionResult>
    installOrRepair(): Promise<DirectInstanceResult>
    openInstance(): Promise<LauncherActionResult>
  }
  onInstallProgress(listener: (progress: InstallProgress) => void): () => void
}
