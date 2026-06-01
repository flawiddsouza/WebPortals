const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const root = join(__dirname, '..')

test('idle app startup parks the transparent overlay offscreen without parenting it', () => {
  const source = readFileSync(join(root, 'src/main/index.ts'), 'utf8')

  assert.doesNotMatch(
    source,
    /mainWindow\.on\('show'[\s\S]*?overlayWindow\.showInactive\(\)[\s\S]*?\}\)/
  )
  assert.match(source, /x: -10000[\s\S]*?y: -10000[\s\S]*?width: 1[\s\S]*?height: 1/)
  assert.doesNotMatch(source, /parent: mainWindow/)
  assert.match(
    source,
    /function parkOverlayWindow\(overlayWindow: BrowserWindow\)[\s\S]*?overlayWindow\.setParentWindow\(null\)[\s\S]*?x: -10000[\s\S]*?overlayWindow\.showInactive\(\)[\s\S]*?\}/
  )
  assert.match(
    source,
    /overlayWindow\.webContents\.once\('did-finish-load'[\s\S]*?parkOverlayWindow\(overlayWindow\)[\s\S]*?\}\)/
  )
  assert.match(
    source,
    /const syncBounds = \(\) => \{[\s\S]*?if \(overlayWindow\.getParentWindow\(\)\)[\s\S]*?syncOverlayWindowBounds\(mainWindow, overlayWindow\)[\s\S]*?\}/
  )
  assert.doesNotMatch(source, /function showIdleOverlayWindow/)
  assert.doesNotMatch(source, /function setInertOverlayShape/)
})

test('closing or emptying the app overlay parks the transparent overlay offscreen', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.doesNotMatch(source, /const inertOverlayShape/)
  assert.doesNotMatch(source, /rects\.length === 0[\s\S]*?overlayWindow\.hide\(\)/)
  assert.match(
    source,
    /if \(rects\.length === 0\) \{[\s\S]*?detachOverlayFromMainWindow\(\)[\s\S]*?return[\s\S]*?\}/
  )
  assert.match(
    source,
    /ipcMain\.handle\('app-overlay-close'[\s\S]*?setOverlayShape\(\[\]\)[\s\S]*?\}/
  )
})

test('active overlay regions show the transparent overlay window', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.match(
    source,
    /if \(!overlayWindow\.isVisible\(\)\) \{[\s\S]*?overlayWindow\.showInactive\(\)[\s\S]*?\}/
  )
})

test('native-shaped partial overlays stay clickable without blocking the full window', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.doesNotMatch(
    source,
    /ipcMain\.handle\('app-overlay-set-mouse-events'[\s\S]*?process\.platform !== 'darwin'/
  )
  assert.match(
    source,
    /function supportsNativeOverlayShape\(\) \{[\s\S]*?process\.platform === 'win32' \|\| process\.platform === 'linux'[\s\S]*?\}/
  )
  assert.match(
    source,
    /if \(!interactive && supportsNativeOverlayShape\(\) && overlayShapeRects\.length > 0\) \{[\s\S]*?interactive = true[\s\S]*?\}/
  )
  assert.match(
    source,
    /const coversWindow = rects\.some\(\(rect\) => rectCoversWindow\(rect, bounds\)\)/
  )
  assert.match(source, /setOverlayMouseEvents\(coversWindow \|\| supportsNativeOverlayShape\(\)\)/)
})

test('full-window modal overlay shape follows overlay window resize', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.match(source, /let overlayBounds = overlayWindow\.getBounds\(\)/)
  assert.match(
    source,
    /function syncFullOverlayShapeToWindowBounds\(\) \{[\s\S]*?const previousBounds = overlayBounds[\s\S]*?const nextBounds = overlayWindow\.getBounds\(\)[\s\S]*?overlayBounds = nextBounds[\s\S]*?hadFullWindowShape[\s\S]*?width: nextBounds\.width[\s\S]*?height: nextBounds\.height[\s\S]*?applyNativeOverlayShape\(\)[\s\S]*?setOverlayMouseEvents\(true\)[\s\S]*?\}/
  )
  assert.match(source, /overlayWindow\.on\('resize', syncFullOverlayShapeToWindowBounds\)/)
  assert.match(source, /overlayWindow\.on\('resized', syncFullOverlayShapeToWindowBounds\)/)
})

