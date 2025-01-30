console.log(`Logging from preload`)

const { contextBridge } = require('electron')
const { ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('_prompt', (...args) => {
  return ipcRenderer.sendSync('prompt', ...args)
})
