import { readFile } from 'node:fs/promises'
import path from 'node:path'

interface LauncherConfigFile {
  microsoftClientId?: unknown
}

const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadMicrosoftClientId(appPath: string): Promise<string | undefined> {
  const environmentValue = process.env.EMPILAUNCHER_MICROSOFT_CLIENT_ID?.trim()
  if (environmentValue && CLIENT_ID_PATTERN.test(environmentValue)) {
    return environmentValue
  }

  try {
    const configPath = path.join(appPath, 'launcher.config.json')
    const config = JSON.parse(await readFile(configPath, 'utf8')) as LauncherConfigFile
    const clientId = typeof config.microsoftClientId === 'string'
      ? config.microsoftClientId.trim()
      : ''

    return CLIENT_ID_PATTERN.test(clientId) ? clientId : undefined
  } catch {
    return undefined
  }
}
