<template>
  <div id="video-player-section" class="w-full h-full flex flex-col">
    
    <div class="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      
      <!-- Live Stream Mode (YouTube + AI Overlay) -->
      <div v-if="isLiveMode" class="w-full h-full relative">
        <!-- Session Error Overlay -->
        <div v-if="sessionError" class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-30">
          <div class="text-center p-8 max-w-md">
            <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 class="text-white font-bold text-lg mb-2">Server Penuh</h3>
            <p class="text-gray-400 text-sm mb-4">{{ sessionError }}</p>
            <div v-if="workerStatus" class="bg-slate-800 rounded-lg p-3 mb-4">
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Status Worker:</span>
                <span class="text-white font-medium">{{ workerStatus.busy }}/{{ workerStatus.total }} terpakai</span>
              </div>
            </div>
            <button 
              @click="requestSession()"
              :disabled="isRequestingSession"
              class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isRequestingSession" class="flex items-center gap-2">
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Mencoba...
              </span>
              <span v-else>Coba Lagi</span>
            </button>
          </div>
        </div>
        
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
        
        <!-- Worker Info Badge -->
        <div v-if="workerId && !sessionError" class="absolute top-4 left-4 bg-slate-800/90 text-white px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg z-20 border border-white/10">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          {{ workerId }}
        </div>

        <!-- AI Status -->
        <div v-if="!sessionError">
          <div v-if="!aiConnected" class="absolute bottom-4 left-4 bg-yellow-600/90 text-white px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg z-20">
            <div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Menunggu AI terhubung...
          </div>
          <div v-else class="absolute bottom-4 left-4 bg-green-600/90 text-white px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg z-20">
            <span class="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            AI Aktif · {{ detectedCount }} objek
          </div>
        </div>
      </div>

      <!-- Normal YouTube Mode -->
      <div v-else class="w-full h-full relative">
        <div id="youtube-player" class="w-full h-full"></div>
        
        <!-- AI Bounding Box Overlay for Normal Mode -->
        <canvas 
          ref="normalOverlayCanvas" 
          class="absolute inset-0 w-full h-full pointer-events-none z-10"
        ></canvas>
        
        <!-- AI Status for Normal Mode -->
        <div v-if="props.characters && props.characters.length > 0" class="absolute bottom-4 left-4 bg-green-600/90 text-white px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg z-20">
          <span class="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          AI Aktif · {{ props.characters.length }} objek
        </div>
      </div>
      
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
          @click="handleClose"
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
  autoPlay: { type: Boolean, default: false }, // Kontrol autoplay dari parent
  characters: { type: Array, default: () => [] }, // Characters with bounding boxes for normal mode
  showBoundingBox: { type: Boolean, default: true }, // Toggle bounding box visibility
  showLabels: { type: Boolean, default: true }, // Toggle label visibility
  confidenceThreshold: { type: Number, default: 50 } // Min confidence to show
});

const isLiveMode = computed(() => props.streamUrl === 'socket-relay');

// Mendefinisikan event 'close' agar bisa didengar App.vue
const emit = defineEmits(['close', 'timeUpdate', 'seek', 'playerReady', 'ai-connected', 'boxes-update']);

let player = null;
let livePlayer = null;
let lastTime = 0;
let timeUpdateInterval = null;
const isWaitingForBackend = ref(true);

// Canvas overlay for bounding boxes (Live Mode)
const overlayCanvas = ref(null);
let canvasCtx = null;

// Canvas overlay for normal mode
const normalOverlayCanvas = ref(null);
let normalCanvasCtx = null;

// Socket for AI Detection
const socket = ref(null);
const aiConnected = ref(false);
const detectedCount = ref(0);
const currentBoxes = ref([]);

// Emit aiConnected state to parent
watch(aiConnected, (newVal) => {
  emit('ai-connected', newVal);
});

// Redraw bounding boxes when control props change
watch(() => props.showBoundingBox, () => {
  if (isLiveMode.value) {
    drawBoundingBoxes(currentBoxes.value);
  } else {
    drawNormalBoundingBoxes(props.characters);
  }
});

