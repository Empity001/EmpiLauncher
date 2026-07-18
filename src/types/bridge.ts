export type AuthStatus =
  | { state: 'loading' }
  | { state: 'not-configured' }
  | { state: 'ready' }
  | { state: 'working' }

export type AuthResult =
  | { ok: true }
  | { ok: false; code: 'not-configured' | 'not-implemented'; message: string }

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
  }
}
