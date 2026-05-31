export interface ManagedServicePage {
  id: string
  partitionId: string
  name: string
  url: string
  enabled: boolean
  hidden: boolean
}

export interface ServicePageFailure {
  title: string
  message: string
  raw: string
}

export type ServicePagePlacement = 'embedded' | 'popped-out'

export interface ServicePageState {
  serviceId: string
  placement: ServicePagePlacement
  loading: boolean
  failure: ServicePageFailure | null
  currentUrl: string
  title: string
}

export interface ServicePageBounds {
  x: number
  y: number
  width: number
  height: number
}

function toPlainManagedServicePage(service: ManagedServicePage): ManagedServicePage {
  return {
    id: service.id,
    partitionId: service.partitionId,
    name: service.name,
    url: service.url,
    enabled: service.enabled,
    hidden: service.hidden
  }
}

export function syncServicePages(services: ManagedServicePage[]) {
  return window.electron.ipcRenderer.invoke(
    'service-pages-sync',
    services.map(toPlainManagedServicePage)
  )
}

export function activateServicePage(serviceId: string): Promise<ServicePageState | null> {
  return window.electron.ipcRenderer.invoke('service-page-activate', serviceId)
}

export function setServicePageBounds(bounds: ServicePageBounds) {
  return window.electron.ipcRenderer.invoke('service-page-set-bounds', bounds)
}

export function popOutServicePage(serviceId: string): Promise<ServicePageState | null> {
  return window.electron.ipcRenderer.invoke('service-page-pop-out', serviceId)
}

export function focusServicePopout(serviceId: string): Promise<ServicePageState | null> {
  return window.electron.ipcRenderer.invoke('service-page-focus-popout', serviceId)
}

export function bringBackServicePage(serviceId: string): Promise<ServicePageState | null> {
  return window.electron.ipcRenderer.invoke('service-page-bring-back', serviceId)
}

export function reloadServicePage(serviceId: string): Promise<ServicePageState | null> {
  return window.electron.ipcRenderer.invoke('service-page-reload', serviceId)
}

export function getServicePageState(serviceId: string): Promise<ServicePageState | null> {
  return window.electron.ipcRenderer.invoke('service-page-get-state', serviceId)
}
