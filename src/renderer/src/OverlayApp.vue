<template>
  <div
    class="overlay-root"
    :class="{ 'overlay-root--modal': pane !== null }"
    @click.self="handleRootClick"
    @keydown.esc="closeTopOverlay"
    @mousemove="handleOverlayMouseMove"
    @mouseleave="setOverlayInteractive(false)"
  >
    <div
      v-show="findVisible"
      ref="findSurfaceRef"
      class="overlay-surface overlay-surface--find"
      tabindex="-1"
      @focusin="markFindFocused"
      @focusout="handleFindFocusOut"
    >
      <FindInPage
        ref="findInPageRef"
        v-model:visible="findVisible"
        :activate-search-on-show="activateFindSearchOnShow"
        :focus-on-show="focusFindOnShow"
        :webview-id="visibleFindServiceId"
      />
    </div>

    <div v-if="pane" ref="modalSurfaceRef" class="overlay-surface" tabindex="-1">
      <div class="overlay-panel">
        <ManageServices
          v-if="pane === 'services'"
          v-model:services="services"
          v-model:show-partition-manager="showPartitionManager"
          :partitions="partitions"
          @update:services="handleServicesChanged"
          @manage-permissions="openPermissions"
        />

        <ManagePermissions
          v-else-if="pane === 'permissions'"
          :service="permissionService"
          :target-url="permissionTargetUrl"
        />

        <ScreenPicker
          v-else-if="pane === 'screen-picker'"
          :service-id="activeScreenShareServiceId"
          @cancel="cancelScreenSharing"
          @selected="handleScreenSelected"
        />
      </div>
    </div>

    <div v-if="stackedPane" class="overlay-stack-layer" @click.self="closeTopOverlay">
      <div ref="stackedSurfaceRef" class="overlay-surface overlay-surface--stacked" tabindex="-1">
        <div class="overlay-panel">
          <ManagePartitions
            v-if="stackedPane === 'partitions'"
            v-model:partitions="partitions"
            @update:partitions="handlePartitionsChanged"
          />
          <ManagePermissions
            v-else-if="stackedPane === 'permissions'"
            :service="stackedPermissionService"
            :target-url="stackedPermissionTargetUrl"
          />
        </div>
      </div>
    </div>

    <div ref="downloadManagerRef" class="overlay-download-host">
      <DownloadManager />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Partition, Service } from './db'
import { getPartitions, getServices } from './db'
import DownloadManager from './components/DownloadManager.vue'
import FindInPage from './components/FindInPage.vue'
import ManagePartitions from './components/ManagePartitions.vue'
import ManagePermissions from './components/ManagePermissions.vue'
import ManageServices from './components/ManageServices.vue'
import ScreenPicker from './components/ScreenPicker.vue'
import {
  closeAppOverlay,
  focusAppOverlay,
  notifyAppOverlayDataChanged,
  setAppOverlayShape,
  setAppOverlayMouseEvents,
  type AppOverlayPane,
  type AppOverlayRequest,
  type AppOverlayShapeRect
} from './overlay'

type ModalPane = Exclude<AppOverlayPane, 'find'>

const pane = ref<ModalPane | null>(null)
const services = ref<Service[]>([])
const partitions = ref<Partition[]>([])
const showPartitionManager = ref(false)
const stackedPane = ref<'partitions' | 'permissions' | null>(null)
const permissionService = ref<Service | null>(null)
const permissionTargetUrl = ref('')
const stackedPermissionService = ref<Service | null>(null)
const stackedPermissionTargetUrl = ref('')
const findVisible = ref(false)
const activateFindSearchOnShow = ref(true)
const focusFindOnShow = ref(true)
const activeServiceId = ref<string | null>(null)
const activeFindServiceId = ref<string | null>(null)
const findServiceIds = reactive(new Set<string>())
const focusedFindServiceIds = reactive(new Set<string>())
const activeScreenShareServiceId = ref('')
const findInPageRef = ref<{ focus: () => void } | null>(null)
const findSurfaceRef = ref<HTMLElement | null>(null)
const modalSurfaceRef = ref<HTMLElement | null>(null)
const stackedSurfaceRef = ref<HTMLElement | null>(null)
const downloadManagerRef = ref<HTMLElement | null>(null)
let removeOverlayOpenListener: (() => void) | null = null
let removeActiveServiceChangedListener: (() => void) | null = null
let removeWindowBoundsChangedListener: (() => void) | null = null
let removeOverlayEscapeListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let overlayInteractive = false
let lastMousePosition: { x: number; y: number } | null = null
let pendingFindFocusClear: ReturnType<typeof setTimeout> | null = null

