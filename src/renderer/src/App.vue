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
        @click="showAddServiceModal = true"
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
      <div style="position: relative; min-height: 0">
        <template v-for="service in visibleServices" :key="service.id">
          <webview
            v-if="service.enabled"
            v-show="service.id === activeService?.id"
            v-webview="service.id"
            :src="service.url"
            style="height: 100%; width: 100%; background-color: white"
            :partition="`persist:${service.partitionId}`"
            :useragent="userAgent"
            class="webview"
            allowpopups
            :data-service-id="service.id"
          ></webview>
          <ServiceStatusOverlay
            v-if="service.id === activeService?.id"
            :loading="loadingServices.has(service.id)"
            :error="failedServices.get(service.id) ?? null"
            :service-url="service.url"
            @retry="retryService(service)"
          />
        </template>

        <FindInPage v-model:visible="findInPageVisible" :webview-id="activeService?.id || null" />
      </div>

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

  <VueFinalModal
    v-model="showAddServiceModal"
    style="display: flex; justify-content: center; align-items: center"
    :content-style="modalContentStyle"
  >
    <ManageServices
      v-model:services="services"
      v-model:show-partition-manager="showPartitionManager"
      :partitions="partitions"
      @manage-permissions="openPermissionManager"
    ></ManageServices>
  </VueFinalModal>

  <VueFinalModal
    v-model="showPartitionManager"
    style="display: flex; justify-content: center; align-items: center"
    :content-style="modalContentStyle"
  >
    <ManagePartitions v-model:partitions="partitions" />
  </VueFinalModal>

  <VueFinalModal
    v-model="showScreenPicker"
    style="display: flex; justify-content: center; align-items: center"
    :content-style="modalContentStyle"
  >
    <ScreenPicker
      :service-id="activeScreenShareServiceId"
      @cancel="cancelScreenSharing"
      @selected="handleScreenSelected"
    />
  </VueFinalModal>

  <VueFinalModal
    v-model="showPermissionManager"
    style="display: flex; justify-content: center; align-items: center"
    :content-style="modalContentStyle"
  >
    <ManagePermissions :service="permissionService" :target-url="permissionTargetUrl" />
  </VueFinalModal>

  <DownloadManager />
  <ModalsContainer />
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
  watch,
  type ObjectDirective
} from 'vue'
import { ModalsContainer, VueFinalModal } from 'vue-final-modal'
import 'vue-final-modal/style.css'
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
import ManagePartitions from './components/ManagePartitions.vue'
import ManagePermissions from './components/ManagePermissions.vue'
import ManageServices from './components/ManageServices.vue'
import ScreenPicker from './components/ScreenPicker.vue'
import FindInPage from './components/FindInPage.vue'
import DownloadManager from './components/DownloadManager.vue'
import ServiceStatusOverlay from './components/ServiceStatusOverlay.vue'
import EmbeddedInspectorPane from './components/EmbeddedInspectorPane.vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import { useEmbeddedInspector } from './composables/useEmbeddedInspector'
import { getServiceWebview, type ServiceWebview } from './webview'

interface WebviewKeyboardShortcut {
  ctrlKey: boolean
  metaKey: boolean
  key: string
  serviceId?: string
}

interface WebviewDidFailLoadEvent extends Event {
  errorCode: number
  errorDescription: string
}

interface WebviewDidNavigateEvent extends Event {
  url?: string
}

interface DesktopCaptureConstraints {
  audio: boolean
  video: {
    mandatory: {
      chromeMediaSource: string
      chromeMediaSourceId: string
      minWidth: number
      maxWidth: number
      minHeight: number
      maxHeight: number
    }
  }
}

const partitions = ref<Partition[]>([])
const services = ref<Service[]>([])
const visibleServices = computed(() => services.value.filter((service) => !service.hidden))
const activeService = ref<Service | null>(null)
const showAddServiceModal = ref(false)
const showPartitionManager = ref(false)
const showPermissionManager = ref(false)
const showScreenPicker = ref(false)
const activeScreenShareServiceId = ref('')
const permissionService = ref<Service | null>(null)
const permissionTargetUrl = ref('')
const findInPageVisible = ref(false)
const sidebarVisible = ref(true)
let removeProcessKeyboardShortcutListener: (() => void) | null = null
let removeMakeServiceActiveListener: (() => void) | null = null
let removeRequestScreenSharingListener: (() => void) | null = null
let removeToggleSidebarListener: (() => void) | null = null
const modalContentStyle = computed(() => {
  return {
    backgroundColor: 'white',
    padding: '1rem',
    width: 'max-content',
    height: 'max-content',
    color: 'black',
    maxHeight: '100vh',
    overflow: 'auto'
  }
})

