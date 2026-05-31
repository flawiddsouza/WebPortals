<template>
  <div v-if="visible" class="find-container">
    <div class="find-input-container">
      <input
        ref="findInput"
        v-model="currentSearchText"
        type="text"
        placeholder="Find in page"
        autofocus
        @keydown="handleKeyDown"
        @input="startFind"
      />
      <span v-if="activeMatchOrdinal !== null" class="result-count">
        {{ activeMatchOrdinal }}/{{ numberOfMatches }}
      </span>
    </div>
    <div class="find-actions">
      <button :disabled="numberOfMatches === 0" @click="findPrevious">
        <span>↑</span>
      </button>
      <button :disabled="numberOfMatches === 0" @click="findNext">
        <span>↓</span>
      </button>
      <button @click="closeFindBar">
        <span>✕</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  webviewId: string | null
  activateSearchOnShow?: boolean
  focusOnShow?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
}>()

type FindResultState = {
  numberOfMatches: number
  activeMatchOrdinal: number | null
}

type FindOptions = {
  forward?: boolean
  findNext?: boolean
}

const preserveOnHide = ref(false)
const preservedFindServiceIds = ref(new Set<string>())
const restoringPreservedFind = ref(false)
const searchTextMap = ref(new Map<string, string>())
const findResultMap = ref(new Map<string, FindResultState>())
const latestFindSequences = ref(new Map<string, number>())
const latestFindRequestIds = ref(new Map<string, number>())
const pendingFindResultMap = ref(new Map<string, Map<number, FindResultState>>())
const numberOfMatches = ref(0)
const activeMatchOrdinal = ref<number | null>(null)
const findInput = ref<HTMLInputElement | null>(null)
let nextFindSequence = 0

// Computed property to get/set the current search text based on webviewId
const currentSearchText = computed({
  get: () => {
    if (!props.webviewId) return ''
    return searchTextMap.value.get(props.webviewId) || ''
  },
  set: (value: string) => {
    if (!props.webviewId) return
    searchTextMap.value.set(props.webviewId, value)
  }
})

function focusFindInput() {
  findInput.value?.focus()
  setTimeout(() => {
    findInput.value?.focus()
  }, 50)
}

defineExpose({
  focus: focusFindInput
})

// Immediately focus input when component becomes visible
watch(
  () => props.visible,
  async (newValue) => {
    if (newValue) {
      preserveOnHide.value = false
      restoreFindState()
      await nextTick()
      if (props.focusOnShow !== false) {
        focusFindInput()
      }

      if (
        currentSearchText.value &&
        props.activateSearchOnShow !== false &&
        !restoringPreservedFind.value
      ) {
        startFind()
      }
      restoringPreservedFind.value = false
    } else {
      if (preserveOnHide.value || !props.webviewId) {
        preserveOnHide.value = false
      } else {
        stopFind()
      }
    }
  },
  { immediate: true }
)

watch(
  () => props.webviewId,
  (newId, oldId) => {
    if (oldId && !newId) {
      preserveOnHide.value = true
      preservedFindServiceIds.value.add(oldId)
    } else if (newId) {
      preserveOnHide.value = false
      restoringPreservedFind.value = preservedFindServiceIds.value.delete(newId)
    }

    restoreFindState(newId)

    if (newId && props.visible) {
      nextTick(() => {
        if (props.focusOnShow !== false) {
          focusFindInput()
        }
        if (
          currentSearchText.value &&
          props.activateSearchOnShow !== false &&
          !restoringPreservedFind.value
        ) {
          startFind()
        }
        restoringPreservedFind.value = false
      })
    }
  }
)

function startFind() {
  if (!props.webviewId || !currentSearchText.value) {
    resetFindState(props.webviewId)
    return
  }

  findInPage(props.webviewId, currentSearchText.value, { forward: true, findNext: true })
}

function findNext() {
  if (!props.webviewId || !currentSearchText.value) return

  findInPage(props.webviewId, currentSearchText.value, { forward: true, findNext: false })
}

function findPrevious() {
  if (!props.webviewId || !currentSearchText.value) return

  findInPage(props.webviewId, currentSearchText.value, { forward: false, findNext: false })
}

function findInPage(webviewId: string, text: string, options?: FindOptions) {
  const sequence = ++nextFindSequence
  latestFindSequences.value.set(webviewId, sequence)
  latestFindRequestIds.value.delete(webviewId)

  void window.electron.ipcRenderer
    .invoke('service-page-find-start', webviewId, text, options)
    .then((requestId) => {
      if (typeof requestId !== 'number') {
        return
      }

      if (latestFindSequences.value.get(webviewId) !== sequence) {
        return
      }

      latestFindRequestIds.value.set(webviewId, requestId)
      applyPendingFindResult(webviewId, requestId)
    })
}

