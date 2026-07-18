import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node'
import { safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class SecureCacheError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecureCacheError'
  }
}

export class SecureCachePlugin implements ICachePlugin {
  private readonly cachePath: string

  constructor(cachePath: string) {
    this.cachePath = cachePath
  }

  async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    let encryptedCache: Buffer

    try {
      encryptedCache = await readFile(this.cachePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecureCacheError('Windows encryption is not available.')
    }

    try {
      context.tokenCache.deserialize(safeStorage.decryptString(encryptedCache))
    } catch {
      throw new SecureCacheError('The saved Microsoft session could not be decrypted.')
    }
  }

  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (!context.cacheHasChanged) return
    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecureCacheError('Windows encryption is not available.')
    }

    await mkdir(path.dirname(this.cachePath), { recursive: true })
    const encryptedCache = safeStorage.encryptString(context.tokenCache.serialize())
    await writeFile(this.cachePath, encryptedCache, { mode: 0o600 })
  }

  async clear(): Promise<void> {
    await rm(this.cachePath, { force: true })
  }
}
