<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
import io from 'socket.io-client'

// --- COMPONENTS ---
import Navbar from './components/Navbar.vue'
import LoginModal from './components/LoginModal.vue'
import HeroSection from './components/HeroSection.vue'
import VideoGallery from './components/VideoGallery.vue'
import VideoPlayer from './components/VideoPlayer.vue'
import CharacterList from './components/CharacterList.vue'
import LiveTranscription from './components/LiveTranscription.vue'

// --- STATE: LOGIN & UI ---
const isLoginModalOpen = ref(false)
const openLoginModal = () => isLoginModalOpen.value = true
const closeLoginModal = () => isLoginModalOpen.value = false
const handleLogin = (userData) => console.log('User logged in:', userData)

// --- STATE: WAYANG AI ---
// Pastikan backend Node.js jalan di port 3000
const socket = io('http://localhost:3000') 
const currentVideoId = ref(null)
const currentStartTime = ref(0)
const isLoading = ref(false)
const isASRLoadng = ref(false)

// Data Hasil AI
const characters = ref([])
const subtitles = ref([])
const currentVideoTime = ref(0)

// Mobile Tab State
const activeMobileTab = ref('characters')

// --- LOGIKA ANALISIS ---
const getYouTubeVideoId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

const handleAnalyze = async (payload) => {
  const { url, startTime } = payload;
  const videoId = getYouTubeVideoId(url);

  if (!videoId) {
    alert("URL YouTube tidak valid!");
    return;
  }

  isLoading.value = true;
  currentVideoId.value = videoId;
  currentStartTime.value = parseTimeToSeconds(startTime || '0'); // Konversi HH:MM:SS ke detik
  
  // Reset Data Lama
  characters.value = [];
  subtitles.value = [];

  // Auto Scroll ke Player
  await nextTick();
  const playerSection = document.getElementById('player-section');
  if (playerSection) playerSection.scrollIntoView({ behavior: 'smooth' });

  // Request ke Backend Node.js untuk Object Detection
  try {
    await axios.post('http://localhost:3000/api/analyze', {
      videoUrl: url,
      startTime: startTime || '0',
      socketId: socket.id
    });
  } catch (error) {
    console.error("Gagal menghubungi backend:", error);
    alert("Backend error. Cek terminal Node.js!");
  } finally {
    isLoading.value = false;
  }

  // AUTO START ASR juga ketika analisis dimulai
  console.log("[App] Auto-starting ASR...");
  try {
    await axios.post('http://localhost:3000/api/start-asr', {
      videoUrl: url,
      startTime: startTime || '0'
    });
    console.log("[App] ASR auto-started successfully");
  } catch (error) {
    console.error("[App] Failed to auto-start ASR:", error);
  }
};

const handleStartASR = async (payload) => {
  const { url, startTime } = payload;
  const videoId = getYouTubeVideoId(url);

  if (!videoId) {
    alert("URL YouTube tidak valid!");
    return;
  }

  isASRLoadng.value = true;
  currentVideoId.value = videoId;
  currentStartTime.value = parseTimeToSeconds(startTime || '0');
  
  // Reset Data Lama hanya untuk video baru
  characters.value = [];
  subtitles.value = [];

  // Auto Scroll ke Player
  await nextTick();
  const playerSection = document.getElementById('player-section');
  if (playerSection) playerSection.scrollIntoView({ behavior: 'smooth' });

  // Request ke Backend Node.js untuk ASR
  try {
    await axios.post('http://localhost:3000/api/start-asr', {
      videoUrl: url,
      startTime: startTime || '0'
    });
  } catch (error) {
    console.error("Gagal memulai ASR:", error);
    alert("ASR error. Cek terminal Node.js!");
  } finally {
    isASRLoadng.value = false;
  }
}

const parseTimeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === '0') return 0;
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else {
    return parseInt(parts[0]) || 0;
  }
}

