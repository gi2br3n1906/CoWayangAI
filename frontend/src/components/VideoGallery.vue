<template>
  <div class="mt-12 w-full max-w-4xl mx-auto">
    <div class="flex items-center gap-4 mb-6">
      <div class="h-px flex-1 bg-gradient-to-r from-transparent via-wayang-card to-transparent"></div>
      <span class="text-gray-400 text-sm font-medium">Atau pilih lakon populer</span>
      <div class="h-px flex-1 bg-gradient-to-r from-transparent via-wayang-card to-transparent"></div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      <div 
        v-for="video in recommendedVideos" 
        :key="video.id"
        @click="$emit('select', video.videoId)"
        class="group relative bg-wayang-card rounded-xl overflow-hidden border border-white/5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-wayang-gold/10 hover:border-wayang-gold/30"
      >
        <!-- Thumbnail -->
        <div class="aspect-video relative overflow-hidden">
          <img 
            :src="video.thumbnail" 
            :alt="video.title"
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity"></div>
          
          <!-- Play Icon Overlay -->
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div class="w-12 h-12 bg-wayang-gold/90 rounded-full flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform">
              <svg class="w-5 h-5 text-wayang-dark ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          <!-- Duration Badge -->
          <div class="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-xs text-white font-medium">
            {{ video.duration }}
          </div>
        </div>

        <!-- Content -->
        <div class="p-4">
          <h3 class="text-white font-medium text-sm line-clamp-2 group-hover:text-wayang-gold transition-colors">
            {{ video.title }}
          </h3>
          <p class="text-gray-500 text-xs mt-2 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {{ video.dalang }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const recommendedVideos = [
  {
    id: 1,
    title: 'Bima Suci - Pagelaran Wayang Kulit',
    dalang: 'Ki Seno Nugroho',
    duration: '10 Menit',
    videoId: 'dQw4w9WgXcQ', // Dummy ID, ganti dengan yang asli jika ada
    thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'
  },
  {
    id: 2,
    title: 'Wahyu Cakraningrat - Full Lakon',
    dalang: 'Ki Manteb Soedharsono',
    duration: '15 Menit',
    videoId: 'jNQXAC9IVRw', // Dummy ID
    thumbnail: 'https://img.youtube.com/vi/jNQXAC9IVRw/maxresdefault.jpg'
  },
  {
    id: 3,
    title: 'Gatotkaca Gugur - Perang Baratayuda',
    dalang: 'Ki Anom Suroto',
    duration: '12 Menit',
    videoId: '9bZkp7q19f0', // Dummy ID
    thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/maxresdefault.jpg'
  }
]

defineEmits(['select'])
</script>
