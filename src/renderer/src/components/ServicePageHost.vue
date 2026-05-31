<template>
  <div ref="hostRef" class="service-page-host">
    <ServiceStatusOverlay
      v-if="activeService"
      :loading="activeState?.loading ?? false"
      :error="activeState?.failure ?? null"
      :service-url="activeService.url"
      @retry="$emit('retry', activeService)"
    />

    <div v-if="activeService && activeState?.placement === 'popped-out'" class="popout-placeholder">
      <div class="popout-placeholder__title">Opened in separate window</div>
      <div class="popout-placeholder__actions">
        <button @click="$emit('focus-popout', activeService)">Focus Window</button>
        <button @click="$emit('bring-back', activeService)">Bring Back Here</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Service } from '../db'
import type { ServicePageState } from '../webview'
import { setServicePageBounds } from '../webview'
import ServiceStatusOverlay from './ServiceStatusOverlay.vue'

const props = defineProps<{
  activeService: Service | null
  serviceStates: Map<string, ServicePageState>
  visible: boolean
}>()

defineEmits<{
  retry: [service: Service]
  'focus-popout': [service: Service]
  'bring-back': [service: Service]
}>()

const hostRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const activeState = computed(() => {
  return props.activeService ? (props.serviceStates.get(props.activeService.id) ?? null) : null
})

function reportBounds() {
  if (!hostRef.value || !props.visible) {
    void setServicePageBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }

  const rect = hostRef.value.getBoundingClientRect()
  void setServicePageBounds({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  })
}

onMounted(() => {
  resizeObserver = new ResizeObserver(reportBounds)
  if (hostRef.value) {
    resizeObserver.observe(hostRef.value)
  }
  reportBounds()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  void setServicePageBounds({ x: 0, y: 0, width: 0, height: 0 })
})

watch(() => props.visible, reportBounds)
watch(() => props.activeService?.id, reportBounds)
</script>

<style scoped>
.service-page-host {
  position: relative;
  min-height: 0;
  height: 100%;
}

.popout-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: black;
  background: white;
}

.popout-placeholder__title {
  font-size: 1rem;
  font-weight: 600;
}

.popout-placeholder__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
