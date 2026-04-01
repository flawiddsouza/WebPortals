<template>
  <div class="inspector-pane">
    <div
      class="inspector-toolbar"
      :style="{ cursor: resizeHotzone ? 'row-resize' : 'default' }"
      @mousedown="emit('resize-handle-mousedown', $event)"
      @mousemove="emit('resize-handle-mousemove', $event)"
      @mouseleave="emit('resize-handle-leave')"
    >
      <button
        class="close-button"
        :title="`Close inspector for ${title}`"
        @click="emit('close')"
        @mousedown.stop
      >
        ×
      </button>
    </div>

    <div class="inspector-content">
      <slot />
    </div>
  </div>

  <div v-if="resizing" class="resize-scrim"></div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  resizeHotzone: boolean
  resizing: boolean
}>()

const emit = defineEmits<{
  close: []
  'resize-handle-mousedown': [event: MouseEvent]
  'resize-handle-mousemove': [event: MouseEvent]
  'resize-handle-leave': []
}>()
</script>

<style scoped>
.inspector-pane {
  min-height: 0;
  display: grid;
  grid-template-rows: 22px minmax(0, 1fr);
  border-top: 1px solid #d1d5db;
  background: white;
  position: relative;
  z-index: 2;
}

.inspector-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px 0 4px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(248, 250, 252, 0.96);
}

.close-button {
  width: 20px;
  height: 20px;
  border: none;
  background: white;
  color: #334155;
  border-radius: 999px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
}

.inspector-content {
  min-height: 0;
}

.resize-scrim {
  position: absolute;
  inset: 0;
  z-index: 9999;
  cursor: row-resize;
}
</style>
