import {
  CryptoProvider,
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-node'
import {
  MicrosoftAuthenticator,
  MojangClient,
  ProfileNotFoundError,
} from '@xmcl/user'
import type {
  AuthErrorCode,
  AuthResult,
  AuthStatus,
  MinecraftProfile,
} from '../../src/types/bridge.js'
import {
  authorizeInBrowser,
  BrowserAuthorizationError,
} from './browserAuthorization.js'
import { SecureCacheError, SecureCachePlugin } from './secureCachePlugin.js'

const AUTHORITY = 'https://login.microsoftonline.com/consumers'
const SCOPES = ['XboxLive.signin', 'XboxLive.offline_access']

class MinecraftAuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'MinecraftAuthError'
    this.code = code
  }
}

interface MinecraftSession {
  accessToken: string
  expiresAt: number
  profile: MinecraftProfile
}

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  'app-registration': 'Microsoft rechazo el registro de EmpiLauncher para Xbox Live.',
  busy: 'Ya hay un inicio de sesion en curso.',
  cancelled: 'El inicio de sesion fue cancelado.',
  network: 'No se pudo contactar con Microsoft o Minecraft.',
  'no-minecraft': 'Esta cuenta no tiene Minecraft: Java Edition.',
  'not-configured': 'Falta configurar el identificador de Microsoft.',
  'profile-missing': 'La cuenta tiene Minecraft, pero aun no ha creado su perfil de Java.',
  'secure-storage': 'Windows no pudo proteger la sesion de Microsoft.',
  timeout: 'Microsoft tardo demasiado en responder. Intentalo otra vez.',
  unknown: 'No se pudo completar el inicio de sesion.',
  'xbox-account': 'La cuenta necesita completar o revisar su perfil de Xbox.',
}

function mapPublicProfile(profile: {
  id: string
  name: string
  skins: Array<{ state: string; url: string }>
}): MinecraftProfile {
  return {
    id: profile.id,
    name: profile.name,
    skinUrl: profile.skins.find((skin) => skin.state === 'ACTIVE')?.url,
  }
}

function hasAppRegistrationError(error: Error) {
  return error.message.includes('AADSTS700016')
    || error.message.toLowerCase().includes('invalid app registration')
}

function hasXboxAccountError(error: Error) {
  return ['2148916233', '2148916235', '2148916236', '2148916237', '2148916238']
    .some((code) => error.message.includes(code))
}

function mapError(error: unknown): AuthErrorCode {
  if (error instanceof MinecraftAuthError) return error.code
  if (error instanceof SecureCacheError) return 'secure-storage'
  if (error instanceof ProfileNotFoundError) return 'profile-missing'
  if (error instanceof BrowserAuthorizationError) {
    if (error.code !== 'provider-error') return error.code
    return hasAppRegistrationError(error) ? 'app-registration' : 'unknown'
  }
  if (error instanceof InteractionRequiredAuthError) return 'cancelled'

  if (error instanceof Error) {
    if (hasAppRegistrationError(error)) return 'app-registration'
    if (hasXboxAccountError(error)) return 'xbox-account'
    if (error.name === 'TypeError' || error.message.includes('fetch failed')) return 'network'
  }

  return 'unknown'
}

export class MicrosoftAuthService {
  private readonly cachePlugin: SecureCachePlugin
  private readonly client?: PublicClientApplication
  private readonly minecraftAuthenticator = new MicrosoftAuthenticator({})
  private readonly mojangClient = new MojangClient()
  private initialized = false
  private loginInProgress = false
  private status: AuthStatus
  private minecraftSession?: MinecraftSession