const userAgent = computed(() => {
  return window.navigator.userAgent
    .replaceAll(/(WebPortals\/[0-9.]+|Electron\/[0-9.]+) /g, '')
    .trim()
})

function setActiveService(service: Service | null) {
  if (!service || !service.enabled || service.hidden) {
    return
  }

  activeService.value = service
  document.title = service.name + ' - WebPortals'
  saveActiveServiceId(service.id)
}

function findFirstSelectableService(): Service | null {
  return services.value.find((service) => service.enabled && !service.hidden) ?? null
}

function clearActiveService() {
  activeService.value = null
  document.title = 'WebPortals'
  saveActiveServiceId(undefined)
}

function ensureActiveService() {
  if (!activeService.value || !activeService.value.enabled || activeService.value.hidden) {
    const fallback = findFirstSelectableService()
    if (fallback) {
      setActiveService(fallback)
    } else {
      clearActiveService()
    }
  }
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
  markServiceReady,
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
  ensureActiveService()
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
  ensureActiveService()
}

function openPermissionManager(service: Service) {
  permissionService.value = service
  const webview = getServiceWebview(service.id)
  const currentUrl = webview?.getURL?.()
  permissionTargetUrl.value =
    currentUrl && !currentUrl.startsWith('chrome-error://') ? currentUrl : service.url
  showPermissionManager.value = true
}

function handleContextMenu(event: MouseEvent, service: Service) {
  event.preventDefault()

  ContextMenu.showContextMenu({
    x: event.x,
    y: event.y,
    preserveIconWidth: false,
    items: [
      {
        label: 'Reload',
        onClick: () => {
          const webview = getServiceWebview(service.id)
          if (webview) {
            failedServices.delete(service.id)
            loadingServices.add(service.id)
            webview.loadURL(service.url)
          }
        },
        disabled: !service.enabled
      },
      {
        label: 'Reload Partition',
        onClick: () => {
          const partitionServices = services.value.filter(
            (s) => s.partitionId === service.partitionId && s.enabled
          )
          for (const s of partitionServices) {
            failedServices.delete(s.id)
            loadingServices.add(s.id)
            const webview = getServiceWebview(s.id)
            if (webview) {
              webview.loadURL(s.url)
            }
          }
        },
        disabled: !service.enabled
      },
      {
        label: 'Inspect',
        onClick: () => {
          void openInspector(service)
        },
        disabled: !service.enabled
      },
      {
        label: 'Find in Page',
        onClick: () => {
          setActiveService(service)
          findInPageVisible.value = true
        },
        disabled: !service.enabled
      },
      {
        label: 'Permissions',
        onClick: () => {
          openPermissionManager(service)
        }
      },
      {
        label: service.enabled ? 'Disable' : 'Enable',
        onClick: () => {
          service.enabled = !service.enabled
          updateServiceEnabled(service)
        }
      },
      {
        label: service.hidden ? 'Unhide' : 'Hide',
        onClick: () => {
          updateServiceHidden(service)
        }
      }
    ]
  })
}

function handleKeyDown(event: KeyboardEvent) {
  // Ctrl+F to find in page
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
    event.preventDefault()
    findInPageVisible.value = true
  }
}

function handleWebviewKeyboardShortcut(shortcutData: WebviewKeyboardShortcut) {
  console.log('Received keyboard shortcut from webview:', shortcutData)
  if ((shortcutData.ctrlKey || shortcutData.metaKey) && shortcutData.key === 'f') {
    findInPageVisible.value = true
    // Make sure the correct webview is active for the find operation
    if (shortcutData.serviceId) {
      const service = services.value.find((s) => s.id === shortcutData.serviceId)
      if (service) {
        setActiveService(service)
      }
    }
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
  removeRequestScreenSharingListener?.()
  removeToggleSidebarListener?.()
})

