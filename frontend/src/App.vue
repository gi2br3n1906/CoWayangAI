<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import axios from 'axios'
import io from 'socket.io-client'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { unlockCharacter } from '@/services/firebase'
import AlmanacView from '@/views/AlmanacView.vue'

// --- COMPONENTS ---
import Navbar from './components/Navbar.vue'
import StickySearchBar from './components/StickySearchBar.vue'
import LoginModal from './components/LoginModal.vue'
import RegisterModal from './components/RegisterModal.vue'
import ForgotPasswordModal from './components/ForgotPasswordModal.vue'
import UserProfileModal from './components/UserProfileModal.vue'
import HeroSection from './components/HeroSection.vue'
import VideoGallery from './components/VideoGallery.vue'
import VideoPlayer from './components/VideoPlayer.vue'
import DetectionPanel from './components/DetectionPanel.vue'
import LiveTranscription from './components/LiveTranscription.vue'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal.vue'
import TutorialModal from './components/TutorialModal.vue'
import AboutSection from './components/AboutSection.vue'
import AppFooter from './components/AppFooter.vue'

// --- STATE: LOGIN & UI ---
const isLoginModalOpen = ref(false)
const isRegisterModalOpen = ref(false)
const isForgotPasswordModalOpen = ref(false)
const isProfileModalOpen = ref(false)
const isShortcutsModalOpen = ref(false)
const isTutorialOpen = ref(false)

const openLoginModal = () => isLoginModalOpen.value = true
const closeLoginModal = () => isLoginModalOpen.value = false
const openRegisterModal = () => isRegisterModalOpen.value = true
const closeRegisterModal = () => isRegisterModalOpen.value = false
const openForgotPasswordModal = () => isForgotPasswordModalOpen.value = true
const closeForgotPasswordModal = () => isForgotPasswordModalOpen.value = false
const openProfileModal = () => isProfileModalOpen.value = true
const closeProfileModal = () => isProfileModalOpen.value = false
const openShortcutsModal = () => isShortcutsModalOpen.value = true
const closeShortcutsModal = () => isShortcutsModalOpen.value = false
const openTutorial = () => isTutorialOpen.value = true
const closeTutorial = () => isTutorialOpen.value = false

const handleLogin = (userData) => console.log('User logged in:', userData)
const handleRegister = (userData) => console.log('User registered:', userData)

// Switch between modals
const switchToRegister = () => {
  closeLoginModal()
  openRegisterModal()
}
const switchToLogin = () => {
  closeRegisterModal()
  closeForgotPasswordModal()
  openLoginModal()
}
const switchToForgotPassword = () => {
  closeLoginModal()
  openForgotPasswordModal()
}

// Auth Store
const authStore = useAuthStore()

// --- STATE: WAYANG AI ---
// Pastikan backend Node.js jalan di port 3000
const socket = io("/", { path: "/socket.io" });
const currentVideoId = ref(null)
const liveStreamUrl = ref(null)
const liveVideoUrl = ref(null)  // YouTube URL for live mode
const currentStartTime = ref(0)
const isLoading = ref(false)
const isASRLoadng = ref(false)
const route = useRoute()
const isAlmanacRoute = computed(() => route.name === 'almanac')

// Search Results from StickySearchBar
const searchResults = ref([])
const searchError = ref('')
const stickySearchBarRef = ref(null)
const isSearchBarSticky = ref(false)
const searchBarHeight = ref(0)

// Video Player Control
const videoPlayerRef = ref(null)
const shouldAutoPlay = ref(false)

// Data Hasil AI
const characters = ref([])
const currentVideoTime = ref(0)
const aiConnected = ref(false)

// AI Control Settings
const showBoundingBox = ref(true)
const showLabels = ref(true)
const confidenceThreshold = ref(50)
const targetLanguage = ref('id') // 'id' for Indonesia, 'en' for English
const videoInfo = ref(null)

const isAchievementVisible = ref(false)
const achievementMessage = ref('')
let achievementTimer = null
let audioContext = null
const unlockedCache = new Set()

