const { app, BrowserWindow, globalShortcut, ipcMain, dialog, screen, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawnSync } = require('child_process')
const MonitorManager = require('./monitor')

const isDev = process.env.NODE_ENV === 'development' || process.env.APP_DEV === '1'
const isMac = process.platform === 'darwin'

let mainWindow = null
let cropWindow = null
let monitorManager = null

const getApiKeyPath = () => {
  const base = app.isPackaged ? process.resourcesPath : process.cwd()
  return path.join(base, 'APIKEYS', 'APIKEYS.txt')
}

const readApiKey = () => {
  try {
    const p = getApiKeyPath()
    if (!fs.existsSync(p)) return null
    const content = fs.readFileSync(p, 'utf8').trim()
    const line = content.split('\n')[0].trim()
    if (line.startsWith('GEMINI') && line.includes('=')) return line.split('=')[1].trim()
    return line
  } catch {
    return null
  }
}

const createMainWindow = () => {
  const win = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 400,
    alwaysOnTop: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (isDev) {
    const port = process.env.VITE_PORT || '5173'
    win.loadURL(`http://localhost:${port}`)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }
  mainWindow = win
}

/** 全屏截图用于 crop 窗口（与 OCR 框选同一套流程）：Mac 用 screencapture，Win 用 screenshot-desktop */
async function captureFullScreenForCrop () {
  if (isMac) {
    const tmpPath = path.join(os.tmpdir(), `jplinker_crop_${Date.now()}.png`)
    if (mainWindow) mainWindow.hide()
    const result = spawnSync('screencapture', ['-x', tmpPath], { stdio: 'inherit', shell: false })
    if (mainWindow) mainWindow.show()
    if (result.status !== 0 || !fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath) } catch {}
      return null
    }
    try {
      const base64 = fs.readFileSync(tmpPath).toString('base64')
      return base64
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  }
  try {
    const screenshot = require('screenshot-desktop')
    const img = await screenshot({ format: 'png' })
    return img.toString('base64')
  } catch (e) {
    console.error('captureFullScreenForCrop error:', e)
    return null
  }
}

const createCropWindow = (imageBase64, mode = 'ocr') => {
  if (cropWindow) {
    cropWindow.close()
    cropWindow = null
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  cropWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-crop.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  cropWindow.loadFile(path.join(__dirname, 'crop.html'))
  cropWindow.webContents.on('did-finish-load', () => {
    if (mode === 'monitor') cropWindow.webContents.send('set-mode', 'monitor')
    cropWindow.webContents.send('screenshot-data', imageBase64)
  })
  cropWindow.on('closed', () => { cropWindow = null })
}

function captureMac () {
  const tmpPath = path.join(os.tmpdir(), `jplinker_${Date.now()}.png`)
  if (mainWindow) mainWindow.hide()
  const result = spawnSync('screencapture', ['-i', '-s', tmpPath], {
    stdio: 'inherit',
    shell: false
  })
  if (mainWindow) mainWindow.show()
  if (result.status !== 0) {
    if (mainWindow) mainWindow.webContents.send('screenshot-error', '已取消截屏')
    try { fs.unlinkSync(tmpPath) } catch {}
    return
  }
  if (!fs.existsSync(tmpPath)) {
    if (mainWindow) mainWindow.webContents.send('screenshot-error', '截屏未生成')
    return
  }
  try {
    const base64 = fs.readFileSync(tmpPath).toString('base64')
    if (mainWindow) mainWindow.webContents.send('screenshot-result', base64)
  } catch (e) {
    if (mainWindow) mainWindow.webContents.send('screenshot-error', e.message)
  }
  try { fs.unlinkSync(tmpPath) } catch {}
}

function pasteClipboardImage () {
  const img = clipboard.readImage()
  if (!img || img.isEmpty()) {
    if (mainWindow) mainWindow.webContents.send('screenshot-error', '剪贴板无图片')
    return false
  }
  try {
    const base64 = img.toPNG().toString('base64')
    if (mainWindow) mainWindow.webContents.send('screenshot-result', base64)
    return true
  } catch (e) {
    if (mainWindow) mainWindow.webContents.send('screenshot-error', '剪贴板图片读取失败: ' + (e && e.message))
    return false
  }
}

app.whenReady().then(() => {
  createMainWindow()

  // 框选区域：与 OCR 同一套 crop 窗口，必须在 app ready 后注册
  ipcMain.handle('start-monitor-area-selection', async () => {
    const base64 = await captureFullScreenForCrop()
    if (!base64) return null
    createCropWindow(base64, 'monitor')
    return {}
  })

  globalShortcut.register('Alt+Q', () => {
    if (isMac) {
      captureMac()
    } else {
      try {
        const screenshot = require('screenshot-desktop')
        screenshot({ format: 'png' }).then(img => {
          const base64 = img.toString('base64')
          createCropWindow(base64, 'ocr')
        }).catch(e => {
          if (mainWindow) mainWindow.webContents.send('screenshot-error', e.message)
        })
      } catch (e) {
        if (mainWindow) mainWindow.webContents.send('screenshot-error', e.message)
      }
    }
  })
  globalShortcut.register(isMac ? 'Cmd+Shift+V' : 'Control+Shift+V', () => {
    pasteClipboardImage()
  })
})

ipcMain.handle('paste-clipboard-image', () => pasteClipboardImage())

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  app.quit()
})

