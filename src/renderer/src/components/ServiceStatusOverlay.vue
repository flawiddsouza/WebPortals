<template>
  <div v-if="loading" class="loading-overlay">
    <span
      v-for="(color, index) in loadingColors"
      :key="color"
      class="loading-dot"
      :style="{ background: color, animationDelay: `${index * 0.15}s` }"
    ></span>
  </div>

  <div v-else-if="error" class="error-overlay">
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" class="error-icon">
      <circle cx="36" cy="36" r="32" fill="#e5e7eb" />
      <path d="M24 24l24 24M48 24L24 48" stroke="#9ca3af" stroke-width="5" stroke-linecap="round" />
    </svg>
    <p class="error-title">{{ error.title }}</p>
    <p class="error-message">{{ error.message }}</p>
    <p class="error-url">{{ serviceUrl }}</p>
    <code class="error-raw">{{ error.raw }}</code>
    <button class="retry-button" @click="emit('retry')">Retry</button>
  </div>
</template>

<script setup lang="ts">
interface ServiceErrorState {
  title: string
  message: string
  raw: string
}

defineProps<{
  serviceUrl: string
  loading: boolean
  error: ServiceErrorState | null
}>()

const emit = defineEmits<{
  retry: []
}>()

const loadingColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6']
</script>

<style scoped>
.loading-overlay,
.error-overlay {
  position: absolute;
  inset: 0;
  background: #f8f9fa;
}

.loading-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.loading-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  animation: bounce 1s ease-in-out infinite;
}

.error-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.error-icon {
  margin-bottom: 1.5rem;
}

.error-title {
  margin: 0 0 0.5rem;
  font-size: 1.4rem;
  font-weight: 600;
  color: #1f2937;
}

.error-message {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  color: #6b7280;
  max-width: 380px;
  text-align: center;
  line-height: 1.5;
}

.error-url {
  margin: 0 0 1.5rem;
  font-size: 0.85rem;
  color: #9ca3af;
  max-width: 480px;
  text-align: center;
  overflow-wrap: break-word;
}

.error-raw {
  margin-bottom: 1.5rem;
  font-size: 0.75rem;
  color: #6b7280;
  background: #e5e7eb;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.retry-button {
  padding: 0.5rem 1.5rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: inherit;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-14px);
  }
}
</style>
