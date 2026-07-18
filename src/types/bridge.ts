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

export type CurseForgeStatus =
  | { state: 'loading' }
  | { state: 'detected'; variant: 'standalone' | 'overwolf' }
  | { state: 'not-found' }
  | { state: 'unsupported' }

export type DirectInstanceStatus =
  | { state: 'loading' }
  | { state: 'absent'; path: string }
  | { state: 'installed'; path: string; installedVersion: string }
  | { state: 'update-available'; path: string; installedVersion: string }
  | { state: 'conflict'; path: string }
  | { state: 'unsupported' }

export type DirectInstanceResult =
  | { ok: true; path: string; created: boolean; forgeVersionId: string }
  | {
      ok: false
      code: 'unsupported' | 'instance-conflict' | 'installation-failed'
      message: string
    }

export interface InstallProgress {
  stage: 'java' | 'minecraft' | 'forge' | 'instance' | 'done'
  message: string
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
    onInstallProgress(listener: (progress: InstallProgress) => void): () => void
    open(): Promise<LauncherActionResult>
    openInstance(): Promise<LauncherActionResult>
  }
}
