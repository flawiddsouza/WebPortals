import { BrowserWindow, ipcMain, webContents, desktopCapturer, screen } from 'electron'
import prompt from 'custom-electron-prompt'

export function initIpc(mainWindow: BrowserWindow) {
  ipcMain.on('prompt', async (event, label, defaultValue) => {
    const result = await prompt({
      title: 'Prompt',
      label,
      value: defaultValue,
    })
    event.returnValue = result
  })

  ipcMain.on('notificationClick', async (_event, serviceId) => {
    mainWindow.webContents.send('makeServiceActive', serviceId)

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (mainWindow.isVisible() && mainWindow.isFocused()) {
      // do nothing
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  ipcMain.handle('openDevTools', async (_event, webContentsId) => {
    const webview = webContents.fromId(webContentsId)
    if (!webview) {
      throw new Error(`Invalid webContentsId: ${webContentsId}`)
    }

    // event.sender === mainWindow.webContents

    // event.sender.openDevTools({
    //   mode: 'right'
    // })

    // while (!event.sender.devToolsWebContents) {
    //   await new Promise(resolve => setTimeout(resolve, 100));
    // }

    // webview.setDevToolsWebContents(event.sender.devToolsWebContents)

    webview.openDevTools()

    while (!webview.devToolsWebContents) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    webview.devToolsWebContents.focus()
  })

  ipcMain.handle('get-screens', async () => {
    const displays = screen.getAllDisplays()
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: {
          width: 320,
          height: 180
        }
      })

      // Map sources with display information for better selection UI
      return {
        displays,
        sources: sources.map((source) => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL(),
          type: source.id.includes('screen') ? 'screen' : 'window',
          display: source.display_id
            ? displays.find((d) => d.id.toString() === source.display_id)
            : null
        }))
      }
    } catch (error) {
      console.error('Error getting screen sources:', error)
      throw error
    }
  })

  ipcMain.handle('get-mediastream-constraints', async (_event, sourceId: string) => {
    // These constraints work better for screen sharing
    return {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080
        }
      }
    }
  })

  ipcMain.handle('request-screen-picker', (_event, serviceId) => {
    console.log('Received request-screen-picker for service:', serviceId)
    return new Promise((resolve, reject) => {
      try {
        // Send event to renderer to show screen picker
        mainWindow.webContents.send('request-screen-sharing', serviceId)

        // Set up a one-time handler for the response
        ipcMain.handleOnce('screen-picker-response', (_event, result) => {
          console.log('Got screen-picker-response:', result ? 'result available' : 'no result')
          resolve(result)
        })
      } catch (error) {
        console.error('Error in request-screen-picker:', error)
        reject(error)
      }
    })
  })

  ipcMain.on('webview-keyboard-shortcut', (_event, shortcutData) => {
    mainWindow.webContents.send('process-keyboard-shortcut', shortcutData)
  })
}