watch(() => props.showLabels, () => {
  if (isLiveMode.value) {
    drawBoundingBoxes(currentBoxes.value);
  } else {
    drawNormalBoundingBoxes(props.characters);
  }
});

watch(() => props.confidenceThreshold, () => {
  if (isLiveMode.value) {
    drawBoundingBoxes(currentBoxes.value);
  } else {
    drawNormalBoundingBoxes(props.characters);
  }
});

// Session Management
const sessionId = ref(null);
const workerId = ref(null);
const sessionError = ref(null);
const isRequestingSession = ref(false);

// Worker Status
const workerStatus = ref(null);

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
  
  // Skip if bounding box disabled
  if (!props.showBoundingBox) return;
  
  if (!boxes || boxes.length === 0) return;
  
  // Filter by confidence threshold
  const filteredBoxes = boxes.filter(box => 
    (box.confidence || 100) >= props.confidenceThreshold
  );
  
  filteredBoxes.forEach((box, index) => {
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
    
    // Draw label if enabled
    if (props.showLabels) {
      const label = box.confidence ? `${box.name} ${box.confidence}%` : box.name;
      ctx.font = 'bold 14px Arial';
      const textWidth = ctx.measureText(label).width;
      
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 24, textWidth + 10, 24);
      
      // Draw label text
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, y - 7);
    }
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

// Setup normal mode canvas dimensions
const setupNormalCanvas = () => {
  if (!normalOverlayCanvas.value) return;
  
  const canvas = normalOverlayCanvas.value;
  const container = canvas.parentElement;
  
  // Match canvas size to container
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
  
  normalCanvasCtx = canvas.getContext('2d');
};

// Draw bounding boxes on normal mode canvas
const drawNormalBoundingBoxes = (characters) => {
  if (!normalOverlayCanvas.value || !normalCanvasCtx) return;
  
  const canvas = normalOverlayCanvas.value;
  const ctx = normalCanvasCtx;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Skip if bounding box disabled
  if (!props.showBoundingBox) return;
  
  if (!characters || characters.length === 0) return;
  
  // Filter by confidence threshold
  const filteredChars = characters.filter(char => 
    char.box && (char.confidence || 100) >= props.confidenceThreshold
  );
  
  filteredChars.forEach((char, index) => {
    const box = char.box;
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
    
    // Draw label if enabled
    if (props.showLabels) {
      const label = char.confidence ? `${char.name} ${char.confidence}%` : char.name;
      ctx.font = 'bold 14px Arial';
      const textWidth = ctx.measureText(label).width;
      
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 24, textWidth + 10, 24);
      
      // Draw label text
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, y - 7);
    }
  });
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

// Request session from server
const requestSession = (existingSessionId = null) => {
  if (!socket.value || !socket.value.connected) return;
  if (isRequestingSession.value) return;
  
  // Prevent double request if already have session
  if (sessionId.value) {
    console.log('[VideoPlayer] Already have session:', sessionId.value);
    return;
  }
  
  isRequestingSession.value = true;
  sessionError.value = null;
  
  // Get current player time for sync
  const currentPlayerTime = getCurrentTime() || 0;
  
  console.log('[VideoPlayer] Requesting session for:', props.liveVideoUrl, 'at time:', currentPlayerTime);
  
  socket.value.emit('start-live-stream', {
    videoUrl: props.liveVideoUrl,
    existingSessionId: existingSessionId,
    currentTime: Math.floor(currentPlayerTime)  // Send current player position
  });
};

// End current session
const endSession = (reason = 'user_action') => {
  if (!socket.value || !sessionId.value) return;
  
  console.log('[VideoPlayer] Ending session:', sessionId.value, 'reason:', reason);
  
  socket.value.emit('end-session', {
    sessionId: sessionId.value,
    reason: reason
  });
  
  localStorage.removeItem('cowayang_session_id');
  sessionId.value = null;
  workerId.value = null;
  aiConnected.value = false;
};

