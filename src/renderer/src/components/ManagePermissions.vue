<template>
  <div style="min-width: 28rem">
    <h2 style="margin-top: 0">Permissions</h2>

    <template v-if="service">
      <div style="margin-bottom: 1rem">
        <div>
          <strong>{{ service.name }}</strong>
        </div>
        <div><strong>Site:</strong> {{ currentOrigin }}</div>
        <div style="word-break: break-all"><strong>Configured URL:</strong> {{ service.url }}</div>
      </div>

      <table style="width: 100%">
        <thead>
          <tr>
            <th style="text-align: left">Permission</th>
            <th style="text-align: left">Access</th>
            <th style="text-align: left">Setting</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="setting in settings" :key="`${setting.permission}:${setting.mode ?? 'none'}`">
            <td>{{ getPermissionLabel(setting) }}</td>
            <td>{{ getModeLabelForPermission(setting) }}</td>
            <td>
              <select
                :value="setting.decision"
                @change="updatePermission(setting, $event)"
                :disabled="savingKeys.has(`${setting.permission}:${setting.mode ?? 'none'}`)"
              >
                <option value="ask">Ask every time</option>
                <option value="allow">Allow on every visit</option>
                <option value="block">Don't allow</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-else>
      <div>Select a service to manage its permissions.</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Service } from '@renderer/db'

type ManagedPermission =
  | 'fileSystem'
  | 'camera'
  | 'microphone'
  | 'notifications'
  | 'geolocation'
  | 'clipboardRead'
  | 'clipboardWrite'
type FileSystemAccessMode = 'readable' | 'writable'
type PermissionDecision = 'ask' | 'allow' | 'block'

interface PermissionSetting {
  permission: ManagedPermission
  mode?: FileSystemAccessMode
  decision: PermissionDecision
}

const props = defineProps<{
  service: Service | null
  targetUrl: string
}>()

const settings = ref<PermissionSetting[]>([])
const savingKeys = ref(new Set<string>())
const currentOrigin = computed(() => {
  const url = props.targetUrl || props.service?.url || ''

  try {
    return new URL(url).origin
  } catch {
    return url
  }
})

async function loadPermissions() {
  if (!props.service) {
    settings.value = []
    return
  }

  settings.value = await window.electron.ipcRenderer.invoke('permissions-list', {
    partitionId: props.service.partitionId,
    url: props.targetUrl || props.service.url
  })
}

function getPermissionLabel(setting: PermissionSetting) {
  if (setting.permission === 'fileSystem') {
    return 'Files and folders'
  }

  if (setting.permission === 'camera') {
    return 'Camera'
  }

  if (setting.permission === 'microphone') {
    return 'Microphone'
  }

  if (setting.permission === 'notifications') {
    return 'Notifications'
  }

  if (setting.permission === 'clipboardRead' || setting.permission === 'clipboardWrite') {
    return 'Clipboard'
  }

  return 'Location'
}

function getModeLabel(mode?: FileSystemAccessMode) {
  if (mode === 'writable') {
    return 'Write'
  }

  if (mode === 'readable') {
    return 'Read'
  }

  return '-'
}

function getModeLabelForPermission(setting: PermissionSetting) {
  if (setting.permission === 'clipboardRead') {
    return 'Read'
  }

  if (setting.permission === 'clipboardWrite') {
    return 'Write'
  }

  return getModeLabel(setting.mode)
}

async function updatePermission(eventSetting: PermissionSetting, event: Event) {
  if (!props.service) {
    return
  }

  const decision = (event.target as HTMLSelectElement).value as PermissionDecision
  const key = `${eventSetting.permission}:${eventSetting.mode ?? 'none'}`

  savingKeys.value.add(key)

  try {
    settings.value = await window.electron.ipcRenderer.invoke('permissions-update', {
      partitionId: props.service.partitionId,
      url: props.targetUrl || props.service.url,
      permission: eventSetting.permission,
      mode: eventSetting.mode,
      decision
    })
  } finally {
    savingKeys.value.delete(key)
  }
}

watch(
  () => [props.service, props.targetUrl],
  () => {
    void loadPermissions()
  },
  { immediate: true }
)
</script>
