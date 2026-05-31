import { BrowserWindow, WebContentsView, webContents, type Rectangle } from 'electron'
import type { ServicePageManager } from './servicePageManager'

interface InspectorViewEntry {
  view: WebContentsView
  webContentsId: number
  bounds: Rectangle
}

export function createEmbeddedDevToolsManager(
  mainWindow: BrowserWindow,
  servicePages: ServicePageManager
) {
  const inspectorViews = new Map<string, InspectorViewEntry>()

  function destroyInspectorView(serviceId: string) {
    const inspector = inspectorViews.get(serviceId)
    if (!inspector) {
      return
    }

    if (!mainWindow.isDestroyed()) {
      mainWindow.contentView.removeChildView(inspector.view)
    }

    if (!inspector.view.webContents.isDestroyed()) {
      inspector.view.webContents.close()
    }

    inspectorViews.delete(serviceId)
  }

  function ensureInspectorView(serviceId: string, bounds: Rectangle, webContentsId: number) {
    let inspector = inspectorViews.get(serviceId)

    if (!inspector || inspector.view.webContents.isDestroyed()) {
      if (mainWindow.isDestroyed()) {
        throw new Error('Cannot create embedded DevTools view after main window was destroyed')
      }

      const view = new WebContentsView()
      view.setBackgroundColor('#ffffff')
      mainWindow.contentView.addChildView(view)
      inspector = { view, webContentsId, bounds }
      inspectorViews.set(serviceId, inspector)
    }

    inspector.webContentsId = webContentsId
    inspector.bounds = bounds
    inspector.view.setBounds(bounds)
    inspector.view.setVisible(!mainWindow.webContents.isDevToolsOpened())

    return inspector
  }

  function getInspectorBounds(inspector: InspectorViewEntry): Rectangle | null {
    if (inspector.view.webContents.isDestroyed()) {
      return null
    }

    return inspector.bounds
  }

  function hideWhenMainDevToolsOpen() {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return
    }

    if (!mainWindow.webContents.isDevToolsOpened()) {
      return
    }

    for (const inspector of inspectorViews.values()) {
      if (!inspector.view.webContents.isDestroyed()) {
        inspector.view.setVisible(false)
      }
    }
  }

  function openInspector(serviceId: string, bounds: Rectangle, throwOnMissingService: boolean) {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
      return
    }

    const inspectedContents = servicePages.getWebContents(serviceId)
    if (!inspectedContents) {
      if (throwOnMissingService) {
        throw new Error(`Invalid inspected serviceId: ${serviceId}`)
      }

      destroyInspectorView(serviceId)
      return
    }

    const webContentsId = inspectedContents.id
    const existingInspector = inspectorViews.get(serviceId)
    const hasUsableInspector =
      existingInspector !== undefined && !existingInspector.view.webContents.isDestroyed()
    const needsAttach =
      !inspectedContents.isDevToolsOpened() ||
      !hasUsableInspector ||
      existingInspector?.webContentsId !== webContentsId

    const inspector = ensureInspectorView(serviceId, bounds, webContentsId)

    if (needsAttach) {
      const previousWebview =
        existingInspector && existingInspector.webContentsId !== webContentsId
          ? webContents.fromId(existingInspector.webContentsId)
          : undefined

      if (previousWebview?.isDevToolsOpened()) {
        previousWebview.closeDevTools()
      }

      if (inspectedContents.isDevToolsOpened()) {
        inspectedContents.closeDevTools()
      }

      inspectedContents.setDevToolsWebContents(inspector.view.webContents)
      inspectedContents.openDevTools({
        mode: 'detach',
        activate: true
      })
    }

    if (!mainWindow.webContents.isDevToolsOpened()) {
      inspector.view.setVisible(true)
      inspector.view.webContents.focus()
    }
  }

  servicePages.onWebContentsChanged((serviceId) => {
    const inspector = inspectorViews.get(serviceId)
    if (!inspector) {
      return
    }

    const bounds = getInspectorBounds(inspector)
    if (!bounds) {
      destroyInspectorView(serviceId)
      return
    }

    openInspector(serviceId, bounds, false)
  })

  return {
    open(serviceId: string, bounds: Rectangle) {
      openInspector(serviceId, bounds, true)
    },
    close(serviceId: string) {
      const inspector = inspectorViews.get(serviceId)
      const webview = inspector ? webContents.fromId(inspector.webContentsId) : undefined
      if (webview?.isDevToolsOpened()) {
        webview.closeDevTools()
      }

      destroyInspectorView(serviceId)
    },
    setBounds(serviceId: string, bounds: Rectangle) {
      const inspector = inspectorViews.get(serviceId)
      if (!inspector) {
        return
      }

      if (!inspector.view.webContents.isDestroyed()) {
        inspector.bounds = bounds
        inspector.view.setBounds(bounds)
      }
    },
    setVisible(serviceId: string, visible: boolean) {
      const inspector = inspectorViews.get(serviceId)
      if (!inspector) {
        return
      }

      if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return
      }

      if (!inspector.view.webContents.isDestroyed()) {
        inspector.view.setVisible(visible && !mainWindow.webContents.isDevToolsOpened())
      }
    },
    hideWhenMainDevToolsOpen,
    isMainDevToolsOpen() {
      if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return false
      }

      return mainWindow.webContents.isDevToolsOpened()
    }
  }
}
