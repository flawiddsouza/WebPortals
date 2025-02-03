<template>
  <form @submit.prevent="handleCreateService">
    <div>
      <label>
        <div>Partition</div>
        <select v-model="addService.partitionId" required v-focus>
          <option v-for="partition in partitions" :key="partition.id" :value="partition.id">
            {{ partition.name }}
          </option>
        </select>
      </label>
      <div>
        <button type="button" @click="emit('update:showPartitionManager', true)">Manage</button>
      </div>
    </div>
    <div>
      <label>
        <div>Name</div>
        <input type="text" v-model="addService.name" required />
      </label>
    </div>
    <div>
      <label>
        <div>URL</div>
        <input type="url" v-model="addService.url" required />
      </label>
    </div>
    <button style="margin-top: 1rem">Add Service</button>
  </form>

  <hr style="margin-top: 1rem; margin-bottom: 1rem" />

  <form @submit.prevent="handleUpdateService">
    <table>
      <thead>
        <tr>
          <th>Partition</th>
          <th>Name</th>
          <th>URL</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="service in services" :key="service.id">
          <template v-if="editService?.id !== service.id">
            <td>{{ getPartitionName(service.partitionId) }}</td>
            <td>{{ service.name }}</td>
            <td>{{ service.url }}</td>
            <td>
              <button type="button" @click="startEditService(service)">Edit</button>
              <button type="button" @click="handleDeleteService(service)">Delete</button>
            </td>
          </template>
          <template v-else>
            <td>
              <select v-model="editService.partitionId" required v-focus>
                <option v-for="partition in partitions" :key="partition.id" :value="partition.id">
                  {{ partition.name }}
                </option>
              </select>
            </td>
            <td><input type="text" v-model="editService.name" required /></td>
            <td><input type="url" v-model="editService.url" required /></td>
            <td>
              <button>Save</button>
              <button type="button" @click="editService = null">Cancel</button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { createService, deleteService, getServices, updateService } from '@renderer/db'
import { vFocus } from '@renderer/utils'
import type { Partition, Service } from '@renderer/db'

const props = defineProps<{
  partitions: Partition[]
  services: Service[]
  showPartitionManager: boolean
}>()

const emit = defineEmits<{
  'update:services': [Service[]]
  'update:showPartitionManager': [boolean]
}>()

const addService = ref<Partial<Service>>({})
const editService = ref<Service | null>(null)

async function handleCreateService() {
  if (!addService.value.partitionId) {
    alert('Please select a partition')
    return
  }

  if (!addService.value.name) {
    alert('Please enter a name')
    return
  }

  if (!addService.value.url) {
    alert('Please enter a url')
    return
  }

  await createService(addService.value.partitionId, addService.value.name, addService.value.url)
  emit('update:services', await getServices())

  addService.value = {}
}

function startEditService(service: Service) {
  editService.value = JSON.parse(JSON.stringify(service))
}

async function handleUpdateService() {
  if (!editService.value) return

  await updateService(
    editService.value.id,
    editService.value.partitionId,
    editService.value.name,
    editService.value.url
  )
  emit('update:services', await getServices())

  editService.value = null
}

async function handleDeleteService(service: Service) {
  if (!confirm('Are you sure you want to delete this service?')) {
    return
  }

  await deleteService(service.id)
  emit('update:services', await getServices())
}

function getPartitionName(partitionId: string) {
  return props.partitions.find((partition) => partition.id === partitionId)?.name
}
</script>
