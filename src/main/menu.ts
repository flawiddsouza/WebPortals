import { Menu, type MenuItemConstructorOptions, BrowserWindow, app, dialog } from 'electron'

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
            dialog.showMessageBox(mainWindow, {
              message: 'WebPortals',
              detail: `Version: ${app.getVersion()}\nElectron Version: ${process.versions.electron}\nChromium Version: ${process.versions.chrome}`,
              buttons: ['OK', 'Open GitHub Release'],
              cancelId: 0
            }).then(({ response }) => {
              if (response === 1) {
                const releaseUrl = `https://github.com/flawiddsouza/WebPortals/releases/tag/v${app.getVersion()}`;
                import('open').then((open) => {
                  open.default(releaseUrl)
                })
              }
            });
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
