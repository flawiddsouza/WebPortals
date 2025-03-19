<template>
  <div class="screen-picker">
    <div class="screen-picker-header">
      <h3>Choose what to share</h3>
    </div>
    <div class="screen-picker-tabs">
      <button :class="{ active: activeTab === 'screen' }" @click="activeTab = 'screen'">
        Your Entire Screen
      </button>
      <button :class="{ active: activeTab === 'window' }" @click="activeTab = 'window'">
        Application Window
      </button>
    </div>
    <div class="screen-picker-content">
      <div v-if="loading" class="loading">Loading available screens...</div>
      <div v-else class="source-list">
        <div
          v-for="source in filteredSources"
          :key="source.id"
          class="source-item"
          :class="{ selected: selectedSourceId === source.id }"
          @click="selectedSourceId = source.id"
        >
          <div class="thumbnail">
            <img :src="source.thumbnail" :alt="source.name" />
          </div>
          <div class="name">{{ source.name }}</div>
        </div>
      </div>
    </div>
    <div class="screen-picker-footer">
      <button @click="$emit('cancel')">Cancel</button>
      <button :disabled="!selectedSourceId" class="primary" @click="handleShare">Share</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

defineProps<{
  serviceId: string
}>()

const emit = defineEmits<{
  cancel: []
  selected: [constraints: any]
}>()

const loading = ref(true)
const sources = ref<any[]>([])
const activeTab = ref('screen')
const selectedSourceId = ref('')

const filteredSources = computed(() => {
  return sources.value.filter((source) => {
    if (activeTab.value === 'screen') {
      return source.type === 'screen'
    } else {
      return source.type === 'window'
    }
  })
})

async function loadSources() {
  loading.value = true
  try {
    console.log('Loading screen sources...')
    const result = await window.electron.ipcRenderer.invoke('get-screens')
    console.log('Got sources:', result.sources.length)
    sources.value = result.sources

    // Auto-select first item
    if (sources.value.length > 0) {
      if (activeTab.value === 'screen') {
        const screens = sources.value.filter((s) => s.type === 'screen')
        if (screens.length > 0) {
          selectedSourceId.value = screens[0].id
          console.log('Auto-selected screen:', screens[0].name)
        }
      } else {
        const windows = sources.value.filter((s) => s.type === 'window')
        if (windows.length > 0) {
          selectedSourceId.value = windows[0].id
          console.log('Auto-selected window:', windows[0].name)
        }
      }
    } else {
      console.warn('No screen sources available')
    }
  } catch (error) {
    console.error('Failed to load sources:', error)
  } finally {
    loading.value = false
  }
}

async function handleShare() {
  if (!selectedSourceId.value) return

  try {
    console.log('Getting media constraints for source:', selectedSourceId.value)
    const constraints = await window.electron.ipcRenderer.invoke(
      'get-mediastream-constraints',
      selectedSourceId.value
    )
    console.log('Emitting selected event with constraints')
    emit('selected', constraints)
  } catch (error) {
    console.error('Error getting media constraints:', error)
  }
}

onMounted(() => {
  loadSources()
})
</script>

<style scoped>
.screen-picker {
  width: 600px;
  height: 450px;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border-radius: 8px;
  overflow: hidden;
}

.screen-picker-header {
  padding: 15px;
  border-bottom: 1px solid var(--ev-c-gray-3);
}

.screen-picker-tabs {
  display: flex;
  padding: 10px 15px;
  border-bottom: 1px solid var(--ev-c-gray-3);
}

.screen-picker-tabs button {
  background: none;
  border: none;
  padding: 8px 16px;
  color: var(--color-text);
  cursor: pointer;
  border-radius: 4px;
  margin-right: 8px;
}

.screen-picker-tabs button.active {
  background-color: var(--ev-c-gray-3);
}

.screen-picker-content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.source-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
}

.source-item {
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s;
}

.source-item.selected {
  border-color: #2196f3;
}

.thumbnail {
  width: 100%;
  height: 120px;
  background-color: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.name {
  padding: 8px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.screen-picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 15px;
  border-top: 1px solid var(--ev-c-gray-3);
}

.screen-picker-footer button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.screen-picker-footer button.primary {
  background-color: #2196f3;
  color: white;
}

.screen-picker-footer button.primary:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}
</style>
