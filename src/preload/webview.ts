const { contextBridge } = require('electron')
const { ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('WebPortals', {
  prompt(...args: any[]) {
    return ipcRenderer.sendSync('prompt', ...args)
  },
  notificationClick(serviceId: string) {
    ipcRenderer.send('notificationClick', serviceId)
  }
})
