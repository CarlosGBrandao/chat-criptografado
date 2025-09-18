import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path' // 'join' é importado corretamente aqui
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createChatWindow(chatInfo) {
  const chatWin = new BrowserWindow({
    width: 500,
    height: 700,
    autoHideMenuBar: true,
    title: 'Chat com ',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const query = new URLSearchParams({
    currentUser: chatInfo.currentUser,
    chatWithUser: chatInfo.chatWithUser
  }).toString()

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  chatWin.loadURL(`${rendererUrl}/#/chat?${query}`) // Usando Hash Router para compatibilidade
}

ipcMain.on('open-chat-window', (event, chatInfo) => {
  createChatWindow(chatInfo)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})