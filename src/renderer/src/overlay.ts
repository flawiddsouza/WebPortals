import type { Service } from './db'

export type AppOverlayPane = 'services' | 'permissions' | 'find' | 'screen-picker'

export interface AppOverlayRequest {
  pane: AppOverlayPane
  service?: Service
  serviceId?: string
  targetUrl?: string
}

export interface AppOverlayShapeRect {
  x: number
  y: number
  width: number
  height: number
}

function toPlainService(service: Service): Service {
  return {
    id: service.id,
    partitionId: service.partitionId,
    name: service.name,
    url: service.url,
    enabled: service.enabled,
    hidden: service.hidden,
    sortOrder: service.sortOrder
  }
}

export function openAppOverlay(request: AppOverlayRequest) {
  return window.electron.ipcRenderer.invoke('app-overlay-open', {
    ...request,
    service: request.service ? toPlainService(request.service) : undefined
  })
}

export function closeAppOverlay() {
  return window.electron.ipcRenderer.invoke('app-overlay-close')
}

export function setAppOverlayShape(rects: AppOverlayShapeRect[]) {
  return window.electron.ipcRenderer.invoke('app-overlay-set-shape', rects)
}

export function setAppOverlayMouseEvents(interactive: boolean) {
  return window.electron.ipcRenderer.invoke('app-overlay-set-mouse-events', interactive)
}

export function focusAppOverlay() {
  return window.electron.ipcRenderer.invoke('app-overlay-focus')
}

export function notifyAppOverlayDataChanged() {
  window.electron.ipcRenderer.send('app-overlay-data-changed')
}

export function notifyAppOverlayActiveServiceChanged(serviceId: string | null) {
  window.electron.ipcRenderer.send('app-overlay-active-service-changed', serviceId)
}
