<template>
  <div
    style="height: 100dvh; display: grid"
    :style="{ gridTemplateColumns: sidebarVisible ? 'auto 1fr' : '1fr' }"
  >
    <div
      v-if="sidebarVisible"
      style="height: 100%; background-color: lightcoral; padding: 1rem; overflow-y: auto"
    >
      <div
        v-for="service in services"
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
        :style="{ marginTop: services.length > 0 ? '0.5rem' : '0', whiteSpace: 'nowrap' }"
        @click="showAddServiceModal = true"
      >
        Add Service
      </button>
    </div>
    <div style="height: 100%; background-color: plum; position: relative">
      <template v-for="service in services" :key="service.id">
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
      </template>

      <FindInPage v-model:visible="findInPageVisible" :webview-id="activeService?.id || null" />
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

  <ModalsContainer />
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, onMounted, onBeforeUnmount } from 'vue'
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
import ManageServices from './components/ManageServices.vue'
import ScreenPicker from './components/ScreenPicker.vue'
import FindInPage from './components/FindInPage.vue'
import ContextMenu from '@imengyu/vue3-context-menu'

const partitions = ref<Partition[]>([])
const services = ref<Service[]>([])
const activeService = ref<Service | null>(null)
const showAddServiceModal = ref(false)
const showPartitionManager = ref(false)
const showScreenPicker = ref(false)
const activeScreenShareServiceId = ref('')
const findInPageVisible = ref(false)
const sidebarVisible = ref(true)
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

function setActiveService(service: Service) {
  if (!service.enabled) {
    return
  }

  activeService.value = service
  document.title = service.name + ' - WebPortals'
  saveActiveServiceId(service.id)
}

interface WebView {
  reload: () => void
  getWebContentsId: () => number
}

async function updateServiceEnabled(service: Service) {
  await updateService(service.id, service.partitionId, service.name, service.url, service.enabled)
  services.value = await getServices()
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
          const webview = document.querySelector(
            `.webview[data-service-id="${service.id}"]`
          ) as WebView | null
          if (webview) {
            webview.reload()
          }
        },
        disabled: !service.enabled
      },
      {
        label: 'Inspect',
        onClick: () => {
          const webview = document.querySelector(
            `.webview[data-service-id="${service.id}"]`
          ) as WebView | null
          if (webview) {
            window.electron.ipcRenderer.invoke('openDevTools', webview.getWebContentsId())
          }
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
        label: service.enabled ? 'Disable' : 'Enable',
        onClick: () => {
          service.enabled = !service.enabled
          updateServiceEnabled(service)
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

function handleWebviewKeyboardShortcut(shortcutData: any) {
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
  window.electron.ipcRenderer.on('process-keyboard-shortcut', (_event, shortcutData) => {
    handleWebviewKeyboardShortcut(shortcutData)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.electron.ipcRenderer.removeAllListeners('process-keyboard-shortcut')
})

const notificationsClassDefinition = `(() => {
const originalNotification = window.Notification;

class Notification {
  static permission = 'granted';

  constructor(title, options) {
    const notification = new originalNotification(title, options);

    console.log('Notification created:', title, options);

    notification.onclick = () => {
      window.WebPortals.notificationClick(window._serviceId);
      this.onclick();
    };

    notification.onclose = () => {
      this.onclose();
    };

    notification.onerror = () => {
      this.onerror();
    };

    notification.onshow = () => {
      this.onshow();
    };
  }

  static requestPermission(cb) {
    if (typeof cb === 'function') {
      cb(Notification.permission);
    }

    return Promise.resolve(Notification.permission);
  }

  onclick() {}

  onclose() {}

  onerror() {}

  onshow() {}

  close() {}
}

window.Notification = Notification;
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

const vWebview = {
  mounted(el: HTMLElement, binding: any) {
    el.addEventListener('dom-ready', () => {
      // el.openDevTools()
      // @ts-expect-error
      el.executeJavaScript(`
        window._serviceId = '${binding.value}';
        window.prompt = window.WebPortals.prompt;
        ${notificationsClassDefinition}
        ${displayMediaPatchCode}
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
    services.value.find((service) => service.id === activeServiceId) ?? services.value[0]
  setActiveService(serviceToSelect)
  sidebarVisible.value = await getSidebarVisible()

  window.electron.ipcRenderer.on('makeServiceActive', (_event, serviceId) => {
    const service = services.value.find((service) => service.id === serviceId)
    if (service) {
      setActiveService(service)
    }
  })

  window.electron.ipcRenderer.on('request-screen-sharing', (_event, serviceId) => {
    console.log('Received request-screen-sharing for service:', serviceId)
    activeScreenShareServiceId.value = serviceId
    showScreenPicker.value = true
  })

  window.electron.ipcRenderer.on('toggle-sidebar', async () => {
    sidebarVisible.value = !sidebarVisible.value
    await saveSidebarVisible(sidebarVisible.value)
  })
})

function cancelScreenSharing() {
  console.log('User canceled screen sharing')
  showScreenPicker.value = false
  window.electron.ipcRenderer.invoke('screen-picker-response', null)
}

function handleScreenSelected(constraints: any) {
  console.log(
    'User selected screen sharing source:',
    constraints ? 'constraints available' : 'no constraints'
  )
  showScreenPicker.value = false
  window.electron.ipcRenderer.invoke('screen-picker-response', constraints)
}
</script>
