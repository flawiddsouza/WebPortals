const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { existsSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const test = require('node:test')
const electronPath = require('electron')
const { _electron: electron } = require('playwright-core')

const root = join(__dirname, '..', '..')
const builtAppMain = join(root, 'out', 'main', 'index.js')

async function launchWebPortalsApp() {
  assert.ok(existsSync(builtAppMain), 'Run npm run build before this test so out/main/index.js exists')

  const userDataDir = mkdtempSync(join(tmpdir(), 'webportals-e2e-'))
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [builtAppMain],
    env: {
      ...process.env,
      WEBPORTALS_USER_DATA_DIR: userDataDir
    }
  })

  return { electronApp, userDataDir }
}

async function closeWebPortalsApp(appHandle) {
  await appHandle.electronApp.close()
  rmSync(appHandle.userDataDir, { recursive: true, force: true })
}

async function getMainAppWindow(electronApp) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    for (const window of electronApp.windows()) {
      if (!(await window.url()).includes('overlay=1')) {
        return window
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Timed out waiting for WebPortals main window')
}

async function installAppDragService(window, service) {
  await window.waitForSelector('.service-page-host')
  return window.evaluate(async (inputService) => {
    localStorage.setItem(
      'partitions',
      JSON.stringify([{ id: inputService.partitionId, name: inputService.name }])
    )
    localStorage.setItem('services', JSON.stringify([inputService]))
    localStorage.setItem('activeServiceId', inputService.id)

    await window.electron.ipcRenderer.invoke('service-pages-sync', [inputService])
    const host = document.querySelector('.service-page-host')
    if (!host) {
      throw new Error('Missing .service-page-host')
    }
    const rect = host.getBoundingClientRect()
    await window.electron.ipcRenderer.invoke('service-page-set-bounds', {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    })
    return window.electron.ipcRenderer.invoke('service-page-activate', inputService.id)
  }, service)
}

async function waitForServiceTitle(electronApp, titlePrefix, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const title = await electronApp.evaluate(({ webContents }, prefix) => {
      return (
        webContents
          .getAllWebContents()
          .map((item) => item.getTitle())
          .find((item) => item.startsWith(prefix)) ?? null
      )
    }, titlePrefix)

    if (title) {
      return title
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(message)
}

async function getServiceElementCenter(electronApp, titlePrefix, selector) {
  return electronApp.evaluate(async ({ webContents }, input) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getTitle().startsWith(input.titlePrefix))

    if (!contents) {
      throw new Error(`Unable to find service webContents for ${input.titlePrefix}`)
    }

    const selectorLiteral = JSON.stringify(input.selector)
    return contents.executeJavaScript(`
      (() => {
        const element = document.querySelector(${selectorLiteral});
        if (!element) throw new Error('Missing element: ' + ${selectorLiteral});
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      })()
    `)
  }, { titlePrefix, selector })
}

async function getServiceDragDetails(electronApp, titlePrefix) {
  return electronApp.evaluate(async ({ webContents }, prefix) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getTitle().startsWith(prefix))

    return contents?.executeJavaScript(`({
      title: document.title,
      events: window.__dragEvents,
      order: Array.from(document.querySelectorAll('.todo-item')).map((item) => item.innerText.trim())
    })`)
  }, titlePrefix)
}

async function getMainAppBrowserWindowInfo(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (item) => !item.webContents.getURL().includes('overlay=1')
    )
    if (!window) {
      throw new Error('Unable to find main WebPortals window')
    }

    return {
      hwnd: Number(window.getNativeWindowHandle().readBigUInt64LE(0)),
      contentBounds: window.getContentBounds(),
      focused: window.isFocused()
    }
  })
}