watch(services, () => {
  ensureActiveService()
})

const notificationsClassDefinition = `(() => {
const originalNotification = window.Notification;

if (!originalNotification) {
  return;
}

const toBrowserPermission = (state) => {
  switch (state) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'default';
  }
};

class NotificationShim {
  static get permission() {
    return toBrowserPermission(window.WebPortals.queryPermissionSync('notifications'));
  }

  static async requestPermission(cb) {
    const permission = toBrowserPermission(
      await window.WebPortals.requestPermission('notifications')
    );

    if (typeof cb === 'function') {
      cb(permission);
    }

    return permission;
  }

  constructor(title, options) {
    if (NotificationShim.permission !== 'granted') {
      throw new TypeError('Notification permission has not been granted.');
    }

    const notification = new originalNotification(title, options);
    notification.addEventListener('click', () => {
      window.WebPortals.notificationClick(window._serviceId);
    });
    return notification;
  }
}

Object.setPrototypeOf(NotificationShim, originalNotification);
Object.setPrototypeOf(NotificationShim.prototype, originalNotification.prototype);
window.Notification = NotificationShim;
})();`

const displayMediaPatchCode = `
  (function() {
    // Make sure we have the mediaDevices API
    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }

    // Store original getDisplayMedia if it exists
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;

    // Define our custom getDisplayMedia implementation
    navigator.mediaDevices.getDisplayMedia = async function(constraints) {
      try {
        // Get source ID through our custom WebPortals API
        console.log('WebPortals: Requesting screen capture through custom picker');
        const customConstraints = await window.WebPortals.getDisplayMedia(window._serviceId);

        // If user canceled selection
        if (!customConstraints) {
          const error = new Error('Permission denied by user');
          error.name = 'NotAllowedError';
          throw error;
        }

        // Now use the original getUserMedia with our desktop capture constraints
        // This is more reliable than trying to use the original getDisplayMedia
        return await navigator.mediaDevices.getUserMedia(customConstraints);
      } catch (error) {
        console.error('WebPortals getDisplayMedia error:', error);
        throw error;
      }
    };

    console.log('WebPortals: Screen capture API patched successfully');
  })();
`

const fileSystemPermissionPatchCode = `
  (function() {
    // This must run in the page world so site code sees the patched
    // FileSystemHandle methods. Patching them in the preload world is not enough.
    const FileSystemHandleCtor = window.FileSystemHandle;
    if (!FileSystemHandleCtor || !FileSystemHandleCtor.prototype) {
      return;
    }

    if (window.__webPortalsFsPermissionPatchApplied) {
      return;
    }

    const normalizeMode = (options) => {
      return options && options.mode === 'readwrite' ? 'writable' : 'readable';
    };

    FileSystemHandleCtor.prototype.queryPermission = function(options) {
      return window.WebPortals.queryFileSystemPermission(normalizeMode(options));
    };

    FileSystemHandleCtor.prototype.requestPermission = function(options) {
      return window.WebPortals.requestFileSystemPermission(normalizeMode(options));
    };

    window.__webPortalsFsPermissionPatchApplied = true;
  })();
`

const failedServices = reactive(new Map<string, { title: string; message: string; raw: string }>())
const loadingServices = reactive(new Set<string>())

function toFriendlyError(errorDescription: string): { title: string; message: string } {
  switch (errorDescription) {
    case 'ERR_NAME_NOT_RESOLVED':
      return {
        title: "This site can't be reached",
        message: 'Check if there is a typo in the address.'
      }
    case 'ERR_INTERNET_DISCONNECTED':
      return {
        title: 'No internet connection',
        message: 'Try checking your network cables, modem, and router.'
      }
    case 'ERR_CONNECTION_REFUSED':
      return { title: "This site can't be reached", message: 'The connection was refused.' }
    case 'ERR_ADDRESS_UNREACHABLE':
      return { title: "This site can't be reached", message: 'The address is unreachable.' }
    case 'ERR_CONNECTION_TIMED_OUT':
      return {
        title: 'This site is taking too long to respond',
        message: 'Try checking your proxy and firewall configuration.'
      }
    case 'ERR_CONNECTION_RESET':
      return { title: "This site can't be reached", message: 'The connection was reset.' }
    case 'ERR_NETWORK_CHANGED':
      return { title: 'Connection interrupted', message: 'A network change was detected.' }
    case 'ERR_CERT_AUTHORITY_INVALID':
    case 'ERR_CERT_DATE_INVALID':
      return {
        title: 'Your connection is not private',
        message: "The site's security certificate is not trusted."
      }
    default:
      return { title: "This page isn't working", message: 'An unexpected error occurred.' }
  }
}

