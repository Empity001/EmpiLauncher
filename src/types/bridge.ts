export interface MinecraftProfile {
  id: string
  name: string
  skinUrl?: string
}

export type AuthErrorCode =
  | 'app-registration'
  | 'busy'
  | 'cancelled'
  | 'network'
  | 'no-minecraft'
  | 'not-configured'
  | 'profile-missing'
  | 'secure-storage'
  | 'timeout'
  | 'unknown'
  | 'xbox-account'

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'not-configured' }
  | { state: 'signed-out' }
  | { state: 'working' }
  | { state: 'authenticated'; profile: MinecraftProfile }
  | { state: 'error'; code: AuthErrorCode; message: string }

export type AuthResult =
  | { ok: true; profile: MinecraftProfile }
  | { ok: false; code: AuthErrorCode; message: string }

export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface EmpiBridge {
  getAppInfo(): Promise<AppInfo>
  auth: {
    getStatus(): Promise<AuthStatus>
    startMicrosoftLogin(): Promise<AuthResult>
    logout(): Promise<AuthStatus>
  }
}