const visibleFindServiceId = computed(() => {
  return findVisible.value ? activeFindServiceId.value : null
})

async function loadData() {
  partitions.value = await getPartitions()
  services.value = await getServices()
}

function elementShape(element: HTMLElement | null): AppOverlayShapeRect | null {
  const rect = element?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null
  }

  return {
    x: Math.floor(rect.x),
    y: Math.floor(rect.y),
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height)
  }
}

function elementContainsPoint(element: HTMLElement | null, x: number, y: number) {
  const rect = element?.getBoundingClientRect()
  return Boolean(
    rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
  )
}

function setOverlayInteractive(interactive: boolean, force = false) {
  if (pane.value) {
    interactive = true
  }

  if (!force && overlayInteractive === interactive) {
    return
  }

  overlayInteractive = interactive
  void setAppOverlayMouseEvents(interactive)
}

function handleOverlayMouseMove(event: MouseEvent) {
  lastMousePosition = { x: event.clientX, y: event.clientY }

  if (pane.value) {
    setOverlayInteractive(true)
    return
  }

  setOverlayInteractive(isPointOverPartialOverlay(event.clientX, event.clientY))
}

function isPointOverPartialOverlay(x: number, y: number) {
  return (
    elementContainsPoint(findVisible.value ? findSurfaceRef.value : null, x, y) ||
    elementContainsPoint(downloadManagerRef.value, x, y)
  )
}

function getDownloadManagerShapeRects(): AppOverlayShapeRect[] {
  const rect = elementShape(downloadManagerRef.value)
  return rect ? [rect] : []
}

