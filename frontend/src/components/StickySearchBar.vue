<template>
  <!-- Search Bar - Sticky when scrolled -->
  <div 
    ref="searchBarRef"
    :class="[
      'z-40 w-full transition-all duration-300 ease-in-out',
      isSticky 
        ? 'fixed top-16 left-0 right-0 bg-wayang-dark/95 backdrop-blur-md border-b border-white/5 shadow-lg !m-0' 
        : 'relative bg-transparent'
    ]"
  >
    <div class="container mx-auto px-4 py-4">
      <!-- Mode Toggle -->
      <div class="flex gap-2 mb-4 justify-center">
        <button
          @click="inputMode = 'search'"
          :class="[
            'px-5 py-2.5 rounded-lg font-medium transition-all border',
            inputMode === 'search' 
              ? 'bg-wayang-primary text-white border-white/30 shadow-[0_8px_20px_rgba(120,29,66,0.35)]' 
              : 'bg-white/5 text-[#F0D290]/80 border-white/15 hover:text-white'
          ]"
        >
          🔍 Cari Video
        </button>
        <button
          @click="inputMode = 'live'"
          :class="[
            'px-5 py-2.5 rounded-lg font-medium transition-all border flex items-center gap-2',
            inputMode === 'live' 
              ? 'bg-red-600 text-white border-white/30 shadow-[0_8px_20px_rgba(220,38,38,0.35)]' 
              : 'bg-white/5 text-[#F0D290]/80 border-white/15 hover:text-white'
          ]"
        >
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          Live Stream
        </button>
      </div>

      <div class="w-full max-w-4xl mx-auto bg-white/5 p-2 rounded-2xl border border-white/10 shadow-xl backdrop-blur">
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
              class="w-full pl-12 pr-4 py-4 bg-white/10 text-white rounded-xl border border-white/20 focus:border-wayang-gold/60 focus:ring-2 focus:ring-wayang-gold/30 outline-none transition-all placeholder-[#F0D290]/70 text-base"
              @keyup.enter="handleSearch"
            />
          </div>

          <!-- Live Mode Input - User inputs YouTube URL for local AI processing -->
          <div v-else-if="inputMode === 'live'" class="flex-1 relative group">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-red-500 group-focus-within:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <input
              v-model="liveUrl"
              type="text"
              placeholder="Tempel link YouTube untuk diproses AI..."
              class="w-full pl-12 pr-4 py-4 bg-white/10 text-white rounded-xl border border-red-500/30 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/30 outline-none transition-all placeholder-[#F0D290]/70 text-base"
              @keyup.enter="handleLiveStream"
            />
          </div>

          <!-- Search Button -->
          <button
            v-if="inputMode === 'search'"
            @click="handleSearch"
            :disabled="!searchQuery || searchLoading"
            class="px-6 py-4 bg-wayang-primary text-white font-bold rounded-xl shadow-[0_12px_30px_rgba(120,29,66,0.35)] hover:shadow-[0_15px_35px_rgba(163,66,60,0.4)] hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <svg v-if="searchLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span class="hidden sm:inline">{{ searchLoading ? 'Mencari...' : 'Cari' }}</span>
          </button>

          <!-- Live Button -->
          <button
            v-if="inputMode === 'live'"
            @click="handleLiveStream"
            :disabled="!liveUrl || liveLoading"
            class="px-6 py-4 bg-red-600 text-white font-bold rounded-xl shadow-[0_12px_30px_rgba(220,38,38,0.35)] hover:shadow-[0_15px_35px_rgba(220,38,38,0.4)] hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <span v-if="liveLoading" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="hidden sm:inline">{{ liveLoading ? 'Memproses...' : 'Mulai' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import axios from 'axios'

defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['search-results', 'sticky-change', 'live-stream'])

// Sticky state
const searchBarRef = ref(null)
const isSticky = ref(false)
const triggerPoint = ref(0)
const searchBarHeight = ref(0)

// Mode toggle
const inputMode = ref('search')

// Live mode
const liveUrl = ref('')
const liveLoading = ref(false)

// Search mode
const searchQuery = ref('')
const searchLoading = ref(false)

// Watch sticky state and emit to parent
watch(isSticky, (newVal) => {
  emit('sticky-change', { isSticky: newVal, height: searchBarHeight.value })
})

// Handle scroll to toggle sticky
const handleScroll = () => {
  const scrollY = window.scrollY
  // Make sticky when scrolled past the trigger point
  isSticky.value = scrollY > triggerPoint.value
}

onMounted(async () => {
  await nextTick()
  
  // Calculate trigger point based on search bar's initial position
  if (searchBarRef.value) {
    const rect = searchBarRef.value.getBoundingClientRect()
    searchBarHeight.value = rect.height
    // Trigger when search bar reaches navbar (64px = navbar height)
    triggerPoint.value = rect.top + window.scrollY - 64
  }
  
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll() // Check initial state
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

const handleSearch = async () => {
  if (!searchQuery.value) return
  
  searchLoading.value = true
  
  try {
    const response = await axios.get('/api/search-youtube', {
      params: { q: searchQuery.value }
    })
    
    if (response.data.status === 'success') {
      emit('search-results', { videos: response.data.videos, error: null })
    } else {
      emit('search-results', { videos: [], error: response.data.message || 'Gagal mencari video' })
    }
  } catch (error) {
    console.error('Search error:', error)
    emit('search-results', { videos: [], error: error.response?.data?.message || 'Terjadi kesalahan saat mencari video' })
  } finally {
    searchLoading.value = false
  }
}

const handleLiveStream = () => {
  if (!liveUrl.value) return
  
  // Emit YouTube URL for live processing
  emit('live-stream', { videoUrl: liveUrl.value })
  liveLoading.value = true
}

// Method to reset loading state (called from parent)
const resetLiveLoading = () => {
  liveLoading.value = false
}

// Expose method to set URL from parent (when selecting from search results)
// Now sets to Live Stream mode instead of URL mode
const setVideoUrl = (url) => {
  liveUrl.value = url
  inputMode.value = 'live'
  searchQuery.value = ''
}

defineExpose({ setVideoUrl, resetLiveLoading })
</script>

<style scoped>
/* Animations handled by Tailwind classes */
</style>
