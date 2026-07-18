import { contextBridge, ipcRenderer } from 'electron'
import type { EmpiBridge } from '../src/types/bridge.js'

const bridge: EmpiBridge = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  auth: {
    getStatus: () => ipcRenderer.invoke('auth:get-status'),
    startMicrosoftLogin: () => ipcRenderer.invoke('auth:start-microsoft'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
}

contextBridge.exposeInMainWorld('empi', bridge)
