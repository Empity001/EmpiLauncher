import { contextBridge, ipcRenderer } from 'electron'
import type { EmpiBridge } from '../src/types/bridge.js'

const bridge: EmpiBridge = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getPackInfo: () => ipcRenderer.invoke('pack:get-info'),
  curseForge: {
    getStatus: () => ipcRenderer.invoke('curseforge:get-status'),
    getInstanceStatus: () => ipcRenderer.invoke('curseforge:get-instance-status'),
    installOrRepair: () => ipcRenderer.invoke('curseforge:install-instance'),
    onInstallProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => {
        listener(progress)
      }
      ipcRenderer.on('curseforge:install-progress', handler)
      return () => ipcRenderer.removeListener('curseforge:install-progress', handler)
    },
    open: () => ipcRenderer.invoke('curseforge:open'),
    openInstance: () => ipcRenderer.invoke('curseforge:open-instance'),
  },
}

contextBridge.exposeInMainWorld('empi', bridge)
