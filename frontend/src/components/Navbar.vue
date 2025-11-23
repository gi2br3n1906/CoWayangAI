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
        <div class="md:hidden z-50">
          <button 
            @click="toggleMenu"
            class="text-gray-400 hover:text-white focus:outline-none transition-colors duration-200"
          >
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                v-if="!isMenuOpen"
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

    <!-- Mobile Menu Overlay & Sidebar -->
    <div class="md:hidden">
      <!-- Backdrop Overlay -->
      <div 
        v-if="isMenuOpen" 
        @click="closeMenu"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
      ></div>

      <!-- Sliding Sidebar -->
      <div 
        class="fixed top-0 right-0 h-full w-64 bg-[#0f172a] border-l border-gray-800 z-50 transform transition-transform duration-300 ease-in-out shadow-2xl pt-20"
        :class="isMenuOpen ? 'translate-x-0' : 'translate-x-full'"
      >
        <div class="flex flex-col px-6 space-y-6 h-full">
          <a 
            href="#about" 
            @click="closeMenu"
            class="text-gray-400 hover:text-white text-lg font-medium transition-colors duration-200 border-b border-wayang-card/50 pb-2"
          >
            About
          </a>
          <a 
            href="#documentation" 
            @click="closeMenu"
            class="text-gray-400 hover:text-white text-lg font-medium transition-colors duration-200 border-b border-wayang-card/50 pb-2"
          >
            Documentation
          </a>
          
          <!-- Mobile Login/User -->
          <div v-if="!isAuthenticated" class="pt-4">
            <button
              @click="openLoginModal"
              class="w-full px-6 py-3 bg-wayang-primary text-white font-medium rounded-lg hover:bg-wayang-primary/90 transition-all duration-200 shadow-lg shadow-wayang-primary/20"
            >
              Login
            </button>
          </div>
          <div v-else class="pt-4 space-y-4">
            <div class="flex items-center gap-3 p-3 bg-wayang-card/50 rounded-lg">
              <div v-if="user?.photoURL" class="w-10 h-10 rounded-full overflow-hidden border border-wayang-gold/50">
                <img :src="user?.photoURL" :alt="user?.displayName || user?.email" class="w-full h-full object-cover" />
              </div>
              <div v-else class="w-10 h-10 rounded-full bg-wayang-primary flex items-center justify-center border border-wayang-gold/50">
                <span class="text-lg font-semibold text-white">{{ (user?.displayName || user?.email)?.[0]?.toUpperCase() }}</span>
              </div>
              <div class="flex flex-col overflow-hidden">
                <span class="text-sm font-medium text-white truncate">{{ user?.displayName }}</span>
                <span class="text-xs text-gray-400 truncate">{{ user?.email }}</span>
              </div>
            </div>
            <button
              @click="handleLogout"
              class="w-full px-6 py-3 bg-wayang-card text-gray-300 font-medium rounded-lg hover:bg-wayang-card/70 hover:text-white transition-all duration-200 border border-wayang-card"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const isMenuOpen = ref(false)
const authStore = useAuthStore()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const user = computed(() => authStore.user)

const emit = defineEmits(['openLogin'])

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const closeMenu = () => {
  isMenuOpen.value = false
}

const openLoginModal = () => {
  emit('openLogin')
  closeMenu()
}

const handleLogout = async () => {
  await authStore.logout()
  closeMenu()
}
</script>