const handleVideoSeek = async (seekTime) => {
  console.log(`[App] Video seek detected to: ${seekTime}s`);
  
  // Convert seconds to HH:MM:SS format
  const hours = Math.floor(seekTime / 3600);
  const minutes = Math.floor((seekTime % 3600) / 60);
  const seconds = Math.floor(seekTime % 60);
  const timeStr = hours > 0 ? 
    `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` :
    `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  try {
    await axios.post('http://localhost:3000/api/update-asr-time', {
      startTime: timeStr
    });
    console.log(`[App] ASR updated to start from: ${timeStr}`);
  } catch (error) {
    console.error("[App] Failed to update ASR time:", error);
  }
}

// --- SOCKET LISTENER ---
onMounted(() => {
  socket.on('ai-result', (payload) => {
    console.log('[Frontend] AI Result diterima:', payload);

    // Logika Active Scene (Ganti Total Karakter)
    if (payload.type === 'active_scene') {
      const enrichedData = payload.data.map(char => ({
        ...char,
        timestamp: payload.timestamp,
        image: payload.image 
      }));
      characters.value = enrichedData;
    } 
    // Fallback Logic (Kalau script lama masih jalan)
    else if (payload.type === 'character') {
      const exists = characters.value.find(c => c.name === payload.data.name);
      if (!exists) characters.value.unshift(payload.data);
    }

    // Logika Subtitle
    if (payload.type === 'subtitle') {
      console.log('[Frontend] Subtitle baru:', payload.data);
      subtitles.value.push({
        ...payload.data,
        id: Date.now(), // Tambah ID unik
        isNew: true
      });

      // Hapus flag isNew setelah 3 detik
      setTimeout(() => {
        const sub = subtitles.value.find(s => s.id === payload.data.id);
        if (sub) sub.isNew = false;
      }, 3000);
    }
  });
});

// Cleanup ketika component unmount
onUnmounted(() => {
  // Stop ASR ketika user keluar dari halaman
  axios.post('http://localhost:3000/api/stop-asr').catch(err => console.log('Cleanup ASR:', err));
});
</script>

<template>
  <div class="min-h-screen bg-wayang-dark text-slate-200 font-sans selection:bg-wayang-primary selection:text-white">
    
    <Navbar @open-login="openLoginModal" />

    <main class="container mx-auto px-4 pb-20 pt-24">
      
      <div v-if="!currentVideoId" class="flex flex-col items-center animate-fade-in space-y-8">
        
        <HeroSection @analyze="handleAnalyze" @start-asr="handleStartASR" :loading="isLoading" :asrLoading="isASRLoadng" />
        
        <VideoGallery @select-video="(url) => handleAnalyze({ url, startMinute: 0 })" />
      
      </div>

      <div v-else id="player-section" class="animate-fade-in">
        
        <button 
          @click="currentVideoId = null"
          class="mb-6 text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Kembali ke Pencarian
        </button>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[85vh]">
          
          <div class="lg:col-span-3 h-full overflow-hidden" :class="{'hidden lg:block': activeMobileTab !== 'characters'}">
            <CharacterList :characters="characters" />
          </div>

          <div class="lg:col-span-6 flex flex-col h-full">
            <VideoPlayer 
              :video-id="currentVideoId" 
              :start-time="currentStartTime" 
              @close="currentVideoId = null"
              @timeUpdate="currentVideoTime = $event"
              @seek="handleVideoSeek"
            />
            
            <div class="flex lg:hidden mt-4 bg-slate-800 rounded-xl p-1 border border-white/10">
              <button @click="activeMobileTab = 'characters'" class="flex-1 py-2 rounded-lg text-sm font-bold transition-all" :class="activeMobileTab === 'characters' ? 'bg-wayang-primary text-white' : 'text-gray-400'">
                🎭 Tokoh
              </button>
              <button @click="activeMobileTab = 'subtitles'" class="flex-1 py-2 rounded-lg text-sm font-bold transition-all" :class="activeMobileTab === 'subtitles' ? 'bg-wayang-primary text-white' : 'text-gray-400'">
                📜 Subtitle
              </button>
            </div>
          </div>

          <div class="lg:col-span-3 h-full overflow-hidden" :class="{'hidden lg:block': activeMobileTab !== 'subtitles'}">
            <LiveTranscription :subtitles="subtitles" :currentTime="currentVideoTime" />
          </div>

        </div>
      </div>

    </main>

    <LoginModal :is-open="isLoginModalOpen" @close="closeLoginModal" @login="handleLogin" />
  </div>
</template>

<style>
.animate-fade-in { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* Global Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0f172a; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }
</style>