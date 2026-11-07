import { contextBridge, ipcRenderer } from 'electron'
import type { Backend, BackendMethod } from '../shared/api'

// الجسر بين الواجهة والعملية الرئيسية: قناة وحدة، والعملية الرئيسية بتقبل بس الدوال اللي بـBackend.
const api = {
  platform: process.platform,
  call<K extends BackendMethod>(method: K, ...args: Parameters<Backend[K]>): Promise<ReturnType<Backend[K]>> {
    return ipcRenderer.invoke('api', method, args)
  }
}

contextBridge.exposeInMainWorld('nuqta', api)

export type NuqtaApi = typeof api
