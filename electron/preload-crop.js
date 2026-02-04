const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cropAPI', {
  onScreenshotData: (cb) => ipcRenderer.on('screenshot-data', (_, data) => cb(data)),
  onSetMode: (cb) => ipcRenderer.on('set-mode', (_, mode) => cb(mode)),
  confirm: (base64) => ipcRenderer.send('screenshot-selected', base64),
  cancel: () => ipcRenderer.send('screenshot-cancel')
})
