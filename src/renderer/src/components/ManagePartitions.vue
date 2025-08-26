<template>
  <form @submit.prevent="savePartition">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="partition in partitions" :key="partition.id">
          <template v-if="editPartition?.id !== partition.id">
            <td>
              {{ partition.name }}
            </td>
            <td>
              <button type="button" @click="startEdit(partition)">Edit</button>
              <button type="button" @click="handleDeletePartititon(partition)">Delete</button>
            </td>
          </template>
          <template v-else>
            <td>
              <input v-model="editPartition.name" v-focus type="text" required />
            </td>
            <td>
              <button>Save</button>
              <button type="button" @click="editPartition = null">Cancel</button>
            </td>
          </template>
        </tr>
        <tr v-if="addPartition">
          <td>
            <input v-model="addPartition.name" v-focus type="text" required />
          </td>
          <td>
            <button>Save</button>
            <button type="button" @click="addPartition = null">Cancel</button>
          </td>
        </tr>
        <tr>
          <td colspan="100%" @click="startAddPartition">+ Add Partition</td>
        </tr>
      </tbody>
    </table>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  createPartition,
  deletePartition,
  getPartitions,
  getServices,
  updatePartition,
  type Partition
} from '@renderer/db'
import { vFocus } from '@renderer/utils'

defineProps<{
  partitions: Partition[]
}>()

const emit = defineEmits<{
  'update:partitions': [Partition[]]
}>()

const addPartition = ref<Partial<Partition> | null>(null)
const editPartition = ref<Partition | null>(null)

function startAddPartition() {
  addPartition.value = {}
}

function startEdit(partition: Partition) {
  editPartition.value = JSON.parse(JSON.stringify(partition))
}

async function savePartition() {
  if (addPartition.value) {
    if (!addPartition.value?.name) {
      alert('Please enter a name')
      return
    }

    await createPartition(addPartition.value.name)
    emit('update:partitions', await getPartitions())
    addPartition.value = null
  }

  if (editPartition.value) {
    if (!editPartition.value.name) {
      alert('Please enter a name')
      return
    }

    await updatePartition(editPartition.value.id, editPartition.value.name)
    emit('update:partitions', await getPartitions())
    editPartition.value = null
  }
}

async function handleDeletePartititon(partition: Partition) {
  const services = await getServices()

  const inUse = services.some((service) => {
    if (service.partitionId === partition.id) {
      return true
    }
    return false
  })

  if (inUse) {
    alert('Cannot delete partition used by services')
    return
  }

  if (!confirm('Are you sure you want to delete this partition?')) {
    return
  }

  await deletePartition(partition.id)
  emit('update:partitions', await getPartitions())
}
</script>
