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
            <button 
              @click="$emit('openShortcuts')"
              class="text-gray-400 hover:text-white transition-colors duration-200 px-3 py-2 text-sm font-medium flex items-center gap-1"
              title="Keyboard Shortcuts"
            >
              <kbd class="px-1.5 py-0.5 bg-wayang-card text-xs rounded">?</kbd>
            </button>
            
            <!-- Login/User Menu -->
            <div v-if="!isAuthenticated" class="flex items-center gap-3">
              <button
                @click="openRegisterModal"
                class="px-6 py-2 text-wayang-gold font-medium rounded-lg border border-wayang-gold/50 hover:bg-wayang-gold/10 transition-all duration-200"
              >
                Daftar
              </button>
              <button
                @click="openLoginModal"
                class="px-6 py-2 bg-wayang-primary text-white font-medium rounded-lg hover:bg-wayang-primary/90 hover:shadow-lg hover:shadow-wayang-primary/30 transition-all duration-200"
              >
                Login
              </button>
            </div>
            <div v-else class="flex items-center gap-4">
              <!-- User Dropdown -->
              <div class="relative" ref="userDropdownRef">
                <button 
                  @click="toggleUserDropdown"
                  class="flex items-center gap-2 hover:bg-wayang-card/50 rounded-lg px-2 py-1 transition-colors"
                >
                  <div v-if="user?.photoURL" class="w-8 h-8 rounded-full overflow-hidden">
                    <img :src="user.photoURL" :alt="user.displayName || user.email" class="w-full h-full object-cover" />
                  </div>
                  <div v-else class="w-8 h-8 rounded-full bg-wayang-primary flex items-center justify-center">
                    <span class="text-sm font-semibold">{{ (user?.displayName || user?.email)?.[0]?.toUpperCase() }}</span>
                  </div>
                  <span class="text-sm text-gray-300">{{ user?.displayName || user?.email }}</span>
                  <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <!-- Dropdown Menu -->
                <div 
                  v-if="isUserDropdownOpen"
                  class="absolute right-0 mt-2 w-48 bg-wayang-card rounded-lg shadow-xl border border-wayang-card/50 py-2 z-50"
                >
                  <button
                    @click="openProfileModal"
                    class="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-wayang-dark/50 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Profil Saya
                  </button>
                  <button
                    @click="openProfileModal"
                    class="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-wayang-dark/50 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Riwayat
                  </button>
                  <button
                    @click="openProfileModal"
                    class="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-wayang-dark/50 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    Favorit
                  </button>
                  <hr class="my-2 border-wayang-card/50" />
                  <button
                    @click="handleLogout"
                    class="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-wayang-dark/50 hover:text-red-300 transition-colors flex items-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
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
          
          <!-- Mobile Login/User -->
          <div v-if="!isAuthenticated" class="pt-4 space-y-3">
            <button
              @click="openRegisterModal"
              class="w-full px-6 py-3 text-wayang-gold font-medium rounded-lg border border-wayang-gold/50 hover:bg-wayang-gold/10 transition-all duration-200"
            >
              Daftar
            </button>
            <button
              @click="openLoginModal"
              class="w-full px-6 py-3 bg-wayang-primary text-white font-medium rounded-lg hover:bg-wayang-primary/90 transition-all duration-200 shadow-lg shadow-wayang-primary/20"
            >
              Login
            </button>
          </div>
          <div v-else class="pt-4 space-y-4">
            <div 
              @click="openProfileModal"
              class="flex items-center gap-3 p-3 bg-wayang-card/50 rounded-lg cursor-pointer hover:bg-wayang-card/70 transition-colors"
            >
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
              @click="openProfileModal"
              class="w-full px-6 py-3 bg-wayang-card text-gray-300 font-medium rounded-lg hover:bg-wayang-card/70 hover:text-white transition-all duration-200 border border-wayang-card flex items-center justify-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profil Saya
            </button>
            <button
              @click="handleLogout"
              class="w-full px-6 py-3 text-red-400 font-medium rounded-lg hover:bg-red-500/10 transition-all duration-200 border border-red-500/30"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const isMenuOpen = ref(false)
const isUserDropdownOpen = ref(false)
const userDropdownRef = ref(null)
const authStore = useAuthStore()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const user = computed(() => authStore.user)

const emit = defineEmits(['openLogin', 'openRegister', 'openProfile', 'openShortcuts'])

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const closeMenu = () => {
  isMenuOpen.value = false
}

const toggleUserDropdown = () => {
  isUserDropdownOpen.value = !isUserDropdownOpen.value
}

const openLoginModal = () => {
  emit('openLogin')
  closeMenu()
}

const openRegisterModal = () => {
  emit('openRegister')
  closeMenu()
}

const openProfileModal = () => {
  isUserDropdownOpen.value = false
  emit('openProfile')
  closeMenu()
}

const handleLogout = async () => {
  isUserDropdownOpen.value = false
  await authStore.logout()
  closeMenu()
}

// Close dropdown when clicking outside
const handleClickOutside = (event) => {
  if (userDropdownRef.value && !userDropdownRef.value.contains(event.target)) {
    isUserDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
