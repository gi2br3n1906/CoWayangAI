<template>
  <div id="video-player-section" class="w-full h-full flex flex-col">
    
    <div class="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      <div id="youtube-player" class="w-full h-full"></div>
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
          <h3 class="text-white font-semibold text-sm">Video Sedang Dianalisis</h3>
          <p class="text-xs text-gray-400">AI mendeteksi tokoh & subtitle secara real-time</p>
        </div>
      </div>

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
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';

// Menerima props dari App.vue
const props = defineProps({
  videoId: { type: String, required: true },
  startTime: { type: Number, default: 0 } // Menerima detik mulai
});

// Mendefinisikan event 'close' agar bisa didengar App.vue
const emit = defineEmits(['close', 'timeUpdate', 'seek']);

let player = null;
let lastTime = 0;
let timeUpdateInterval = null;

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
  
  player = new window.YT.Player('youtube-player', {
    height: '100%',
    width: '100%',
    videoId: props.videoId,
    playerVars: {
      autoplay: 1,
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

const onPlayerReady = (event) => {
  // Player is ready
  lastTime = props.startTime;
};

const onPlayerStateChange = (event) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
    // Start updating current time
    if (!timeUpdateInterval) {
      timeUpdateInterval = setInterval(() => {
        if (player && player.getCurrentTime) {
          const currentTime = player.getCurrentTime();
          
          // Detect seek (perubahan waktu > 5 detik)
          if (Math.abs(currentTime - lastTime) > 5) {
            console.log(`[VideoPlayer] Seek detected: ${lastTime}s -> ${currentTime}s`);
            emit('seek', currentTime);
          }
          
          emit('timeUpdate', currentTime);
          lastTime = currentTime;
        }
      }, 1000); // Update every second
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
watch(() => props.videoId, (newId) => {
  if (player && newId) {
    player.loadVideoById(newId, props.startTime);
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