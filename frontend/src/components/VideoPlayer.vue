<template>
  <div id="video-player-container" class="w-full">
    <div class="bg-wayang-card rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative group">
      <!-- Decorative glow effect -->
      <div class="absolute -inset-0.5 bg-gradient-to-r from-wayang-gold via-wayang-primary to-wayang-gold opacity-20 blur-xl group-hover:opacity-30 transition-opacity duration-500"></div>
      
      <!-- Video container -->
      <div class="relative aspect-video bg-black">
        <iframe
          :src="`https://www.youtube.com/embed/${videoId}?autoplay=1`"
          class="w-full h-full"
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
      
      <!-- Video info bar -->
      <div class="p-4 bg-wayang-dark/50 backdrop-blur-sm border-t border-white/5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-wayang-primary/20 rounded-lg flex items-center justify-center">
              <svg class="w-5 h-5 text-wayang-gold" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
            </div>
            <div>
              <p class="text-sm font-semibold text-white">Video Sedang Dianalisis</p>
              <p class="text-xs text-gray-400">AI akan mendeteksi tokoh dan subtitle secara real-time</p>
            </div>
          </div>
          <button
            @click="$emit('close')"
            class="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Tutup video"
          >
            <svg class="w-5 h-5 text-gray-400 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  videoId: {
    type: String,
    required: true
  }
})

defineEmits(['close'])
</script>

<style scoped>
/* Additional custom styles if needed */
</style>
