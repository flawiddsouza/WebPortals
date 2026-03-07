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
    ;(event.target as Element).setPointerCapture(event.pointerId)
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
