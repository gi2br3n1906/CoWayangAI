<template>
  <div class="w-full max-w-7xl mx-auto mt-8 px-4 pb-12">
    <!-- Dashboard Header -->
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-white flex items-center gap-3">
        <div class="w-10 h-10 bg-wayang-primary/20 rounded-lg flex items-center justify-center">
          <svg class="w-6 h-6 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <span>Analysis Dashboard</span>
        <span class="ml-auto text-sm font-normal text-gray-400 flex items-center gap-2">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-wayang-gold opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-wayang-gold"></span>
          </span>
          Live Analysis
        </span>
      </h2>
      <p class="text-gray-400 text-sm mt-2">Real-time detection results from AI</p>
    </div>

    <!-- Dashboard Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Column: Characters Detected -->
      <div class="bg-wayang-card rounded-xl border border-white/10 shadow-xl overflow-hidden">
        <!-- Header -->
        <div class="bg-gradient-to-r from-wayang-primary/20 to-wayang-gold/20 p-4 border-b border-white/10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-wayang-gold/20 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-wayang-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-white">Characters Detected</h3>
              <p class="text-xs text-gray-400">{{ characters.length }} wayang characters identified</p>
            </div>
          </div>
        </div>

        <!-- Characters List -->
        <div class="p-4 max-h-96 overflow-y-auto custom-scrollbar">
          <TransitionGroup name="list" tag="div" class="space-y-3">
            <div 
              v-for="character in characters" 
              :key="character.id"
              class="bg-wayang-dark/50 rounded-lg p-4 border border-white/5 hover:border-wayang-gold/30 transition-all duration-200 group"
            >
              <div class="flex items-start justify-between mb-3">
                <div class="flex-1">
                  <h4 class="text-white font-semibold group-hover:text-wayang-gold transition-colors">
                    {{ character.name }}
                  </h4>
                  <p class="text-xs text-gray-400 mt-1 flex items-center gap-2">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ character.time }}
                  </p>
                </div>
                <div class="text-right">
                  <span class="text-xs font-medium text-wayang-primary bg-wayang-primary/10 px-2 py-1 rounded">
                    {{ character.confidence }}
                  </span>
                </div>
              </div>

              <!-- Confidence Bar -->
              <div class="w-full bg-wayang-dark rounded-full h-2 overflow-hidden">
                <div 
                  class="h-full bg-gradient-to-r from-wayang-primary to-wayang-gold transition-all duration-500"
                  :style="{ width: character.confidence }"
                ></div>
              </div>

              <!-- Additional Info -->
              <div v-if="character.description" class="mt-3 text-xs text-gray-500 italic">
                {{ character.description }}
              </div>
            </div>
          </TransitionGroup>

          <!-- Empty State -->
          <div v-if="characters.length === 0" class="text-center py-12">
            <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p class="text-gray-400">Waiting for character detection...</p>
            <p class="text-sm text-gray-500 mt-2">Characters will appear here as AI analyzes the video</p>
          </div>
        </div>
      </div>

      <!-- Right Column: Live Transcription -->
      <div class="bg-wayang-card rounded-xl border border-white/10 shadow-xl overflow-hidden">
        <!-- Header -->
        <div class="bg-gradient-to-r from-wayang-gold/20 to-wayang-primary/20 p-4 border-b border-white/10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-wayang-primary/20 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-white">Live Transcription</h3>
              <p class="text-xs text-gray-400">Real-time subtitle translation</p>
            </div>
          </div>
        </div>

        <!-- Transcription Content -->
        <div class="p-4 max-h-96 overflow-y-auto custom-scrollbar">
          <TransitionGroup name="fade-slide" tag="div" class="space-y-3">
            <div 
              v-for="subtitle in subtitles" 
              :key="subtitle.id"
              class="bg-wayang-dark/50 rounded-lg p-3 border border-white/5"
              :class="{ 'border-wayang-gold/50 bg-wayang-gold/5': subtitle.isNew }"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-gray-400 font-mono">{{ subtitle.timestamp }}</span>
                <span 
                  v-if="subtitle.isNew" 
                  class="text-xs bg-wayang-gold text-wayang-dark px-2 py-0.5 rounded-full font-semibold"
                >
                  NEW
                </span>
              </div>
              <p 
                class="text-sm leading-relaxed"
                :class="subtitle.isNew ? 'text-white font-medium' : 'text-gray-300'"
              >
                {{ subtitle.text }}
              </p>
              <p 
                v-if="subtitle.translation" 
                class="text-xs text-gray-500 mt-2 italic border-t border-white/5 pt-2"
              >
                {{ subtitle.translation }}
              </p>
            </div>
          </TransitionGroup>

          <!-- Empty State -->
          <div v-if="subtitles.length === 0" class="text-center py-12">
            <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p class="text-gray-400">Waiting for transcription...</p>
            <p class="text-sm text-gray-500 mt-2">Subtitles will appear here as they are detected</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// Dummy data for characters
const characters = ref([
  {
    id: 1,
    name: 'Arjuna',
    time: '02:15',
    confidence: '98%',
    description: 'Ksatria pandawa yang terkenal dengan keahliannya memanah'
  },
  {
    id: 2,
    name: 'Krishna',
    time: '03:42',
    confidence: '95%',
    description: 'Penasihat bijaksana keluarga Pandawa'
  },
  {
    id: 3,
    name: 'Bima',
    time: '05:18',
    confidence: '92%',
    description: 'Pandawa kedua yang dikenal dengan kekuatan luar biasa'
  },
  {
    id: 4,
    name: 'Gatotkaca',
    time: '07:30',
    confidence: '89%',
    description: 'Putra Bima yang dapat terbang'
  }
])

// Dummy data for subtitles
const subtitles = ref([
  {
    id: 1,
    timestamp: '02:15',
    text: 'Sang Arjuna mulai mengambil busurnya dengan penuh keyakinan.',
    translation: 'Arjuna begins to take his bow with full confidence.',
    isNew: false
  },
  {
    id: 2,
    timestamp: '03:42',
    text: 'Krishna memberikan nasihat bijak kepada Arjuna sebelum peperangan dimulai.',
    translation: 'Krishna gives wise advice to Arjuna before the war begins.',
    isNew: false
  },
  {
    id: 3,
    timestamp: '05:18',
    text: 'Bima menunjukkan kekuatannya yang luar biasa di medan perang.',
    translation: 'Bima shows his extraordinary strength on the battlefield.',
    isNew: true
  }
])

// Simulate real-time updates (untuk testing)
onMounted(() => {
  // Uncomment untuk test auto-update
  // setTimeout(() => {
  //   subtitles.value.push({
  //     id: Date.now(),
  //     timestamp: '08:45',
  //     text: 'Dialog baru dari AI...',
  //     translation: 'New dialogue from AI...',
  //     isNew: true
  //   })
  // }, 3000)
})
</script>

<style scoped>
/* Custom scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
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

/* List animation */
.list-enter-active {
  transition: all 0.5s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.list-leave-active {
  transition: all 0.3s ease;
}

.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

/* Fade slide animation for subtitles */
.fade-slide-enter-active {
  transition: all 0.4s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
