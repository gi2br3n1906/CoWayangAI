<template>
  <div class="bg-white/10 rounded-2xl shadow-2xl border border-white/15 overflow-hidden h-full max-h-full flex flex-col backdrop-blur">
    <!-- Header -->
    <div class="bg-gradient-to-r from-[#781D42]/80 to-[#A3423C]/80 p-3 border-b border-white/10 flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-[#F0D290]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-white flex items-center gap-2">
            <span>Transcription</span>
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-wayang-gold opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-wayang-gold"></span>
            </span>
          </h3>
          <div class="flex items-center gap-2">
            <p class="text-[10px] text-white/70">Live subtitle</p>
            <span v-if="queueCount > 0" class="text-[10px] bg-white/15 text-[#F0D290] px-1.5 py-0.5 rounded-full">
              {{ queueCount }} pending
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Transcription Content - dengan overflow-y-auto dan flex-1 -->
    <div ref="containerRef" class="p-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
      <TransitionGroup name="fade-slide" tag="div" class="space-y-2">
        <div 
          v-for="subtitle in sortedSubtitles" 
          :key="subtitle.id"
          :data-id="subtitle.id"
          class="bg-white/5 rounded-lg p-2 border border-white/10 transition-all duration-200"
          :class="{ 
            'border-wayang-gold/50 bg-wayang-gold/5': subtitle.isNew,
            'border-wayang-primary/50 bg-wayang-primary/15 ring-1 ring-white/25': subtitle.isCurrent 
          }"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[10px] text-white/70 font-mono">{{ subtitle.timestamp }}</span>
            <span 
              v-if="subtitle.isNew" 
              class="text-[10px] bg-wayang-gold text-wayang-dark px-1.5 py-0.5 rounded-full font-semibold"
            >
              NEW
            </span>
            <span 
              v-if="subtitle.isCurrent" 
              class="text-[10px] bg-wayang-primary text-white px-1.5 py-0.5 rounded-full font-semibold animate-pulse"
            >
              NOW
            </span>
          </div>
          <p 
            class="text-xs leading-relaxed"
            :class="subtitle.isNew || subtitle.isCurrent ? 'text-white font-medium' : 'text-white/85'"
          >
            {{ subtitle.text }}
          </p>
          <p 
            v-if="subtitle.translation" 
            class="text-xs text-white/75 mt-1 italic border-t border-white/5 pt-1"
          >
            {{ subtitle.translation }}
          </p>
        </div>
      </TransitionGroup>

      <!-- Empty State -->
      <div v-if="subtitles.length === 0" class="text-center py-6 text-white/70">
        <svg class="w-10 h-10 mx-auto text-white/40 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-sm">Waiting...</p>
        <p class="text-xs mt-1">Subtitles will appear here</p>
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

// Auto-scroll ke bawah saat ada subtitle baru
watch(() => props.subtitles.length, async (newLen, oldLen) => {
  if (newLen > oldLen) {
    await nextTick()
    if (containerRef.value) {
      // Selalu auto-scroll ke item terbaru
      containerRef.value.scrollTo({
        top: containerRef.value.scrollHeight,
        behavior: 'smooth'
      })
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
  background: rgba(240, 210, 144, 0.15);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(163, 66, 60, 0.5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(240, 210, 144, 0.8);
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
