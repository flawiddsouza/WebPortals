import { app, shell, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'

interface Download {
  id: string
  filename: string
  totalBytes: number
  receivedBytes: number
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'
  savePath: string
  url: string
  canResume: boolean
  session: Electron.Session
  item?: Electron.DownloadItem
}

interface PendingRetry {
  downloadId: string
  savePath: string
  session: Electron.Session
  url: string
}

export class DownloadManager {
  private downloads = new Map<string, Download>()
  private mainWindow: BrowserWindow
  private registeredSessions = new Set<Electron.Session>()
  private pendingRetries: PendingRetry[] = []

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setupDownloadHandler(webContents: Electron.WebContents) {
    const session = webContents.session
    if (this.registeredSessions.has(session)) return
    this.registeredSessions.add(session)

    session.on('will-download', (_event, item) => {
      const pendingRetry = this.consumePendingRetry(session, item.getURL())
      const downloadId = pendingRetry?.downloadId ?? randomUUID()
      const defaultPath = join(app.getPath('downloads'), item.getFilename())
      const filePath = pendingRetry?.savePath

      const download: Download = {
        id: downloadId,
        filename: item.getFilename(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: item.getReceivedBytes(),
        state: item.isPaused() ? 'paused' : 'progressing',
        savePath: filePath ?? '',
        url: item.getURL(),
        canResume: item.canResume(),
        session,
        item
      }

      this.downloads.set(downloadId, download)

      // Attach listeners before starting the download so we never miss fast events
      item.on('updated', (_event, state) => {
        const d = this.findDownloadByItem(item)
        if (!d) return

        this.syncDownloadFromItem(d, item)
        d.state = this.resolveDownloadState(item, state)
        this.notifyRenderer('download-progress', d)
      })

      item.once('done', (_event, state) => {
        const d = this.findDownloadByItem(item)
        if (!d) return

        this.syncDownloadFromItem(d, item)
        d.state = state as Download['state']
        this.notifyRenderer('download-done', d)
        if (state !== 'interrupted') {
          this.downloads.delete(d.id)
        }
      })

      if (filePath) {
        item.setSavePath(filePath)
      } else {
        item.setSaveDialogOptions({
          defaultPath,
          buttonLabel: 'Save'
        })
      }

      this.notifyRenderer('download-started', download)
    })
  }

  private findDownloadByItem(item: Electron.DownloadItem): Download | undefined {
    for (const d of this.downloads.values()) {
      if (d.item === item) return d
    }
    return undefined
  }

  private consumePendingRetry(session: Electron.Session, url: string): PendingRetry | undefined {
    const retryIndex = this.pendingRetries.findIndex(
      (retry) => retry.session === session && retry.url === url
    )
    if (retryIndex === -1) return undefined

    const [retry] = this.pendingRetries.splice(retryIndex, 1)
    return retry
  }

  private syncDownloadFromItem(download: Download, item: Electron.DownloadItem) {
    download.receivedBytes = item.getReceivedBytes()
    download.totalBytes = item.getTotalBytes()
    download.canResume = item.canResume()

    const savePath = item.getSavePath()
    if (savePath) {
      download.savePath = savePath
      download.filename = basename(savePath)
      return
    }

    download.filename = item.getFilename()
  }

  private resolveDownloadState(
    item: Electron.DownloadItem,
    state: 'progressing' | 'interrupted'
  ): Download['state'] {
    if (state === 'interrupted') return 'interrupted'
    if (item.isPaused()) return 'paused'
    return state as Download['state']
  }

  private notifyRenderer(event: string, download: Download) {
    this.mainWindow.webContents.send(event, {
      id: download.id,
      filename: download.filename,
      totalBytes: download.totalBytes,
      receivedBytes: download.receivedBytes,
      state: download.state,
      savePath: download.savePath,
      canResume: download.canResume
    })
  }

  pauseDownload(downloadId: string): boolean {
    const d = this.downloads.get(downloadId)
    if (d?.item && d.item.getState() === 'progressing' && !d.item.isPaused()) {
      d.item.pause()
      d.state = 'paused'
      d.canResume = d.item.canResume()
      this.notifyRenderer('download-progress', d)
      return true
    }
    return false
  }

  resumeDownload(downloadId: string): boolean {
    const d = this.downloads.get(downloadId)
    if (
      d?.item &&
      (d.item.isPaused() || d.item.getState() === 'interrupted') &&
      d.item.canResume()
    ) {
      d.item.resume()
      d.state = 'progressing'
      d.canResume = d.item.canResume()
      this.notifyRenderer('download-progress', d)
      return true
    }
    return false
  }

  retryDownload(downloadId: string): boolean {
    const d = this.downloads.get(downloadId)
    if (!d || d.state !== 'interrupted') return false

    if (d.item?.canResume()) {
      d.item.resume()
      d.state = 'progressing'
      d.canResume = d.item.canResume()
      this.notifyRenderer('download-progress', d)
      return true
    }

    this.pendingRetries.push({
      downloadId: d.id,
      savePath: d.savePath,
      session: d.session,
      url: d.url
    })

    d.state = 'progressing'
    d.receivedBytes = 0
    d.totalBytes = 0
    d.canResume = false
    this.notifyRenderer('download-progress', d)
    d.session.downloadURL(d.url)
    return true
  }

  cancelDownload(downloadId: string): boolean {
    const d = this.downloads.get(downloadId)
    if (!d) return false

    if (d.item && !['cancelled', 'completed'].includes(d.item.getState())) {
      d.state = 'cancelled'
      d.canResume = false
      d.item.cancel()
      return true
    }

    this.downloads.delete(downloadId)
    this.notifyRenderer('download-done', d)
    return true
  }

  openDownload(savePath: string) {
    shell.openPath(savePath)
  }

  showInFolder(savePath: string) {
    shell.showItemInFolder(savePath)
  }
}