// SUBTITLE QUEUE SYSTEM - Untuk sinkronisasi yang lebih baik
const subtitlesQueue = ref([])      // Antrian subtitle dari backend
const displayedSubtitles = ref([])  // Subtitle yang sudah ditampilkan (sesuai waktu video)

// Computed: Gabungan subtitle untuk display dengan status sinkron
const syncedSubtitles = computed(() => {
  return displayedSubtitles.value.map(sub => ({
    ...sub,
    isCurrent: currentVideoTime.value >= sub.start_time && currentVideoTime.value <= sub.end_time
  }))
})

// Mobile Tab State
const activeMobileTab = ref('characters')

// Debounce timer for seek
let seekDebounceTimer = null
let syncInterval = null

// --- FUNGSI SINKRONISASI KUNCI ---
const syncVideoAndData = () => {
  const currentTime = currentVideoTime.value
  
  // Iterasi queue dan pindahkan subtitle yang sudah lewat waktunya
  const toDisplay = []
  const remaining = []
  
  for (const subtitle of subtitlesQueue.value) {
    // Jika waktu video sudah melewati timestamp subtitle, tampilkan
    if (subtitle.start_time <= currentTime + 1) { // +1 detik buffer
      toDisplay.push(subtitle)
    } else {
      remaining.push(subtitle)
    }
  }
  
  // Pindahkan dari queue ke displayed
  if (toDisplay.length > 0) {
    displayedSubtitles.value.push(...toDisplay)
    subtitlesQueue.value = remaining
    console.log(`[Sync] Moved ${toDisplay.length} subtitles to display. Queue: ${remaining.length}`)
  }
}

// Watch currentVideoTime untuk sinkronisasi
watch(currentVideoTime, () => {
  syncVideoAndData()
})

watch(() => authStore.isAuthenticated, (isAuthenticated) => {
  if (!isAuthenticated) {
    unlockedCache.clear()
  }
})

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
  shouldAutoPlay.value = false; // Jangan autoplay dulu
  currentVideoId.value = videoId;
  currentStartTime.value = parseTimeToSeconds(startTime || '0');
  
  // Reset Data Lama
  characters.value = [];
  subtitlesQueue.value = [];
  displayedSubtitles.value = [];
  currentVideoTime.value = currentStartTime.value;

  // Save to watch history if user is logged in
  if (authStore.isAuthenticated) {
    authStore.addToWatchHistory({
      videoId: videoId,
      videoUrl: url,
      title: `Video ${videoId}`, // Will be updated with actual title if available
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    })
  }

  // Auto Scroll ke Player
  await nextTick();
  const playerSection = document.getElementById('player-section');
  if (playerSection) playerSection.scrollIntoView({ behavior: 'smooth' });

  // Request ke Backend Node.js untuk Object Detection & ASR
  try {
    await axios.post('/api/analyze', {
      videoUrl: url,
      startTime: startTime || '0',
      socketId: socket.id
    });
    
    console.log("[App] Backend request success, waiting before play...");
    
    // Tunggu 2.5 detik agar backend siap memproses
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    // Sekarang putar video
    console.log("[App] Starting video playback...");
    shouldAutoPlay.value = true;
    
    // Fallback: Jika autoPlay prop tidak trigger, panggil manual
    setTimeout(() => {
      if (videoPlayerRef.value && videoPlayerRef.value.playVideo) {
        videoPlayerRef.value.playVideo();
      }
    }, 500);

  } catch (error) {
    console.error("Gagal menghubungi backend:", error);
    alert("Backend error. Cek terminal Node.js!");
  } finally {
    isLoading.value = false;
  }
};

