<template>
  <section class="flex flex-col items-center justify-center w-full max-w-4xl mx-auto text-center">
    
    <div class="space-y-6 mb-10">
      <h1 class="text-4xl md:text-6xl font-bold text-white leading-tight tracking-tight">
        Analisis Video Wayang Kulit 
        <span class="bg-gradient-to-r from-wayang-gold to-wayang-primary bg-clip-text text-transparent">
          Real-time
        </span>
      </h1>
      <p class="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
        Cari video wayang di YouTube atau tempel URL langsung untuk dianalisis AI.
      </p>
    </div>

    <!-- Mode Toggle -->
    <div class="flex gap-2 mb-6">
      <button
        @click="inputMode = 'search'"
        :class="[
          'px-4 py-2 rounded-lg font-medium transition-all',
          inputMode === 'search' 
            ? 'bg-wayang-primary text-white' 
            : 'bg-slate-800/50 text-gray-400 hover:text-white'
        ]"
      >
        🔍 Cari Video
      </button>
      <button
        @click="inputMode = 'url'"
        :class="[
          'px-4 py-2 rounded-lg font-medium transition-all',
          inputMode === 'url' 
            ? 'bg-wayang-primary text-white' 
            : 'bg-slate-800/50 text-gray-400 hover:text-white'
        ]"
      >
        🔗 Tempel URL
      </button>
    </div>

    <div class="w-full bg-slate-800/50 p-2 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
      <div class="flex flex-col md:flex-row gap-3">
        
        <!-- Search Mode Input -->
        <div v-if="inputMode === 'search'" class="flex-1 relative group">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-gray-500 group-focus-within:text-wayang-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari video wayang... (tekan Enter)"
            class="w-full pl-12 pr-4 py-4 bg-slate-900/80 text-white rounded-xl border border-transparent focus:border-wayang-primary/50 focus:ring-2 focus:ring-wayang-primary/20 outline-none transition-all placeholder-gray-500"
            @keyup.enter="handleSearch"
          />
        </div>

        <!-- URL Mode Input -->
        <div v-else class="flex-1 relative group">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-gray-500 group-focus-within:text-wayang-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <input
            v-model="videoUrl"
            type="text"
            placeholder="Tempel link YouTube di sini..."
            class="w-full pl-12 pr-4 py-4 bg-slate-900/80 text-white rounded-xl border border-transparent focus:border-wayang-primary/50 focus:ring-2 focus:ring-wayang-primary/20 outline-none transition-all placeholder-gray-500"
            @keyup.enter="handleAnalyze"
          />
        </div>

        <!-- Start Time Input (only for URL mode) -->
        <div v-if="inputMode === 'url'" class="relative w-full md:w-48 group">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-gray-500 group-focus-within:text-wayang-gold transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <input
            v-model="startTime"
            type="text"
            placeholder="HH:MM:SS (opsional)"
            class="w-full pl-12 pr-4 py-4 bg-slate-900/80 text-white rounded-xl border border-transparent focus:border-wayang-gold/50 focus:ring-2 focus:ring-wayang-gold/20 outline-none transition-all placeholder-gray-500"
            @keyup.enter="handleAnalyze"
          />
        </div>

        <!-- Search Button -->
        <button
          v-if="inputMode === 'search'"
          @click="handleSearch"
          :disabled="!searchQuery || searchLoading"
          class="px-6 py-4 bg-gradient-to-r from-wayang-primary to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <svg v-if="searchLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>{{ searchLoading ? 'Mencari...' : 'Cari' }}</span>
        </button>

        <!-- Analyze & ASR Buttons (URL mode) -->
        <template v-else>
          <button
            @click="handleAnalyze"
            :disabled="!videoUrl || loading"
            class="px-6 py-4 bg-gradient-to-r from-wayang-primary to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <svg v-if="loading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>{{ loading ? 'Memproses...' : 'Analisis' }}</span>
          </button>

          <button
            @click="handleStartASR"
            :disabled="!videoUrl || asrLoading"
            class="px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <svg v-if="asrLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span>{{ asrLoading ? 'Memulai ASR...' : 'Start ASR' }}</span>
          </button>
        </template>
      </div>
    </div>

    <!-- Search Results Grid -->
    <div v-if="searchResults.length > 0" class="w-full mt-8">
      <h3 class="text-left text-lg font-semibold text-white mb-4">
        Hasil Pencarian ({{ searchResults.length }} video)
      </h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div 
          v-for="video in searchResults" 
          :key="video.videoId"
          @click="selectVideo(video)"
          class="bg-slate-800/50 rounded-xl overflow-hidden border border-white/10 hover:border-wayang-primary/50 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-wayang-primary/20"
        >
          <div class="relative aspect-video">
            <img 
              :src="video.thumbnail" 
              :alt="video.title"
              class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
          <div class="p-3">
            <h4 class="text-sm font-medium text-white line-clamp-2 leading-tight">
              {{ video.title }}
            </h4>
            <p class="text-xs text-gray-500 mt-1">{{ video.channelTitle }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Search Error -->
    <div v-if="searchError" class="w-full mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
      {{ searchError }}
    </div>

    <p class="mt-6 text-sm text-gray-500 flex items-center gap-2">
      <svg class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      Mendukung YouTube Live & Video Panjang
    </p>

  </section>
</template>

<script setup>
import { ref } from 'vue'
import axios from 'axios'

defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  asrLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['analyze', 'start-asr'])

// Mode toggle
const inputMode = ref('search')

// URL mode
const videoUrl = ref('')
const startTime = ref('')

// Search mode
const searchQuery = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchError = ref('')

const handleSearch = async () => {
  if (!searchQuery.value) return
  
  searchLoading.value = true
  searchError.value = ''
  searchResults.value = []
  
  try {
    const response = await axios.get('/api/search-youtube', {
      params: { q: searchQuery.value }
    })
    
    if (response.data.status === 'success') {
      searchResults.value = response.data.videos
    } else {
      searchError.value = response.data.message || 'Gagal mencari video'
    }
  } catch (error) {
    console.error('Search error:', error)
    searchError.value = error.response?.data?.message || 'Terjadi kesalahan saat mencari video'
  } finally {
    searchLoading.value = false
  }
}

const selectVideo = (video) => {
  // Set URL and switch to URL mode
  videoUrl.value = `https://www.youtube.com/watch?v=${video.videoId}`
  inputMode.value = 'url'
  // Clear search results
  searchResults.value = []
  searchQuery.value = ''
}

const handleAnalyze = () => {
  if (videoUrl.value) {
    emit('analyze', { 
      url: videoUrl.value, 
      startTime: startTime.value 
    })
  }
}

const handleStartASR = () => {
  if (videoUrl.value) {
    emit('start-asr', { 
      url: videoUrl.value, 
      startTime: startTime.value 
    })
  }
}
</script>