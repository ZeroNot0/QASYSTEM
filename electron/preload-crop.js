const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cropAPI', {
  onScreenshotData: (cb) => ipcRenderer.on('screenshot-data', (_, data) => cb(data)),
  confirm: (base64) => ipcRenderer.send('screenshot-selected', base64),
  cancel: () => ipcRenderer.send('screenshot-cancel')
})
