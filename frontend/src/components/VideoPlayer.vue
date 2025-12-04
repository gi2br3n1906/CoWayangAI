<template>
  <div id="video-player-section" class="w-full h-full flex flex-col">
    
    <div class="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      
      <!-- Live Stream Mode (YouTube + AI Overlay) -->
      <div v-if="isLiveMode" class="w-full h-full relative">
        <!-- YouTube Player for Video + Audio -->
        <div id="youtube-player-live" class="w-full h-full"></div>
        
        <!-- AI Bounding Box Overlay -->
        <canvas 
          ref="overlayCanvas" 
          class="absolute inset-0 w-full h-full pointer-events-none z-10"
        ></canvas>
        
        <!-- Live Badge -->
        <div class="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse flex items-center gap-2 shadow-lg z-20">
          <span class="w-2 h-2 bg-white rounded-full"></span>
          LIVE AI
        </div>

        <!-- AI Status -->
        <div v-if="!aiConnected" class="absolute bottom-4 left-4 bg-yellow-600/90 text-white px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg z-20">
          <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          Menunggu AI terhubung...
        </div>
        <div v-else class="absolute bottom-4 left-4 bg-green-600/90 text-white px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg z-20">
          <span class="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          AI Aktif · {{ detectedCount }} objek
        </div>
      </div>

      <!-- Normal YouTube Mode -->
      <div v-else id="youtube-player" class="w-full h-full"></div>
      
      <!-- Loading Overlay saat menunggu backend (Only for YouTube) -->
      <div 
        v-if="!isLiveMode && isWaitingForBackend"
        class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10"
      >
        <div class="w-16 h-16 border-4 border-wayang-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-white font-semibold">Menunggu AI siap...</p>
        <p class="text-gray-400 text-sm mt-1">Video akan diputar otomatis</p>
      </div>
    </div>

    <div class="mt-4 bg-slate-800/80 backdrop-blur border border-white/10 rounded-xl p-4 flex items-center justify-between shadow-lg animate-fade-in">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 class="text-white font-semibold text-sm">
            {{ isLiveMode ? 'Live AI Detection Mode' : 'Video Sedang Dianalisis' }}
          </h3>
          <p class="text-xs text-gray-400">
            {{ isLiveMode ? 'YouTube + AI Bounding Box Overlay' : 'AI mendeteksi tokoh & subtitle secara real-time' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Favorite Button (Only for YouTube) -->
        <button 
          v-if="isAuthenticated && !isLiveMode"
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
          @click="emit('close')"
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { io } from 'socket.io-client';

// Auth Store
const authStore = useAuthStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isFavorited = ref(false);

// Menerima props dari App.vue
const props = defineProps({
  videoId: { type: String, default: '' },
  streamUrl: { type: String, default: '' }, // Used as flag for Live Mode
  liveVideoUrl: { type: String, default: '' }, // YouTube URL for live mode
  startTime: { type: Number, default: 0 },
  autoPlay: { type: Boolean, default: false } // Kontrol autoplay dari parent
});

const isLiveMode = computed(() => props.streamUrl === 'socket-relay');

// Mendefinisikan event 'close' agar bisa didengar App.vue
const emit = defineEmits(['close', 'timeUpdate', 'seek', 'playerReady']);

let player = null;
let livePlayer = null;
let lastTime = 0;
let timeUpdateInterval = null;
const isWaitingForBackend = ref(true);

// Canvas overlay for bounding boxes
const overlayCanvas = ref(null);
let canvasCtx = null;

// Socket for AI Detection
const socket = ref(null);
const aiConnected = ref(false);
const detectedCount = ref(0);
const currentBoxes = ref([]);

// Colors for bounding boxes (same as Python)
const COLORS = [
  'rgba(255, 111, 97, 0.9)',
  'rgba(97, 186, 255, 0.9)',
  'rgba(162, 155, 254, 0.9)',
  'rgba(255, 204, 112, 0.9)',
  'rgba(76, 209, 149, 0.9)',
  'rgba(255, 118, 253, 0.9)',
];

// Check if video is favorited
const checkFavorite = async () => {
  if (authStore.isAuthenticated && props.videoId && !isLiveMode.value) {
    isFavorited.value = await authStore.isFavorite(props.videoId);
  }
};

// Toggle favorite
const toggleFavorite = async () => {
  if (!authStore.isAuthenticated || isLiveMode.value) return;
  
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

// Draw bounding boxes on canvas
const drawBoundingBoxes = (boxes) => {
  if (!overlayCanvas.value || !canvasCtx) return;
  
  const canvas = overlayCanvas.value;
  const ctx = canvasCtx;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!boxes || boxes.length === 0) return;
  
  boxes.forEach((box, index) => {
    const color = COLORS[index % COLORS.length];
    
    // Convert percentage to pixels
    const x = (box.left / 100) * canvas.width;
    const y = (box.top / 100) * canvas.height;
    const w = (box.width / 100) * canvas.width;
    const h = (box.height / 100) * canvas.height;
    
    // Draw box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    
    // Draw label background
    const label = box.confidence ? `${box.name} ${box.confidence}%` : box.name;
    ctx.font = 'bold 14px Arial';
    const textWidth = ctx.measureText(label).width;
    
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 24, textWidth + 10, 24);
    
    // Draw label text
    ctx.fillStyle = '#000';
    ctx.fillText(label, x + 5, y - 7);
  });
};

// Setup canvas dimensions
const setupCanvas = () => {
  if (!overlayCanvas.value) return;
  
  const canvas = overlayCanvas.value;
  const container = canvas.parentElement;
  
  // Match canvas size to container
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  
  canvasCtx = canvas.getContext('2d');
};

// Expose player methods ke parent
const playVideo = () => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p && p.playVideo) {
    p.playVideo();
    isWaitingForBackend.value = false;
  }
};

