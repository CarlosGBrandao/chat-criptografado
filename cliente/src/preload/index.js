import { contextBridge, ipcRenderer } from 'electron' // 👈 1. IMPORTE O ipcRenderer AQUI
import { electronAPI } from '@electron-toolkit/preload'

// APIs customizadas para o renderer
const api = {
  openChatWindow: (data) => ipcRenderer.send('open-chat-window', data),
}

// Use `contextBridge` para expor as APIs de forma segura
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api) // 👈 3. O OBJETO 'api' JÁ É EXPOSTO AQUI
  } catch (error) {
    console.error(error)
  }
} else {
  // Fallback para ambientes sem context isolation
  window.electron = electronAPI
  window.api = api
}