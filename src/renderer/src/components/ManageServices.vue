<template>
  <form @submit.prevent="handleCreateService">
    <div>
      <label>
        <div>Partition</div>
        <select v-model="addService.partitionId" v-focus required>
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
        <input v-model="addService.name" type="text" required />
      </label>
    </div>
    <div>
      <label>
        <div>URL</div>
        <input v-model="addService.url" type="url" required />
      </label>
    </div>
    <div>
      <label>
        <div>Enabled</div>
        <select v-model="addService.enabled">
          <option :value="true">Yes</option>
          <option :value="false">No</option>
        </select>
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
          <th>Enabled</th>
          <th>Order</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(service, serviceIndex) in services" :key="service.id">
          <template v-if="editService?.id !== service.id">
            <td>{{ getPartitionName(service.partitionId) }}</td>
            <td>{{ service.name }}</td>
            <td
              style="
                max-width: 25rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                user-select: text;
              "
            >
              {{ service.url }}
            </td>
            <td style="text-align: center" @click="updateServiceEnabled(service)">
              <template v-if="service.enabled">Yes</template>
              <template v-else>No</template>
            </td>
            <td>
              <button @click="moveUp(serviceIndex)">↑</button>
              <button @click="moveDown(serviceIndex)">↓</button>
            </td>
            <td>
              <button type="button" @click="startEditService(service)">Edit</button>
              <button type="button" @click="handleDeleteService(service)">Delete</button>
            </td>
          </template>
          <template v-else>
            <td>
              <select v-model="editService.partitionId" v-focus required>
                <option v-for="partition in partitions" :key="partition.id" :value="partition.id">
                  {{ partition.name }}
                </option>
              </select>
            </td>
            <td><input v-model="editService.name" type="text" required /></td>
            <td><input v-model="editService.url" type="url" required style="width: 100%" /></td>
            <td style="text-align: center">
              <select v-model="editService.enabled" required>
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </td>
            <td></td>
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
import {
  createService,
  deleteService,
  getServices,
  updateService,
  updateServicesSortOrder
} from '@renderer/db'
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

const addService = ref<Partial<Service>>({
  enabled: true
})
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

  if (addService.value.enabled === undefined) {
    alert('Please select whether the service is enabled')
    return
  }

  await createService(
    addService.value.partitionId,
    addService.value.name,
    addService.value.url,
    addService.value.enabled
  )
  emit('update:services', await getServices())

  addService.value = {
    enabled: true
  }
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
    editService.value.url,
    editService.value.enabled
  )
  emit('update:services', await getServices())

  editService.value = null
}

async function updateServiceEnabled(service: Service) {
  service.enabled = !service.enabled
  await updateService(service.id, service.partitionId, service.name, service.url, service.enabled)
  emit('update:services', await getServices())
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

async function moveUp(index: number) {
  if (index === 0) return

  const services = [...props.services]
  const service = services[index]
  services[index] = services[index - 1]
  services[index - 1] = service

  await updateServicesSortOrder(
    services.map((service, serviceIndex) => {
      return {
        serviceId: service.id,
        sortOrder: serviceIndex + 1
      }
    })
  )

  emit('update:services', await getServices())
}

async function moveDown(index: number) {
  if (index === props.services.length - 1) return

  const services = [...props.services]
  const service = services[index]
  services[index] = services[index + 1]
  services[index + 1] = service

  await updateServicesSortOrder(
    services.map((service, serviceIndex) => {
      return {
        serviceId: service.id,
        sortOrder: serviceIndex + 1
      }
    })
  )

  emit('update:services', await getServices())
}
</script>
