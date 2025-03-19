<template>
  <div class="find-container" v-if="visible">
    <div class="find-input-container">
      <input
        ref="findInput"
        type="text"
        v-model="currentSearchText"
        placeholder="Find in page"
        @keydown="handleKeyDown"
        @input="startFind"
        autofocus
      />
      <span class="result-count" v-if="activeMatchOrdinal !== null">
        {{ activeMatchOrdinal }}/{{ numberOfMatches }}
      </span>
    </div>
    <div class="find-actions">
      <button @click="findPrevious" :disabled="numberOfMatches === 0">
        <span>↑</span>
      </button>
      <button @click="findNext" :disabled="numberOfMatches === 0">
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
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
}>()

const searchTextMap = ref(new Map<string, string>())
const numberOfMatches = ref(0)
const activeMatchOrdinal = ref<number | null>(null)
const findInput = ref<HTMLInputElement | null>(null)

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

// Immediately focus input when component becomes visible
watch(
  () => props.visible,
  async (newValue) => {
    if (newValue) {
      await nextTick()
      // Try multiple times to ensure focus works even if there's a delay
      findInput.value?.focus()
      // Sometimes focus doesn't work on the first try, especially when switching context
      setTimeout(() => {
        findInput.value?.focus()
      }, 50)

      if (currentSearchText.value) {
        startFind()
      }
    } else {
      stopFind()
    }
  },
  { immediate: true }
)

watch(
  () => props.webviewId,
  (newId, oldId) => {
    if (newId && props.visible) {
      // If webview changed, reset and restart find with the search text for this webview
      stopFind(oldId)
      nextTick(() => {
        findInput.value?.focus()
        if (currentSearchText.value) {
          startFind()
        }
      })
    }
  }
)

function getActiveWebview() {
  if (!props.webviewId) return null
  return document.querySelector(
    `.webview[data-service-id="${props.webviewId}"]`
  ) as Electron.WebviewTag | null
}

function startFind() {
  const webview = getActiveWebview()
  if (!webview || !currentSearchText.value) {
    resetFindState()
    return
  }

  webview.findInPage(currentSearchText.value)
}

function findNext() {
  const webview = getActiveWebview()
  if (!webview || !currentSearchText.value) return

  webview.findInPage(currentSearchText.value, { forward: true, findNext: true })
}

function findPrevious() {
  const webview = getActiveWebview()
  if (!webview || !currentSearchText.value) return

  webview.findInPage(currentSearchText.value, { forward: false, findNext: true })
}

function stopFind(webviewId?: string | null) {
  const id = webviewId || props.webviewId
  if (!id) return

  const webview = document.querySelector(
    `.webview[data-service-id="${id}"]`
  ) as Electron.WebviewTag | null

  if (!webview) return

  webview.stopFindInPage('clearSelection')
  resetFindState()
}

function resetFindState() {
  numberOfMatches.value = 0
  activeMatchOrdinal.value = null
}

function closeFindBar() {
  stopFind()
  emit('update:visible', false)
}

function handleFoundInPage(event: Electron.FoundInPageEvent) {
  // Update UI with result counts
  if (event.result.finalUpdate) {
    numberOfMatches.value = event.result.matches
    if (event.result.matches > 0) {
      activeMatchOrdinal.value = event.result.activeMatchOrdinal
    } else {
      activeMatchOrdinal.value = null
    }
  }
}

// Listen for found-in-page events
function setupWebviewListeners() {
  const webview = getActiveWebview()
  if (!webview) return

  webview.addEventListener('found-in-page', handleFoundInPage)
}

function cleanupWebviewListeners() {
  const webview = getActiveWebview()
  if (!webview) return

  webview.removeEventListener('found-in-page', handleFoundInPage)
}

// Set up and clean up webview event listeners
onMounted(() => {
  setupWebviewListeners()
  if (props.visible) {
    nextTick(() => {
      findInput.value?.focus()
    })
  }
})

onBeforeUnmount(() => {
  // Clear all find operations when component is unmounted
  for (const id of searchTextMap.value.keys()) {
    stopFind(id)
  }
  cleanupWebviewListeners()
})

// Watch for webview changes and update listeners
watch(
  () => props.webviewId,
  () => {
    cleanupWebviewListeners()
    setupWebviewListeners()
  }
)

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
