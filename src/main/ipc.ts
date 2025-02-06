import { BrowserWindow, ipcMain } from 'electron'
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
}