  constructor(clientId: string | undefined, cachePath: string) {
    this.cachePlugin = new SecureCachePlugin(cachePath)
    this.status = clientId ? { state: 'signed-out' } : { state: 'not-configured' }

    if (clientId) {
      this.client = new PublicClientApplication({
        auth: {
          clientId,
          authority: AUTHORITY,
        },
        cache: {
          cachePlugin: this.cachePlugin,
        },
        system: {
          loggerOptions: {
            logLevel: LogLevel.Error,
            piiLoggingEnabled: false,
            loggerCallback: () => undefined,
          },
        },
      })
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.client) {
      this.initialized = true
      return
    }

    this.initialized = true

    try {
      const accounts = await this.client.getTokenCache().getAllAccounts()
      if (accounts.length === 0) return
      await this.restoreAccount(accounts[0])
    } catch (error) {
      const code = mapError(error)
      if (code === 'secure-storage') {
        this.status = { state: 'error', code, message: ERROR_MESSAGES[code] }
      } else {
        this.status = { state: 'signed-out' }
      }
    }
  }

  getStatus(): AuthStatus {
    return this.status
  }

  getSession(): MinecraftSession | undefined {
    return this.minecraftSession
  }

  async login(): Promise<AuthResult> {
    if (!this.client) return this.failure('not-configured')
    if (this.loginInProgress) return this.failure('busy')

    this.loginInProgress = true
    this.status = { state: 'working' }

    try {
      const cryptoProvider = new CryptoProvider()
      const pkce = await cryptoProvider.generatePkceCodes()
      const callback = await authorizeInBrowser((redirectUri, state) => (
        this.client!.getAuthCodeUrl({
          scopes: SCOPES,
          redirectUri,
          codeChallenge: pkce.challenge,
          codeChallengeMethod: 'S256',
          prompt: 'select_account',
          state,
        })
      ))

      const microsoftResult = await this.client.acquireTokenByCode({
        scopes: SCOPES,
        redirectUri: callback.redirectUri,
        code: callback.code,
        codeVerifier: pkce.verifier,
      })

      const profile = await this.createMinecraftSession(microsoftResult.accessToken)
      this.status = { state: 'authenticated', profile }
      return { ok: true, profile }
    } catch (error) {
      const code = mapError(error)
      this.status = { state: 'signed-out' }
      console.error(`[auth] Microsoft login failed: ${code}`)
      return this.failure(code)
    } finally {
      this.loginInProgress = false
    }
  }

  async logout(): Promise<void> {
    this.minecraftSession = undefined

    if (this.client) {
      const tokenCache = this.client.getTokenCache()
      const accounts = await tokenCache.getAllAccounts()
      await Promise.all(accounts.map((account) => tokenCache.removeAccount(account)))
      await this.cachePlugin.clear()
      this.status = { state: 'signed-out' }
    }
  }

  private async restoreAccount(account: AccountInfo) {
    if (!this.client) return

    const microsoftResult = await this.client.acquireTokenSilent({
      account,
      scopes: SCOPES,
    })
    const profile = await this.createMinecraftSession(microsoftResult.accessToken)
    this.status = { state: 'authenticated', profile }
  }

  private async createMinecraftSession(microsoftAccessToken: string) {
    const { minecraftXstsResponse } = await this.minecraftAuthenticator
      .acquireXBoxToken(microsoftAccessToken)
    const xboxUser = minecraftXstsResponse.DisplayClaims.xui[0]
    const minecraftToken = await this.minecraftAuthenticator.loginMinecraftWithXBox(
      xboxUser.uhs,
      minecraftXstsResponse.Token,
    )

    const ownership = await this.mojangClient.checkGameOwnership(minecraftToken.access_token)
    if (ownership.items.length === 0) {
      throw new MinecraftAuthError('no-minecraft', 'The account does not own Minecraft Java.')
    }

    const fullProfile = await this.mojangClient.getProfile(minecraftToken.access_token)
    const profile = mapPublicProfile(fullProfile)
    this.minecraftSession = {
      accessToken: minecraftToken.access_token,
      expiresAt: Date.now() + (minecraftToken.expires_in * 1000),
      profile,
    }
    return profile
  }

  private failure(code: AuthErrorCode): AuthResult {
    return { ok: false, code, message: ERROR_MESSAGES[code] }
  }
}
