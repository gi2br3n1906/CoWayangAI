<template>
  <transition name="modal">
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/60 backdrop-blur-sm overflow-y-auto"
      @click.self="closeModal"
    >
      <div class="relative w-full max-w-md bg-wayang-card rounded-2xl shadow-2xl p-6 border border-wayang-card">
        <!-- Close Button -->
        <button
          @click="closeModal"
          class="absolute top-3 right-3 z-10 text-gray-400 hover:text-white transition-colors bg-wayang-dark/50 rounded-full p-1"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Header -->
        <div class="text-center mb-6">
          <div class="w-16 h-16 mx-auto mb-4 bg-wayang-primary/20 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 class="text-2xl font-bold bg-gradient-to-r from-wayang-gold to-white bg-clip-text text-transparent mb-1">
            Reset Password
          </h2>
          <p class="text-gray-400 text-sm">Masukkan email untuk reset password</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleResetPassword" class="space-y-4">
          <!-- Success Message -->
          <div v-if="successMessage" class="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p class="text-sm text-green-400 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              {{ successMessage }}
            </p>
          </div>

          <!-- Error Message -->
          <div v-if="errorMessage" class="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p class="text-sm text-red-400 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {{ errorMessage }}
            </p>
          </div>

          <!-- Email Input -->
          <div>
            <label for="resetEmail" class="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="resetEmail"
              v-model="email"
              type="email"
              required
              placeholder="nama@email.com"
              class="w-full px-3 py-2.5 bg-wayang-dark text-white rounded-lg border border-wayang-card
                     focus:ring-2 focus:ring-wayang-primary focus:border-transparent outline-none
                     placeholder-gray-500 transition-all duration-200 text-sm"
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="isLoading || !email"
            class="w-full px-4 py-2.5 bg-wayang-primary text-white font-semibold rounded-lg
                   hover:bg-wayang-primary/90 hover:shadow-lg hover:shadow-wayang-primary/30
                   active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200 flex items-center justify-center gap-2 text-sm"
          >
            <svg v-if="isLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ isLoading ? 'Mengirim...' : 'Kirim Link Reset' }}</span>
          </button>
        </form>

        <!-- Back to Login -->
        <div class="mt-4 text-center text-xs text-gray-400">
          Ingat password?
          <button 
            @click="$emit('switch-to-login')"
            class="text-wayang-gold hover:text-wayang-gold/80 transition-colors font-medium"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/firebase'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'switch-to-login'])

const email = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const closeModal = () => {
  email.value = ''
  errorMessage.value = ''
  successMessage.value = ''
  emit('close')
}

const handleResetPassword = async () => {
  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  
  try {
    await sendPasswordResetEmail(auth, email.value)
    successMessage.value = 'Link reset password telah dikirim ke email Anda!'
    
    // Auto close after 3 seconds
    setTimeout(() => {
      closeModal()
    }, 3000)
  } catch (error) {
    console.error('Reset password error:', error)
    errorMessage.value = getErrorMessage(error.code)
  } finally {
    isLoading.value = false
  }
}

const getErrorMessage = (errorCode) => {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'Email tidak terdaftar'
    case 'auth/invalid-email':
      return 'Format email tidak valid'
    case 'auth/too-many-requests':
      return 'Terlalu banyak permintaan. Coba lagi nanti'
    default:
      return 'Terjadi kesalahan. Silakan coba lagi'
  }
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
