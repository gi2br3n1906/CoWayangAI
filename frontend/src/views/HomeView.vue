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
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Left Column: Character List -->
          <div class="lg:col-span-3 h-[600px]">
            <CharacterList :characters="characters" />
          </div>

          <!-- Center Column: Video Player -->
          <div class="lg:col-span-6">
            <VideoPlayer 
              :video-id="currentVideoId"
              @close="closeVideoPlayer"
            />
          </div>

          <!-- Right Column: Live Transcription -->
          <div class="lg:col-span-3 h-[600px]">
            <LiveTranscription :subtitles="subtitles" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import HeroSection from '@/components/HeroSection.vue'
import VideoPlayer from '@/components/VideoPlayer.vue'
import CharacterList from '@/components/CharacterList.vue'
import LiveTranscription from '@/components/LiveTranscription.vue'

const currentVideoId = ref(null)
const isLoading = ref(false)

// Data for characters and subtitles
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

const handleAnalyze = async (videoUrl) => {
  isLoading.value = true
  
  try {
    const videoId = extractYouTubeId(videoUrl)
    
    if (!videoId) {
      alert('URL YouTube tidak valid. Gunakan format: https://youtube.com/watch?v=... atau https://youtu.be/...')
      isLoading.value = false
      return
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
    
    currentVideoId.value = videoId
    
    console.log('Video ID:', videoId)
    
    await nextTick()
    const playerElement = document.getElementById('video-player-container')
    if (playerElement) {
      playerElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    
  } catch (error) {
    console.error('Error analyzing video:', error)
    alert('Terjadi kesalahan saat memproses video')
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
