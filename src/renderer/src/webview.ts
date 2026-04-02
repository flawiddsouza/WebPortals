export interface ServiceWebview extends HTMLElement {
  reload: () => void
  loadURL: (url: string) => void
  getURL: () => string
  getWebContentsId: () => number
  executeJavaScript: (code: string) => void
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
}

export function getServiceWebview(serviceId: string) {
  return document.querySelector(`.webview[data-service-id="${serviceId}"]`) as ServiceWebview | null
}
