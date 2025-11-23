<template>
  <div>
    <HeroSection 
      :loading="isLoading"
      :hide-features="!!currentVideoId"
      @analyze="handleAnalyze"
    />
    
    <!-- 3 Column Layout: Character List | Video Player | Live Transcription -->
    <Transition name="fade">
      <div v-if="currentVideoId" class="w-full max-w-[1800px] mx-auto px-4 mt-8 pb-12">
        <div class="flex flex-col lg:grid lg:grid-cols-12 gap-6">
          <!-- Left Column: Character List -->
          <div class="order-2 lg:order-1 lg:col-span-3 h-[600px]" :class="activeMobileTab === 'characters' ? 'block' : 'hidden lg:block'">
            <CharacterList :characters="characters" />
          </div>

          <!-- Center Column: Video Player -->
          <div class="order-1 lg:order-2 lg:col-span-6 sticky top-0 z-50 lg:static bg-wayang-dark lg:bg-transparent -mx-4 px-4 pt-4 lg:mx-0 lg:px-0 lg:pt-0 pb-4 lg:pb-0">
            <VideoPlayer 
              :video-id="currentVideoId"
              :start-minute="videoStartMinute"
              @close="closeVideoPlayer"
            />

            <!-- Mobile Tabs -->
            <div class="flex lg:hidden gap-2 mt-4">
              <button 
                @click="activeMobileTab = 'characters'"
                class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                :class="activeMobileTab === 'characters' ? 'bg-wayang-primary text-white' : 'bg-wayang-card text-gray-400 hover:text-white'"
              >
                Tokoh
              </button>
              <button 
                @click="activeMobileTab = 'subtitles'"
                class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                :class="activeMobileTab === 'subtitles' ? 'bg-wayang-primary text-white' : 'bg-wayang-card text-gray-400 hover:text-white'"
              >
                Subtitle
              </button>
            </div>
          </div>

          <!-- Right Column: Live Transcription -->
          <div class="order-2 lg:order-3 lg:col-span-3 h-[600px]" :class="activeMobileTab === 'subtitles' ? 'block' : 'hidden lg:block'">
            <LiveTranscription :subtitles="subtitles" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { io } from 'socket.io-client'
import axios from 'axios'
import HeroSection from '@/components/HeroSection.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import CharacterList from '@/components/CharacterList.vue'
import LiveTranscription from '@/components/LiveTranscription.vue'

const currentVideoId = ref(null)
const videoStartMinute = ref(0) // Menyimpan waktu mulai video
const isLoading = ref(false)
const activeMobileTab = ref('characters')
const socket = ref(null)
const socketId = ref(null)

// Data for characters and subtitles
const characters = ref([])
const subtitles = ref([])

onMounted(() => {
  // Connect to Backend Socket.IO
  socket.value = io('http://localhost:3000')

  socket.value.on('connect', () => {
    console.log('Connected to backend:', socket.value.id)
    socketId.value = socket.value.id
  })

  socket.value.on('ai-result', (payload) => {
    console.log('Received AI Result:', payload)
    if (payload.type === 'character') {
      // Cek duplicate biar ga numpuk kalau simulasi jalan berkali-kali
      const exists = characters.value.find(c => c.name === payload.data.name && c.time === payload.data.timestamp)
      if (!exists) {
        characters.value.unshift({ // Gunakan unshift agar muncul paling atas
          id: Date.now(), // Generate random ID
          name: payload.data.name,
          time: payload.data.timestamp,
          confidence: payload.data.confidence + '%',
          description: payload.data.description || 'Tokoh terdeteksi'
        })
      }
    } else if (payload.type === 'subtitle') {
      subtitles.value.push({
        id: Date.now(),
        timestamp: payload.data.timestamp,
        text: payload.data.text,
        translation: payload.data.translation || '',
        isNew: true
      })
    }
  })
})

// Extract YouTube video ID from URL
const extractYouTubeId = (url) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

const handleAnalyze = async ({ url, startMinute }) => {
  isLoading.value = true
  
  // Reset data
  characters.value = []
  subtitles.value = []
  
  try {
    const videoId = extractYouTubeId(url)
    
    if (!videoId) {
      alert('URL YouTube tidak valid. Gunakan format: https://youtube.com/watch?v=... atau https://youtu.be/...')
      isLoading.value = false
      return
    }

    // Call Backend API
    await axios.post('http://localhost:3000/api/analyze', {
      videoUrl: url,
      socketId: socketId.value, // Kirim socketId agar backend tau siapa yg request
      startMinute: startMinute || 0
    })

    // Simulate loading delay for UI UX
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    currentVideoId.value = videoId
    videoStartMinute.value = startMinute || 0
    
    console.log('Video ID:', videoId, 'Start Minute:', startMinute)
    
    await nextTick()
    const playerElement = document.getElementById('video-player-container')
    if (playerElement) {
      playerElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    
  } catch (error) {
    console.error('Error analyzing video:', error)
    alert('Terjadi kesalahan saat memproses video: ' + (error.response?.data?.error || error.message))
  } finally {
    isLoading.value = false
  }
}

const closeVideoPlayer = () => {
  currentVideoId.value = null
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
