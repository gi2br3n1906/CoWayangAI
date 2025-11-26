<template>
  <!-- Tutorial/Onboarding Modal -->
  <transition name="modal">
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      @click.self="skipTutorial"
    >
      <div class="relative w-full max-w-xl bg-wayang-card rounded-2xl shadow-2xl overflow-hidden border border-wayang-card">
        <!-- Progress Bar -->
        <div class="h-1 bg-wayang-dark">
          <div 
            class="h-full bg-gradient-to-r from-wayang-primary to-wayang-gold transition-all duration-300"
            :style="{ width: `${((currentStep + 1) / steps.length) * 100}%` }"
          ></div>
        </div>

        <!-- Content -->
        <div class="p-6">
          <!-- Step Indicator -->
          <div class="flex items-center justify-between mb-4">
            <span class="text-xs text-gray-400">Step {{ currentStep + 1 }} / {{ steps.length }}</span>
            <button 
              @click="skipTutorial"
              class="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Lewati Tutorial
            </button>
          </div>

          <!-- Step Content -->
          <div class="text-center py-4">
            <!-- Icon -->
            <div 
              class="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center text-4xl"
              :class="steps[currentStep].bgClass"
            >
              {{ steps[currentStep].icon }}
            </div>

            <!-- Title -->
            <h2 class="text-2xl font-bold text-white mb-3">
              {{ steps[currentStep].title }}
            </h2>

            <!-- Description -->
            <p class="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
              {{ steps[currentStep].description }}
            </p>

            <!-- Feature Highlight -->
            <div 
              v-if="steps[currentStep].features"
              class="mt-6 grid grid-cols-3 gap-3"
            >
              <div 
                v-for="feature in steps[currentStep].features" 
                :key="feature.label"
                class="p-3 bg-wayang-dark/50 rounded-lg text-center"
              >
                <div class="text-2xl mb-1">{{ feature.icon }}</div>
                <div class="text-xs text-gray-400">{{ feature.label }}</div>
              </div>
            </div>
          </div>

          <!-- Navigation -->
          <div class="flex items-center justify-between mt-6 pt-4 border-t border-wayang-card/50">
            <button
              v-if="currentStep > 0"
              @click="prevStep"
              class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              Sebelumnya
            </button>
            <div v-else></div>

            <button
              @click="nextStep"
              class="px-6 py-2 bg-wayang-primary text-white text-sm font-medium rounded-lg hover:bg-wayang-primary/90 transition-colors flex items-center gap-1"
            >
              {{ currentStep === steps.length - 1 ? 'Mulai Sekarang' : 'Lanjut' }}
              <svg v-if="currentStep < steps.length - 1" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <!-- Dots Indicator -->
          <div class="flex justify-center gap-2 mt-4">
            <button
              v-for="(step, index) in steps"
              :key="index"
              @click="currentStep = index"
              class="w-2 h-2 rounded-full transition-all"
              :class="index === currentStep ? 'bg-wayang-gold w-6' : 'bg-wayang-card hover:bg-gray-600'"
            ></button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'complete'])

const currentStep = ref(0)

const steps = [
  {
    icon: '🎭',
    title: 'Selamat Datang di Co-Wayang AI',
    description: 'Platform AI untuk menganalisis pertunjukan Wayang Kulit secara real-time. Deteksi tokoh, transkripsi dialog, dan terjemahan otomatis.',
    bgClass: 'bg-gradient-to-br from-wayang-primary/30 to-wayang-gold/30',
    features: [
      { icon: '🔍', label: 'Deteksi Tokoh' },
      { icon: '📝', label: 'Transkripsi' },
      { icon: '🌐', label: 'Terjemahan' }
    ]
  },
  {
    icon: '🔗',
    title: 'Masukkan URL YouTube',
    description: 'Cari video wayang di YouTube atau tempel URL video langsung. Anda juga bisa memilih dari koleksi video populer yang sudah tersedia.',
    bgClass: 'bg-gradient-to-br from-red-500/30 to-pink-500/30',
    features: [
      { icon: '🔍', label: 'Cari Video' },
      { icon: '📋', label: 'Tempel URL' },
      { icon: '⭐', label: 'Video Populer' }
    ]
  },
  {
    icon: '🤖',
    title: 'AI Mulai Bekerja',
    description: 'Setelah Anda klik "Mulai Analisis", AI akan mendeteksi tokoh wayang yang muncul dan mentranskripsi dialog secara real-time.',
    bgClass: 'bg-gradient-to-br from-blue-500/30 to-cyan-500/30',
    features: [
      { icon: '🎭', label: 'Panel Tokoh' },
      { icon: '▶️', label: 'Video Player' },
      { icon: '📜', label: 'Live Subtitle' }
    ]
  },
  {
    icon: '⌨️',
    title: 'Gunakan Keyboard Shortcuts',
    description: 'Navigasi lebih cepat dengan keyboard. Tekan "Space" untuk play/pause, "panah kiri/kanan" untuk seek, dan "?" untuk melihat semua shortcuts.',
    bgClass: 'bg-gradient-to-br from-purple-500/30 to-indigo-500/30',
    features: [
      { icon: '⏯️', label: 'Space' },
      { icon: '⏪', label: '← / →' },
      { icon: '❓', label: '?' }
    ]
  },
  {
    icon: '🚀',
    title: 'Siap Memulai!',
    description: 'Sekarang Anda siap menggunakan Co-Wayang AI. Daftar akun untuk menyimpan riwayat dan video favorit Anda!',
    bgClass: 'bg-gradient-to-br from-wayang-gold/30 to-amber-500/30',
    features: null
  }
]

const nextStep = () => {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  } else {
    completeTutorial()
  }
}

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const skipTutorial = () => {
  localStorage.setItem('cowayang_tutorial_completed', 'true')
  emit('close')
}

const completeTutorial = () => {
  localStorage.setItem('cowayang_tutorial_completed', 'true')
  emit('complete')
  emit('close')
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
