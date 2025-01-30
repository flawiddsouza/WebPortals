<script setup lang="ts">
const ipcHandle = () => window.electron.ipcRenderer.send('ping')
</script>

<template>
  <div style="height: 100dvh; display: grid; grid-template-columns: auto 1fr;">
    <div style="height: 100%; background-color: lightcoral; padding: 1rem;">
      <div>Service 1</div>
      <div>Service 2</div>
      <div>Service 3</div>
      <button>Add Service</button>
    </div>
    <div style="height: 100%; background-color: plum;">
      <button @click="ipcHandle">Ping</button>
    </div>
  </div>
</template>
