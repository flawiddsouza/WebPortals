const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const root = join(__dirname, '..')

test('webview preload does not hijack service page drag gestures with pointer capture', () => {
  const source = readFileSync(join(root, 'src/preload/webview.ts'), 'utf8')

  assert.doesNotMatch(source, /setPointerCapture/)
  assert.doesNotMatch(source, /hasPointerCapture/)
})

test('webview preload does not change native window state during draggable gestures', () => {
  const source = readFileSync(join(root, 'src/preload/webview.ts'), 'utf8')

  assert.doesNotMatch(source, /setupNativeDragOverlaySuspension/)
  assert.doesNotMatch(source, /service-page-native-drag-gesture-started/)
  assert.doesNotMatch(source, /service-page-native-drag-gesture-ended/)
})
