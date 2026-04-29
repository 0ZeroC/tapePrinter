import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { initDatabase } from './database'
import { startServer, getServerUrl, getLocalIP } from './server'

const isDev = !app.isPackaged
const DEFAULT_SERVER_PORT = 3456
const SERVER_PORT = Number.parseInt(process.env.SERVER_PORT || '', 10) || DEFAULT_SERVER_PORT
const SERVER_HOST = (process.env.SERVER_HOST || '0.0.0.0').trim() || '0.0.0.0'

function showErrorAndQuit(title: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err)
  dialog.showErrorBox(title, msg)
  app.quit()
}

function createWindow(serverUrl: string): void {
  const ip = getLocalIP()
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: `库存管理系统 - 其他电脑请访问 http://${ip}:${SERVER_PORT}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription)
    if (errorCode !== -3) {
      setTimeout(() => {
        mainWindow.loadURL(serverUrl)
      }, 1000)
    }
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

const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  small: { width: 50000, height: 40000 },
  large: { width: 90000, height: 70000 }
}

ipcMain.handle('print-label', async (event, templateType: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('找不到窗口')

  const pageSize = PAGE_SIZES[templateType] ?? PAGE_SIZES.small

  await win.webContents.print({
    silent: false,
    printBackground: true,
    pageSize,
    margins: { marginType: 'none' },
    scaleFactor: 100
  })
})

app.whenReady().then(async () => {
  try {
    initDatabase()
  } catch (err) {
    showErrorAndQuit('数据库初始化失败', err)
    return
  }

  let serverUrl: string
  try {
    const rendererDir = isDev
      ? undefined
      : join(__dirname, '../renderer').replace('app.asar', 'app.asar.unpacked')
    const viteDevUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined
    serverUrl = await startServer(SERVER_PORT, rendererDir, viteDevUrl, SERVER_HOST)
  } catch (err) {
    showErrorAndQuit('服务器启动失败', err)
    return
  }

  createWindow(serverUrl)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(getServerUrl())
  })
})

process.on('uncaughtException', (err) => {
  showErrorAndQuit('未捕获的异常', err)
})

process.on('unhandledRejection', (reason) => {
  showErrorAndQuit('未处理的Promise异常', reason)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
