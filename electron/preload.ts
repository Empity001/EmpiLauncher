import { contextBridge, ipcRenderer } from 'electron'
import type { EmpiBridge } from '../src/types/bridge.js'

const bridge: EmpiBridge = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getPackInfo: () => ipcRenderer.invoke('pack:get-info'),
  curseForge: {
    getStatus: () => ipcRenderer.invoke('curseforge:get-status'),
    preparePack: () => ipcRenderer.invoke('curseforge:prepare-pack'),
    open: () => ipcRenderer.invoke('curseforge:open'),
    showPreparedPack: () => ipcRenderer.invoke('curseforge:show-pack'),
  },
}

contextBridge.exposeInMainWorld('empi', bridge)