test('native overlay shape writes are centralized', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.match(
    source,
    /function applyNativeOverlayShape\(\) \{[\s\S]*?supportsNativeOverlayShape\(\)[\s\S]*?overlayWindow\.setShape\(overlayShapeRects\)[\s\S]*?\}/
  )
  assert.doesNotMatch(source, /overlayWindow\.setShape\(rects\)/)
})

test('unchanged overlay shapes do not repeat native window mutations', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.match(
    source,
    /function sameOverlayShape\(left: Rectangle\[\], right: Rectangle\[\]\) \{[\s\S]*?left\.length !== right\.length[\s\S]*?left\.every[\s\S]*?x === rightRect\.x[\s\S]*?height === rightRect\.height[\s\S]*?\}/
  )
  assert.match(
    source,
    /const shapeChanged = !sameOverlayShape\(overlayShapeRects, rects\)[\s\S]*?if \(!shapeChanged && overlayWindow\.isVisible\(\) && overlayWindow\.getParentWindow\(\) === mainWindow\) \{[\s\S]*?return[\s\S]*?\}/
  )
})

test('service page native drag gestures do not mutate app overlay visibility', () => {
  const source = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')

  assert.doesNotMatch(source, /overlayHiddenForServicePageDrag/)
  assert.doesNotMatch(source, /hideOverlayDuringServicePageDrag/)
  assert.doesNotMatch(source, /restoreOverlayAfterServicePageDrag/)
  assert.doesNotMatch(source, /service-page-native-drag-gesture-started/)
  assert.doesNotMatch(source, /service-page-native-drag-gesture-ended/)
})

test('download manager changes refresh the overlay shape', () => {
  const overlaySource = readFileSync(join(root, 'src/renderer/src/OverlayApp.vue'), 'utf8')
  const downloadManagerSource = readFileSync(
    join(root, 'src/renderer/src/components/DownloadManager.vue'),
    'utf8'
  )

  assert.match(overlaySource, /<DownloadManager\s+@changed="refreshShape"\s+\/>/)
  assert.match(downloadManagerSource, /defineEmits<\{\s+changed: \[\]\s+\}>/)
  assert.match(downloadManagerSource, /emit\('changed'\)/)
})

test('modal overlays are shown after renderer content is ready', () => {
  const mainSource = readFileSync(join(root, 'src/main/ipc.ts'), 'utf8')
  const overlaySource = readFileSync(join(root, 'src/renderer/src/OverlayApp.vue'), 'utf8')
  const mainOpenStart = mainSource.indexOf('async function openOverlay')
  const mainOpenEnd = mainSource.indexOf("overlayWindow.webContents.on('before-input-event'", mainOpenStart)

  assert.notEqual(mainOpenStart, -1)
  assert.notEqual(mainOpenEnd, -1)
  const mainOpenBody = mainSource.slice(mainOpenStart, mainOpenEnd)
  assert.doesNotMatch(mainOpenBody, /setOverlayShape\(\[\{ x: 0, y: 0/)
  assert.doesNotMatch(mainOpenBody, /overlayWindow\.focus\(\)/)
  assert.match(mainOpenBody, /overlayWindow\.webContents\.send\('app-overlay-open', request\)/)
  assert.match(
    overlaySource,
    /pane\.value = request\.pane[\s\S]*?await refreshShape\(\)[\s\S]*?await focusAppOverlay\(\)/
  )
})

test('overlay shape refresh does not depend only on requestAnimationFrame', () => {
  const overlaySource = readFileSync(join(root, 'src/renderer/src/OverlayApp.vue'), 'utf8')
  const refreshShapeMatch = overlaySource.match(
    /async function refreshShape\(\) \{([\s\S]*?)\n\}/
  )

  assert.ok(refreshShapeMatch)
  const refreshShapeBody = refreshShapeMatch[1]
  assert.ok(refreshShapeBody.indexOf('reportShape()') < refreshShapeBody.indexOf('requestAnimationFrame'))
})

test('opening find explicitly focuses the find input even when it was already visible', () => {
  const overlaySource = readFileSync(join(root, 'src/renderer/src/OverlayApp.vue'), 'utf8')

  assert.match(
    overlaySource,
    /function focusFindInput\(\) \{[\s\S]*?focusAppOverlay\(\)[\s\S]*?findInPageRef\.value\?\.focus\(\)[\s\S]*?\}/
  )
  assert.match(
    overlaySource,
    /if \(request\.pane === 'find'\) \{[\s\S]*?focusFindInput\(\)[\s\S]*?return/
  )
})