function reportShape() {
  const shapeRects = getDownloadManagerShapeRects()

  if (pane.value) {
    setOverlayInteractive(true, true)
    void setAppOverlayShape([
      ...shapeRects,
      { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
    ])
    return
  }

  if (findVisible.value) {
    const findRect = elementShape(findSurfaceRef.value)
    if (findRect) {
      shapeRects.push(findRect)
    }
  }

  setOverlayInteractive(
    shapeRects.length > 0 && lastMousePosition
      ? isPointOverPartialOverlay(lastMousePosition.x, lastMousePosition.y)
      : false,
    true
  )

  void setAppOverlayShape(shapeRects)
}

function observeSurfaces() {
  if (!resizeObserver) {
    return
  }

  resizeObserver.disconnect()
  for (const element of [
    findSurfaceRef.value,
    modalSurfaceRef.value,
    stackedSurfaceRef.value,
    downloadManagerRef.value
  ]) {
    if (element) {
      resizeObserver.observe(element)
    }
  }
}

async function refreshShape() {
  await nextTick()
  observeSurfaces()
  requestAnimationFrame(() => {
    reportShape()
    requestAnimationFrame(reportShape)
  })
}

function restoreFindForActiveService() {
  if (activeServiceId.value && findServiceIds.has(activeServiceId.value)) {
    activateFindSearchOnShow.value = false
    focusFindOnShow.value = focusedFindServiceIds.has(activeServiceId.value)
    activeFindServiceId.value = activeServiceId.value
    findVisible.value = true
    if (focusFindOnShow.value) {
      void focusAppOverlay()
        .then(() => nextTick())
        .then(() => {
          findInPageRef.value?.focus()
        })
    }
    return
  }

  activateFindSearchOnShow.value = true
  focusFindOnShow.value = true
  activeFindServiceId.value = null
  findVisible.value = false
}

function stopActiveFind() {
  if (!activeFindServiceId.value) {
    return
  }

  void window.electron.ipcRenderer.invoke('service-page-find-stop', activeFindServiceId.value)
}

async function openOverlay(request: AppOverlayRequest) {
  await loadData()

  showPartitionManager.value = false
  stackedPane.value = null
  permissionService.value = request.service ?? null
  permissionTargetUrl.value = request.targetUrl ?? request.service?.url ?? ''
  activeScreenShareServiceId.value = request.serviceId ?? ''

  if (request.pane === 'find') {
    pane.value = null
    const serviceId = request.serviceId ?? request.service?.id ?? activeServiceId.value
    if (serviceId) {
      activateFindSearchOnShow.value = true
      focusFindOnShow.value = true
      findServiceIds.add(serviceId)
      focusedFindServiceIds.add(serviceId)
      activeFindServiceId.value = serviceId
      findVisible.value = serviceId === activeServiceId.value || activeServiceId.value === null
    }
    await refreshShape()
    return
  }

  pane.value = request.pane
  findVisible.value = false
  await refreshShape()
}

async function closeModalOverlay() {
  if (pane.value === 'screen-picker') {
    await window.electron.ipcRenderer.invoke('screen-picker-response', null)
  }

  pane.value = null
  showPartitionManager.value = false
  stackedPane.value = null
  activeScreenShareServiceId.value = ''
  restoreFindForActiveService()
  await refreshShape()
  if (!findVisible.value) {
    await closeAppOverlay()
  }
}

async function closeFindOverlay() {
  stopActiveFind()
  if (activeFindServiceId.value) {
    findServiceIds.delete(activeFindServiceId.value)
    focusedFindServiceIds.delete(activeFindServiceId.value)
  }

  activeFindServiceId.value = null
  activateFindSearchOnShow.value = true
  focusFindOnShow.value = true
  findVisible.value = false
  await refreshShape()
  await closeAppOverlay()
}

async function finishScreenPicker(constraints: unknown) {
  await window.electron.ipcRenderer.invoke('screen-picker-response', constraints)
  pane.value = null
  activeScreenShareServiceId.value = ''
  restoreFindForActiveService()
  await refreshShape()
  if (!findVisible.value) {
    await closeAppOverlay()
  }
}

async function closeTopOverlay() {
  if (stackedPane.value) {
    stackedPane.value = null
    showPartitionManager.value = false
    await refreshShape()
    return
  }

  if (pane.value === 'screen-picker') {
    await finishScreenPicker(null)
    return
  }

  if (pane.value) {
    await closeModalOverlay()
    return
  }

  if (findVisible.value) {
    await closeFindOverlay()
  }
}

async function handleServicesChanged(value: Service[]) {
  services.value = value
  notifyAppOverlayDataChanged()
  await refreshShape()
}

async function handlePartitionsChanged(value: Partition[]) {
  partitions.value = value
  notifyAppOverlayDataChanged()
  await refreshShape()
}

async function openPermissions(service: Service) {
  if (pane.value === 'services') {
    stackedPermissionService.value = service
    stackedPermissionTargetUrl.value = service.url
    stackedPane.value = 'permissions'
    await refreshShape()
    return
  }

  permissionService.value = service
  permissionTargetUrl.value = service.url
  pane.value = 'permissions'
  findVisible.value = false
  await refreshShape()
}

function handleRootClick() {
  void closeTopOverlay()
}

function isFindFocused() {
  const activeElement = document.activeElement
  return Boolean(
    document.hasFocus() &&
      activeElement &&
      findSurfaceRef.value &&
      (activeElement === findSurfaceRef.value || findSurfaceRef.value.contains(activeElement))
  )
}

function preserveFindFocusState(serviceId: string | null) {
  if (!serviceId || activeFindServiceId.value !== serviceId || !findVisible.value) {
    return
  }

  if (isFindFocused()) {
    focusedFindServiceIds.add(serviceId)
  } else {
    focusedFindServiceIds.delete(serviceId)
  }
}

function markFindFocused() {
  if (pendingFindFocusClear) {
    clearTimeout(pendingFindFocusClear)
    pendingFindFocusClear = null
  }

  if (activeFindServiceId.value && findVisible.value) {
    focusedFindServiceIds.add(activeFindServiceId.value)
  }
}

function cancelPendingFindFocusClear() {
  if (!pendingFindFocusClear) {
    return
  }

  clearTimeout(pendingFindFocusClear)
  pendingFindFocusClear = null
}

function handleFindFocusOut() {
  cancelPendingFindFocusClear()
  const serviceId = activeFindServiceId.value
  pendingFindFocusClear = setTimeout(() => {
    pendingFindFocusClear = null
    if (!isFindFocused()) {
      focusedFindServiceIds.delete(serviceId ?? '')
    }
  }, 100)
}

function cancelScreenSharing() {
  void finishScreenPicker(null)
}

function handleScreenSelected(constraints: unknown) {
  void finishScreenPicker(constraints)
}

watch(showPartitionManager, (visible) => {
  stackedPane.value = visible ? 'partitions' : null
  void refreshShape()
})

watch(findVisible, (visible) => {
  if (!visible && !pane.value && activeFindServiceId.value) {
    void closeFindOverlay()
  }
})

onMounted(() => {
  resizeObserver = new ResizeObserver(reportShape)
  observeSurfaces()

  removeOverlayOpenListener = window.electron.ipcRenderer.on(
    'app-overlay-open',
    (_event, request: AppOverlayRequest) => {
      void openOverlay(request)
    }
  )

  removeActiveServiceChangedListener = window.electron.ipcRenderer.on(
    'app-overlay-active-service-changed',
    (_event, serviceId: string | null) => {
      if (pendingFindFocusClear) {
        cancelPendingFindFocusClear()
      } else {
        preserveFindFocusState(activeServiceId.value)
      }
      activeServiceId.value = serviceId
      if (!pane.value) {
        restoreFindForActiveService()
      }
      void refreshShape()
    }
  )

  removeWindowBoundsChangedListener = window.electron.ipcRenderer.on(
    'app-overlay-window-bounds-changed',
    () => {
      void refreshShape()
    }
  )

  removeOverlayEscapeListener = window.electron.ipcRenderer.on('app-overlay-escape', () => {
    void closeTopOverlay()
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cancelPendingFindFocusClear()
  removeOverlayOpenListener?.()
  removeActiveServiceChangedListener?.()
  removeWindowBoundsChangedListener?.()
  removeOverlayEscapeListener?.()
})
</script>

<style scoped>
.overlay-root {
  position: fixed;
  inset: 0;
  background: transparent;
  color: black;
  animation: none;
  transition: none;
}

.overlay-root--modal {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
}

.overlay-surface {
  width: max-content;
  max-width: 92vw;
  max-height: 86vh;
  animation: none;
  transition: none;
}

.overlay-surface--find {
  position: absolute;
  top: 20px;
  right: 20px;
  left: auto;
  width: auto;
  max-width: none;
  max-height: none;
  transform: none;
}

.overlay-surface--find :deep(.find-container) {
  position: static;
}

.overlay-surface--stacked {
  z-index: 2;
}

.overlay-stack-layer {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.16);
}

.overlay-panel {
  width: max-content;
  max-width: 92vw;
  max-height: 86vh;
  overflow: auto;
  padding: 1rem;
  color: black;
  background: white;
  animation: none;
  transition: none;
}

.overlay-download-host {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
}

.overlay-download-host :deep(.download-manager) {
  position: static;
}
</style>
