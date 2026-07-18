import { access } from 'node:fs/promises'
import path from 'node:path'

export type CurseForgeVariant = 'standalone' | 'overwolf'

export type CurseForgeDetection =
  | {
      state: 'detected'
      variant: CurseForgeVariant
      executablePath: string
    }
  | { state: 'not-found' }
  | { state: 'unsupported' }

interface Candidate {
  variant: CurseForgeVariant
  executablePath: string | undefined
}

async function isAccessible(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function detectCurseForge(): Promise<CurseForgeDetection> {
  if (process.platform !== 'win32') return { state: 'unsupported' }

  const localAppData = process.env.LOCALAPPDATA
  const programFiles = process.env.PROGRAMFILES
  const programFilesX86 = process.env['PROGRAMFILES(X86)']

  const candidates: Candidate[] = [
    {
      variant: 'standalone',
      executablePath: localAppData
        ? path.join(localAppData, 'Programs', 'CurseForge Windows', 'CurseForge.exe')
        : undefined,
    },
    {
      variant: 'standalone',
      executablePath: localAppData
        ? path.join(localAppData, 'Programs', 'CurseForge', 'CurseForge.exe')
        : undefined,
    },
    {
      variant: 'standalone',
      executablePath: programFiles
        ? path.join(programFiles, 'CurseForge Windows', 'CurseForge.exe')
        : undefined,
    },
    {
      variant: 'standalone',
      executablePath: programFiles
        ? path.join(programFiles, 'CurseForge', 'CurseForge.exe')
        : undefined,
    },
    {
      variant: 'overwolf',
      executablePath: programFilesX86
        ? path.join(programFilesX86, 'Overwolf', 'OverwolfLauncher.exe')
        : undefined,
    },
    {
      variant: 'overwolf',
      executablePath: programFiles
        ? path.join(programFiles, 'Overwolf', 'OverwolfLauncher.exe')
        : undefined,
    },
  ]

  for (const candidate of candidates) {
    if (candidate.executablePath && await isAccessible(candidate.executablePath)) {
      return {
        state: 'detected',
        variant: candidate.variant,
        executablePath: candidate.executablePath,
      }
    }
  }

  return { state: 'not-found' }
}