const handleLiveStream = async (payload) => {
  const videoUrl = payload.videoUrl;
  console.log("[App] Starting Live Stream with URL:", videoUrl);
  
  // Reset state
  currentVideoId.value = 'live-stream'; // Dummy ID to trigger view switch
  liveStreamUrl.value = 'socket-relay'; // Flag for socket mode
  liveVideoUrl.value = videoUrl; // Pass YouTube URL to player
  currentStartTime.value = 0;
  
  characters.value = [];
  subtitlesQueue.value = [];
  displayedSubtitles.value = [];
  
  // NOTE: Don't emit start-live-stream here!
  // VideoPlayer.vue will handle session request when it mounts
  // This prevents double session creation
  console.log("[App] Live Stream mode set, VideoPlayer will request session");
  
  // Start ASR untuk Live Stream juga
  try {
    console.log("[App] Starting ASR for Live Stream...");
    await axios.post('/api/start-asr', {
      videoUrl: videoUrl,
      startTime: '0'
    });
    console.log("[App] ASR started for Live Stream");
  } catch (error) {
    console.error("[App] Failed to start ASR:", error);
  }
  
  shouldAutoPlay.value = true;
  
  // Auto Scroll ke Player
  nextTick(() => {
    const playerSection = document.getElementById('player-section');
    if (playerSection) playerSection.scrollIntoView({ behavior: 'smooth' });
  });
};

const handleStartASR = async (payload) => {
  const { url, startTime } = payload;
  const videoId = getYouTubeVideoId(url);

  if (!videoId) {
    alert("URL YouTube tidak valid!");
    return;
  }

  isASRLoadng.value = true;
  shouldAutoPlay.value = false;
  currentVideoId.value = videoId;
  currentStartTime.value = parseTimeToSeconds(startTime || '0');
  
  // Reset Data Lama
  characters.value = [];
  subtitlesQueue.value = [];
  displayedSubtitles.value = [];
  currentVideoTime.value = currentStartTime.value;

  // Auto Scroll ke Player
  await nextTick();
  const playerSection = document.getElementById('player-section');
  if (playerSection) playerSection.scrollIntoView({ behavior: 'smooth' });

  // Request ke Backend Node.js untuk ASR
  try {
    await axios.post('/api/start-asr', {
      videoUrl: url,
      startTime: startTime || '0'
    });
    
    console.log("[App] ASR request success, waiting before play...");
    
    // Tunggu 2 detik agar ASR siap
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Putar video
    shouldAutoPlay.value = true;
    setTimeout(() => {
      if (videoPlayerRef.value && videoPlayerRef.value.playVideo) {
        videoPlayerRef.value.playVideo();
      }
    }, 500);
    
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

const normalizeCharacterId = (characterPayload) => {
  if (!characterPayload) return null
  const fallbackFromName = characterPayload.name
    ? characterPayload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    : null
  return characterPayload.id || characterPayload.slug || fallbackFromName || null
}

const playAchievementSound = async () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!audioContext) {
      audioContext = new AudioCtx()
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880, audioContext.currentTime)
    osc.connect(gain)
    gain.connect(audioContext.destination)
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35)
    osc.start()
    osc.stop(audioContext.currentTime + 0.35)
  } catch (error) {
    console.warn('Achievement sound error:', error)
  }
}

const triggerAchievementToast = (characterName) => {
  achievementMessage.value = `Karakter Baru Ditemukan: ${characterName || 'Tokoh Misterius'}!`
  isAchievementVisible.value = true
  if (achievementTimer) {
    clearTimeout(achievementTimer)
  }
  achievementTimer = setTimeout(() => {
    isAchievementVisible.value = false
  }, 4000)
  playAchievementSound()
}

const handleCharacterUnlock = async (characterPayload) => {
  if (!authStore.isAuthenticated) return
  const characterId = normalizeCharacterId(characterPayload)
  if (!characterId) return
  if (unlockedCache.has(characterId)) return

  try {
    const result = await unlockCharacter({
      userId: authStore.user.uid,
      characterId,
      videoId: currentVideoId.value
    })
    unlockedCache.add(characterId)
    if (result?.isNew) {
      triggerAchievementToast(characterPayload?.name)
    }
  } catch (error) {
    console.error('[App] Gagal unlock karakter:', error)
  }
}

