import { BrowserWindow, WebContentsView, webContents, type Rectangle } from 'electron'

interface InspectorViewEntry {
  view: WebContentsView
  webContentsId: number
}

export function createEmbeddedDevToolsManager(mainWindow: BrowserWindow) {
  const inspectorViews = new Map<string, InspectorViewEntry>()

  function destroyInspectorView(serviceId: string) {
    const inspector = inspectorViews.get(serviceId)
    if (!inspector) {
      return
    }

    mainWindow.contentView.removeChildView(inspector.view)

    if (!inspector.view.webContents.isDestroyed()) {
      inspector.view.webContents.close()
    }

    inspectorViews.delete(serviceId)
  }

  function ensureInspectorView(serviceId: string, bounds: Rectangle, webContentsId: number) {
    let inspector = inspectorViews.get(serviceId)

    if (!inspector || inspector.view.webContents.isDestroyed()) {
      const view = new WebContentsView()
      view.setBackgroundColor('#ffffff')
      mainWindow.contentView.addChildView(view)
      inspector = { view, webContentsId }
      inspectorViews.set(serviceId, inspector)
    }

    inspector.webContentsId = webContentsId
    inspector.view.setBounds(bounds)
    inspector.view.setVisible(!mainWindow.webContents.isDevToolsOpened())

    return inspector
  }

  function hideWhenMainDevToolsOpen() {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      return
    }

    for (const inspector of inspectorViews.values()) {
      inspector.view.setVisible(false)
    }
  }

  return {
    open(serviceId: string, webContentsId: number, bounds: Rectangle) {
      const webview = webContents.fromId(webContentsId)
      if (!webview) {
        throw new Error(`Invalid inspected webContentsId: ${webContentsId}`)
      }

      const existingInspector = inspectorViews.get(serviceId)
      const hasUsableInspector =
        existingInspector !== undefined && !existingInspector.view.webContents.isDestroyed()
      const needsAttach =
        !webview.isDevToolsOpened() ||
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

        if (webview.isDevToolsOpened()) {
          webview.closeDevTools()
        }

        webview.setDevToolsWebContents(inspector.view.webContents)
        webview.openDevTools({
          mode: 'detach',
          activate: true
        })
      }

      if (!mainWindow.webContents.isDevToolsOpened()) {
        inspector.view.setVisible(true)
        inspector.view.webContents.focus()
      }
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

      inspector.view.setBounds(bounds)
    },
    setVisible(serviceId: string, visible: boolean) {
      const inspector = inspectorViews.get(serviceId)
      if (!inspector) {
        return
      }

      inspector.view.setVisible(visible && !mainWindow.webContents.isDevToolsOpened())
    },
    hideWhenMainDevToolsOpen,
    isMainDevToolsOpen() {
      return mainWindow.webContents.isDevToolsOpened()
    }
  }
}
