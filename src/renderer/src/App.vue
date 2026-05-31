<template>
  <div
    style="height: 100dvh; display: grid; position: relative; overflow: hidden"
    :style="{ gridTemplateColumns: sidebarVisible ? 'auto 1fr' : '1fr' }"
  >
    <div
      v-if="sidebarVisible"
      style="height: 100%; background-color: lightcoral; padding: 1rem; overflow-y: auto"
    >
      <div
        v-for="service in visibleServices"
        :key="service.id"
        :style="{
          fontWeight: activeService?.id === service.id ? 'bold' : 'normal',
          color: service.enabled ? 'white' : '#ffffff69',
          cursor: service.enabled ? 'pointer' : 'cursor'
        }"
        @click="setActiveService(service)"
        @contextmenu.prevent="handleContextMenu($event, service)"
      >
        {{ service.name }}
      </div>
      <button
        :style="{ marginTop: visibleServices.length > 0 ? '0.5rem' : '0', whiteSpace: 'nowrap' }"
        @click="openServiceManager"
      >
        Add Service
      </button>
    </div>
    <div
      style="height: 100%; background-color: plum; position: relative; display: grid"
      :style="{
        gridTemplateRows: effectiveInspectorVisible
          ? `minmax(0, 1fr) ${currentInspectorHeight}px`
          : 'minmax(0, 1fr)'
      }"
    >
      <ServicePageHost
        :active-service="activeService"
        :service-states="servicePageStates"
        :visible="true"
        @retry="retryService"
        @focus-popout="focusServiceWindow"
        @bring-back="bringBackServiceWindow"
      />

      <EmbeddedInspectorPane
        v-if="effectiveInspectorVisible"
        :title="inspectorServiceTitle"
        :resize-hotzone="inspectorResizeHotzone"
        :resizing="isInspectorResizing"
        @close="closeActiveInspector"
        @resize-handle-mousedown="startInspectorResizeFromNav"
        @resize-handle-mousemove="updateInspectorResizeHotzone"
        @resize-handle-leave="clearInspectorResizeHotzone"
      >
        <div ref="inspectorContentRef" style="min-height: 0; height: 100%"></div>
      </EmbeddedInspectorPane>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  reactive,
  nextTick,
  onBeforeMount,
  onMounted,
  onBeforeUnmount,
  watch
} from 'vue'
import type { Partition, Service } from './db'
import {
  getActiveServiceId,
  getPartitions,
  getServices,
  saveActiveServiceId,
  updateService,
  getSidebarVisible,
  saveSidebarVisible
} from './db'
import ServicePageHost from './components/ServicePageHost.vue'
import EmbeddedInspectorPane from './components/EmbeddedInspectorPane.vue'
import { notifyAppOverlayActiveServiceChanged, openAppOverlay } from './overlay'
import { useEmbeddedInspector } from './composables/useEmbeddedInspector'
import {
  activateServicePage,
  bringBackServicePage,
  focusServicePopout,
  popOutServicePage,
  reloadServicePage,
  syncServicePages,
  type ServicePageState
} from './webview'

interface WebviewKeyboardShortcut {
  ctrlKey: boolean
  metaKey: boolean
  key: string
  serviceId?: string
}

type ServiceContextMenuCommand =
  | 'reload'
  | 'reload-partition'
  | 'toggle-popout'
  | 'inspect'
  | 'find'
  | 'permissions'
  | 'toggle-enabled'
  | 'toggle-hidden'

const partitions = ref<Partition[]>([])
const services = ref<Service[]>([])
const visibleServices = computed(() => services.value.filter((service) => !service.hidden))
const activeService = ref<Service | null>(null)
const sidebarVisible = ref(true)
const servicePageStates = reactive(new Map<string, ServicePageState>())
const servicePagesInitialized = ref(false)
let removeProcessKeyboardShortcutListener: (() => void) | null = null
let removeMakeServiceActiveListener: (() => void) | null = null
let removeToggleSidebarListener: (() => void) | null = null
let removeServicePageStateListener: (() => void) | null = null
let removeOverlayDataChangedListener: (() => void) | null = null

