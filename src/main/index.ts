import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { initDatabase } from './database'
import { startServer, getServerUrl, getLocalIP } from './server'

const isDev = !app.isPackaged
const SERVER_PORT = 3456

function createWindow(serverUrl: string): void {
  const ip = getLocalIP()
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: `标签打印软件 - 其他电脑请访问 http://${ip}:${SERVER_PORT}`,
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

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadURL(serverUrl)
  }
}

app.whenReady().then(async () => {
  initDatabase()

  const rendererDir = isDev ? undefined : join(__dirname, '../renderer')
  const serverUrl = await startServer(SERVER_PORT, rendererDir)

  createWindow(serverUrl)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(getServerUrl())
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
