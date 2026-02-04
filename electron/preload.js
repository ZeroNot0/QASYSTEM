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
  }
})