const handleVideoSeek = async (seekTime) => {
  console.log(`[App] Video seek detected to: ${seekTime}s`);
  
  // Reset subtitle queues on seek
  // Pindahkan semua displayed yang waktunya > seekTime kembali ke queue
  const toQueue = displayedSubtitles.value.filter(sub => sub.start_time > seekTime)
  const toKeep = displayedSubtitles.value.filter(sub => sub.start_time <= seekTime)
  
  displayedSubtitles.value = toKeep
  subtitlesQueue.value = [...toQueue, ...subtitlesQueue.value].sort((a, b) => a.start_time - b.start_time)
  
  // Debounce: tunggu 1.5 detik setelah user selesai seek
  if (seekDebounceTimer) {
    clearTimeout(seekDebounceTimer);
  }
  
  seekDebounceTimer = setTimeout(async () => {
    console.log(`[App] Executing seek to: ${seekTime}s`);
    
    try {
      await axios.post('/api/seek-analysis', {
        startTime: Math.floor(seekTime)
      });
      console.log(`[App] AI Analysis restarted from: ${seekTime}s`);
    } catch (error) {
      console.error("[App] Failed to seek AI analysis:", error);
    }
  }, 1500);
}

const handlePlayerReady = () => {
  console.log("[App] Video player ready");
}

const handleBoxesUpdate = (boxes) => {
  characters.value = boxes;
  console.log("[App] Boxes updated:", boxes.length, "objects detected");
}

const handleChangeLanguage = async (lang) => {
  targetLanguage.value = lang;
  console.log("[App] Changing target language to:", lang);
  
  try {
    const response = await axios.post('/api/change-language', {
      targetLanguage: lang
    });
    console.log("[App] Language change response:", response.data);
  } catch (error) {
    console.error("[App] Failed to change language:", error.message);
  }
}

const handleCloseVideo = async () => {
  // If live streaming, send stop signal
  if (liveStreamUrl.value === 'socket-relay') {
    socket.emit('stop-live-stream');
    console.log("[App] Sent stop-live-stream event");
  }
  
  // Also explicitly stop ASR via API
  try {
    await axios.post('/api/stop-asr');
    console.log("[App] ASR stopped via API");
  } catch (error) {
    console.log("[App] Failed to stop ASR:", error.message);
  }
  
  currentVideoId.value = null;
  liveStreamUrl.value = null;
  liveVideoUrl.value = null;
  shouldAutoPlay.value = false;
  subtitlesQueue.value = [];
  displayedSubtitles.value = [];
  
  // Reset search bar loading state
  if (stickySearchBarRef.value && stickySearchBarRef.value.resetLiveLoading) {
    stickySearchBarRef.value.resetLiveLoading();
  }
}

// Handle search results from StickySearchBar
const handleSearchResults = (result) => {
  searchResults.value = result.videos
  searchError.value = result.error
}

// Handle sticky state change
const handleStickyChange = (data) => {
  isSearchBarSticky.value = data.isSticky
  searchBarHeight.value = data.height
}

// Handle video selection from search results
const handleSelectSearchVideo = (video) => {
  if (stickySearchBarRef.value) {
    stickySearchBarRef.value.setVideoUrl(`https://www.youtube.com/watch?v=${video.videoId}`)
  }
  searchResults.value = []
}

