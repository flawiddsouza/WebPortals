import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import type { Service } from '../db'
import { getServiceWebview } from '../webview'

interface RectangleBounds {
  x: number
  y: number
  width: number
  height: number
}

interface UseEmbeddedInspectorOptions {
  services: Ref<Service[]>
  activeService: Ref<Service | null>
  setActiveService: (service: Service) => void
}

const minInspectorHeight = 180
const maxInspectorHeight = 640
const defaultInspectorHeight = 320

export function useEmbeddedInspector({
  services,
  activeService,
  setActiveService
}: UseEmbeddedInspectorOptions) {
  const inspectorHeights = reactive(new Map<string, number>())
  const inspectedServiceIds = reactive(new Set<string>())
  const readyServices = reactive(new Set<string>())
  const inspectorContentRef = ref<HTMLElement | null>(null)
  const isInspectorResizing = ref(false)
  const inspectorResizeHotzone = ref(false)
  const outerDevToolsVisible = ref(false)
  let inspectorResizeCleanup: (() => void) | null = null
  let removeMainDevToolsVisibilityListener: (() => void) | null = null

  const activeInspectedServiceId = computed(() => {
    const serviceId = activeService.value?.id
    return serviceId && inspectedServiceIds.has(serviceId) ? serviceId : null
  })

  const inspectorServiceTitle = computed(() => {
    const service = services.value.find((item) => item.id === activeInspectedServiceId.value)
    return service?.name ?? 'Service'
  })

  const effectiveInspectorVisible = computed(() => {
    return activeInspectedServiceId.value !== null && !outerDevToolsVisible.value
  })

  const currentInspectorHeight = computed(() => {
    const serviceId = activeInspectedServiceId.value
    if (!serviceId) {
      return defaultInspectorHeight
    }

    return inspectorHeights.get(serviceId) ?? defaultInspectorHeight
  })

  function getInspectorBounds(): RectangleBounds | null {
    if (!inspectorContentRef.value) {
      return null
    }

    const bounds = inspectorContentRef.value.getBoundingClientRect()
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    }
  }

  async function syncInspector(serviceId = activeInspectedServiceId.value) {
    if (!effectiveInspectorVisible.value || !serviceId || !readyServices.has(serviceId)) {
      return
    }

    const targetWebview = getServiceWebview(serviceId)
    const bounds = getInspectorBounds()
    if (!targetWebview || !bounds) {
      return
    }

    await window.electron.ipcRenderer.invoke(
      'openDevTools',
      serviceId,
      targetWebview.getWebContentsId(),
      bounds
    )
  }

  async function openInspector(service: Service) {
    if (!service.enabled || service.hidden) {
      return
    }

    inspectedServiceIds.add(service.id)
    if (!inspectorHeights.has(service.id)) {
      inspectorHeights.set(service.id, defaultInspectorHeight)
    }

    setActiveService(service)
    await nextTick()
    await syncInspector(service.id)
  }

  async function closeInspector(serviceId = activeInspectedServiceId.value) {
    if (!serviceId) {
      return
    }

    inspectedServiceIds.delete(serviceId)
    await window.electron.ipcRenderer.invoke('closeDevTools', serviceId)
  }

  function closeActiveInspector() {
    void closeInspector()
  }

  function clearInspectorResizeHotzone() {
    inspectorResizeHotzone.value = false
  }

  function updateInspectorResizeHotzone(event: MouseEvent) {
    const currentTarget = event.currentTarget as HTMLElement | null
    if (!currentTarget) {
      clearInspectorResizeHotzone()
      return
    }

    const rect = currentTarget.getBoundingClientRect()
    inspectorResizeHotzone.value = event.clientY - rect.top <= 4
  }

  function resetInspectorResizeState() {
    isInspectorResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    inspectorResizeCleanup = null
  }

  function startInspectorResize(event: MouseEvent) {
    event.preventDefault()

    const serviceId = activeInspectedServiceId.value
    if (!serviceId) {
      return
    }

    const startY = event.clientY
    const startHeight = currentInspectorHeight.value
    isInspectorResizing.value = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY
      inspectorHeights.set(
        serviceId,
        Math.min(maxInspectorHeight, Math.max(minInspectorHeight, startHeight + deltaY))
      )
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      resetInspectorResizeState()
    }

    inspectorResizeCleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      resetInspectorResizeState()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function startInspectorResizeFromNav(event: MouseEvent) {
    updateInspectorResizeHotzone(event)
    if (!inspectorResizeHotzone.value) {
      return
    }

    startInspectorResize(event)
  }

  async function handleWindowResize() {
    if (
      !effectiveInspectorVisible.value ||
      !inspectorContentRef.value ||
      !activeInspectedServiceId.value
    ) {
      return
    }

    await nextTick()

    const bounds = getInspectorBounds()
    if (!bounds) {
      return
    }

    await window.electron.ipcRenderer.invoke(
      'setDevToolsBounds',
      activeInspectedServiceId.value,
      bounds
    )
  }

  async function handleEffectiveInspectorVisibility() {
    const serviceId = activeInspectedServiceId.value
    if (!serviceId) {
      return
    }

    await window.electron.ipcRenderer.invoke(
      'setDevToolsVisible',
      serviceId,
      effectiveInspectorVisible.value
    )

    if (!effectiveInspectorVisible.value) {
      return
    }

    await handleWindowResize()
  }

  function markServiceReady(serviceId: string) {
    readyServices.add(serviceId)

    if (activeService.value?.id === serviceId && inspectedServiceIds.has(serviceId)) {
      void syncInspector(serviceId)
    }
  }

  onMounted(() => {
    window.addEventListener('resize', handleWindowResize)
    removeMainDevToolsVisibilityListener = window.electron.ipcRenderer.on(
      'main-devtools-visibility',
      (_event, visible: boolean) => {
        outerDevToolsVisible.value = visible
      }
    )
    void window.electron.ipcRenderer.invoke('isMainDevToolsOpen').then((visible) => {
      outerDevToolsVisible.value = Boolean(visible)
    })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleWindowResize)
    removeMainDevToolsVisibilityListener?.()
    inspectorResizeCleanup?.()

    for (const serviceId of Array.from(inspectedServiceIds)) {
      void closeInspector(serviceId)
    }
  })

  watch(services, () => {
    for (const serviceId of Array.from(inspectedServiceIds)) {
      const inspectedService = services.value.find((service) => service.id === serviceId)
      if (!inspectedService || !inspectedService.enabled || inspectedService.hidden) {
        inspectorHeights.delete(serviceId)
        void closeInspector(serviceId)
      }
    }
  })

  watch(
    () => activeService.value?.id ?? null,
    (activeServiceId, previousActiveServiceId) => {
      if (previousActiveServiceId && inspectedServiceIds.has(previousActiveServiceId)) {
        void window.electron.ipcRenderer.invoke(
          'setDevToolsVisible',
          previousActiveServiceId,
          false
        )
      }

      void nextTick(async () => {
        await handleEffectiveInspectorVisibility()

        if (activeServiceId && inspectedServiceIds.has(activeServiceId)) {
          await syncInspector(activeServiceId)
        }
      })
    }
  )

  watch(effectiveInspectorVisible, (visible) => {
    void handleEffectiveInspectorVisibility()

    if (!visible || !activeInspectedServiceId.value) {
      return
    }

    void syncInspector(activeInspectedServiceId.value)
  })

  watch(
    currentInspectorHeight,
    () => {
      void handleWindowResize()
    },
    { flush: 'post' }
  )

  watch(outerDevToolsVisible, (visible) => {
    if (visible) {
      inspectorResizeCleanup?.()
    }

    void nextTick(() => {
      void handleEffectiveInspectorVisibility()
    })
  })

  return {
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
    syncInspectorBounds: handleWindowResize,
    updateInspectorResizeHotzone
  }
}