const pauseVideo = () => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p && p.pauseVideo) {
    p.pauseVideo();
  }
};

const getCurrentTime = () => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p && p.getCurrentTime) {
    return p.getCurrentTime();
  }
  return 0;
};

const seekTo = (seconds) => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p && p.seekTo) {
    p.seekTo(seconds, true);
  }
};

// Additional methods for keyboard shortcuts
const togglePlayPause = () => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p) {
    const state = p.getPlayerState();
    if (state === window.YT.PlayerState.PLAYING) {
      p.pauseVideo();
    } else {
      p.playVideo();
    }
  }
};

const seekRelative = (delta) => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p && p.getCurrentTime && p.seekTo) {
    const currentTime = p.getCurrentTime();
    const newTime = Math.max(0, currentTime + delta);
    p.seekTo(newTime, true);
    emit('seek', newTime);
  }
};

const changeVolume = (delta) => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p && p.getVolume && p.setVolume) {
    const currentVolume = p.getVolume();
    const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
    p.setVolume(newVolume);
  }
};

const toggleMute = () => {
  const p = isLiveMode.value ? livePlayer : player;
  if (p) {
    if (p.isMuted()) {
      p.unMute();
    } else {
      p.mute();
    }
  }
};

const toggleFullscreen = () => {
  const containerId = isLiveMode.value ? 'youtube-player-live' : 'youtube-player';
  const container = document.getElementById(containerId);
  if (container) {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.parentElement?.requestFullscreen?.() || 
      container.parentElement?.webkitRequestFullscreen?.() || 
      container.parentElement?.mozRequestFullScreen?.();
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

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);

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

// Extract video ID from YouTube URL
const extractVideoId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

// Initialize Live Mode Player
const initLivePlayer = async () => {
  await loadYouTubeAPI();
  
  // Setup canvas
  await nextTick();
  setupCanvas();
  
  // Handle window resize
  window.addEventListener('resize', setupCanvas);
  
  // Connect socket for AI detections
  socket.value = io('/', { path: '/socket.io' });
  
  socket.value.on('connect', () => {
    console.log('[VideoPlayer] Socket connected for AI overlay');
  });
  
  socket.value.on('ai-boxes', (data) => {
    aiConnected.value = true;
    currentBoxes.value = data.boxes || [];
    detectedCount.value = currentBoxes.value.length;
    drawBoundingBoxes(currentBoxes.value);
  });
  
  socket.value.on('stream-started', () => {
    aiConnected.value = true;
  });
  
  // Get video ID from URL
  const videoId = extractVideoId(props.liveVideoUrl);
  if (!videoId) {
    console.error('[VideoPlayer] Invalid YouTube URL:', props.liveVideoUrl);
    return;
  }
  
  // Ensure element exists
  if (!document.getElementById('youtube-player-live')) return;

  livePlayer = new window.YT.Player('youtube-player-live', {
    height: '100%',
    width: '100%',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      start: props.startTime,
      modestbranding: 1,
      rel: 0
    },
    events: {
      onReady: onLivePlayerReady,
      onStateChange: onLivePlayerStateChange
    }
  });
};

