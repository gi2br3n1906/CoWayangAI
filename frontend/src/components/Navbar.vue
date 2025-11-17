<template>
  <nav class="sticky top-0 z-50 bg-wayang-dark/80 backdrop-blur-md border-b border-wayang-card">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <div class="flex-shrink-0">
          <h1 class="text-2xl font-bold bg-gradient-to-r from-wayang-gold to-white bg-clip-text text-transparent">
            Co-Wayang AI
          </h1>
        </div>

        <!-- Navigation Menu -->
        <div class="hidden md:block">
          <div class="ml-10 flex items-center space-x-8">
            <a 
              href="#about" 
              class="text-gray-400 hover:text-white transition-colors duration-200 px-3 py-2 text-sm font-medium"
            >
              About
            </a>
            <a 
              href="#documentation" 
              class="text-gray-400 hover:text-white transition-colors duration-200 px-3 py-2 text-sm font-medium"
            >
              Documentation
            </a>
            
            <!-- Login/User Menu -->
            <div v-if="!isAuthenticated">
              <button
                @click="openLoginModal"
                class="px-6 py-2 bg-wayang-primary text-white font-medium rounded-lg hover:bg-wayang-primary/90 hover:shadow-lg hover:shadow-wayang-primary/30 transition-all duration-200"
              >
                Login
              </button>
            </div>
            <div v-else class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <div v-if="user?.photoURL" class="w-8 h-8 rounded-full overflow-hidden">
                  <img :src="user.photoURL" :alt="user.displayName || user.email" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-8 h-8 rounded-full bg-wayang-primary flex items-center justify-center">
                  <span class="text-sm font-semibold">{{ (user?.displayName || user?.email)?.[0]?.toUpperCase() }}</span>
                </div>
                <span class="text-sm text-gray-300">{{ user?.displayName || user?.email }}</span>
              </div>
              <button
                @click="handleLogout"
                class="px-4 py-2 bg-wayang-card text-gray-300 font-medium rounded-lg hover:bg-wayang-card/70 hover:text-white transition-all duration-200"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile menu button -->
        <div class="md:hidden">
          <button 
            @click="mobileMenuOpen = !mobileMenuOpen"
            class="text-gray-400 hover:text-white focus:outline-none"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                v-if="!mobileMenuOpen"
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                d="M4 6h16M4 12h16M4 18h16" 
              />
              <path 
                v-else
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="mobileMenuOpen" class="md:hidden border-t border-wayang-card">
      <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
        <a 
          href="#about" 
          class="text-gray-400 hover:text-white block px-3 py-2 text-base font-medium transition-colors duration-200"
        >
          About
        </a>
        <a 
          href="#documentation" 
          class="text-gray-400 hover:text-white block px-3 py-2 text-base font-medium transition-colors duration-200"
        >
          Documentation
        </a>
        
        <!-- Mobile Login/User -->
        <div v-if="!isAuthenticated" class="mt-2">
          <button
            @click="openLoginModal"
            class="w-full px-6 py-2 bg-wayang-primary text-white font-medium rounded-lg hover:bg-wayang-primary/90 transition-all duration-200"
          >
            Login
          </button>
        </div>
        <div v-else class="mt-2 space-y-2">
          <div class="flex items-center gap-2 px-3 py-2">
            <div v-if="user?.photoURL" class="w-8 h-8 rounded-full overflow-hidden">
              <img :src="user?.photoURL" :alt="user?.displayName || user?.email" class="w-full h-full object-cover" />
            </div>
            <div v-else class="w-8 h-8 rounded-full bg-wayang-primary flex items-center justify-center">
              <span class="text-sm font-semibold">{{ (user?.displayName || user?.email)?.[0]?.toUpperCase() }}</span>
            </div>
            <span class="text-sm text-gray-300">{{ user?.displayName || user?.email }}</span>
          </div>
          <button
            @click="handleLogout"
            class="w-full px-6 py-2 bg-wayang-card text-gray-300 font-medium rounded-lg hover:bg-wayang-card/70 hover:text-white transition-all duration-200"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const mobileMenuOpen = ref(false)
const authStore = useAuthStore()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const user = computed(() => authStore.user)

const emit = defineEmits(['openLogin'])

const openLoginModal = () => {
  emit('openLogin')
  mobileMenuOpen.value = false
}

const handleLogout = async () => {
  await authStore.logout()
  mobileMenuOpen.value = false
}
</script>
