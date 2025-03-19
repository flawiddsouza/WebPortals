<template>
  <div style="height: 100dvh; display: grid; grid-template-columns: auto 1fr">
    <div style="height: 100%; background-color: lightcoral; padding: 1rem">
      <div
        v-for="service in services"
        :key="service.id"
        @click="setActiveService(service)"
        @contextmenu.prevent="handleContextMenu($event, service)"
        :style="{
          fontWeight: activeService?.id === service.id ? 'bold' : 'normal',
          color: service.enabled ? 'white' : '#ffffff69',
          cursor: service.enabled ? 'pointer' : 'cursor'
        }"
      >
        {{ service.name }}
      </div>
      <button
        @click="showAddServiceModal = true"
        :style="{ marginTop: services.length > 0 ? '0.5rem' : '0' }"
      >
        Add Service
      </button>
    </div>
    <div style="height: 100%; background-color: plum">
      <template v-for="service in services" :key="service.id">
        <webview
          v-if="service.enabled"
          v-show="service.id === activeService?.id"
          :src="service.url"
          style="height: 100%; width: 100%; background-color: white"
          :partition="`persist:${service.partitionId}`"
          :useragent="userAgent"
          class="webview"
          allowpopups
          v-webview="service.id"
          :data-service-id="service.id"
        ></webview>
      </template>
    </div>
  </div>

  <VueFinalModal
    v-model="showAddServiceModal"
    style="display: flex; justify-content: center; align-items: center"
    content-style="background-color: white; padding: 1rem; width: max-content; height: max-content; color: black;"
  >
    <ManageServices
      :partitions="partitions"
      v-model:services="services"
      v-model:showPartitionManager="showPartitionManager"
    ></ManageServices>
  </VueFinalModal>

  <VueFinalModal
    v-model="showPartitionManager"
    style="display: flex; justify-content: center; align-items: center"
    content-style="background-color: white; padding: 1rem; width: max-content; height: max-content; color: black;"
  >
    <ManagePartitions v-model:partitions="partitions" />
  </VueFinalModal>

  <VueFinalModal
    v-model="showScreenPicker"
    style="display: flex; justify-content: center; align-items: center"
    content-style="width: max-content; height: max-content;"
  >
    <ScreenPicker
      :serviceId="activeScreenShareServiceId"
      @cancel="cancelScreenSharing"
      @selected="handleScreenSelected"
    />
  </VueFinalModal>

  <ModalsContainer />
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount } from 'vue'
import { ModalsContainer, VueFinalModal } from 'vue-final-modal'
import 'vue-final-modal/style.css'
import type { Partition, Service } from './db'
import {
  getActiveServiceId,
  getPartitions,
  getServices,
  saveActiveServiceId,
  updateService
} from './db'
import ManagePartitions from './components/ManagePartitions.vue'
import ManageServices from './components/ManageServices.vue'
import ScreenPicker from './components/ScreenPicker.vue'
import ContextMenu from '@imengyu/vue3-context-menu'

const partitions = ref<Partition[]>([])
const services = ref<Service[]>([])
const activeService = ref<Service | null>(null)
const showAddServiceModal = ref(false)
const showPartitionManager = ref(false)
const showScreenPicker = ref(false)
const activeScreenShareServiceId = ref('')

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
        label: service.enabled ? 'Disable' : 'Enable',
        onClick: () => {
          service.enabled = !service.enabled
          updateServiceEnabled(service)
        }
      }
    ]
  })
}

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