function retryService(service: Service) {
  failedServices.delete(service.id)
  loadingServices.add(service.id)
  const webview = getServiceWebview(service.id)
  if (webview) {
    webview.loadURL(service.url)
  }
}

const vWebview: ObjectDirective<ServiceWebview, string> = {
  mounted(el, binding) {
    const serviceId = binding.value

    loadingServices.add(serviceId)

    el.addEventListener('did-finish-load', () => {
      loadingServices.delete(serviceId)
    })

    el.addEventListener('did-fail-load', (event) => {
      const loadFailure = event as WebviewDidFailLoadEvent
      if (loadFailure.errorCode === -3) return // ERR_ABORTED — redirect, did-finish-load will fire
      loadingServices.delete(serviceId)
      failedServices.set(serviceId, {
        ...toFriendlyError(loadFailure.errorDescription),
        raw: loadFailure.errorDescription
      })
    })

    el.addEventListener('did-navigate', (event) => {
      const navigation = event as WebviewDidNavigateEvent
      if (navigation.url && !navigation.url.startsWith('chrome-error://')) {
        failedServices.delete(serviceId)
      }
    })

    el.addEventListener('dom-ready', () => {
      markServiceReady(serviceId)
      // el.openDevTools()
      el.executeJavaScript(`
        window._serviceId = '${serviceId}';
        window.prompt = window.WebPortals.prompt;
        ${notificationsClassDefinition}
        ${displayMediaPatchCode}
        ${fileSystemPermissionPatchCode}
        ;0 // without this, we get the below error in the console:
        // Error occurred in handler for 'GUEST_VIEW_MANAGER_CALL': Error: An object could not be cloned.
        // at IpcRendererInternal.send (node:electron/js2c/sandbox_bundle:2:121801)
        // at IpcRendererInternal.<anonymous> (node:electron/js2c/sandbox_bundle:2:121379)
        // Solution from: https://github.com/electron/electron/issues/23722#issuecomment-632631774
      `)
    })
  }
}

onBeforeMount(async () => {
  partitions.value = await getPartitions()
  services.value = await getServices()
  const activeServiceId = await getActiveServiceId()
  const serviceToSelect =
    services.value.find(
      (service) => service.id === activeServiceId && service.enabled && !service.hidden
    ) ?? findFirstSelectableService()
  if (serviceToSelect) {
    setActiveService(serviceToSelect)
  } else {
    clearActiveService()
  }
  sidebarVisible.value = await getSidebarVisible()

  removeMakeServiceActiveListener = window.electron.ipcRenderer.on(
    'makeServiceActive',
    (_event, serviceId: string) => {
      const service = services.value.find((item) => item.id === serviceId)
      if (service) {
        setActiveService(service)
      }
    }
  )

  removeRequestScreenSharingListener = window.electron.ipcRenderer.on(
    'request-screen-sharing',
    (_event, serviceId: string) => {
      console.log('Received request-screen-sharing for service:', serviceId)
      activeScreenShareServiceId.value = serviceId
      showScreenPicker.value = true
    }
  )

  removeToggleSidebarListener = window.electron.ipcRenderer.on('toggle-sidebar', async () => {
    sidebarVisible.value = !sidebarVisible.value
    await saveSidebarVisible(sidebarVisible.value)
    await nextTick()
    await syncInspectorBounds()
  })
})

function cancelScreenSharing() {
  console.log('User canceled screen sharing')
  showScreenPicker.value = false
  window.electron.ipcRenderer.invoke('screen-picker-response', null)
}

function handleScreenSelected(constraints: DesktopCaptureConstraints | null) {
  console.log(
    'User selected screen sharing source:',
    constraints ? 'constraints available' : 'no constraints'
  )
  showScreenPicker.value = false
  window.electron.ipcRenderer.invoke('screen-picker-response', constraints)
}
</script>
