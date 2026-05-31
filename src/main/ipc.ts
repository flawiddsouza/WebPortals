import {
  BrowserWindow,
  Menu,
  ipcMain,
  desktopCapturer,
  screen,
  type MenuItemConstructorOptions,
  type Rectangle
} from 'electron'
import prompt from 'custom-electron-prompt'
import { DownloadManager } from './downloads'
import { createEmbeddedDevToolsManager } from './embeddedDevTools'
import type { ServicePageManager } from './servicePageManager'
import type { ManagedServicePage, ServicePageBounds } from './servicePageTypes'
import {
  type ManagedPermission,
  type FileSystemAccessMode,
  listServicePermissions,
  parseOrigin,
  queryPermissionForSession,
  requestPermissionForSession,
  updateServicePermission
} from './permissions'

type ServiceContextMenuCommand =
  | 'reload'
  | 'reload-partition'
  | 'toggle-popout'
  | 'inspect'
  | 'find'
  | 'permissions'
  | 'toggle-enabled'
  | 'toggle-hidden'

type AppOverlayPane = 'services' | 'permissions' | 'find' | 'screen-picker'

export function initIpc(
  mainWindow: BrowserWindow,
  downloadManager: DownloadManager,
  servicePages: ServicePageManager,
  overlayWindow: BrowserWindow
) {
  const embeddedDevTools = createEmbeddedDevToolsManager(mainWindow, servicePages)
  let overlayReadyPromise: Promise<void> | null = null
  let overlayInteractive: boolean | null = null

  function waitForOverlayReady() {
    if (!overlayWindow.webContents.isLoading()) {
      return Promise.resolve()
    }

    overlayReadyPromise ??= new Promise<void>((resolve) => {
      overlayWindow.webContents.once('did-finish-load', () => {
        overlayReadyPromise = null
        resolve()
      })
    })

    return overlayReadyPromise
  }

  function setOverlayMouseEvents(interactive: boolean) {
    if (overlayWindow.isDestroyed()) {
      return
    }

    if (overlayInteractive === interactive) {
      return
    }

    overlayInteractive = interactive
    if (interactive) {
      overlayWindow.setIgnoreMouseEvents(false)
    } else {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  function rectCoversWindow(rect: Rectangle, bounds: Rectangle) {
    return rect.x <= 0 && rect.y <= 0 && rect.width >= bounds.width && rect.height >= bounds.height
  }

  function setOverlayShape(rects: Rectangle[]) {
    if (overlayWindow.isDestroyed()) {
      return
    }

    const bounds = overlayWindow.getBounds()

    if (rects.length === 0) {
      if (process.platform === 'win32' || process.platform === 'linux') {
        overlayWindow.setShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }])
      }
      setOverlayMouseEvents(false)
      return
    }

    if (process.platform === 'darwin') {
      setOverlayMouseEvents(rects.some((rect) => rectCoversWindow(rect, bounds)))
      return
    }

    setOverlayMouseEvents(true)
    if (process.platform === 'win32' || process.platform === 'linux') {
      overlayWindow.setShape(rects)
    }
  }

  async function openOverlay(request: {
    pane: AppOverlayPane
    service?: ManagedServicePage
    serviceId?: string
    targetUrl?: string
  }) {
    await waitForOverlayReady()
    if (overlayWindow.isDestroyed()) {
      return
    }

    const bounds = mainWindow.getContentBounds()
    overlayWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
    if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive()
    }
    setOverlayShape([{ x: 0, y: 0, width: bounds.width, height: bounds.height }])
    overlayWindow.focus()
    overlayWindow.webContents.send('app-overlay-open', request)
  }

  overlayWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape' || overlayWindow.isDestroyed()) {
      return
    }

    event.preventDefault()
    overlayWindow.webContents.send('app-overlay-escape')
  })

  ipcMain.on('prompt', async (event, label, defaultValue) => {
    const result = await prompt({
      title: 'Prompt',
      label,
      value: defaultValue
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

  ipcMain.handle('openDevTools', async (_event, serviceId: string, bounds: Rectangle) => {
    embeddedDevTools.open(serviceId, bounds)
  })

  ipcMain.handle('closeDevTools', async (_event, serviceId: string) => {
    embeddedDevTools.close(serviceId)
  })

  ipcMain.handle('setDevToolsBounds', async (_event, serviceId: string, bounds: Rectangle) => {
    embeddedDevTools.setBounds(serviceId, bounds)
  })

  ipcMain.handle('setDevToolsVisible', async (_event, serviceId: string, visible: boolean) => {
    embeddedDevTools.setVisible(serviceId, visible)
  })

  ipcMain.handle(
    'permissions-list',
    async (_event, target: { partitionId: string; url: string }) => {
      return listServicePermissions(target)
    }
  )

  ipcMain.handle(
    'permissions-update',
    async (
      _event,
      input: {
        partitionId: string
        url: string
        permission: ManagedPermission
        mode?: FileSystemAccessMode
        decision: 'ask' | 'allow' | 'block'
      }
    ) => {
      return updateServicePermission(input)
    }
  )

  ipcMain.on(
    'permission-query-sync',
    (
      event,
      input: {
        permission: ManagedPermission
        mode?: FileSystemAccessMode
      }
    ) => {
      const requestUrl = event.senderFrame?.url || event.sender.getURL()
      const origin = parseOrigin(requestUrl)
      event.returnValue = queryPermissionForSession(
        event.sender.session,
        origin,
        input.permission,
        input.mode
      )
    }
  )

  ipcMain.handle(
    'permission-request',
    async (
      event,
      input: {
        permission: ManagedPermission
        mode?: FileSystemAccessMode
      }
    ) => {
      const requestUrl = event.senderFrame?.url || event.sender.getURL()
      const origin = parseOrigin(requestUrl)
      return requestPermissionForSession(
        mainWindow,
        event.sender.session,
        origin,
        input.permission,
        input.mode
      )
    }
  )

  mainWindow.webContents.on('devtools-opened', () => {
    embeddedDevTools.hideWhenMainDevToolsOpen()
    mainWindow.webContents.send('main-devtools-visibility', true)
  })

  mainWindow.webContents.on('devtools-closed', () => {
    embeddedDevTools.hideWhenMainDevToolsOpen()
    mainWindow.webContents.send('main-devtools-visibility', false)
  })

  ipcMain.handle('isMainDevToolsOpen', async () => {
    return embeddedDevTools.isMainDevToolsOpen()
  })

  ipcMain.handle(
    'app-overlay-open',
    async (
      _event,
      request: {
        pane: AppOverlayPane
        service?: ManagedServicePage
        serviceId?: string
        targetUrl?: string
      }
    ) => {
      await openOverlay(request)
    }
  )

  ipcMain.handle('app-overlay-close', async () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.focus()
    }
  })

  ipcMain.handle('app-overlay-set-shape', async (_event, rects: Rectangle[]) => {
    setOverlayShape(rects)
  })

  ipcMain.handle('app-overlay-set-mouse-events', async (_event, interactive: boolean) => {
    if (process.platform !== 'darwin') {
      return
    }

    setOverlayMouseEvents(interactive)
  })

  ipcMain.handle('app-overlay-focus', async () => {
    if (overlayWindow.isDestroyed()) {
      return
    }

    if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive()
    }
    overlayWindow.focus()
  })

  ipcMain.on('app-overlay-data-changed', () => {
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('app-overlay-data-changed')
    }
  })

  ipcMain.on('app-overlay-active-service-changed', (_event, serviceId: string | null) => {
    if (!overlayWindow.isDestroyed() && !overlayWindow.webContents.isDestroyed()) {
      overlayWindow.webContents.send('app-overlay-active-service-changed', serviceId)
    }
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
        void openOverlay({ pane: 'screen-picker', serviceId }).catch(reject)

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

  ipcMain.handle('download-cancel', (_event, downloadId: string) => {
    return downloadManager.cancelDownload(downloadId)
  })

  ipcMain.handle('download-open', (_event, savePath: string) => {
    downloadManager.openDownload(savePath)
  })

  ipcMain.handle('download-show-in-folder', (_event, savePath: string) => {
    downloadManager.showInFolder(savePath)
  })

  ipcMain.handle('download-pause', (_event, downloadId: string) => {
    return downloadManager.pauseDownload(downloadId)
  })

  ipcMain.handle('download-resume', (_event, downloadId: string) => {
    return downloadManager.resumeDownload(downloadId)
  })

  ipcMain.handle('download-retry', (_event, downloadId: string) => {
    return downloadManager.retryDownload(downloadId)
  })

  ipcMain.handle(
    'service-context-menu',
    (
      event,
      input: {
        x: number
        y: number
        enabled: boolean
        hidden: boolean
        poppedOut: boolean
      }
    ) => {
      return new Promise<ServiceContextMenuCommand | null>((resolve) => {
        let selectedCommand: ServiceContextMenuCommand | null = null
        const setSelectedCommand = (command: ServiceContextMenuCommand) => {
          selectedCommand = command
        }

        const template: MenuItemConstructorOptions[] = [
          {
            label: 'Reload',
            enabled: input.enabled,
            click: () => setSelectedCommand('reload')
          },
          {
            label: 'Reload Partition',
            enabled: input.enabled,
            click: () => setSelectedCommand('reload-partition')
          },
          {
            label: input.poppedOut ? 'Bring Back Here' : 'Pop Out',
            enabled: input.enabled,
            click: () => setSelectedCommand('toggle-popout')
          },
          {
            label: 'Inspect',
            enabled: input.enabled,
            click: () => setSelectedCommand('inspect')
          },
          {
            label: 'Find in Page',
            enabled: input.enabled,
            click: () => setSelectedCommand('find')
          },
          {
            label: 'Permissions',
            click: () => setSelectedCommand('permissions')
          },
          {
            label: input.enabled ? 'Disable' : 'Enable',
            click: () => setSelectedCommand('toggle-enabled')
          },
          {
            label: input.hidden ? 'Unhide' : 'Hide',
            click: () => setSelectedCommand('toggle-hidden')
          }
        ]

        const sourceWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
        Menu.buildFromTemplate(template).popup({
          window: sourceWindow,
          x: Math.round(input.x),
          y: Math.round(input.y),
          callback: () => resolve(selectedCommand)
        })
      })
    }
  )

  ipcMain.handle('service-pages-sync', (_event, services: ManagedServicePage[]) => {
    servicePages.syncServices(services)
  })

  ipcMain.handle('service-page-activate', (_event, serviceId: string) => {
    return servicePages.activate(serviceId)
  })

  ipcMain.handle('service-page-set-bounds', (_event, bounds: ServicePageBounds) => {
    servicePages.setHostBounds(bounds)
  })

  ipcMain.handle('service-page-pop-out', (_event, serviceId: string) => {
    return servicePages.popOut(serviceId)
  })

  ipcMain.handle('service-page-focus-popout', (_event, serviceId: string) => {
    return servicePages.focusPopout(serviceId)
  })

  ipcMain.handle('service-page-bring-back', (_event, serviceId: string) => {
    return servicePages.bringBack(serviceId)
  })

  ipcMain.handle('service-page-reload', (_event, serviceId: string) => {
    return servicePages.reload(serviceId)
  })

  ipcMain.handle('service-page-get-state', (_event, serviceId: string) => {
    return servicePages.getState(serviceId)
  })

  ipcMain.handle(
    'service-page-find-start',
    (
      _event,
      serviceId: string,
      text: string,
      options?: { forward?: boolean; findNext?: boolean }
    ) => {
      const contents = servicePages.getWebContents(serviceId)
      if (!contents || !text) {
        return
      }

      return contents.findInPage(text, options)
    }
  )

  ipcMain.handle('service-page-find-stop', (_event, serviceId: string) => {
    const contents = servicePages.getWebContents(serviceId)
    contents?.stopFindInPage('clearSelection')
  })
}
