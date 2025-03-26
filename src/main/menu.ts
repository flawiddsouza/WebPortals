import { Menu, type MenuItemConstructorOptions, BrowserWindow } from 'electron'

export default function createMenu(mainWindow: BrowserWindow) {
  const menuTemplate: MenuItemConstructorOptions[] = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      role: 'viewMenu',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomIn', accelerator: 'CommandOrControl+=', visible: false },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CommandOrControl+B',
          click: () => {
            mainWindow.webContents.send('toggle-sidebar')
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            console.log('About clicked')
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    menuTemplate.unshift({ role: 'appMenu' })
  }

  return Menu.buildFromTemplate(menuTemplate)
}
