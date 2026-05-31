import { BrowserWindow, WebContentsView, type Rectangle, type WebContents } from 'electron'
import { join } from 'path'
import contextMenu from 'electron-context-menu'
import type { DownloadManager } from './downloads'
import { configurePermissions } from './permissions'
import { toFriendlyServicePageFailure } from './servicePageErrors'
import { buildServicePageInjection } from './servicePageInjection'
import type {
  ManagedServicePage,
  ServicePageBounds,
  ServicePageFailure,
  ServicePageState
} from './servicePageTypes'

interface ServicePageEntry {
  service: ManagedServicePage
  view: WebContentsView
  placement: 'embedded' | 'popped-out'
  loading: boolean
  failure: ServicePageFailure | null
  popoutWindow: BrowserWindow | null
  attachedToMainHost: boolean
  attachedToPopout: boolean
}

type ServicePageFailureReason =
  | 'crashed'
  | 'killed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure'
  | 'clean-exit'
  | 'abnormal-exit'
  | 'memory-eviction'

export interface ServicePageManager {
  syncServices(services: ManagedServicePage[]): void
  activate(serviceId: string): ServicePageState | null
  setHostBounds(bounds: ServicePageBounds): void
  popOut(serviceId: string): ServicePageState | null
  focusPopout(serviceId: string): ServicePageState | null
  bringBack(serviceId: string): ServicePageState | null
  reload(serviceId: string): ServicePageState | null
  getState(serviceId: string): ServicePageState | null
  getWebContents(serviceId: string): WebContents | null
  onWebContentsChanged(listener: (serviceId: string) => void): () => void
  destroyAll(): void
  setQuitting(quitting: boolean): void
}

export interface ServicePageManagerOptions {
  appIcon: string
  isWindows: boolean
  windowOpenHandler: (details: Electron.HandlerDetails) => Electron.WindowOpenHandlerResponse
}

function clampBounds(bounds: Rectangle): Rectangle {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height))
  }
}

function hasUsableBounds(bounds: Rectangle): boolean {
  return bounds.width > 0 && bounds.height > 0
}

function persistPartition(partitionId: string) {
  return `persist:${partitionId}`
}

