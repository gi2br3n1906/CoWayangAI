<template>
  <div class="bg-wayang-card rounded-2xl shadow-2xl border border-white/10 overflow-hidden h-full flex flex-col">
    <!-- Header -->
    <div class="bg-gradient-to-r from-wayang-gold/20 to-wayang-primary/20 p-4 border-b border-white/10 flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-wayang-primary/20 rounded-lg flex items-center justify-center">
          <svg class="w-6 h-6 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-white flex items-center gap-2">
            <span>Transcription</span>
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-wayang-gold opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-wayang-gold"></span>
            </span>
          </h3>
          <div class="flex items-center gap-2">
            <p class="text-xs text-gray-400">Live subtitle feed</p>
            <span v-if="queueCount > 0" class="text-xs bg-wayang-primary/30 text-wayang-primary px-2 py-0.5 rounded-full">
              {{ queueCount }} pending
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Transcription Content -->
    <div ref="containerRef" class="p-4 overflow-y-auto custom-scrollbar flex-1">
      <TransitionGroup name="fade-slide" tag="div" class="space-y-3">
        <div 
          v-for="subtitle in sortedSubtitles" 
          :key="subtitle.id"
          :data-id="subtitle.id"
          class="bg-wayang-dark/50 rounded-lg p-3 border border-white/5 transition-all duration-200"
          :class="{ 
            'border-wayang-gold/50 bg-wayang-gold/5': subtitle.isNew,
            'border-wayang-primary/50 bg-wayang-primary/10 ring-1 ring-wayang-primary/30': subtitle.isCurrent 
          }"
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs text-gray-400 font-mono">{{ subtitle.timestamp }}</span>
            <span 
              v-if="subtitle.isNew" 
              class="text-xs bg-wayang-gold text-wayang-dark px-2 py-0.5 rounded-full font-semibold"
            >
              NEW
            </span>
            <span 
              v-if="subtitle.isCurrent" 
              class="text-xs bg-wayang-primary text-white px-2 py-0.5 rounded-full font-semibold animate-pulse"
            >
              NOW
            </span>
          </div>
          <p 
            class="text-sm leading-relaxed"
            :class="subtitle.isNew || subtitle.isCurrent ? 'text-white font-medium' : 'text-gray-300'"
          >
            {{ subtitle.text }}
          </p>
          <p 
            v-if="subtitle.translation" 
            class="text-sm text-gray-300 mt-2 italic border-t border-white/5 pt-2"
          >
            {{ subtitle.translation }}
          </p>
        </div>
      </TransitionGroup>

      <!-- Empty State -->
      <div v-if="subtitles.length === 0" class="text-center py-8">
        <svg class="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-gray-400 text-sm">Waiting...</p>
        <p class="text-xs text-gray-500 mt-1">Subtitles will appear here</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'

const props = defineProps({
  subtitles: {
    type: Array,
    default: () => []
  },
  currentTime: {
    type: Number,
    default: 0
  },
  queueCount: {
    type: Number,
    default: 0
  }
})

const containerRef = ref(null)

// Computed: Sort subtitles by start_time
const sortedSubtitles = computed(() => {
  return [...props.subtitles].sort((a, b) => a.start_time - b.start_time)
})

// Scroll ke subtitle yang sedang aktif
watch(() => props.currentTime, () => {
  const current = sortedSubtitles.value.find(sub => sub.isCurrent)
  if (current && containerRef.value) {
    const element = containerRef.value.querySelector(`[data-id="${current.id}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}, { immediate: true })

// Scroll ke bawah saat ada subtitle baru
watch(() => props.subtitles.length, async (newLen, oldLen) => {
  if (newLen > oldLen) {
    await nextTick()
    if (containerRef.value) {
      // Hanya auto-scroll jika user tidak sedang scroll manual
      const container = containerRef.value
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      
      if (isNearBottom) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        })
      }
    }
  }
})
</script>

<style scoped>
/* Custom scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.8);
}

/* Fade slide animation */
.fade-slide-enter-active {
  transition: all 0.4s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(15px);
}

.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-15px);
}
</style>