function applyServicePageState(state: ServicePageState | null) {
  if (!state) {
    return
  }

  servicePageStates.set(state.serviceId, state)
}

async function setActiveService(service: Service | null) {
  if (!service || !service.enabled || service.hidden) {
    return
  }

  activeService.value = service
  document.title = service.name + ' - WebPortals'
  saveActiveServiceId(service.id)
  applyServicePageState(await activateServicePage(service.id))
  notifyAppOverlayActiveServiceChanged(service.id)
}

function findFirstSelectableService(): Service | null {
  return services.value.find((service) => service.enabled && !service.hidden) ?? null
}

function clearActiveService() {
  activeService.value = null
  document.title = 'WebPortals'
  saveActiveServiceId(undefined)
  notifyAppOverlayActiveServiceChanged(null)
}

async function ensureActiveService() {
  if (!activeService.value || !activeService.value.enabled || activeService.value.hidden) {
    const fallback = findFirstSelectableService()
    if (fallback) {
      await setActiveService(fallback)
    } else {
      clearActiveService()
    }
  }
}

async function reloadPortalData() {
  partitions.value = await getPartitions()
  services.value = await getServices()
  await syncServicePages(services.value)
  await ensureActiveService()
}

const {
  clearInspectorResizeHotzone,
  closeActiveInspector,
  currentInspectorHeight,
  effectiveInspectorVisible,
  inspectorContentRef,
  inspectorResizeHotzone,
  inspectorServiceTitle,
  isInspectorResizing,
  openInspector,
  startInspectorResizeFromNav,
  syncInspectorBounds,
  updateInspectorResizeHotzone
} = useEmbeddedInspector({
  services,
  activeService,
  setActiveService
})

async function updateServiceEnabled(service: Service) {
  await updateService(
    service.id,
    service.partitionId,
    service.name,
    service.url,
    service.enabled,
    service.hidden
  )
  services.value = await getServices()
  await syncServicePages(services.value)
  await ensureActiveService()
}

async function updateServiceHidden(service: Service) {
  service.hidden = !service.hidden
  await updateService(
    service.id,
    service.partitionId,
    service.name,
    service.url,
    service.enabled,
    service.hidden
  )
  services.value = await getServices()
  await syncServicePages(services.value)
  await ensureActiveService()
}

function openServiceManager() {
  void openAppOverlay({ pane: 'services' })
}

function openFindInPage(service: Service | null = activeService.value) {
  if (!service) {
    return
  }

  void openAppOverlay({ pane: 'find', serviceId: service.id })
}

function openPermissionManager(service: Service) {
  const currentUrl = servicePageStates.get(service.id)?.currentUrl
  const targetUrl =
    currentUrl && !currentUrl.startsWith('chrome-error://') ? currentUrl : service.url
  void openAppOverlay({ pane: 'permissions', service, targetUrl })
}

async function handleContextMenu(event: MouseEvent, service: Service) {
  event.preventDefault()

  const command = (await window.electron.ipcRenderer.invoke('service-context-menu', {
    x: event.x,
    y: event.y,
    enabled: service.enabled,
    hidden: service.hidden,
    poppedOut: servicePageStates.get(service.id)?.placement === 'popped-out'
  })) as ServiceContextMenuCommand | null

  switch (command) {
    case 'reload':
      await retryService(service)
      break
    case 'reload-partition': {
      const partitionServices = services.value.filter(
        (s) => s.partitionId === service.partitionId && s.enabled
      )
      for (const partitionService of partitionServices) {
        void retryService(partitionService)
      }
      break
    }
    case 'toggle-popout':
      if (servicePageStates.get(service.id)?.placement === 'popped-out') {
        await bringBackServiceWindow(service)
      } else {
        await popOutServiceWindow(service)
      }
      break
    case 'inspect':
      await openInspector(service)
      break
    case 'find':
      await setActiveService(service)
      openFindInPage(service)
      break
    case 'permissions':
      openPermissionManager(service)
      break
    case 'toggle-enabled':
      service.enabled = !service.enabled
      await updateServiceEnabled(service)
      break
    case 'toggle-hidden':
      await updateServiceHidden(service)
      break
  }
}

