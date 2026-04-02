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

// In a normal browser, text selection continues even when you drag the cursor
// outside the page. This works because the browser internally calls
// setPointerCapture when selection starts, routing all subsequent pointer events
// to the element regardless of cursor position.
//
// In Electron, webviews run as OOPIFs (out-of-process iframes). When the cursor
// moves from the webview into the parent frame (e.g. the sidebar), the parent
// process receives pointer events instead of the webview process — so selection
// cuts off. Electron doesn't propagate pointer capture cross-process automatically.
//
// Calling setPointerCapture explicitly here replicates that behavior: it tells
// Chromium to keep routing pointer events to the webview process even when the
// cursor is physically over the parent frame.
document.addEventListener('pointerdown', (event) => {
  if (event.button === 0 && event.target) {
    const target = event.target as Element
    // Skip inputs: they have internal shadow-DOM controls (e.g. the clear button
    // on input[type=search]) whose clicks are broken by pointer capture.
    // Inputs manage their own pointer events natively, so they don't need this.
    if (target.tagName === 'INPUT') return
    target.setPointerCapture(event.pointerId)
  }
})

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
