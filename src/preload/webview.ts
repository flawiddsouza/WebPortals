const { contextBridge } = require('electron')
const { ipcRenderer } = require('electron/renderer')

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    // Check if the event is already handled (prevented) by the page
    if (event.defaultPrevented) {
      return
    }

    // Forward Ctrl+F (or Cmd+F on Mac) to the main process
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
      console.log('Ctrl+F detected in webview, forwarding to main window')
      ipcRenderer.send('webview-keyboard-shortcut', {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        key: event.key,
        serviceId: (window as any)._serviceId
      })
      // Prevent the browser's default find
      event.preventDefault()
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupKeyboardShortcuts)
} else {
  setupKeyboardShortcuts()
}

contextBridge.exposeInMainWorld('WebPortals', {
  prompt(...args: any[]) {
    return ipcRenderer.sendSync('prompt', ...args)
  },
  queryPermissionSync(
    permission:
      | 'fileSystem'
      | 'camera'
      | 'microphone'
      | 'notifications'
      | 'geolocation'
      | 'clipboardRead'
      | 'clipboardWrite',
    mode?: 'readable' | 'writable'
  ) {
    return ipcRenderer.sendSync('permission-query-sync', { permission, mode })
  },
  requestPermission(
    permission:
      | 'fileSystem'
      | 'camera'
      | 'microphone'
      | 'notifications'
      | 'geolocation'
      | 'clipboardRead'
      | 'clipboardWrite',
    mode?: 'readable' | 'writable'
  ) {
    return ipcRenderer.invoke('permission-request', { permission, mode })
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
  },
  queryFileSystemPermission(mode: 'readable' | 'writable' = 'readable') {
    return Promise.resolve(
      ipcRenderer.sendSync('permission-query-sync', { permission: 'fileSystem', mode })
    )
  },
  requestFileSystemPermission(mode: 'readable' | 'writable' = 'readable') {
    return ipcRenderer.invoke('permission-request', { permission: 'fileSystem', mode })
  }
})