// Handle close button - end session first
const handleClose = () => {
  if (isLiveMode.value && sessionId.value) {
    endSession('user_close');
  }
  emit('close');
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
    
    // Only request session if we don't already have one
    if (sessionId.value) {
      console.log('[VideoPlayer] Already have active session:', sessionId.value);
      return;
    }
    
    // Try to reconnect to existing session from localStorage
    const savedSessionId = localStorage.getItem('cowayang_session_id');
    if (savedSessionId) {
      console.log('[VideoPlayer] Attempting to reconnect to session:', savedSessionId);
    }
    
    // Debounce: wait a bit before requesting to avoid race conditions
    setTimeout(() => {
      if (!sessionId.value && !isRequestingSession.value) {
        requestSession(savedSessionId);
      }
    }, 500);
  });
  
  socket.value.on('session-created', (data) => {
    console.log('[VideoPlayer] Session created:', data);
    sessionId.value = data.sessionId;
    workerId.value = data.workerId;
    isRequestingSession.value = false;
    sessionError.value = null;
    
    // Save session for reconnect
    localStorage.setItem('cowayang_session_id', data.sessionId);
    
    if (data.reconnected) {
      console.log('[VideoPlayer] Reconnected to existing session');
      aiConnected.value = true;
    }
  });
  
  socket.value.on('session-error', (data) => {
    console.error('[VideoPlayer] Session error:', data);
    sessionError.value = data.message;
    isRequestingSession.value = false;
    workerStatus.value = data.status;
  });
  
  socket.value.on('session-ended', (data) => {
    console.log('[VideoPlayer] Session ended:', data);
    sessionId.value = null;
    workerId.value = null;
    localStorage.removeItem('cowayang_session_id');
  });
  
  socket.value.on('worker-status-update', (data) => {
    console.log('[VideoPlayer] Worker status update:', data);
    workerStatus.value = data;
  });
  
  socket.value.on('ai-boxes', (data) => {
    // Only process if for our session (or no session filter for backward compat)
    if (data.sessionId && data.sessionId !== sessionId.value) return;
    
    aiConnected.value = true;
    currentBoxes.value = data.boxes || [];
    detectedCount.value = currentBoxes.value.length;
    drawBoundingBoxes(currentBoxes.value);
    
    // Emit boxes to parent for statistics panel
    emit('boxes-update', currentBoxes.value);
  });
  
  socket.value.on('stream-started', (data) => {
    if (data.sessionId && data.sessionId !== sessionId.value) return;
    aiConnected.value = true;
  });
  
  socket.value.on('stream-error', (data) => {
    if (data.sessionId && data.sessionId !== sessionId.value) return;
    console.error('[VideoPlayer] Stream error:', data.message);
    sessionError.value = data.message;
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
            
            // Send seek event to Python via socket with session
            if (socket.value) {
              socket.value.emit('player-seek', { 
                sessionId: sessionId.value,
                time: currentTime 
              });
            }
          }
          
          // Send player time to Python for sync
          if (socket.value && sessionId.value) {
            socket.value.emit('player-time', { 
              sessionId: sessionId.value,
              time: currentTime 
            });
          }
          
          emit('timeUpdate', currentTime);
          lastTime = currentTime;
        }
      }, 500);
    }
    
    // Notify backend of playing state
    if (socket.value && sessionId.value) {
      socket.value.emit('player-state', {
        sessionId: sessionId.value,
        state: 'playing',
        time: livePlayer ? livePlayer.getCurrentTime() : 0
      });
    }
  } else if (event.data === window.YT.PlayerState.PAUSED) {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }
    
    if (socket.value && sessionId.value) {
      socket.value.emit('player-state', {
        sessionId: sessionId.value,
        state: 'paused',
        time: livePlayer ? livePlayer.getCurrentTime() : 0
      });
    }
  } else if (event.data === window.YT.PlayerState.ENDED) {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }
    
    // Video ended - end session
    if (socket.value && sessionId.value) {
      socket.value.emit('player-state', {
        sessionId: sessionId.value,
        state: 'ended'
      });
      
      // End the session
      endSession('video_ended');
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
  
  // Connect socket for player state sync (not just live mode)
  if (!socket.value) {
    socket.value = io('/', { path: '/socket.io' });
    socket.value.on('connect', () => {
      console.log('[VideoPlayer] Socket connected for player sync');
    });
  }
  
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
  
  // Setup normal mode canvas if not live mode
  if (!isLiveMode.value) {
    await nextTick();
    setupNormalCanvas();
    
    // Handle resize (including mobile orientation change)
    const handleNormalResize = () => {
      setupNormalCanvas();
      drawNormalBoundingBoxes(props.characters);
    };
    window.addEventListener('resize', handleNormalResize);
    window.addEventListener('orientationchange', handleNormalResize);
    
    // Handle fullscreen change to redraw canvas
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  }
  
  // Handle tab close - end session
  window.addEventListener('beforeunload', handleBeforeUnload);
});

