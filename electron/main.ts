import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { InstallProgress } from '../src/types/bridge.js'
import { CustomInstanceService } from './custom/instanceService.js'
import { detectCurseForge } from './curseforge/detection.js'
import { CurseForgeInstanceService } from './curseforge/instanceService.js'
import { detectModrinth } from './modrinth/detection.js'
import { ModrinthInstanceService } from './modrinth/instanceService.js'
import { PackRepository } from './packs/repository.js'
import { LauncherSettingsStore } from './settings/launcherSettings.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const rendererDirectory = path.join(currentDirectory, '../dist')

app.setName('EmpiLauncher')

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111311',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(rendererDirectory, 'index.html'))
  }
}

const CURSEFORGE_DOWNLOAD_URL = 'https://www.curseforge.com/download/app'
const CURSEFORGE_OVERWOLF_APP_ID = 'cfiahnpaolfnlgaihhmobmnjdafknjnjdpdabpcm'
const MODRINTH_DOWNLOAD_URL = 'https://modrinth.com/app'

function registerIpcHandlers(
  curseForgeService: CurseForgeInstanceService,
  modrinthService: ModrinthInstanceService,
  customService: CustomInstanceService,
) {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }))

  ipcMain.handle('pack:get-info', () => curseForgeService.getPackInfo())

  ipcMain.handle('curseforge:get-status', async () => {
    const detection = await detectCurseForge()
    if (detection.state !== 'detected') return detection
    return { state: detection.state, variant: detection.variant }
  })

  ipcMain.handle('curseforge:get-instance-status', () => curseForgeService.getStatus())
  ipcMain.handle('curseforge:install-instance', () => curseForgeService.installOrRepair())

  ipcMain.handle('curseforge:open-instance', async () => {
    const status = await curseForgeService.getStatus()
    if (status.state !== 'installed' && status.state !== 'update-available') {
      return { ok: false, message: 'Crea primero la instancia.' }
    }
    const error = await shell.openPath(status.path)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.handle('curseforge:open', async () => {
    const detection = await detectCurseForge()

    if (detection.state === 'unsupported') {
      return { ok: false, message: 'CurseForge solo se busca en Windows por ahora.' }
    }

    if (detection.state === 'not-found') {
      await shell.openExternal(CURSEFORGE_DOWNLOAD_URL)
      return { ok: true }
    }

    if (detection.variant === 'overwolf') {
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(
            detection.executablePath,
            ['-launchapp', CURSEFORGE_OVERWOLF_APP_ID, '-from-desktop'],
            { detached: true, stdio: 'ignore' },
          )
          child.once('spawn', () => {
            child.unref()
            resolve()
          })
          child.once('error', reject)
        })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error
            ? error.message
            : 'No se pudo abrir CurseForge desde Overwolf.',
        }
      }
    }

    const error = await shell.openPath(detection.executablePath)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.handle('modrinth:get-status', async () => {
    const detection = await detectModrinth()
    return { state: detection.state }
  })
  ipcMain.handle('modrinth:get-instance-status', () => modrinthService.getStatus())
  ipcMain.handle('modrinth:install-instance', () => modrinthService.installOrRepair())

  ipcMain.handle('modrinth:locate-instance', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Elige la instancia o la carpeta profiles de Modrinth',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: true }
    const located = await modrinthService.locateInstance(result.filePaths[0])
    return located
      ? { ok: true }
      : { ok: false, message: 'Esa carpeta no contiene la instancia de EmpiLauncher.' }
  })

  ipcMain.handle('modrinth:open-instance', async () => {
    const status = await modrinthService.getStatus()
    if (status.state !== 'installed' && status.state !== 'update-available') {
      return { ok: false, message: 'Crea primero la instancia en Modrinth.' }
    }
    const error = await shell.openPath(status.path)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.handle('modrinth:open', async () => {
    const detection = await detectModrinth()
    if (detection.state === 'unsupported') {
      return { ok: false, message: 'Modrinth solo se busca en Windows por ahora.' }
    }
    if (detection.state === 'not-found' || !detection.executablePath) {
      await shell.openExternal(MODRINTH_DOWNLOAD_URL)
      return { ok: true }
    }
    const error = await shell.openPath(detection.executablePath)
    return error ? { ok: false, message: error } : { ok: true }
  })

  ipcMain.handle('custom:get-instance-status', () => customService.getStatus())
  ipcMain.handle('custom:install-instance', () => customService.installOrRepair())

  ipcMain.handle('custom:choose-location', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Elige donde crear la instancia portable',
      buttonLabel: 'Usar esta carpeta',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: true }
    await customService.chooseLocation(result.filePaths[0])
    return { ok: true }
  })

  ipcMain.handle('custom:open-instance', async () => {
    const status = await customService.getStatus()
    if (status.state !== 'installed' && status.state !== 'update-available') {
      return { ok: false, message: 'Crea primero la instancia portable.' }
    }
    const error = await shell.openPath(status.path)
    return error ? { ok: false, message: error } : { ok: true }
  })
}

app.whenReady().then(async () => {
  const resourcesDirectory = app.isPackaged
    ? process.resourcesPath
    : app.getAppPath()
  const settings = new LauncherSettingsStore(app.getPath('userData'))
  const packRepository = new PackRepository(
    resourcesDirectory,
    path.join(app.getPath('userData'), 'packs'),
    process.env.EMPI_PACK_CATALOG_URL,
  )
  const packSourceDirectory = await packRepository.getDirectory()
  const reportProgress = (progress: InstallProgress) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('install:progress', progress)
    }
  }
  const curseForgeService = new CurseForgeInstanceService(
    packSourceDirectory,
    settings,
    reportProgress,
  )
  const modrinthService = new ModrinthInstanceService(
    packSourceDirectory,
    path.join(app.getPath('userData'), 'installers'),
    settings,
    (packPath) => shell.openPath(packPath),
    reportProgress,
  )
  const customService = new CustomInstanceService(
    packSourceDirectory,
    settings,
    reportProgress,
  )

  registerIpcHandlers(curseForgeService, modrinthService, customService)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
