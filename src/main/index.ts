import { app, BrowserWindow, Tray, Menu, screen, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import createMenu from './menu'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import windowStateKeeper from './utils/window-state'
import AutoLaunch from './utils/auto-launch'
import { initIpc } from './ipc'

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const isLinux = process.platform === 'linux'

const argv = yargs(hideBin(process.argv)).option('start-minimized', {
  type: 'boolean',
  description: 'Start the application minimized',
  default: false
}).argv

console.log('--start-minimized:', argv['start-minimized'])

let tray: Tray

function toggleWindow(mainWindow: BrowserWindow) {
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  } else if (mainWindow.isVisible() && mainWindow.isFocused()) {
    if (isMac && mainWindow.isFullScreen()) {
      mainWindow.once('show', () => mainWindow.setFullScreen(true))
      mainWindow.once('leave-full-screen', () => mainWindow.hide())
      mainWindow.setFullScreen(false)
    } else {
      mainWindow.hide()
    }
  } else {
    mainWindow.show()
    mainWindow.focus()
  }

  tray.setContextMenu(getTrayMenuTemplate(mainWindow))
}

function getTrayMenuTemplate(mainWindow: BrowserWindow) {
  const isHidden = mainWindow.isMinimized() || !mainWindow.isVisible()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isHidden ? 'Show Web Portals' : 'Hide Web Portals',
      click: () => {
        toggleWindow(mainWindow)
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  return contextMenu
}

function createTray(mainWindow: BrowserWindow) {
  let trayIcon: any = icon

  if (isMac) {
    // On macOS, create a template image (monochrome)
    const nativeImg = nativeImage.createFromPath(icon)
    // Resize to appropriate size for menu bar
    const resizedImage = nativeImg.resize({ width: 16, height: 16 })
    // Make it a template image so macOS can properly display it
    resizedImage.setTemplateImage(true)
    trayIcon = resizedImage
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Web Portals')
  tray.setContextMenu(getTrayMenuTemplate(mainWindow))
  tray.on('click', () => {
    toggleWindow(mainWindow)
  })
}

function windowOpenHandler(details: Electron.HandlerDetails) {
  import('open').then((open) => {
    open.default(details.url)
  })
  return { action: 'deny' } as const
}

function createWindow(): void {
  const workAreaSize = screen.getPrimaryDisplay().workAreaSize
  const winStateOptions = {
    defaultWidth: parseInt((workAreaSize.width * 0.75).toString()),
    defaultHeight: parseInt((workAreaSize.height * 0.75).toString()),
    defaultMaximize: true
  }
  const winState = windowStateKeeper(winStateOptions)

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    show: false,
    autoHideMenuBar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  winState.manage(mainWindow)

  const menu = createMenu(mainWindow)
  mainWindow.setMenu(menu)

  mainWindow.on('ready-to-show', () => {
    if (!argv['start-minimized']) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(windowOpenHandler)

  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.preload = join(__dirname, '..', 'preload', 'webview.js')
  })

  mainWindow.on('show', () => {
    tray.setContextMenu(getTrayMenuTemplate(mainWindow))
    if (isMac) {
      app.dock.show()
    }
  })

  mainWindow.on('hide', () => {
    tray.setContextMenu(getTrayMenuTemplate(mainWindow))
    if (isMac) {
      app.dock.hide()
    }
  })

  mainWindow.on('minimize', () => {
    tray.setContextMenu(getTrayMenuTemplate(mainWindow))
  })

  mainWindow.on('close', (event) => {
    event.preventDefault()
    mainWindow.hide()
  })

  createTray(mainWindow)

  initIpc(mainWindow)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  app.on('second-instance', () => {
    console.log('Second instance was opened, showing the existing window and focusing it')
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
    mainWindow.show()
  })
}

// start application on startup
if (!is.dev) {
  if (isWindows || isMac) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--start-minimized'] // only supported by windows
    })
  }

  if (isLinux) {
    const autolauncher = new AutoLaunch({
      name: 'Web Portals',
      options: {
        extraArgs: ['--start-minimized']
      }
    })

    autolauncher
      .isEnabled()
      .then((isEnabled) => {
        if (!isEnabled) {
          autolauncher.enable()
        }
      })
      .catch((err) => {
        console.error('AutoLaunch error:', err)
      })
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.flawiddsouza.WebPortals')

  const isSingleInstance = app.requestSingleInstanceLock()

  if (!isSingleInstance) {
    app.quit()
    return
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(windowOpenHandler)
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', function () {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.removeAllListeners('close')
      win.close()
    })
    tray.destroy()
  })
})