// Handle fullscreen change - resize canvas and redraw
const handleFullscreenChange = async () => {
  await nextTick();
  // Wait a bit for fullscreen transition
  setTimeout(() => {
    if (isLiveMode.value) {
      setupCanvas();
      drawBoundingBoxes(currentBoxes.value);
    } else {
      setupNormalCanvas();
      drawNormalBoundingBoxes(props.characters);
    }
  }, 100);
};

const handleBeforeUnload = () => {
  if (isLiveMode.value && sessionId.value) {
    // Try to end session before tab closes
    endSession('tab_close');
  }
};

onUnmounted(() => {
  // End session if live mode
  if (isLiveMode.value && sessionId.value) {
    endSession('component_unmount');
  }
  
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }
  if (socket.value) {
    socket.value.disconnect();
  }
  window.removeEventListener('resize', setupCanvas);
  window.removeEventListener('resize', setupNormalCanvas);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
});

// Watch for characters prop changes (normal mode) and draw bounding boxes
watch(() => props.characters, async (newCharacters) => {
  if (isLiveMode.value) return;
  
  await nextTick();
  if (!normalCanvasCtx) {
    setupNormalCanvas();
  }
  drawNormalBoundingBoxes(newCharacters);
}, { deep: true, immediate: true });

const onPlayerReady = (event) => {
  lastTime = props.startTime;
  emit('playerReady');
  
  if (props.autoPlay) {
    playVideo();
  }
};

// Helper to send player state to backend for ASR sync
const sendPlayerState = (state, time = null) => {
  if (socket.value && socket.value.connected) {
    socket.value.emit('player-state', { 
      state, 
      time: time !== null ? time : (player ? player.getCurrentTime() : 0)
    });
    console.log(`[VideoPlayer] Sent player state: ${state}`);
  }
};

const onPlayerStateChange = (event) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
    isWaitingForBackend.value = false;
    
    // Notify backend ASR to resume
    const currentTime = player ? player.getCurrentTime() : 0;
    sendPlayerState('playing', currentTime);
    
    if (!timeUpdateInterval) {
      timeUpdateInterval = setInterval(() => {
        if (player && player.getCurrentTime) {
          const currentTime = player.getCurrentTime();
          
          if (Math.abs(currentTime - lastTime) > 3) {
            console.log(`[VideoPlayer] Seek detected: ${lastTime}s -> ${currentTime}s`);
            emit('seek', currentTime);
            
            // Send seek event to backend for ASR sync
            if (socket.value && socket.value.connected) {
              socket.value.emit('player-seek', { time: currentTime });
            }
          }
          
          emit('timeUpdate', currentTime);
          lastTime = currentTime;
        }
      }, 500);
    }
  } else if (event.data === window.YT.PlayerState.PAUSED) {
    sendPlayerState('paused');
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
      timeUpdateInterval = null;
    }
  } else if (event.data === window.YT.PlayerState.ENDED) {
    sendPlayerState('ended');
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
