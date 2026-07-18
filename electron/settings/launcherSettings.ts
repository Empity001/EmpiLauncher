import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LauncherKind } from '../../src/types/bridge.js'

interface LauncherSettings {
  instancePaths: Partial<Record<LauncherKind, string>>
}

const EMPTY_SETTINGS: LauncherSettings = { instancePaths: {} }

export class LauncherSettingsStore {
  readonly #filePath: string
  #settings: LauncherSettings | null = null

  constructor(userDataDirectory: string) {
    this.#filePath = path.join(userDataDirectory, 'launcher-settings.json')
  }

  async getInstancePath(launcher: LauncherKind) {
    const settings = await this.#read()
    return settings.instancePaths[launcher] ?? null
  }

  async rememberInstancePath(launcher: LauncherKind, instancePath: string) {
    const settings = await this.#read()
    settings.instancePaths[launcher] = path.resolve(instancePath)
    await this.#write(settings)
  }

  async forgetInstancePath(launcher: LauncherKind) {
    const settings = await this.#read()
    delete settings.instancePaths[launcher]
    await this.#write(settings)
  }

  async #read(): Promise<LauncherSettings> {
    if (this.#settings) return this.#settings

    try {
      const parsed = JSON.parse(await readFile(this.#filePath, 'utf8')) as LauncherSettings
      this.#settings = {
        instancePaths: parsed.instancePaths ?? {},
      }
    } catch {
      this.#settings = structuredClone(EMPTY_SETTINGS)
    }
    return this.#settings
  }

  async #write(settings: LauncherSettings) {
    await mkdir(path.dirname(this.#filePath), { recursive: true })
    const temporaryPath = `${this.#filePath}.${randomUUID()}.tmp`
    const backupPath = `${this.#filePath}.${randomUUID()}.backup`
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    let hadExistingFile = false
    try {
      await readFile(this.#filePath)
      hadExistingFile = true
    } catch {
      hadExistingFile = false
    }
    let backedUp = false
    try {
      if (hadExistingFile) {
        await rename(this.#filePath, backupPath)
        backedUp = true
      }
      await rename(temporaryPath, this.#filePath)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      if (backedUp) await rename(backupPath, this.#filePath)
      throw error
    }
    await rm(backupPath, { force: true })
    this.#settings = settings
  }
}
