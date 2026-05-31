import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import OverlayApp from './OverlayApp.vue'

const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1'

if (isOverlay) {
  document.documentElement.dataset.appOverlay = 'true'
}

createApp(isOverlay ? OverlayApp : App).mount('#app')
