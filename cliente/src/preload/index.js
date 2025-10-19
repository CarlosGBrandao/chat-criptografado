import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// APIs customizadas para o renderer
const api = {
  openChatWindow: (data) => ipcRenderer.send('open-chat-window', data),
  openChatGroupWindow: (data) => ipcRenderer.send('open-chat-group-window', data),
  
 
  onChatKeys: (callback) => ipcRenderer.on('chat-keys', (_event, value) => callback(value))
}

// Use `contextBridge` para expor as APIs de forma segura
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Fallback para ambientes sem context isolation
  window.electron = electronAPI
  window.api = api
}