ipcMain.handle('get-api-key', () => readApiKey())
ipcMain.handle('get-api-key-path', () => getApiKeyPath())

ipcMain.on('screenshot-selected', (event, data) => {
  if (typeof data === 'string') {
    if (cropWindow) { cropWindow.close(); cropWindow = null }
    if (mainWindow) mainWindow.webContents.send('screenshot-result', data)
    return
  }
  if (typeof data === 'object' && data != null && 'x' in data) {
    if (cropWindow) { cropWindow.close(); cropWindow = null }
    if (mainWindow) mainWindow.webContents.send('monitor-area-selected', data)
  }
})

ipcMain.on('screenshot-cancel', () => {
  if (cropWindow) cropWindow.close()
})

ipcMain.handle('select-folder', () => {
  if (!mainWindow) return null
  const r = dialog.showOpenDialogSync(mainWindow, { properties: ['openDirectory'] })
  return r && r[0] ? r[0] : null
})

ipcMain.handle('read-dir-files', (_, dirPath) => {
  try {
    const names = fs.readdirSync(dirPath)
    return names.filter(n => /\.(xlsx)$/i.test(n)).map(n => path.join(dirPath, n))
  } catch {
    return []
  }
})

ipcMain.handle('read-file-buffer', (_, filePath) => {
  try {
    const buf = fs.readFileSync(filePath)
    return buf.toString('base64')
  } catch {
    return null
  }
})

// LM Studio API proxy
ipcMain.handle('call-lmstudio', async (_, url, options) => {
  try {
    const fetch = require('node-fetch')
    
    const fetchOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    }
    
    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body)
    }
    
    console.log('Calling LM Studio:', url, fetchOptions)
    
    const response = await fetch(url, fetchOptions)
    const data = await response.json()
    
    console.log('LM Studio response:', { ok: response.ok, status: response.status, data })
    
    return {
      ok: response.ok,
      status: response.status,
      data: data
    }
  } catch (error) {
    console.error('LM Studio call error:', error)
    return {
      ok: false,
      status: 0,
      error: error.message
    }
  }
})

// 监控系统 IPC handlers
ipcMain.handle('start-monitor', async (event, config) => {
  if (!monitorManager) {
    monitorManager = new MonitorManager(mainWindow)
  }
  await monitorManager.startMonitor(config)
  return { success: true }
})

ipcMain.handle('stop-monitor', async () => {
  if (monitorManager) {
    monitorManager.stopMonitor()
  }
  return { success: true }
})
