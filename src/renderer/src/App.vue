<template>
  <div style="height: 100dvh; display: grid; grid-template-columns: auto 1fr">
    <div style="height: 100%; background-color: lightcoral; padding: 1rem">
      <div
        v-for="service in services"
        :key="service.id"
        @click="setActiveService(service)"
        style="cursor: pointer"
        :style="{ fontWeight: activeService?.id === service.id ? 'bold' : 'normal' }"
      >
        {{ service.name }}
      </div>
      <button @click="showAddServiceModal = true">Add Service</button>
    </div>
    <div style="height: 100%; background-color: plum">
      <webview
        v-for="service in services"
        v-show="service.id === activeService?.id"
        :src="service.url"
        style="height: 100%; width: 100%; background-color: white"
        :partition="`persist:${service.partitionId}`"
        :useragent="userAgent"
        class="webview"
        allowpopups
        v-webview
      ></webview>
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

  <ModalsContainer />
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount } from 'vue'
import { ModalsContainer, VueFinalModal } from 'vue-final-modal'
import 'vue-final-modal/style.css'
import type { Partition, Service } from './db'
import { getActiveServiceId, getPartitions, getServices, saveActiveServiceId } from './db'
import ManagePartitions from './components/ManagePartitions.vue'
import ManageServices from './components/ManageServices.vue'

const partitions = ref<Partition[]>([])
const services = ref<Service[]>([])
const activeService = ref<Service | null>(null)
const showAddServiceModal = ref(false)
const showPartitionManager = ref(false)

const userAgent = computed(() => {
  return window.navigator.userAgent
    .replaceAll(/(WebPortals\/[0-9.]+|Electron\/[0-9.]+) /g, '')
    .trim()
})

function setActiveService(service: Service) {
  activeService.value = service
  document.title = service.name + ' - WebPortals'
  saveActiveServiceId(service.id)
}

const vWebview = {
  mounted(el: HTMLElement) {
    el.addEventListener('dom-ready', () => {
      // el.openDevTools()
      // @ts-expect-error
      el.executeJavaScript(`
        window.prompt = window._prompt
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
})
</script>