async function forceForegroundBrowserWindow(electronApp) {
  const windowInfo = await getMainAppBrowserWindowInfo(electronApp)
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class ForegroundWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$hwnd = [IntPtr]::new([long]${windowInfo.hwnd})
[ForegroundWindow]::ShowWindow($hwnd, 9) | Out-Null
[ForegroundWindow]::SetForegroundWindow($hwnd) | Out-Null
`

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

function sendNativeMouseDrag(hwnd, from, to) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeMouse {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

$hwnd = [IntPtr]::new([long]${hwnd})
[NativeMouse]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 100
[NativeMouse]::SetCursorPos(${from.x}, ${from.y}) | Out-Null
Start-Sleep -Milliseconds 150
[NativeMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 250

$steps = 28
for ($i = 1; $i -le $steps; $i++) {
  $x = [int](${from.x} + ((${to.x} - ${from.x}) * $i / $steps))
  $y = [int](${from.y} + ((${to.y} - ${from.y}) * $i / $steps))
  [NativeMouse]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 25
}

Start-Sleep -Milliseconds 500
[NativeMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

test(
  'WebPortals app service page supports native Windows pragmatic-style table reorder',
  {
    timeout: 30000,
    skip: process.platform !== 'win32' ? 'native mouse input helper is Windows-only' : false
  },
  async () => {
    const appHandle = await launchWebPortalsApp()

    try {
      const window = await getMainAppWindow(appHandle.electronApp)
      await window.waitForLoadState('domcontentloaded')

      const serviceHtml = `
      <!doctype html>
      <html>
        <head>
          <title>native-pragmatic-table-ready</title>
          <style>
            html, body { width: 100%; height: 100%; margin: 0; font-family: Arial, sans-serif; }
            body { padding: 24px 32px; box-sizing: border-box; overflow: auto; }
            .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
            .tab { border: 0; padding: 8px 14px; font-weight: 600; }
            .tab.active { color: white; background: #6574e8; }
            h1 { margin: 0 0 14px; font-size: 30px; }
            table { border-collapse: collapse; table-layout: fixed; width: 1180px; }
            th, td { border: 1px solid #8f8f8f; padding: 4px 6px; vertical-align: top; }
            th { text-align: center; }
            .count { width: 48px; text-align: center; }
            .current { background: #ffefa3; height: 140px; }
            .todo-list { min-height: 108px; }
            .todo-item {
              min-height: 21px;
              display: flex;
              align-items: center;
              color: black;
              cursor: grab;
              user-select: none;
            }
            .todo-item.dragging { opacity: 0.45; }
            .todo-item.drag-over { outline: 2px solid #ef4444; }
            .todo-text {
              appearance: none;
              border: 0;
              background: transparent;
              padding: 0;
              color: inherit;
              font: inherit;
              text-align: left;
              cursor: inherit;
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <span>&larr; Back to Todo Groups</span>
            <button class="tab active">Table</button>
            <button class="tab">Kanban</button>
            <button class="tab">Calendar</button>
          </div>
          <h1>Test</h1>
          <table>
            <tbody>
              <tr><td>27-May-26</td><td>Wednesday</td><td class="count">0</td><td></td><td></td><td></td></tr>
              <tr><td>28-May-26</td><td>Thursday</td><td class="count">0</td><td></td><td></td><td></td></tr>
              <tr><td>29-May-26</td><td>Friday</td><td class="count">0</td><td></td><td></td><td></td></tr>
              <tr class="current">
                <td>01-Jun-26</td>
                <td>Monday</td>
                <td class="count">4</td>
                <td>
                  <div id="todo-list" class="todo-list">
                    <div class="todo-item" draggable="true" data-id="bat-1"><button class="todo-text" type="button">bat (1)</button></div>
                    <div class="todo-item" draggable="true" data-id="cat-2"><button class="todo-text" type="button">cat (2)</button></div>
                    <div class="todo-item" draggable="true" data-id="bat-2"><button class="todo-text" type="button">bat (2)</button></div>
                    <div class="todo-item" draggable="true" data-id="cat-1"><button class="todo-text" type="button">cat (1)</button></div>
                  </div>
                </td>
                <td></td>
                <td></td>
              </tr>
              <tr class="current"><td>02-Jun-26</td><td>Tuesday</td><td class="count">0</td><td></td><td></td><td></td></tr>
            </tbody>
          </table>
          <script>
            const nativeDataKey = 'application/vnd.pdnd'
            const list = document.getElementById('todo-list')
            window.__dragEvents = []

            function itemTexts() {
              return Array.from(document.querySelectorAll('.todo-item')).map((item) => item.innerText.trim())
            }

            function record(label) {
              window.__dragEvents.push(label)
            }

            function setupItem(item) {
              item.addEventListener('dragstart', (event) => {
                record('dragstart')
                item.classList.add('dragging')
                event.dataTransfer.setData(nativeDataKey, '')
              })

              item.addEventListener('dragenter', (event) => {
                record('dragenter')
                if (event.dataTransfer.types.includes(nativeDataKey)) item.classList.add('drag-over')
              })

              item.addEventListener('dragover', (event) => {
                record('dragover')
                if (!event.dataTransfer.types.includes(nativeDataKey)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              })

              item.addEventListener('dragleave', () => {
                record('dragleave')
                item.classList.remove('drag-over')
              })

              item.addEventListener('drop', (event) => {
                record('drop')
                event.preventDefault()
                const source = document.querySelector('.todo-item.dragging')
                item.classList.remove('drag-over')
                if (!source || source === item) return
                list.insertBefore(source, item)
                document.title = 'native-pragmatic-table-dropped:' + itemTexts().join(',')
              })

              item.addEventListener('dragend', () => {
                record('dragend')
                document.querySelectorAll('.todo-item').forEach((element) => {
                  element.classList.remove('dragging')
                  element.classList.remove('drag-over')
                })
              })
            }

            document.querySelectorAll('.todo-item').forEach(setupItem)
          </script>
        </body>
      </html>
    `

      await installAppDragService(window, {
        id: 'native-pragmatic-table-service',
        partitionId: 'native-pragmatic-table-partition',
        name: 'Native Pragmatic Table Service',
        url: 'data:text/html;charset=utf-8,' + encodeURIComponent(serviceHtml),
        enabled: true,
        hidden: false
      })

      await waitForServiceTitle(
        appHandle.electronApp,
        'native-pragmatic-table-ready',
        10000,
        'Timed out waiting for pragmatic table fixture'
      )

      const sourceCenter = await getServiceElementCenter(
        appHandle.electronApp,
        'native-pragmatic-table-ready',
        '[data-id="cat-2"] .todo-text'
      )
      const targetCenter = await getServiceElementCenter(
        appHandle.electronApp,
        'native-pragmatic-table-ready',
        '[data-id="bat-1"] .todo-text'
      )

      await appHandle.electronApp.evaluate(({ BrowserWindow, webContents }, titlePrefix) => {
        const window = BrowserWindow.getAllWindows().find(
          (item) => !item.webContents.getURL().includes('overlay=1')
        )
        window?.show()
        window?.focus()
        webContents
          .getAllWebContents()
          .find((item) => item.getTitle().startsWith(titlePrefix))
          ?.focus()
      }, 'native-pragmatic-table-ready')

      await window.bringToFront()
      await forceForegroundBrowserWindow(appHandle.electronApp)
      await new Promise((resolve) => setTimeout(resolve, 500))

      const windowInfo = await getMainAppBrowserWindowInfo(appHandle.electronApp)
      const hostRect = await window.evaluate(() => {
        const element = document.querySelector('.service-page-host')
        if (!element) throw new Error('Missing .service-page-host')
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y }
      })
      const from = {
        x: Math.round(windowInfo.contentBounds.x + hostRect.x + sourceCenter.x),
        y: Math.round(windowInfo.contentBounds.y + hostRect.y + sourceCenter.y)
      }
      const to = {
        x: Math.round(windowInfo.contentBounds.x + hostRect.x + targetCenter.x),
        y: Math.round(windowInfo.contentBounds.y + hostRect.y + targetCenter.y)
      }

      sendNativeMouseDrag(windowInfo.hwnd, from, to)

      const deadline = Date.now() + 5000
      let dropped = false
      while (Date.now() < deadline) {
        dropped = await appHandle.electronApp.evaluate(({ webContents }) => {
          return webContents
            .getAllWebContents()
            .some((item) => item.getTitle().startsWith('native-pragmatic-table-dropped:'))
        })
        if (dropped) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const details = await getServiceDragDetails(appHandle.electronApp, 'native-pragmatic-table')
      if (!dropped) {
        throw new Error(
          `Timed out waiting for pragmatic table reorder; details=${JSON.stringify(
            details
          )}; points=${JSON.stringify({ from, to, hostRect, sourceCenter, targetCenter, windowInfo })}`
        )
      }

      assert.ok(details.events.includes('dragstart'), JSON.stringify(details))
      assert.ok(details.events.includes('dragover'), JSON.stringify(details))
      assert.ok(details.events.includes('drop'), JSON.stringify(details))
      assert.deepEqual(details.order.slice(0, 2), ['cat (2)', 'bat (1)'])
    } finally {
      await closeWebPortalsApp(appHandle)
    }
  }
)
