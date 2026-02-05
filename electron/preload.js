const { contextBridge, ipcRenderer } = require('electron')

function onResult(cb) {
  const fn = (_, data) => cb(data)
  ipcRenderer.on('screenshot-result', fn)
  return () => ipcRenderer.removeListener('screenshot-result', fn)
}
function onError(cb) {
  const fn = (_, msg) => cb(msg)
  ipcRenderer.on('screenshot-error', fn)
  return () => ipcRenderer.removeListener('screenshot-error', fn)
}

contextBridge.exposeInMainWorld('electronAPI', {
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  getApiKeyPath: () => ipcRenderer.invoke('get-api-key-path'),
  onScreenshotResult: onResult,
  onScreenshotError: onError,
  pasteClipboardImage: () => ipcRenderer.invoke('paste-clipboard-image'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirFiles: (dirPath) => ipcRenderer.invoke('read-dir-files', dirPath),
  readFileBuffer: async (filePath) => {
    const b64 = await ipcRenderer.invoke('read-file-buffer', filePath)
    if (!b64) return null
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr.buffer
  },
  // LM Studio API calls
  callLMStudio: (url, options) => ipcRenderer.invoke('call-lmstudio', url, options),
  
  // Monitor API（框选复用与 OCR 相同的 crop 窗口）
  startMonitorAreaSelection: () => ipcRenderer.invoke('start-monitor-area-selection'),
  onMonitorAreaSelected: (callback) => {
    const fn = (_, area) => callback(area)
    ipcRenderer.on('monitor-area-selected', fn)
    return () => ipcRenderer.removeListener('monitor-area-selected', fn)
  },
  startMonitor: (config) => ipcRenderer.invoke('start-monitor', config),
  stopMonitor: () => ipcRenderer.invoke('stop-monitor'),
  onMonitorMessage: (callback) => {
    const fn = (_, data) => callback(data)
    ipcRenderer.on('monitor-message', fn)
    return () => ipcRenderer.removeListener('monitor-message', fn)
  },
  onMonitorStats: (callback) => {
    const fn = (_, data) => callback(data)
    ipcRenderer.on('monitor-stats', fn)
    return () => ipcRenderer.removeListener('monitor-stats', fn)
  },
  onMonitorScreenshot: (callback) => {
    const fn = (_, data) => callback(data)
    ipcRenderer.on('monitor-screenshot', fn)
    return () => ipcRenderer.removeListener('monitor-screenshot', fn)
  },
  onMonitorExcelReady: (callback) => {
    const fn = (_, data) => callback(data)
    ipcRenderer.on('monitor-excel-ready', fn)
    return () => ipcRenderer.removeListener('monitor-excel-ready', fn)
  },
  onMonitorStopped: (callback) => {
    const fn = (_, data) => callback(data)
    ipcRenderer.on('monitor-stopped', fn)
    return () => ipcRenderer.removeListener('monitor-stopped', fn)
  }
})
