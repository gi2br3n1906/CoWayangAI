<template>
  <!-- About Section -->
  <section id="about" class="py-12 px-4 border-t border-wayang-card">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-10">
        <h2 class="text-2xl font-bold text-white mb-2">
          Tentang <span class="text-wayang-gold">Co-Wayang AI</span>
        </h2>
        <p class="text-gray-400 text-sm max-w-2xl mx-auto">
          Platform berbasis AI untuk menganalisis dan melestarikan seni pertunjukan Wayang Kulit Indonesia
        </p>
      </div>

      <!-- Features Grid -->
      <div class="grid md:grid-cols-3 gap-6 mb-10">
        <div 
          v-for="feature in features" 
          :key="feature.title"
          class="p-6 bg-wayang-card/50 rounded-xl border border-wayang-card/50 hover:border-wayang-primary/30 transition-colors"
        >
          <div class="w-12 h-12 rounded-lg bg-wayang-primary/20 flex items-center justify-center text-2xl mb-4">
            {{ feature.icon }}
          </div>
          <h3 class="text-white font-semibold mb-2">{{ feature.title }}</h3>
          <p class="text-gray-400 text-sm leading-relaxed">{{ feature.description }}</p>
        </div>
      </div>

      <!-- Tech Stack (Compact) -->
      <div class="flex flex-wrap justify-center gap-3 mb-10">
        <span 
          v-for="tech in techStack" 
          :key="tech"
          class="px-3 py-1 bg-wayang-dark text-xs text-gray-400 rounded-full border border-wayang-card/50"
        >
          {{ tech }}
        </span>
      </div>

      <!-- Team/Credit -->
      <div class="text-center">
        <p class="text-gray-500 text-xs">
          Dikembangkan sebagai bagian dari upaya pelestarian budaya Wayang Kulit Indonesia
        </p>
        <p class="text-gray-600 text-xs mt-1">
          © {{ new Date().getFullYear() }} Co-Wayang AI • 
          <a href="#" class="text-wayang-primary hover:underline">Dokumentasi</a> • 
          <a href="#" class="text-wayang-primary hover:underline">GitHub</a>
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
const features = [
  {
    icon: '🎭',
    title: 'Deteksi Tokoh',
    description: 'AI mengenali tokoh wayang yang muncul di layar menggunakan computer vision dan deep learning.'
  },
  {
    icon: '📝',
    title: 'Transkripsi Otomatis',
    description: 'Speech recognition untuk bahasa Jawa menghasilkan teks dialog dalang secara real-time.'
  },
  {
    icon: '🌐',
    title: 'Terjemahan',
    description: 'Terjemahan otomatis dari bahasa Jawa ke bahasa Indonesia untuk memudahkan pemahaman.'
  }
]

const techStack = [
  'Vue.js',
  'Firebase',
  'Python',
  'PyTorch',
  'Wav2Vec2',
  'YOLOv8',
  'Socket.IO',
  'YouTube API'
]
</script>
