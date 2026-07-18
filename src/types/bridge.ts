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

export type PreparePackResult =
  | { ok: true; fileName: string; path: string; sha256: string }
  | { ok: false; message: string }

export type LauncherActionResult =
  | { ok: true }
  | { ok: false; message: string }

export interface EmpiBridge {
  getAppInfo(): Promise<AppInfo>
  getPackInfo(): Promise<PackInfo>
  curseForge: {
    getStatus(): Promise<CurseForgeStatus>
    preparePack(): Promise<PreparePackResult>
    open(): Promise<LauncherActionResult>
    showPreparedPack(): Promise<LauncherActionResult>
  }
}