function stopFind(webviewId?: string | null) {
  const id = webviewId || props.webviewId
  if (!id) return

  void window.electron.ipcRenderer.invoke('service-page-find-stop', id)
  resetFindState(id)
}

function applyPendingFindResult(webviewId: string, requestId: number) {
  const pendingResults = pendingFindResultMap.value.get(webviewId)
  const state = pendingResults?.get(requestId)
  if (!pendingResults || !state) {
    return
  }

  saveFindState(webviewId, state)
  pendingResults.delete(requestId)
  if (pendingResults.size === 0) {
    pendingFindResultMap.value.delete(webviewId)
  }
}

function savePendingFindResult(webviewId: string, requestId: number, state: FindResultState) {
  let pendingResults = pendingFindResultMap.value.get(webviewId)
  if (!pendingResults) {
    pendingResults = new Map<number, FindResultState>()
    pendingFindResultMap.value.set(webviewId, pendingResults)
  }

  pendingResults.set(requestId, state)
}

function applyFindState(state: FindResultState) {
  numberOfMatches.value = state.numberOfMatches
  activeMatchOrdinal.value = state.activeMatchOrdinal
}

function restoreFindState(webviewId = props.webviewId) {
  const state = webviewId ? findResultMap.value.get(webviewId) : null
  applyFindState(state ?? { numberOfMatches: 0, activeMatchOrdinal: null })
}

function resetFindState(webviewId?: string | null) {
  const id = webviewId || props.webviewId
  if (id) {
    findResultMap.value.delete(id)
    latestFindSequences.value.delete(id)
    latestFindRequestIds.value.delete(id)
    pendingFindResultMap.value.delete(id)
  }

  if (!id || id === props.webviewId) {
    applyFindState({ numberOfMatches: 0, activeMatchOrdinal: null })
  }
}

function saveFindState(webviewId: string, state: FindResultState) {
  findResultMap.value.set(webviewId, state)
  if (webviewId === props.webviewId) {
    applyFindState(state)
  }
}

function closeFindBar() {
  stopFind()
  emit('update:visible', false)
}

function handleFoundInPage(payload: {
  serviceId: string
  result: {
    requestId: number
    finalUpdate: boolean
    matches: number
    activeMatchOrdinal: number
  }
}) {
  // Update UI with result counts
  if (payload.result.finalUpdate) {
    const state = {
      numberOfMatches: payload.result.matches,
      activeMatchOrdinal: payload.result.matches > 0 ? payload.result.activeMatchOrdinal : null
    }

    const latestRequestId = latestFindRequestIds.value.get(payload.serviceId)
    if (latestRequestId === undefined && latestFindSequences.value.has(payload.serviceId)) {
      savePendingFindResult(payload.serviceId, payload.result.requestId, state)
      return
    }

    if (latestRequestId === undefined || payload.result.requestId !== latestRequestId) {
      return
    }

    saveFindState(payload.serviceId, state)
  }
}

let removeFoundInPageListener: (() => void) | null = null

// Set up and clean up webview event listeners
onMounted(() => {
  removeFoundInPageListener = window.electron.ipcRenderer.on(
    'service-page-found-in-page',
    (_event, payload) => {
      handleFoundInPage(payload)
    }
  )
  if (props.visible) {
    nextTick(() => {
      if (props.focusOnShow !== false) {
        focusFindInput()
      }
    })
  }
})

onBeforeUnmount(() => {
  // Clear all find operations when component is unmounted
  for (const id of searchTextMap.value.keys()) {
    stopFind(id)
  }
  removeFoundInPageListener?.()
})

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      findPrevious()
    } else {
      findNext()
    }
  } else if (event.key === 'Escape') {
    closeFindBar()
  } else if (event.key === 'Tab') {
    // Allow Tab to work normally for accessibility
  } else {
    // Prevent losing focus for any other key
    event.stopPropagation()
  }
}
</script>

<style scoped>
.find-container {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  background-color: var(--color-background-soft);
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  padding: 8px;
  align-items: center;
}

.find-input-container {
  position: relative;
}

.find-input-container input {
  padding: 6px 8px;
  border: 1px solid var(--ev-c-gray-3);
  border-radius: 4px;
  width: 200px;
  color: var(--color-text);
  background-color: var(--color-background);
}

.find-input-container .result-count {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--ev-c-text-2);
}

.find-actions {
  display: flex;
  margin-left: 8px;
}

.find-actions button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  color: var(--color-text);
  border-radius: 4px;
  margin-left: 2px;
}

.find-actions button:hover {
  background-color: var(--ev-c-gray-3);
}

.find-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
