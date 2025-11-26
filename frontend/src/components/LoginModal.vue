<template>
  <transition name="modal">
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      @click.self="closeModal"
    >
      <div class="relative w-full max-w-md bg-wayang-card rounded-2xl shadow-2xl p-8 border border-wayang-card">
        <!-- Close Button -->
        <button
          @click="closeModal"
          class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Header -->
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold bg-gradient-to-r from-wayang-gold to-white bg-clip-text text-transparent mb-2">
            Welcome Back
          </h2>
          <p class="text-gray-400">Login ke akun Co-Wayang AI Anda</p>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-6">
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
            <label for="email" class="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              v-model="formData.email"
              type="email"
              required
              placeholder="nama@email.com"
              class="w-full px-4 py-3 bg-wayang-dark text-white rounded-lg border border-wayang-card
                     focus:ring-2 focus:ring-wayang-primary focus:border-transparent outline-none
                     placeholder-gray-500 transition-all duration-200"
            />
          </div>

          <!-- Password Input -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                required
                placeholder="••••••••"
                class="w-full px-4 py-3 bg-wayang-dark text-white rounded-lg border border-wayang-card
                       focus:ring-2 focus:ring-wayang-primary focus:border-transparent outline-none
                       placeholder-gray-500 transition-all duration-200"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <svg v-if="!showPassword" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Remember Me & Forgot Password -->
          <div class="flex items-center justify-between text-sm">
            <label class="flex items-center text-gray-400 cursor-pointer">
              <input 
                v-model="formData.rememberMe"
                type="checkbox" 
                class="w-4 h-4 rounded border-wayang-card bg-wayang-dark text-wayang-primary
                       focus:ring-2 focus:ring-wayang-primary focus:ring-offset-0 cursor-pointer"
              />
              <span class="ml-2">Remember me</span>
            </label>
            <button 
              type="button"
              @click="$emit('forgot-password')"
              class="text-wayang-gold hover:text-wayang-gold/80 transition-colors"
            >
              Lupa password?
            </button>
          </div>

          <!-- Login Button -->
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full px-6 py-3 bg-wayang-primary text-white font-semibold rounded-lg
                   hover:bg-wayang-primary/90 hover:shadow-lg hover:shadow-wayang-primary/50
                   active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg v-if="isLoading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ isLoading ? 'Loading...' : 'Login' }}</span>
          </button>

          <!-- Divider -->
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-wayang-card"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-4 bg-wayang-card text-gray-400">Atau login dengan</span>
            </div>
          </div>

          <!-- Social Login Buttons -->
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              @click="handleGoogleLogin"
              :disabled="isLoading"
              class="px-4 py-3 bg-wayang-dark border border-wayang-card text-white rounded-lg
                     hover:border-wayang-gold/50 transition-all duration-200 flex items-center justify-center gap-2
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Google</span>
            </button>
            <button
              type="button"
              @click="handleGithubLogin"
              :disabled="isLoading"
              class="px-4 py-3 bg-wayang-dark border border-wayang-card text-white rounded-lg
                     hover:border-wayang-gold/50 transition-all duration-200 flex items-center justify-center gap-2
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </button>
          </div>
        </form>

        <!-- Register Link -->
        <div class="mt-6 text-center text-sm text-gray-400">
          Belum punya akun?
          <button 
            @click="$emit('switch-to-register')"
            class="text-wayang-gold hover:text-wayang-gold/80 transition-colors font-medium"
          >
            Daftar sekarang
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'login', 'switch-to-register', 'forgot-password'])

const authStore = useAuthStore()
const showPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

const formData = reactive({
  email: '',
  password: '',
  rememberMe: false
})

const closeModal = () => {
  errorMessage.value = ''
  emit('close')
}

const handleLogin = async () => {
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    const result = await authStore.loginWithEmail(formData.email, formData.password)
    
    if (result.success) {
      emit('login', {
        email: formData.email,
        rememberMe: formData.rememberMe
      })
      
      // Reset form
      formData.email = ''
      formData.password = ''
      formData.rememberMe = false
      
      closeModal()
    } else {
      errorMessage.value = getErrorMessage(result.error)
    }
  } catch (error) {
    console.error('Login error:', error)
    errorMessage.value = 'Terjadi kesalahan saat login'
  } finally {
    isLoading.value = false
  }
}

const handleGoogleLogin = async () => {
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    const result = await authStore.loginWithGoogle()
    
    if (result.success) {
      emit('login', authStore.user)
      closeModal()
    } else {
      errorMessage.value = getErrorMessage(result.error)
    }
  } catch (error) {
    console.error('Google login error:', error)
    errorMessage.value = 'Terjadi kesalahan saat login dengan Google'
  } finally {
    isLoading.value = false
  }
}

const handleGithubLogin = async () => {
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    const result = await authStore.loginWithGithub()
    
    if (result.success) {
      emit('login', authStore.user)
      closeModal()
    } else {
      errorMessage.value = getErrorMessage(result.error)
    }
  } catch (error) {
    console.error('GitHub login error:', error)
    errorMessage.value = 'Terjadi kesalahan saat login dengan GitHub'
  } finally {
    isLoading.value = false
  }
}

const getErrorMessage = (error) => {
  if (error.includes('user-not-found')) return 'Email tidak ditemukan'
  if (error.includes('wrong-password')) return 'Password salah'
  if (error.includes('invalid-email')) return 'Format email tidak valid'
  if (error.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi nanti'
  if (error.includes('invalid-credential')) return 'Email atau password salah'
  return 'Terjadi kesalahan. Silakan coba lagi'
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

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.3s ease;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.9);
}
</style>