function stripServicePageUserAgent(userAgent: string): string {
  return userAgent
    .replaceAll(/(WebPortals\/[0-9.]+|Electron\/[0-9.]+)\s*/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function toRenderProcessGoneFailure(reason: ServicePageFailureReason): ServicePageFailure {
  return {
    title: 'Service page stopped working',
    message: 'Reload the service to try again.',
    raw: `render-process-gone:${reason}`
  }
}

function toLoadUrlFailure(error: unknown): ServicePageFailure {
  return {
    title: 'Service page failed to load',
    message: 'Reload the service to try again.',
    raw: error instanceof Error ? error.message : String(error)
  }
}

export function createServicePageManager(
  mainWindow: BrowserWindow,
  downloadManager: DownloadManager,
  options: ServicePageManagerOptions
): ServicePageManager {
  const entries = new Map<string, ServicePageEntry>()
  const webContentsChangedListeners = new Set<(serviceId: string) => void>()
  const replacingWebContentsServiceIds = new Set<string>()
  let activeServiceId: string | null = null
  let hostBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
  let quitting = false

  function hasLiveWebContents(entry: ServicePageEntry): boolean {
    return !entry.view.webContents.isDestroyed()
  }

  function toState(entry: ServicePageEntry): ServicePageState {
    const contents = entry.view.webContents
    const hasLiveContents = !contents.isDestroyed()

    return {
      serviceId: entry.service.id,
      placement: entry.placement,
      loading: entry.loading,
      failure: entry.failure,
      currentUrl: hasLiveContents ? contents.getURL() : '',
      title: hasLiveContents ? contents.getTitle() : ''
    }
  }

  function emitState(entry: ServicePageEntry) {
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('service-page-state', toState(entry))
    }
  }

  function emitWebContentsChanged(serviceId: string) {
    for (const listener of webContentsChangedListeners) {
      listener(serviceId)
    }
  }

  function removeFromMainHost(entry: ServicePageEntry) {
    if (entry.attachedToMainHost && !mainWindow.isDestroyed()) {
      mainWindow.contentView.removeChildView(entry.view)
      entry.attachedToMainHost = false
    }
    entry.view.setVisible(false)
  }

  function removeFromPopout(entry: ServicePageEntry) {
    if (entry.attachedToPopout && entry.popoutWindow && !entry.popoutWindow.isDestroyed()) {
      entry.popoutWindow.contentView.removeChildView(entry.view)
      entry.attachedToPopout = false
    }
  }

  function attachToMainHost(entry: ServicePageEntry) {
    if (!hasLiveWebContents(entry)) {
      entry.view.setVisible(false)
      return
    }

    if (
      entry.placement !== 'embedded' ||
      !hasUsableBounds(hostBounds) ||
      mainWindow.isDestroyed()
    ) {
      entry.view.setVisible(false)
      return
    }

    if (!entry.attachedToMainHost) {
      mainWindow.contentView.addChildView(entry.view)
      entry.attachedToMainHost = true
    }

    entry.view.setBounds(hostBounds)
    entry.view.setVisible(true)
    entry.view.webContents.focus()
  }

  function detachInactiveEmbeddedViews() {
    for (const entry of entries.values()) {
      if (entry.service.id !== activeServiceId && entry.placement === 'embedded') {
        removeFromMainHost(entry)
      }
    }
  }

  function resizeViewToPopout(entry: ServicePageEntry) {
    if (!entry.popoutWindow || entry.popoutWindow.isDestroyed()) {
      return
    }

    const contentBounds = entry.popoutWindow.getContentBounds()
    entry.view.setBounds({
      x: 0,
      y: 0,
      width: contentBounds.width,
      height: contentBounds.height
    })
  }

  function clearStalePopoutWindow(entry: ServicePageEntry) {
    entry.popoutWindow = null
    entry.attachedToPopout = false

    if (entry.placement !== 'popped-out') {
      return
    }

    entry.placement = 'embedded'

    if (activeServiceId === entry.service.id) {
      attachToMainHost(entry)
    } else {
      entry.view.setVisible(false)
    }
  }

  function getLivePopoutWindow(entry: ServicePageEntry): BrowserWindow | null {
    if (!entry.popoutWindow) {
      return null
    }

    if (entry.popoutWindow.isDestroyed()) {
      clearStalePopoutWindow(entry)
      return null
    }

    return entry.popoutWindow
  }

  function focusPopoutWindow(entry: ServicePageEntry): boolean {
    const popoutWindow = getLivePopoutWindow(entry)
    if (!popoutWindow) {
      return false
    }

    popoutWindow.show()
    popoutWindow.focus()
    return true
  }

  function injectServicePage(entry: ServicePageEntry, view: WebContentsView) {
    if (entry.view !== view || view.webContents.isDestroyed()) {
      return
    }

    view.webContents
      .executeJavaScript(buildServicePageInjection(entry.service.id))
      .catch((error) => {
        console.warn(`[service-page:${entry.service.id}] Failed to inject page script`, error)
      })
  }

  function createView(service: ManagedServicePage): WebContentsView {
    const partition = persistPartition(service.partitionId)
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'webview.js'),
        sandbox: false,
        partition,
        defaultFontFamily: options.isWindows ? { monospace: 'Consolas' } : undefined
      }
    })

    view.setBackgroundColor('#ffffff')
    configurePermissions(mainWindow, partition)
    view.webContents.setWindowOpenHandler(options.windowOpenHandler)
    downloadManager.setupDownloadHandler(view.webContents)
    contextMenu({ window: view.webContents, showInspectElement: false })
    view.webContents.setUserAgent(stripServicePageUserAgent(view.webContents.getUserAgent()))

    return view
  }

  function registerViewEvents(entry: ServicePageEntry, view: WebContentsView) {
    view.webContents.on('did-start-loading', () => {
      if (entry.view !== view) return

      entry.loading = true
      entry.failure = null
      emitState(entry)
    })

    view.webContents.on('dom-ready', () => {
      injectServicePage(entry, view)
    })

    view.webContents.on('did-finish-load', () => {
      if (entry.view !== view) return

      entry.loading = false
      emitState(entry)
    })

    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      if (entry.view !== view) return
      if (errorCode === -3) return

      entry.loading = false
      entry.failure = toFriendlyServicePageFailure(errorDescription)
      emitState(entry)
    })

    view.webContents.on('did-navigate', (_event, url) => {
      if (entry.view !== view) return

      if (!url.startsWith('chrome-error://')) {
        entry.failure = null
      }
      emitState(entry)
    })

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      if (entry.view !== view) return

      if (!url.startsWith('chrome-error://')) {
        entry.failure = null
      }
      emitState(entry)
    })

    view.webContents.on('page-title-updated', () => {
      if (entry.view !== view) return

      emitState(entry)
    })

    view.webContents.on('found-in-page', (_event, result) => {
      if (entry.view !== view) return

      BrowserWindow.getAllWindows().forEach((window) => {
        if (window.webContents.isDestroyed()) return

        window.webContents.send('service-page-found-in-page', {
          serviceId: entry.service.id,
          result
        })
      })
    })

    view.webContents.on('render-process-gone', (_event, details) => {
      if (entry.view !== view) return

      entry.loading = false
      entry.failure = toRenderProcessGoneFailure(details.reason)
      emitState(entry)
    })

    view.webContents.once('destroyed', () => {
      if (entry.view !== view) return
      if (replacingWebContentsServiceIds.has(entry.service.id)) return

      emitWebContentsChanged(entry.service.id)
    })
  }

  function loadEntryUrl(entry: ServicePageEntry) {
    if (!hasLiveWebContents(entry)) {
      return
    }

    const view = entry.view
    const url = entry.service.url

    view.webContents.loadURL(url).catch((error) => {
      console.warn(`[service-page:${entry.service.id}] Failed to load ${url}`, error)

      if (entry.view !== view || entry.service.url !== url || view.webContents.isDestroyed()) {
        return
      }

      if (entry.failure) {
        return
      }

      entry.loading = false
      entry.failure = toLoadUrlFailure(error)
      emitState(entry)
    })
  }

  function createEntry(service: ManagedServicePage): ServicePageEntry {
    const view = createView(service)
    const entry: ServicePageEntry = {
      service,
      view,
      placement: 'embedded',
      loading: true,
      failure: null,
      popoutWindow: null,
      attachedToMainHost: false,
      attachedToPopout: false
    }

    registerViewEvents(entry, view)
    loadEntryUrl(entry)

    return entry
  }

  function destroyEntryView(entry: ServicePageEntry) {
    removeFromPopout(entry)
    removeFromMainHost(entry)

    if (!entry.view.webContents.isDestroyed()) {
      entry.view.webContents.close()
    }
  }

  function destroyEntry(entry: ServicePageEntry) {
    const popoutWindow = entry.popoutWindow

    destroyEntryView(entry)

    if (popoutWindow && !popoutWindow.isDestroyed()) {
      popoutWindow.removeAllListeners('close')
      popoutWindow.removeAllListeners('closed')
      popoutWindow.destroy()
    }

    entry.popoutWindow = null
    entry.attachedToPopout = false
  }

  function attachRecreatedView(entry: ServicePageEntry) {
    if (entry.placement === 'popped-out') {
      const popoutWindow = getLivePopoutWindow(entry)
      if (popoutWindow) {
        popoutWindow.contentView.addChildView(entry.view)
        entry.attachedToPopout = true
        resizeViewToPopout(entry)
        entry.view.setVisible(true)
        return
      }

      entry.popoutWindow = null
      entry.attachedToPopout = false
      entry.placement = 'embedded'
    }

    if (activeServiceId === entry.service.id) {
      attachToMainHost(entry)
    } else {
      entry.view.setVisible(false)
    }
  }

  function recreateEntryView(entry: ServicePageEntry) {
    replacingWebContentsServiceIds.add(entry.service.id)
    try {
      destroyEntryView(entry)
      entry.view = createView(entry.service)
    } finally {
      replacingWebContentsServiceIds.delete(entry.service.id)
    }
    registerViewEvents(entry, entry.view)
    entry.loading = true
    entry.failure = null
    attachRecreatedView(entry)
    loadEntryUrl(entry)
    emitState(entry)
    emitWebContentsChanged(entry.service.id)
  }

  const manager: ServicePageManager = {
    syncServices(services) {
      const activeServices = services.filter((service) => service.enabled && !service.hidden)
      const activeServiceIds = new Set(activeServices.map((service) => service.id))

      for (const [serviceId, entry] of entries) {
        if (!activeServiceIds.has(serviceId)) {
          destroyEntry(entry)
          entries.delete(serviceId)
          emitWebContentsChanged(serviceId)
        }
      }

      for (const service of activeServices) {
        const entry = entries.get(service.id)
        if (entry) {
          const partitionChanged = entry.service.partitionId !== service.partitionId
          const urlChanged = entry.service.url !== service.url

          entry.service = service

          if (partitionChanged) {
            recreateEntryView(entry)
            continue
          }

          if (urlChanged) {
            entry.loading = true
            entry.failure = null
            if (hasLiveWebContents(entry)) {
              loadEntryUrl(entry)
            } else {
              recreateEntryView(entry)
            }
          }

          emitState(entry)
          continue
        }

        entries.set(service.id, createEntry(service))
      }

      if (activeServiceId && !entries.has(activeServiceId)) {
        activeServiceId = null
      }
    },

    activate(serviceId) {
      const entry = entries.get(serviceId)
      if (!entry) {
        return null
      }

      activeServiceId = serviceId
      detachInactiveEmbeddedViews()

      if (entry.placement === 'popped-out') {
        focusPopoutWindow(entry)
      } else {
        attachToMainHost(entry)
      }

      emitState(entry)
      return toState(entry)
    },

    setHostBounds(bounds) {
      hostBounds = clampBounds(bounds)
      const entry = activeServiceId ? entries.get(activeServiceId) : null

      if (entry?.placement === 'embedded') {
        attachToMainHost(entry)
        emitState(entry)
      }
    },

    popOut(serviceId) {
      const entry = entries.get(serviceId)
      if (!entry) {
        return null
      }

      if (entry.placement === 'popped-out') {
        focusPopoutWindow(entry)
        return toState(entry)
      }

      if (!hasLiveWebContents(entry)) {
        recreateEntryView(entry)
      }

      removeFromMainHost(entry)

      const popoutWindow = new BrowserWindow({
        width: Math.max(900, hostBounds.width || 900),
        height: Math.max(700, hostBounds.height || 700),
        show: false,
        autoHideMenuBar: false,
        icon: options.appIcon
      })

      entry.placement = 'popped-out'
      entry.popoutWindow = popoutWindow

      popoutWindow.contentView.addChildView(entry.view)
      entry.attachedToPopout = true
      resizeViewToPopout(entry)
      entry.view.setVisible(true)

      popoutWindow.on('resize', () => {
        const bounds = popoutWindow.getContentBounds()
        entry.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
      })

      popoutWindow.on('close', (event) => {
        if (quitting) {
          return
        }

        event.preventDefault()
        manager.bringBack(serviceId)
      })

      popoutWindow.once('closed', () => {
        if (entry.popoutWindow !== popoutWindow) {
          return
        }

        clearStalePopoutWindow(entry)
        emitState(entry)
      })

      popoutWindow.show()
      if (hasLiveWebContents(entry)) {
        entry.view.webContents.focus()
      }
      emitState(entry)
      return toState(entry)
    },

    focusPopout(serviceId) {
      const entry = entries.get(serviceId)
      if (!entry) {
        return null
      }

      if (entry.placement === 'popped-out') {
        focusPopoutWindow(entry)
      }

      emitState(entry)
      return toState(entry)
    },

    bringBack(serviceId) {
      const entry = entries.get(serviceId)
      if (!entry) {
        return null
      }

      const popoutWindow = entry.popoutWindow
      removeFromPopout(entry)

      entry.popoutWindow = null
      entry.attachedToPopout = false
      entry.placement = 'embedded'

      if (popoutWindow && !popoutWindow.isDestroyed()) {
        popoutWindow.removeAllListeners('close')
        popoutWindow.destroy()
      }

      if (activeServiceId === serviceId) {
        attachToMainHost(entry)
      } else {
        entry.view.setVisible(false)
      }

      emitState(entry)
      return toState(entry)
    },

    reload(serviceId) {
      const entry = entries.get(serviceId)
      if (!entry) {
        return null
      }

      entry.loading = true
      entry.failure = null
      if (!hasLiveWebContents(entry)) {
        recreateEntryView(entry)
      } else {
        loadEntryUrl(entry)
      }
      emitState(entry)
      return toState(entry)
    },

    getState(serviceId) {
      const entry = entries.get(serviceId)
      return entry ? toState(entry) : null
    },

    getWebContents(serviceId) {
      const entry = entries.get(serviceId)
      if (!entry || entry.view.webContents.isDestroyed()) {
        return null
      }

      return entry.view.webContents
    },

    onWebContentsChanged(listener) {
      webContentsChangedListeners.add(listener)
      return () => {
        webContentsChangedListeners.delete(listener)
      }
    },

    destroyAll() {
      for (const [serviceId, entry] of entries) {
        destroyEntry(entry)
        emitWebContentsChanged(serviceId)
      }

      entries.clear()
      activeServiceId = null
    },

    setQuitting(value) {
      quitting = value
    }
  }

  return manager
}
