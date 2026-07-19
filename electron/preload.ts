import { contextBridge, ipcRenderer } from 'electron'
import type { EmpiBridge } from '../src/types/bridge.js'

const bridge: EmpiBridge = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getPackInfo: () => ipcRenderer.invoke('pack:get-info'),
  curseForge: {
    getStatus: () => ipcRenderer.invoke('curseforge:get-status'),
    getInstanceStatus: () => ipcRenderer.invoke('curseforge:get-instance-status'),
    installOrRepair: () => ipcRenderer.invoke('curseforge:install-instance'),
    open: () => ipcRenderer.invoke('curseforge:open'),
    openInstance: () => ipcRenderer.invoke('curseforge:open-instance'),
  },
  modrinth: {
    getStatus: () => ipcRenderer.invoke('modrinth:get-status'),
    getInstanceStatus: () => ipcRenderer.invoke('modrinth:get-instance-status'),
    installOrRepair: () => ipcRenderer.invoke('modrinth:install-instance'),
    locateInstance: () => ipcRenderer.invoke('modrinth:locate-instance'),
    open: () => ipcRenderer.invoke('modrinth:open'),
    openInstance: () => ipcRenderer.invoke('modrinth:open-instance'),
  },
  custom: {
    getInstanceStatus: () => ipcRenderer.invoke('custom:get-instance-status'),
    chooseLocation: () => ipcRenderer.invoke('custom:choose-location'),
    installOrRepair: () => ipcRenderer.invoke('custom:install-instance'),
    openInstance: () => ipcRenderer.invoke('custom:open-instance'),
  },
  onInstallProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => {
      listener(progress)
    }
    ipcRenderer.on('install:progress', handler)
    return () => ipcRenderer.removeListener('install:progress', handler)
  },
}

contextBridge.exposeInMainWorld('empi', bridge)
