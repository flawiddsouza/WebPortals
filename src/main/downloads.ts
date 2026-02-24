import { app, dialog, shell, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'

interface Download {
  id: string
  filename: string
  totalBytes: number
  receivedBytes: number
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'
  savePath: string
  item?: Electron.DownloadItem
}

export class DownloadManager {
  private downloads = new Map<string, Download>()
  private mainWindow: BrowserWindow
  private registeredSessions = new Set<Electron.Session>()

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  setupDownloadHandler(webContents: Electron.WebContents) {
    const session = webContents.session
    if (this.registeredSessions.has(session)) return
    this.registeredSessions.add(session)

    session.on('will-download', (_event, item) => {
      const downloadId = randomUUID()
      const defaultPath = join(app.getPath('downloads'), item.getFilename())

      // Using the sync dialog keeps the handler alive so the default dialog never appears
      const filePath = dialog.showSaveDialogSync(this.mainWindow, {
        defaultPath,
        buttonLabel: 'Save'
      })

      if (!filePath) {
        item.cancel()
        return
      }

      const download: Download = {
        id: downloadId,
        filename: basename(filePath),
        totalBytes: item.getTotalBytes(),
        receivedBytes: item.getReceivedBytes(),
        state: item.isPaused() ? 'paused' : 'progressing',
        savePath: filePath,
        item
      }

      this.downloads.set(downloadId, download)

      // Attach listeners before starting the download so we never miss fast events
      item.on('updated', (_event, state) => {
        const d = this.findDownloadByItem(item)
        if (!d) return

        d.receivedBytes = item.getReceivedBytes()
        d.totalBytes = item.getTotalBytes()
        d.state = item.isPaused() ? 'paused' : (state as any)
        this.notifyRenderer('download-progress', d)
      })

      item.once('done', (_event, state) => {
        const d = this.findDownloadByItem(item)
        if (!d) return

        d.state = state as any
        this.notifyRenderer('download-done', d)
      })

      item.setSavePath(filePath)

      this.notifyRenderer('download-started', download)
    })
  }

  private findDownloadByItem(item: Electron.DownloadItem): Download | undefined {
    for (const d of this.downloads.values()) {
      if (d.item === item) return d
    }
    return undefined
  }

  private notifyRenderer(event: string, download: Download) {
    this.mainWindow.webContents.send(event, {
      id: download.id,
      filename: download.filename,
      totalBytes: download.totalBytes,
      receivedBytes: download.receivedBytes,
      state: download.state,
      savePath: download.savePath
    })
  }

  pauseDownload(downloadId: string): boolean {
    const d = this.downloads.get(downloadId)
    if (d?.item && !d.item.isPaused() && d.item.canResume()) {
      d.item.pause()
      d.state = 'paused'
      this.notifyRenderer('download-progress', d)
      return true
    }
    return false
  }

  resumeDownload(downloadId: string): boolean {
    const d = this.downloads.get(downloadId)
    if (d?.item && d.item.isPaused() && d.item.canResume()) {
      d.item.resume()
      d.state = 'progressing'
      this.notifyRenderer('download-progress', d)
      return true
    }
    return false
  }

  cancelDownload(downloadId: string) {
    const d = this.downloads.get(downloadId)
    if (d?.item) {
      d.item.cancel()
    }
    this.downloads.delete(downloadId)
  }

  openDownload(savePath: string) {
    shell.openPath(savePath)
  }

  showInFolder(savePath: string) {
    shell.showItemInFolder(savePath)
  }
}