const onLivePlayerReady = (event) => {
  console.log('[VideoPlayer] Live YouTube player ready');
  emit('playerReady');
  event.target.playVideo();
};

const onLivePlayerStateChange = (event) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
    // Start time update interval
    if (!timeUpdateInterval) {
      timeUpdateInterval = setInterval(() => {
        if (livePlayer && livePlayer.getCurrentTime) {
          const currentTime = livePlayer.getCurrentTime();
          
          // Detect seek (time jump > 3 seconds)
          if (Math.abs(currentTime - lastTime) > 3) {
            console.log(`[VideoPlayer] Live seek detected: ${lastTime}s -> ${currentTime}s`);
            emit('seek', currentTime);
            
            // Send seek event to Python via socket
            if (socket.value) {
              socket.value.emit('player-seek', { time: currentTime });
            }
          }
          
          emit('timeUpdate', currentTime);
          lastTime = currentTime;
        }
      }, 500);
    }
  } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }
  }
};

// Initialize Normal YouTube Player
const initPlayer = async () => {
  if (isLiveMode.value) {
    await initLivePlayer();
    return;
  }
  
  await loadYouTubeAPI();
  await checkFavorite();
  
  if (!document.getElementById('youtube-player')) return;

  player = new window.YT.Player('youtube-player', {
    height: '100%',
    width: '100%',
    videoId: props.videoId,
    playerVars: {
      autoplay: 0,
      start: props.startTime,
      modestbranding: 1,
      rel: 0
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

onMounted(async () => {
  await initPlayer();
});

onUnmounted(() => {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }
  if (socket.value) {
    socket.value.disconnect();
  }
  window.removeEventListener('resize', setupCanvas);
});

const onPlayerReady = (event) => {
  lastTime = props.startTime;
  emit('playerReady');
  
  if (props.autoPlay) {
    playVideo();
  }
};

const onPlayerStateChange = (event) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
    isWaitingForBackend.value = false;
    
    if (!timeUpdateInterval) {
      timeUpdateInterval = setInterval(() => {
        if (player && player.getCurrentTime) {
          const currentTime = player.getCurrentTime();
          
          if (Math.abs(currentTime - lastTime) > 3) {
            console.log(`[VideoPlayer] Seek detected: ${lastTime}s -> ${currentTime}s`);
            emit('seek', currentTime);
          }
          
          emit('timeUpdate', currentTime);
          lastTime = currentTime;
        }
      }, 500);
    }
  } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }
  }
};

// Watch for videoId changes
watch(() => props.videoId, async (newId) => {
  if (isLiveMode.value) return;

  if (player && newId) {
    isWaitingForBackend.value = true;
    player.loadVideoById({
      videoId: newId,
      startSeconds: props.startTime
    });
    setTimeout(() => {
      if (player && player.pauseVideo) {
        player.pauseVideo();
      }
    }, 100);
    
    await checkFavorite();
  } else if (!player && newId) {
    await nextTick();
    await initPlayer();
  }
});

// Watch streamUrl changes
watch(() => props.streamUrl, async (newUrl) => {
  if (newUrl === 'socket-relay') {
    // Destroy normal player if exists
    if (player && player.destroy) {
      player.destroy();
      player = null;
    }
    await nextTick();
    await initLivePlayer();
  } else if (props.videoId) {
    // Cleanup live mode
    if (livePlayer && livePlayer.destroy) {
      livePlayer.destroy();
      livePlayer = null;
    }
    if (socket.value) {
      socket.value.disconnect();
      socket.value = null;
    }
    aiConnected.value = false;
    await nextTick();
    await initPlayer();
  }
});

// Watch autoPlay prop
watch(() => props.autoPlay, (shouldPlay) => {
  if (shouldPlay) {
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
