<template>
  <section class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-6 md:py-20">
    <div class="max-w-4xl w-full space-y-4 md:space-y-8">
      <!-- Title -->
      <div class="text-center space-y-4">
        <h1 class="text-3xl md:text-6xl font-bold text-white leading-tight">
          Analisis Video Wayang Kulit 
          <span class="bg-gradient-to-r from-wayang-gold to-wayang-primary bg-clip-text text-transparent">
            Real-time
          </span>
        </h1>
        <p class="text-sm md:text-lg text-gray-400 max-w-2xl mx-auto">
          Tempel URL YouTube dan biarkan AI menerjemahkan cerita untukmu.
        </p>
      </div>

      <!-- Input Section -->
      <div class="mt-6 md:mt-12">
        <div class="relative">
          <div class="flex flex-col md:flex-row gap-3">
            <!-- Input Field -->
            <div class="flex-1 relative group">
              <input
                v-model="videoUrl"
                type="text"
                placeholder="https://youtube.com/watch?v=..."
                class="w-full px-6 py-4 bg-wayang-card text-white rounded-lg 
                       placeholder-gray-500 outline-none
                       focus:ring-2 focus:ring-wayang-gold focus:ring-opacity-50
                       transition-all duration-200
                       shadow-lg hover:shadow-wayang-primary/20"
              />
              <!-- Decorative glow effect -->
              <div class="absolute inset-0 bg-gradient-to-r from-wayang-gold/20 to-wayang-primary/20 rounded-lg opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity duration-200 -z-10"></div>
            </div>

            <!-- Start Time Input -->
            <div class="relative group">
              <input
                v-model.number="startMinute"
                type="number"
                min="0"
                placeholder="Mulai menit ke... (Opsional)"
                class="w-full md:w-60 px-6 py-4 bg-wayang-card text-white rounded-lg 
                       placeholder-gray-500 outline-none
                       focus:ring-2 focus:ring-wayang-gold focus:ring-opacity-50
                       transition-all duration-200
                       shadow-lg hover:shadow-wayang-primary/20"
              />
              <div class="absolute inset-0 bg-gradient-to-r from-wayang-gold/20 to-wayang-primary/20 rounded-lg opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity duration-200 -z-10"></div>
            </div>

            <!-- Analyze Button -->
            <button
              @click="handleAnalyze"
              :disabled="!videoUrl || loading"
              class="px-8 py-4 bg-wayang-primary text-white font-semibold rounded-lg
                     hover:bg-wayang-primary/90 hover:shadow-lg hover:shadow-wayang-primary/50
                     active:scale-95
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none
                     transition-all duration-200
                     flex items-center justify-center gap-2"
            >
              <svg v-if="loading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>{{ loading ? 'Processing...' : 'Analyze' }}</span>
            </button>
          </div>
        </div>

        <!-- Info Text -->
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-500">
            Mendukung video YouTube dengan subtitle bahasa Jawa
          </p>
        </div>

        <!-- Video Gallery -->
        <VideoGallery v-if="!hideFeatures" @select="handleGallerySelect" />
      </div>

      <!-- Feature Cards -->
      <div v-if="!hideFeatures" class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
        <div class="p-6 bg-wayang-card rounded-lg border border-wayang-card hover:border-wayang-gold/30 transition-colors duration-200">
          <div class="w-12 h-12 bg-wayang-primary/20 rounded-lg flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">Real-time Analysis</h3>
          <p class="text-gray-400 text-sm">Analisis video secara langsung dengan teknologi AI terkini</p>
        </div>

        <div class="p-6 bg-wayang-card rounded-lg border border-wayang-card hover:border-wayang-gold/30 transition-colors duration-200">
          <div class="w-12 h-12 bg-wayang-gold/20 rounded-lg flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-wayang-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">Character Detection</h3>
          <p class="text-gray-400 text-sm">Identifikasi tokoh wayang secara otomatis dan akurat</p>
        </div>

        <div class="p-6 bg-wayang-card rounded-lg border border-wayang-card hover:border-wayang-gold/30 transition-colors duration-200">
          <div class="w-12 h-12 bg-wayang-primary/20 rounded-lg flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-white mb-2">Smart Subtitle</h3>
          <p class="text-gray-400 text-sm">Terjemahan subtitle otomatis dengan konteks budaya</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import VideoGallery from './VideoGallery.vue'

defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  hideFeatures: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['analyze'])

const videoUrl = ref('')
const startMinute = ref('')

const handleAnalyze = () => {
  if (videoUrl.value) {
    emit('analyze', { 
      url: videoUrl.value, 
      startMinute: startMinute.value 
    })
  }
}

const handleGallerySelect = (videoId) => {
  videoUrl.value = `https://www.youtube.com/watch?v=${videoId}`
  startMinute.value = '' // Reset start time when selecting from gallery
  emit('analyze', {
    url: videoUrl.value,
    startMinute: null
  })
}
</script>
