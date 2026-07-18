import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ModrinthDetection =
  | {
      state: 'detected'
      executablePath?: string
      profileRoots: string[]
    }
  | { state: 'not-found'; profileRoots: string[] }
  | { state: 'unsupported'; profileRoots: string[] }

async function isAccessible(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export function defaultModrinthProfileRoots() {
  const appData = process.env.APPDATA
  if (!appData) return []
  return [
    path.join(appData, 'ModrinthApp', 'profiles'),
    path.join(appData, 'com.modrinth.theseus', 'profiles'),
  ]
}

async function associatedExecutable() {
  try {
    const association = await execFileAsync('reg.exe', [
      'query',
      'HKCR\\.mrpack',
      '/ve',
    ], { windowsHide: true })
    const programId = association.stdout.match(/REG_SZ\s+([^\r\n]+)/)?.[1]?.trim()
    if (!programId) return null
    const command = await execFileAsync('reg.exe', [
      'query',
      `HKCR\\${programId}\\shell\\open\\command`,
      '/ve',
    ], { windowsHide: true })
    return command.stdout.match(/REG_SZ\s+"([^"]+\.exe)"/i)?.[1] ?? null
  } catch {
    return null
  }
}

export async function detectModrinth(): Promise<ModrinthDetection> {
  const profileRoots = defaultModrinthProfileRoots()
  if (process.platform !== 'win32') return { state: 'unsupported', profileRoots }

  const localAppData = process.env.LOCALAPPDATA
  const executableCandidates = localAppData
    ? [
        path.join(localAppData, 'Programs', 'Modrinth App', 'Modrinth App.exe'),
        path.join(localAppData, 'Programs', 'ModrinthApp', 'Modrinth App.exe'),
        path.join(localAppData, 'Modrinth App', 'Modrinth App.exe'),
      ]
    : []

  const associated = await associatedExecutable()
  if (associated) executableCandidates.unshift(associated)

  for (const executablePath of executableCandidates) {
    if (await isAccessible(executablePath)) {
      return { state: 'detected', executablePath, profileRoots }
    }
  }
  for (const profileRoot of profileRoots) {
    if (await isAccessible(profileRoot)) return { state: 'detected', profileRoots }
  }
  return { state: 'not-found', profileRoots }
}
