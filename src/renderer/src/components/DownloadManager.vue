<template>
  <div v-if="downloads.length > 0" class="download-manager">
    <div class="download-header" @click="expanded = !expanded">
      <span>{{ downloads.length }} Download{{ downloads.length > 1 ? 's' : '' }}</span>
      <span class="toggle">{{ expanded ? '▼' : '▲' }}</span>
    </div>

    <div v-if="expanded" class="download-list">
      <div v-for="download in downloads" :key="download.id" class="download-item">
        <div class="download-info">
          <div class="filename" :title="download.filename">{{ download.filename }}</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress(download) + '%' }"></div>
          </div>
          <div class="download-stats">
            <span
              >{{ formatBytes(download.receivedBytes) }} /
              {{ formatBytes(download.totalBytes) }}</span
            >
            <span v-if="download.state === 'completed'" class="completed">✓</span>
          </div>
        </div>

        <div class="download-actions">
          <template v-if="download.state === 'progressing' || download.state === 'paused'">
            <button
              v-if="download.state === 'progressing'"
              @click="pauseDownload(download.id)"
              title="Pause download"
            >
              ⏸ Pause
            </button>

            <button
              v-if="download.state === 'paused'"
              @click="resumeDownload(download.id)"
              title="Resume download"
            >
              ▶ Resume
            </button>

            <button @click="cancelDownload(download.id)" title="Cancel download">✕ Cancel</button>
          </template>

          <template v-else-if="download.state === 'completed'">
            <button @click="openDownload(download)" title="Open file">Open</button>
            <button @click="showInFolder(download)" title="Show in folder">Show in Folder</button>
            <button @click="removeDownload(download.id)" title="Clear">✕</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

interface Download {
  id: string
  filename: string
  totalBytes: number
  receivedBytes: number
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'
  savePath: string
}

const downloads = ref<Download[]>([])
const expanded = ref(true)

function progress(download: Download): number {
  if (download.totalBytes === 0) return 0
  return (download.receivedBytes / download.totalBytes) * 100
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

async function cancelDownload(id: string) {
  await window.electron.ipcRenderer.invoke('download-cancel', id)
  downloads.value = downloads.value.filter((d) => d.id !== id)
}

async function pauseDownload(id: string) {
  const ok = await window.electron.ipcRenderer.invoke('download-pause', id)
  if (ok) {
    const d = downloads.value.find((x) => x.id === id)
    if (d) d.state = 'paused'
  }
}

async function resumeDownload(id: string) {
  const ok = await window.electron.ipcRenderer.invoke('download-resume', id)
  if (ok) {
    const d = downloads.value.find((x) => x.id === id)
    if (d) d.state = 'progressing'
  }
}

async function openDownload(download: Download) {
  await window.electron.ipcRenderer.invoke('download-open', download.savePath)
}

async function showInFolder(download: Download) {
  await window.electron.ipcRenderer.invoke('download-show-in-folder', download.savePath)
}

function removeDownload(id: string) {
  downloads.value = downloads.value.filter((d) => d.id !== id)
}

onMounted(() => {
  window.electron.ipcRenderer.on('download-started', (_event, data) => {
    downloads.value.push(data)
  })

  window.electron.ipcRenderer.on('download-progress', (_event, data) => {
    const download = downloads.value.find((d) => d.id === data.id)
    if (download) {
      download.receivedBytes = data.receivedBytes
      download.totalBytes = data.totalBytes
      download.state = data.state
    }
  })

  window.electron.ipcRenderer.on('download-done', (_event, data) => {
    const download = downloads.value.find((d) => d.id === data.id)
    if (download) {
      download.state = data.state
      // Remove failed/cancelled downloads automatically, but keep completed ones
      if (data.state !== 'completed') {
        downloads.value = downloads.value.filter((d) => d.id !== data.id)
      }
    }
  })
})

onBeforeUnmount(() => {
  window.electron.ipcRenderer.removeAllListeners('download-started')
  window.electron.ipcRenderer.removeAllListeners('download-progress')
  window.electron.ipcRenderer.removeAllListeners('download-done')
})
</script>

<style scoped>
.download-manager {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #2c2c2c;
  color: white;
  border-top: 1px solid #444;
  z-index: 1000;
}

.download-header {
  padding: 0.5rem 1rem;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
  font-size: 0.9rem;
}

.download-header:hover {
  background-color: #333;
}

.download-list {
  max-height: 300px;
  overflow-y: auto;
}

.download-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid #444;
}

.download-info {
  flex: 1;
  min-width: 0;
}

.filename {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.25rem;
}

.progress-bar {
  height: 4px;
  background-color: #444;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.25rem;
}

.progress-fill {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.3s ease;
}

.download-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #aaa;
}

.completed {
  color: #4caf50;
  font-weight: bold;
}

.download-actions {
  display: flex;
  gap: 0.5rem;
}

.download-actions button {
  background: none;
  border: 1px solid #666;
  color: white;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  border-radius: 3px;
  font-size: 1rem;
  min-width: 2rem;
}

.download-actions button:hover {
  background-color: #444;
}
</style>
