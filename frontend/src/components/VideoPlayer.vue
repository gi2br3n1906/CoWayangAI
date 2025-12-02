<template>
  <div id="video-player-section" class="w-full h-full flex flex-col">
    
    <div class="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      <div id="youtube-player" class="w-full h-full"></div>
      
      <!-- Loading Overlay saat menunggu backend -->
      <div 
        v-if="isWaitingForBackend"
        class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10"
      >
        <div class="w-16 h-16 border-4 border-wayang-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-white font-semibold">Menunggu AI siap...</p>
        <p class="text-gray-400 text-sm mt-1">Video akan diputar otomatis</p>
      </div>
    </div>

    <div class="mt-4 bg-white/10 backdrop-blur border border-white/15 rounded-xl p-4 flex items-center justify-between shadow-lg animate-fade-in">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-wayang-gold/15 flex items-center justify-center text-wayang-gold">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 class="text-white font-semibold text-sm">Video Sedang Dianalisis</h3>
          <p class="text-xs text-white/70">AI mendeteksi tokoh & subtitle secara real-time</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Favorite Button -->
        <button 
          v-if="isAuthenticated"
          @click="toggleFavorite"
          class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          :class="isFavorited ? 'text-wayang-gold' : 'text-gray-400 hover:text-wayang-gold'"
          :title="isFavorited ? 'Hapus dari Favorit' : 'Tambah ke Favorit'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" :fill="isFavorited ? 'currentColor' : 'none'" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>

        <button 
          @click="$emit('close')"
          class="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Tutup Video"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';

// Auth Store
const authStore = useAuthStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isFavorited = ref(false);

// Menerima props dari App.vue
const props = defineProps({
  videoId: { type: String, required: true },
  startTime: { type: Number, default: 0 },
  autoPlay: { type: Boolean, default: false } // Kontrol autoplay dari parent
});

// Mendefinisikan event 'close' agar bisa didengar App.vue
const emit = defineEmits(['close', 'timeUpdate', 'seek', 'playerReady']);

let player = null;
let lastTime = 0;
let timeUpdateInterval = null;
const isWaitingForBackend = ref(true);

// Check if video is favorited
const checkFavorite = async () => {
  if (authStore.isAuthenticated && props.videoId) {
    isFavorited.value = await authStore.isFavorite(props.videoId);
  }
};

// Toggle favorite
const toggleFavorite = async () => {
  if (!authStore.isAuthenticated) return;
  
  if (isFavorited.value) {
    await authStore.removeFromFavorites(props.videoId);
    isFavorited.value = false;
  } else {
    await authStore.addToFavorites({
      videoId: props.videoId,
      videoUrl: `https://www.youtube.com/watch?v=${props.videoId}`,
      title: `Video ${props.videoId}`,
      thumbnail: `https://img.youtube.com/vi/${props.videoId}/mqdefault.jpg`
    });
    isFavorited.value = true;
  }
};

// Expose player methods ke parent
const playVideo = () => {
  if (player && player.playVideo) {
    player.playVideo();
    isWaitingForBackend.value = false;
  }
};

const pauseVideo = () => {
  if (player && player.pauseVideo) {
    player.pauseVideo();
  }
};

const getCurrentTime = () => {
  if (player && player.getCurrentTime) {
    return player.getCurrentTime();
  }
  return 0;
};

const seekTo = (seconds) => {
  if (player && player.seekTo) {
    player.seekTo(seconds, true);
  }
};

// Additional methods for keyboard shortcuts
const togglePlayPause = () => {
  if (player) {
    const state = player.getPlayerState();
    if (state === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }
};

const seekRelative = (delta) => {
  if (player && player.getCurrentTime && player.seekTo) {
    const currentTime = player.getCurrentTime();
    const newTime = Math.max(0, currentTime + delta);
    player.seekTo(newTime, true);
    emit('seek', newTime);
  }
};

const changeVolume = (delta) => {
  if (player && player.getVolume && player.setVolume) {
    const currentVolume = player.getVolume();
    const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
    player.setVolume(newVolume);
  }
};

const toggleMute = () => {
  if (player) {
    if (player.isMuted()) {
      player.unMute();
    } else {
      player.mute();
    }
  }
};

const toggleFullscreen = () => {
  const container = document.getElementById('youtube-player');
  if (container) {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen?.() || 
      container.webkitRequestFullscreen?.() || 
      container.mozRequestFullScreen?.();
    }
  }
};

// Expose methods ke parent via defineExpose
defineExpose({
  playVideo,
  pauseVideo,
  getCurrentTime,
  seekTo,
  togglePlayPause,
  seekRelative,
  changeVolume,
  toggleMute,
  toggleFullscreen
});

// Load YouTube IFrame API
const loadYouTubeAPI = () => {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    // If script is already loading or loaded, wait for YT
    if (window.YT) {
      const checkYT = () => {
        if (window.YT && window.YT.Player) {
          resolve();
        } else {
          setTimeout(checkYT, 100);
        }
      };
      checkYT();
      return;
    }

    // Load the script
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);

    // Wait for YT to be ready
    const checkYT = () => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        setTimeout(checkYT, 100);
      }
    };
    checkYT();
  });
};

onMounted(async () => {
  await loadYouTubeAPI();
  await checkFavorite();
  
  player = new window.YT.Player('youtube-player', {
    height: '100%',
    width: '100%',
    videoId: props.videoId,
    playerVars: {
      autoplay: 0, // TIDAK autoplay - dikontrol manual
      start: props.startTime,
      modestbranding: 1,
      rel: 0
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
});

onUnmounted(() => {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }
});

const onPlayerReady = (event) => {
  // Player is ready
  lastTime = props.startTime;
  emit('playerReady');
  
  // Jika autoPlay true, langsung putar
  if (props.autoPlay) {
    playVideo();
  }
};

const onPlayerStateChange = (event) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
    isWaitingForBackend.value = false;
    
    // Start updating current time dengan interval lebih cepat (500ms)
    if (!timeUpdateInterval) {
      timeUpdateInterval = setInterval(() => {
        if (player && player.getCurrentTime) {
          const currentTime = player.getCurrentTime();
          
          // Detect seek (perubahan waktu > 3 detik)
          if (Math.abs(currentTime - lastTime) > 3) {
            console.log(`[VideoPlayer] Seek detected: ${lastTime}s -> ${currentTime}s`);
            emit('seek', currentTime);
          }
          
          emit('timeUpdate', currentTime);
          lastTime = currentTime;
        }
      }, 500); // Update setiap 500ms untuk sinkronisasi lebih baik
    }
  } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
    // Stop updating when paused or ended
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }
  }
};

// Watch for videoId changes
watch(() => props.videoId, async (newId) => {
  if (player && newId) {
    isWaitingForBackend.value = true;
    player.loadVideoById({
      videoId: newId,
      startSeconds: props.startTime
    });
    // Pause immediately after loading
    setTimeout(() => {
      if (player && player.pauseVideo) {
        player.pauseVideo();
      }
    }, 100);
    
    // Check favorite status for new video
    await checkFavorite();
  }
});

// Watch autoPlay prop
watch(() => props.autoPlay, (shouldPlay) => {
  if (shouldPlay && player) {
    playVideo();
  }
});
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>