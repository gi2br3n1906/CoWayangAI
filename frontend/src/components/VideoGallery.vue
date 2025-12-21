<template>
  <div class="mt-12 w-full max-w-5xl mx-auto px-4">
    <div class="flex items-center gap-4 mb-8">
      <div class="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      <span class="text-gray-400 text-sm font-medium uppercase tracking-widest">Pilihan Lakon Populer</span>
      <div class="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      <div v-for="i in 3" :key="i" class="bg-slate-800/50 rounded-xl overflow-hidden border border-white/5 animate-pulse">
        <div class="aspect-video bg-slate-700/50"></div>
        <div class="p-4 space-y-3">
          <div class="h-4 bg-slate-700/50 rounded w-3/4"></div>
          <div class="h-3 bg-slate-700/50 rounded w-1/2"></div>
        </div>
      </div>
    </div>

    <!-- Video Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
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

          <div class="absolute bottom-2 right-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded text-xs text-gray-300 font-medium font-mono border border-white/10">
            {{ video.duration }}
          </div>
        </div>

        <div class="p-4">
          <h3 class="text-white font-semibold text-sm line-clamp-2 leading-relaxed group-hover:text-indigo-400 transition-colors mb-2">
            {{ video.title }}
          </h3>
          
          <div class="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
            <span class="text-gray-500 text-xs flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center">
                <svg class="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              {{ video.dalang }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

// Definisikan Event yang benar sesuai App.vue
const emit = defineEmits(['select-video']);

// Pool 10 video wayang untuk di-random
const allVideos = [
  {
    id: 1,
    title: 'KI SENO NUGROHO - WAHYU CAKRANINGRAT',
    dalang: 'Ki Seno Nugroho',
    videoId: 'aOtB-yw9GSE',
  },
  {
    id: 2,
    title: 'KI MANTEB SUDARSONO - Lakon Pilihan',
    dalang: 'Ki Manteb Sudarsono',
    videoId: 'M_3XC2KMK50',
  },
  {
    id: 3,
    title: 'Pagelaran Wayang Kulit Semalam Suntuk',
    dalang: 'Ki Dalang',
    videoId: 'Qwbun_3nP60',
  },
  {
    id: 4,
    title: 'Wayang Kulit - Lakon Spesial',
    dalang: 'Ki Dalang',
    videoId: 'hgMMNutlGdw',
  },
  {
    id: 5,
    title: 'Pagelaran Wayang Kulit Klasik',
    dalang: 'Ki Dalang',
    videoId: 'hpnBgToKT_w',
  },
  {
    id: 6,
    title: 'Wayang Kulit - Cerita Ramayana',
    dalang: 'Ki Dalang',
    videoId: 'BgJlUmNvF00',
  },
  {
    id: 7,
    title: 'Ki Dalang - Lakon Mahabharata',
    dalang: 'Ki Dalang',
    videoId: 'UFDGJs7VYvM',
  },
  {
    id: 8,
    title: 'Wayang Kulit Full - Semalam Suntuk',
    dalang: 'Ki Dalang',
    videoId: 'vFcYyWJzy4E',
  },
  {
    id: 9,
    title: 'Pagelaran Wayang Kulit Terbaru',
    dalang: 'Ki Dalang',
    videoId: 'cy3ZYEnlO_M',
  },
  {
    id: 10,
    title: 'Wayang Kulit - Lakon Favorit',
    dalang: 'Ki Dalang',
    videoId: '6nVXtRo9uM8',
  },
];

// State untuk 3 video yang ditampilkan
const recommendedVideos = ref([]);
const isLoading = ref(true);

// Fungsi shuffle array (Fisher-Yates)
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Fetch video info dari YouTube API atau gunakan default
const fetchVideoInfo = async (video) => {
  try {
    // Coba ambil info dari API kita
    const response = await fetch(`/api/youtube-info?videoId=${video.videoId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success') {
        return {
          ...video,
          title: data.title || video.title,
          dalang: data.channelTitle || video.dalang,
          duration: data.duration || 'Live',
          thumbnail: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
        };
      }
    }
  } catch (error) {
    console.log('Using default video info for:', video.videoId);
  }
  
  // Fallback ke data default
  return {
    ...video,
    duration: 'Video Panjang',
    thumbnail: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
  };
};

// Load 3 random videos saat mount
onMounted(async () => {
  // Shuffle dan ambil 3 video
  const shuffled = shuffleArray(allVideos);
  const selected = shuffled.slice(0, 3);
  
  // Fetch info untuk masing-masing video
  const videosWithInfo = await Promise.all(
    selected.map(video => fetchVideoInfo(video))
  );
  
  recommendedVideos.value = videosWithInfo;
  isLoading.value = false;
});

// Fungsi Helper untuk mengirim URL lengkap
const selectVideo = (video) => {
  const fullUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
  emit('select-video', fullUrl);
};
</script>