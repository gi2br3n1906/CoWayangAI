<template>
  <div class="mt-12 w-full max-w-5xl mx-auto px-4">
    <div class="flex items-center gap-4 mb-8">
      <div class="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      <span class="text-gray-400 text-sm font-medium uppercase tracking-widest">Pilihan Lakon Populer</span>
      <div class="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      <div 
        v-for="video in recommendedVideos" 
        :key="video.id"
        @click="selectVideo(video)"
        class="group relative bg-slate-800/50 rounded-xl overflow-hidden border border-white/5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/30"
      >
        <div class="aspect-video relative overflow-hidden bg-black">
          <img 
            :src="video.thumbnail" 
            :alt="video.title"
            class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80"></div>
          
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm bg-black/20">
            <div class="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg transform scale-50 group-hover:scale-100 transition-transform duration-300">
              <svg class="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          <div v-if="video.startMinute > 0" class="absolute top-2 left-2 px-2 py-1 bg-indigo-600/90 backdrop-blur-md rounded text-[10px] text-white font-bold uppercase tracking-wide shadow-lg">
            Skip Intro {{ video.startMinute }}m
          </div>

          <div class="absolute bottom-2 right-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded text-xs text-gray-300 font-medium font-mono border border-white/10">
            {{ video.duration }}
          </div>
        </div>

        <div class="p-4">
          <h3 class="text-white font-semibold text-sm line-clamp-2 leading-relaxed group-hover:text-indigo-400 transition-colors mb-2">
            {{ video.title }}
          </h3>
          
          <div class="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
            <p class="text-gray-500 text-xs flex items-center gap-1.5">
              <div class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center">
                <svg class="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              {{ video.dalang }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Definisikan Event yang benar sesuai App.vue
const emit = defineEmits(['select-video']);

const recommendedVideos = [
  {
    id: 1,
    title: 'WAYANG KULIT KI CAHYO KUNTADI || LAKON WAHYU KATENTREMAN',
    dalang: 'Ki Cahyo Kuntadi',
    duration: '7 jam 40 menit',
    videoId: 'Ib5_4dbTK8E', // ID Asli yang kita pakai demo
    thumbnail: 'https://img.youtube.com/vi/Ib5_4dbTK8E/mqdefault.jpg',
    startMinute: 0 // Skip 1 jam intro
  },
  {
    id: 2,
    title: 'KI SENO NUGROHO - WAHYU CAKRANINGRAT',
    dalang: 'Ki Seno Nugroho',
    duration: '6 jam 11 menit',
    videoId: 'aOtB-yw9GSE', 
    thumbnail: 'https://img.youtube.com/vi/aOtB-yw9GSE/mqdefault.jpg',
    startMinute: 30 // Skip 30 menit
  },
  {
    id: 3,
    title: 'Gatotkoco Gugur - KI MANTEB SUDARSONO',
    dalang: 'Ki Manteb Soedharsono',
    duration: '6 jam 53 menit',
    videoId: 'PqvOeI6WHbQ', 
    thumbnail: 'https://img.youtube.com/vi/PqvOeI6WHbQ/mqdefault.jpg',
    startMinute: 15
  }
];

// Fungsi Helper untuk mengirim URL lengkap
const selectVideo = (video) => {
  const fullUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
  // Emit event ke App.vue dengan format yang diharapkan
  // App.vue mengharapkan parameter pertama adalah URL string.
  // Tapi handleAnalyze di App.vue butuh object { url, startMinute }.
  // Jadi kita biarkan App.vue menangani logika defaultnya (startMinute: 0)
  // ATAU kita modif App.vue agar VideoGallery bisa kirim startMinute juga.
  
  // Opsi paling aman (sesuai kode App.vue yang saya kasih sebelumnya):
  // App.vue: <VideoGallery @select-video="(url) => handleAnalyze({ url, startMinute: 0 })" />
  // Jadi kita kirim URL string saja.
  emit('select-video', fullUrl);
};
</script>