function handleKeyDown(event: KeyboardEvent) {
  // Ctrl+F to find in page
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault()
    openFindInPage()
  }
}

function handleWebviewKeyboardShortcut(shortcutData: WebviewKeyboardShortcut) {
  console.log('Received keyboard shortcut from webview:', shortcutData)
  if ((shortcutData.ctrlKey || shortcutData.metaKey) && shortcutData.key === 'f') {
    // Make sure the correct webview is active for the find operation
    if (shortcutData.serviceId) {
      const service = services.value.find((s) => s.id === shortcutData.serviceId)
      if (service) {
        void setActiveService(service)
        openFindInPage(service)
      }
      return
    }

    openFindInPage()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)

  // Listen for keyboard shortcuts from webviews
  removeProcessKeyboardShortcutListener = window.electron.ipcRenderer.on(
    'process-keyboard-shortcut',
    (_event, shortcutData: WebviewKeyboardShortcut) => {
      handleWebviewKeyboardShortcut(shortcutData)
    }
  )
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  removeProcessKeyboardShortcutListener?.()
  removeMakeServiceActiveListener?.()
  removeToggleSidebarListener?.()
  removeServicePageStateListener?.()
  removeOverlayDataChangedListener?.()
})

async function retryService(service: Service) {
  applyServicePageState(await reloadServicePage(service.id))
}

async function popOutServiceWindow(service: Service) {
  applyServicePageState(await popOutServicePage(service.id))
}

async function focusServiceWindow(service: Service) {
  applyServicePageState(await focusServicePopout(service.id))
}

async function bringBackServiceWindow(service: Service) {
  applyServicePageState(await bringBackServicePage(service.id))
}

watch(
  services,
  async () => {
    if (!servicePagesInitialized.value) {
      return
    }

    await syncServicePages(services.value)
    await ensureActiveService()
  },
  { deep: true }
)

onBeforeMount(async () => {
  partitions.value = await getPartitions()
  services.value = await getServices()
  await syncServicePages(services.value)
  const activeServiceId = await getActiveServiceId()
  const serviceToSelect =
    services.value.find(
      (service) => service.id === activeServiceId && service.enabled && !service.hidden
    ) ?? findFirstSelectableService()
  if (serviceToSelect) {
    await setActiveService(serviceToSelect)
  } else {
    clearActiveService()
  }
  servicePagesInitialized.value = true
  sidebarVisible.value = await getSidebarVisible()

  removeServicePageStateListener = window.electron.ipcRenderer.on(
    'service-page-state',
    (_event, state: ServicePageState) => {
      applyServicePageState(state)
    }
  )

  removeMakeServiceActiveListener = window.electron.ipcRenderer.on(
    'makeServiceActive',
    (_event, serviceId: string) => {
      const service = services.value.find((item) => item.id === serviceId)
      if (service) {
        void setActiveService(service)
      }
    }
  )

  removeToggleSidebarListener = window.electron.ipcRenderer.on('toggle-sidebar', async () => {
    sidebarVisible.value = !sidebarVisible.value
    await saveSidebarVisible(sidebarVisible.value)
    await nextTick()
    await syncInspectorBounds()
  })

  removeOverlayDataChangedListener = window.electron.ipcRenderer.on(
    'app-overlay-data-changed',
    () => {
      void reloadPortalData()
    }
  )
})
</script>
