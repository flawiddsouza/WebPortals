const { contextBridge } = require('electron')
const { ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('WebPortals', {
  prompt(...args: any[]) {
    return ipcRenderer.sendSync('prompt', ...args)
  },
  notificationClick(serviceId: string) {
    ipcRenderer.send('notificationClick', serviceId)
  },
  getDisplayMedia(serviceId: string) {
    return new Promise((resolve, reject) => {
      // Request screen picker from main process
      console.log('Sending request-screen-picker for service:', serviceId)
      ipcRenderer
        .invoke('request-screen-picker', serviceId)
        .then((constraints) => {
          console.log('Got screen picker response:', constraints)
          resolve(constraints)
        })
        .catch((err) => {
          console.error('Screen picker error:', err)
          reject(err)
        })
    })
  }
})
