<template>
  <div id="video-player-section" class="w-full h-full flex flex-col">
    
    <div class="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      <iframe 
        class="w-full h-full"
        :src="videoSrc" 
        title="YouTube video player" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen
      ></iframe>
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
import { computed } from 'vue';

// Menerima props dari App.vue
const props = defineProps({
  videoId: { type: String, required: true },
  startTime: { type: Number, default: 0 } // Menerima detik mulai
});

// Mendefinisikan event 'close' agar bisa didengar App.vue
defineEmits(['close']);

// Logic URL YouTube agar bisa skip
const videoSrc = computed(() => {
  // Parameter 'start' di YouTube harus dalam DETIK
  // Kita gunakan &start= karena parameter pertama sudah autoplay=1
  return `https://www.youtube.com/embed/${props.videoId}?autoplay=1&start=${props.startTime}`;
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