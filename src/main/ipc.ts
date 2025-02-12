import { BrowserWindow, ipcMain, webContents } from 'electron'
import prompt from 'custom-electron-prompt'

export function initIpc(mainWindow: BrowserWindow) {
  ipcMain.on('prompt', async (event, label) => {
    const result = await prompt({
      title: 'Prompt',
      label: label
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
}