// Handle video selection from gallery - just set URL to input, don't auto-play
const handleGalleryVideoSelect = (url) => {
  if (stickySearchBarRef.value) {
    stickySearchBarRef.value.setVideoUrl(url)
  }
  // Scroll to top so user can see the input
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// --- SOCKET LISTENER ---
onMounted(() => {
  // Check if first-time user (show tutorial)
  const tutorialCompleted = localStorage.getItem('cowayang_tutorial_completed')
  if (!tutorialCompleted) {
    // Show tutorial after a short delay
    setTimeout(() => {
      isTutorialOpen.value = true
    }, 1000)
  }

  // Keyboard shortcuts listener
  window.addEventListener('keydown', handleKeyboardShortcuts)

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
      handleCharacterUnlock(payload.data)
    }

    // Logika Subtitle - Masukkan ke Queue
    if (payload.type === 'subtitle') {
      console.log('[Frontend] Subtitle masuk ke queue:', payload.data);
      
      const newSubtitle = {
        ...payload.data,
        id: Date.now() + Math.random(), // ID unik
        isNew: true,
        // Pastikan start_time ada (konversi dari timestamp jika perlu)
        start_time: payload.data.start_time || parseTimestampToSeconds(payload.data.timestamp),
        end_time: payload.data.end_time || (payload.data.start_time || parseTimestampToSeconds(payload.data.timestamp)) + 4
      };
      
      // Masukkan ke queue, sorted by start_time
      subtitlesQueue.value.push(newSubtitle);
      subtitlesQueue.value.sort((a, b) => a.start_time - b.start_time);
      
      console.log(`[Frontend] Queue size: ${subtitlesQueue.value.length}, Displayed: ${displayedSubtitles.value.length}`);

      // Hapus flag isNew setelah 3 detik
      setTimeout(() => {
        const sub = displayedSubtitles.value.find(s => s.id === newSubtitle.id);
        if (sub) sub.isNew = false;
      }, 3000);
    }
  });

  // Listen for stream started event from Python
  socket.on('stream-started', (data) => {
    console.log('[Frontend] Stream started:', data);
    // Reset loading state
    if (stickySearchBarRef.value && stickySearchBarRef.value.resetLiveLoading) {
      stickySearchBarRef.value.resetLiveLoading();
    }
  });

  // Listen for stream error
  socket.on('stream-error', (data) => {
    console.error('[Frontend] Stream error:', data);
    alert('Gagal memulai stream: ' + (data.message || 'Unknown error'));
    // Reset state
    if (stickySearchBarRef.value && stickySearchBarRef.value.resetLiveLoading) {
      stickySearchBarRef.value.resetLiveLoading();
    }
    handleCloseVideo();
  });
  
  // Start sync interval (backup untuk sinkronisasi)
  syncInterval = setInterval(syncVideoAndData, 500);
});

// Helper: Parse timestamp string ke seconds
const parseTimestampToSeconds = (timestamp) => {
  if (!timestamp) return 0;
  const parts = timestamp.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  return parseInt(timestamp) || 0;
}

// --- KEYBOARD SHORTCUTS ---
const handleKeyboardShortcuts = (e) => {
  // Ignore if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    return
  }

  // Ignore if any modal is open (except shortcuts modal itself with ?)
  const isModalOpen = isLoginModalOpen.value || isRegisterModalOpen.value || 
                      isForgotPasswordModalOpen.value || isProfileModalOpen.value ||
                      isTutorialOpen.value

  switch(e.key) {
    // Show shortcuts modal
    case '?':
      e.preventDefault()
      isShortcutsModalOpen.value = !isShortcutsModalOpen.value
      break
    
    // Close any open modal
    case 'Escape':
      if (isShortcutsModalOpen.value) {
        closeShortcutsModal()
      } else if (isTutorialOpen.value) {
        closeTutorial()
      } else if (isProfileModalOpen.value) {
        closeProfileModal()
      } else if (isLoginModalOpen.value) {
        closeLoginModal()
      } else if (isRegisterModalOpen.value) {
        closeRegisterModal()
      } else if (isForgotPasswordModalOpen.value) {
        closeForgotPasswordModal()
      }
      break
    
    // Focus search (when no video playing)
    case '/':
      if (!currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="text"]')
        if (searchInput) searchInput.focus()
      }
      break
    
    // Go home
    case 'h':
    case 'H':
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        handleCloseVideo()
      }
      break

    // Video controls (only when video is playing)
    case ' ': // Space - Play/Pause
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.togglePlayPause?.()
        }
      }
      break
    
    case 'ArrowLeft': // Seek backward 10s
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.seekRelative?.(-10)
        }
      }
      break
    
    case 'ArrowRight': // Seek forward 10s
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.seekRelative?.(10)
        }
      }
      break
    
    case 'ArrowUp': // Volume up
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.changeVolume?.(10)
        }
      }
      break
    
    case 'ArrowDown': // Volume down
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.changeVolume?.(-10)
        }
      }
      break
    
    case 'm':
    case 'M': // Mute toggle
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.toggleMute?.()
        }
      }
      break
    
    case 'f':
    case 'F': // Fullscreen
      if (currentVideoId.value && !isModalOpen) {
        e.preventDefault()
        if (videoPlayerRef.value) {
          videoPlayerRef.value.toggleFullscreen?.()
        }
      }
      break
  }
}

