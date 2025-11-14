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
    <div>
      <label>
        <div>Hidden</div>
        <select v-model="addService.hidden">
          <option :value="false">No</option>
          <option :value="true">Yes</option>
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
          <th>Hidden</th>
          <th>Order</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(service, serviceIndex) in services"
          :key="service.id"
          :data-index="serviceIndex"
          draggable="true"
          :class="{
            'drag-over': dragOverIndex === serviceIndex,
            dragging: dragStartIndex === serviceIndex
          }"
          @dragstart="onDragStart($event, serviceIndex)"
          @dragover.prevent="onDragOver($event, serviceIndex)"
          @drop.prevent="onDrop($event, serviceIndex)"
        >
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
            <td style="text-align: center" @click="updateServiceHidden(service)">
              <template v-if="service.hidden">Yes</template>
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
            <td style="text-align: center">
              <select v-model="editService.hidden" required>
                <option :value="false">No</option>
                <option :value="true">Yes</option>
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
  enabled: true,
  hidden: false
})
const editService = ref<Service | null>(null)
const dragStartIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

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
    addService.value.enabled,
    addService.value.hidden ?? false
  )
  emit('update:services', await getServices())

  addService.value = {
    enabled: true,
    hidden: false
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
    editService.value.enabled,
    editService.value.hidden
  )
  emit('update:services', await getServices())

  editService.value = null
}

async function updateServiceEnabled(service: Service) {
  service.enabled = !service.enabled
  await updateService(
    service.id,
    service.partitionId,
    service.name,
    service.url,
    service.enabled,
    service.hidden
  )
  emit('update:services', await getServices())
}

async function updateServiceHidden(service: Service) {
  service.hidden = !service.hidden
  await updateService(
    service.id,
    service.partitionId,
    service.name,
    service.url,
    service.enabled,
    service.hidden
  )
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

async function reorderServices(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return

  const services = [...props.services]
  const [moved] = services.splice(fromIndex, 1)
  services.splice(toIndex, 0, moved)

  await updateServicesSortOrder(
    services.map((service, serviceIndex) => ({
      serviceId: service.id,
      sortOrder: serviceIndex + 1
    }))
  )

  emit('update:services', await getServices())
}

function onDragStart(e: DragEvent, index: number) {
  dragStartIndex.value = index
  try {
    e.dataTransfer?.setData('text/plain', String(index))
  } catch (err) {
    // ignore in environments that block setData
  }
}

function onDragOver(_e: DragEvent, index: number) {
  dragOverIndex.value = index
}

async function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  let fromIndex: number | null = null

  // Prefer transfer data when available
  try {
    const data = e.dataTransfer?.getData('text/plain')
    if (data !== undefined && data !== null && data !== '') {
      const parsed = parseInt(data, 10)
      if (!Number.isNaN(parsed)) fromIndex = parsed
    }
  } catch (err) {
    // ignore
  }

  if (fromIndex === null) fromIndex = dragStartIndex.value
  if (fromIndex === null) return

  await reorderServices(fromIndex, index)

  dragStartIndex.value = null
  dragOverIndex.value = null
}
</script>

<style scoped>
tr.dragging {
  opacity: 0.6;
}

tr.drag-over {
  outline: 3px dashed var(--v-border-color, #3b82f6);
  outline-offset: -6px;
  background: rgba(59, 130, 246, 0.06);
}
</style>