// Cleanup ketika component unmount
onUnmounted(() => {
  // Stop ASR ketika user keluar dari halaman
  axios.post('/api/stop-asr').catch(err => console.log('Cleanup ASR:', err));
  
  // Remove keyboard listener
  window.removeEventListener('keydown', handleKeyboardShortcuts)
  
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  if (seekDebounceTimer) {
    clearTimeout(seekDebounceTimer);
  }
  if (achievementTimer) {
    clearTimeout(achievementTimer)
  }
  if (audioContext?.state !== 'closed') {
    audioContext?.close?.().catch(() => {})
  }
});
</script>

<template>
  <div class="min-h-screen text-[#FCEFE4] font-sans selection:bg-wayang-gold selection:text-wayang-dark">
    
    <Navbar @open-login="openLoginModal" @open-register="openRegisterModal" @open-profile="openProfileModal" @open-shortcuts="openShortcutsModal" />

    <main v-if="!isAlmanacRoute" class="container mx-auto px-4 pb-20 pt-24">
      
      <div v-if="!currentVideoId" class="flex flex-col items-center animate-fade-in space-y-6">
        
        <HeroSection />

        <!-- Sticky Search Bar (in content flow, becomes sticky on scroll) -->
        <StickySearchBar 
          ref="stickySearchBarRef"
          :loading="isLoading"
          @live-stream="handleLiveStream"
          @search-results="handleSearchResults"
          @sticky-change="handleStickyChange"
        />

        <!-- Spacer when sticky to prevent content jump -->
        <div v-if="isSearchBarSticky" :style="{ height: searchBarHeight + 'px' }"></div>

        <!-- Search Results Grid -->
        <div v-if="searchResults.length > 0" class="w-full max-w-4xl">
          <h3 class="text-left text-lg font-semibold text-white mb-4">
            Hasil Pencarian ({{ searchResults.length }} video)
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div 
              v-for="video in searchResults" 
              :key="video.videoId"
              @click="handleSelectSearchVideo(video)"
              class="bg-white/10 rounded-xl overflow-hidden border border-white/15 hover:border-wayang-gold/60 cursor-pointer transition-transform hover:scale-[1.02] backdrop-blur-sm"
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
        <div v-if="searchError" class="w-full max-w-4xl p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
          {{ searchError }}
        </div>
        
        <VideoGallery @select-video="handleGalleryVideoSelect" />
      
      </div>

      <div v-else id="player-section" class="animate-fade-in">
        
        <button 
          @click="handleCloseVideo"
          class="mb-6 text-sm text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Kembali ke Pencarian
        </button>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[75vh] max-h-[700px]">
          
          <div class="lg:col-span-3 h-full overflow-hidden max-h-[700px]" :class="{'hidden lg:block': activeMobileTab !== 'characters'}">
            <DetectionPanel 
              :characters="characters"
              :ai-connected="aiConnected"
              :video-info="videoInfo"
              :current-time="currentVideoTime"
              :show-bounding-box="showBoundingBox"
              :show-labels="showLabels"
              :confidence-threshold="confidenceThreshold"
              :target-language="targetLanguage"
              @toggle-bbox="showBoundingBox = $event"
              @toggle-labels="showLabels = $event"
              @update-confidence="confidenceThreshold = $event"
              @change-language="handleChangeLanguage"
            />
          </div>

          <div class="lg:col-span-6 flex flex-col h-full">
            <VideoPlayer 
              ref="videoPlayerRef"
              :video-id="currentVideoId" 
              :stream-url="liveStreamUrl"
              :live-video-url="liveVideoUrl"
              :start-time="currentStartTime"
              :auto-play="shouldAutoPlay"
              :characters="characters"
              :show-bounding-box="showBoundingBox"
              :show-labels="showLabels"
              :confidence-threshold="confidenceThreshold"
              @close="handleCloseVideo"
              @timeUpdate="currentVideoTime = $event"
              @seek="handleVideoSeek"
              @playerReady="handlePlayerReady"
              @ai-connected="aiConnected = $event"
              @boxes-update="handleBoxesUpdate"
            />
            
            <div class="flex lg:hidden mt-4 bg-white/5 rounded-xl p-1 border border-white/10 backdrop-blur">
              <button @click="activeMobileTab = 'characters'" class="flex-1 py-2 rounded-lg text-sm font-bold transition-all" :class="activeMobileTab === 'characters' ? 'bg-wayang-primary text-white' : 'text-gray-400'">
                🤖 Panel AI
              </button>
              <button @click="activeMobileTab = 'subtitles'" class="flex-1 py-2 rounded-lg text-sm font-bold transition-all" :class="activeMobileTab === 'subtitles' ? 'bg-wayang-primary text-white' : 'text-gray-400'">
                📜 Subtitle
              </button>
            </div>
          </div>

          <div class="lg:col-span-3 h-full overflow-hidden max-h-[700px]" :class="{'hidden lg:block': activeMobileTab !== 'subtitles'}">
            <LiveTranscription :subtitles="syncedSubtitles" :currentTime="currentVideoTime" :queueCount="subtitlesQueue.length" />
          </div>

        </div>
      </div>

      <!-- About Section (shown when no video) -->
      <AboutSection v-if="!currentVideoId" />

    </main>

    <AlmanacView v-else />

    <!-- Footer -->
    <AppFooter 
      @showShortcuts="openShortcutsModal"
      @showTutorial="openTutorial"
    />

    <transition name="fade">
      <div
        v-if="isAchievementVisible"
        class="fixed top-24 right-6 bg-white/10 border border-wayang-gold/60 text-white rounded-2xl px-5 py-4 shadow-[0_15px_35px_rgba(0,0,0,0.45)] backdrop-blur flex items-center gap-3"
      >
        <div class="w-10 h-10 rounded-full bg-wayang-gold/20 flex items-center justify-center text-wayang-gold text-xl">
          ✨
        </div>
        <div>
          <p class="text-xs uppercase tracking-[0.35em] text-white/60">Achievement</p>
          <p class="font-semibold">{{ achievementMessage }}</p>
        </div>
      </div>
    </transition>

    <LoginModal 
      :is-open="isLoginModalOpen" 
      @close="closeLoginModal" 
      @login="handleLogin" 
      @switch-to-register="switchToRegister"
      @forgot-password="switchToForgotPassword"
    />
    <RegisterModal 
      :is-open="isRegisterModalOpen" 
      @close="closeRegisterModal" 
      @register="handleRegister" 
      @switch-to-login="switchToLogin"
    />
    <ForgotPasswordModal
      :is-open="isForgotPasswordModalOpen"
      @close="closeForgotPasswordModal"
      @switch-to-login="switchToLogin"
    />
    <UserProfileModal
      :is-open="isProfileModalOpen"
      @close="closeProfileModal"
      @play-video="(url) => handleAnalyze({ url, startTime: '0' })"
    />
    <KeyboardShortcutsModal
      :is-open="isShortcutsModalOpen"
      @close="closeShortcutsModal"
    />
    <TutorialModal
      :is-open="isTutorialOpen"
      @close="closeTutorial"
      @complete="closeTutorial"
    />
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