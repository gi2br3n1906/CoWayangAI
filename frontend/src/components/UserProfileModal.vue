<template>
  <transition name="modal">
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-50 flex items-start justify-center px-4 py-8 bg-black/60 backdrop-blur-sm overflow-y-auto"
      @click.self="closeModal"
    >
      <div class="relative w-full max-w-2xl bg-wayang-card rounded-2xl shadow-2xl border border-wayang-card my-4">
        <!-- Close Button -->
        <button
          @click="closeModal"
          class="absolute top-4 right-4 z-10 text-gray-400 hover:text-white transition-colors bg-wayang-dark/50 rounded-full p-1.5"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Header with Avatar -->
        <div class="relative bg-gradient-to-r from-wayang-primary/30 to-wayang-gold/30 p-8 rounded-t-2xl">
          <div class="flex flex-col items-center">
            <!-- Avatar -->
            <div class="relative">
              <div class="w-24 h-24 rounded-full overflow-hidden border-4 border-wayang-dark bg-wayang-dark">
                <img 
                  v-if="user?.photoURL" 
                  :src="user.photoURL" 
                  :alt="user.displayName"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-wayang-primary text-3xl font-bold text-white">
                  {{ (user?.displayName || user?.email)?.[0]?.toUpperCase() || '?' }}
                </div>
              </div>
              <!-- Edit Avatar Button -->
              <label class="absolute bottom-0 right-0 w-8 h-8 bg-wayang-gold rounded-full flex items-center justify-center cursor-pointer hover:bg-wayang-gold/80 transition-colors">
                <svg class="w-4 h-4 text-wayang-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange" />
              </label>
            </div>
            
            <h2 class="mt-4 text-xl font-bold text-white">{{ user?.displayName || 'User' }}</h2>
            <p class="text-gray-400 text-sm">{{ user?.email }}</p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-wayang-card">
          <button 
            @click="activeTab = 'profile'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="activeTab === 'profile' ? 'text-wayang-gold border-b-2 border-wayang-gold' : 'text-gray-400 hover:text-white'"
          >
            👤 Profil
          </button>
          <button 
            @click="activeTab = 'history'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="activeTab === 'history' ? 'text-wayang-gold border-b-2 border-wayang-gold' : 'text-gray-400 hover:text-white'"
          >
            📜 Riwayat
          </button>
          <button 
            @click="activeTab = 'favorites'"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="activeTab === 'favorites' ? 'text-wayang-gold border-b-2 border-wayang-gold' : 'text-gray-400 hover:text-white'"
          >
            ⭐ Favorit
          </button>
        </div>

        <!-- Content -->
        <div class="p-6 max-h-[60vh] overflow-y-auto">
          <!-- Profile Tab -->
          <div v-if="activeTab === 'profile'" class="space-y-4">
            <!-- Success/Error Messages -->
            <div v-if="successMessage" class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p class="text-sm text-green-400">{{ successMessage }}</p>
            </div>
            <div v-if="errorMessage" class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p class="text-sm text-red-400">{{ errorMessage }}</p>
            </div>

            <!-- Display Name -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Nama Lengkap</label>
              <input 
                v-model="formData.displayName"
                type="text"
                class="w-full px-3 py-2.5 bg-wayang-dark text-white rounded-lg border border-wayang-card
                       focus:ring-2 focus:ring-wayang-primary focus:border-transparent outline-none text-sm"
              />
            </div>

            <!-- Email (Read Only) -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input 
                :value="user?.email"
                type="email"
                disabled
                class="w-full px-3 py-2.5 bg-wayang-dark/50 text-gray-400 rounded-lg border border-wayang-card text-sm cursor-not-allowed"
              />
            </div>

            <!-- Member Since -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Member Sejak</label>
              <input 
                :value="formatDate(user?.metadata?.creationTime)"
                type="text"
                disabled
                class="w-full px-3 py-2.5 bg-wayang-dark/50 text-gray-400 rounded-lg border border-wayang-card text-sm cursor-not-allowed"
              />
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 gap-4 pt-4">
              <div class="bg-wayang-dark/50 rounded-lg p-4 text-center">
                <div class="text-2xl font-bold text-wayang-gold">{{ watchHistory.length }}</div>
                <div class="text-xs text-gray-400">Video Ditonton</div>
              </div>
              <div class="bg-wayang-dark/50 rounded-lg p-4 text-center">
                <div class="text-2xl font-bold text-wayang-primary">{{ favorites.length }}</div>
                <div class="text-xs text-gray-400">Video Favorit</div>
              </div>
            </div>

            <!-- Save Button -->
            <button 
              @click="updateProfile"
              :disabled="isLoading"
              class="w-full mt-4 px-4 py-2.5 bg-wayang-primary text-white font-semibold rounded-lg
                     hover:bg-wayang-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 text-sm"
            >
              {{ isLoading ? 'Menyimpan...' : 'Simpan Perubahan' }}
            </button>
          </div>

          <!-- History Tab -->
          <div v-if="activeTab === 'history'" class="space-y-3">
            <div v-if="watchHistory.length === 0" class="text-center py-12">
              <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-gray-400">Belum ada riwayat tontonan</p>
              <p class="text-sm text-gray-500 mt-1">Video yang Anda analisis akan muncul di sini</p>
            </div>
            
            <div 
              v-for="item in watchHistory" 
              :key="item.id"
              class="flex gap-3 p-3 bg-wayang-dark/50 rounded-lg hover:bg-wayang-dark/70 transition-colors cursor-pointer group"
              @click="$emit('play-video', item.videoUrl)"
            >
              <img 
                :src="item.thumbnail" 
                :alt="item.title"
                class="w-28 h-16 object-cover rounded"
              />
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-medium text-white line-clamp-2 group-hover:text-wayang-gold transition-colors">
                  {{ item.title }}
                </h4>
                <p class="text-xs text-gray-400 mt-1">{{ formatDate(item.watchedAt) }}</p>
              </div>
              <button 
                @click.stop="removeFromHistory(item.id)"
                class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            <button 
              v-if="watchHistory.length > 0"
              @click="clearHistory"
              class="w-full mt-4 px-4 py-2 text-red-400 text-sm hover:text-red-300 transition-colors"
            >
              Hapus Semua Riwayat
            </button>
          </div>

          <!-- Favorites Tab -->
          <div v-if="activeTab === 'favorites'" class="space-y-3">
            <div v-if="favorites.length === 0" class="text-center py-12">
              <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <p class="text-gray-400">Belum ada video favorit</p>
              <p class="text-sm text-gray-500 mt-1">Klik ⭐ pada video untuk menambah favorit</p>
            </div>
            
            <div 
              v-for="item in favorites" 
              :key="item.id"
              class="flex gap-3 p-3 bg-wayang-dark/50 rounded-lg hover:bg-wayang-dark/70 transition-colors cursor-pointer group"
              @click="$emit('play-video', item.videoUrl)"
            >
              <img 
                :src="item.thumbnail" 
                :alt="item.title"
                class="w-28 h-16 object-cover rounded"
              />
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-medium text-white line-clamp-2 group-hover:text-wayang-gold transition-colors">
                  {{ item.title }}
                </h4>
                <p class="text-xs text-gray-400 mt-1">Ditambahkan {{ formatDate(item.addedAt) }}</p>
              </div>
              <button 
                @click.stop="removeFromFavorites(item.id)"
                class="text-wayang-gold hover:text-wayang-gold/60 transition-all p-1"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { updateProfile as firebaseUpdateProfile } from 'firebase/auth'
import { auth, db } from '@/firebase'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'play-video'])

const authStore = useAuthStore()
const user = ref(authStore.user)

const activeTab = ref('profile')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const formData = reactive({
  displayName: ''
})

const watchHistory = ref([])
const favorites = ref([])

// Watch for auth changes
watch(() => authStore.user, (newUser) => {
  user.value = newUser
  if (newUser) {
    formData.displayName = newUser.displayName || ''
    loadUserData()
  }
}, { immediate: true })

// Load user data when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen && user.value) {
    formData.displayName = user.value.displayName || ''
    loadUserData()
  }
})

const closeModal = () => {
  errorMessage.value = ''
  successMessage.value = ''
  emit('close')
}

const loadUserData = async () => {
  if (!user.value?.uid) return
  
  try {
    // Load watch history
    const historyRef = collection(db, 'users', user.value.uid, 'watchHistory')
    const historyQuery = query(historyRef, orderBy('watchedAt', 'desc'))
    const historySnap = await getDocs(historyQuery)
    watchHistory.value = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    
    // Load favorites
    const favRef = collection(db, 'users', user.value.uid, 'favorites')
    const favQuery = query(favRef, orderBy('addedAt', 'desc'))
    const favSnap = await getDocs(favQuery)
    favorites.value = favSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  } catch (error) {
    console.error('Error loading user data:', error)
  }
}

const updateProfile = async () => {
  if (!auth.currentUser) return
  
  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  
  try {
    await firebaseUpdateProfile(auth.currentUser, {
      displayName: formData.displayName
    })
    
    // Update local store
    authStore.user.displayName = formData.displayName
    user.value = { ...user.value, displayName: formData.displayName }
    
    successMessage.value = 'Profil berhasil diperbarui!'
    setTimeout(() => successMessage.value = '', 3000)
  } catch (error) {
    console.error('Error updating profile:', error)
    errorMessage.value = 'Gagal memperbarui profil'
  } finally {
    isLoading.value = false
  }
}

const handleAvatarChange = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // For now, just show a message - full implementation would need Firebase Storage
  errorMessage.value = 'Fitur upload avatar akan segera hadir!'
  setTimeout(() => errorMessage.value = '', 3000)
}

const removeFromHistory = async (itemId) => {
  if (!user.value?.uid) return
  
  try {
    await deleteDoc(doc(db, 'users', user.value.uid, 'watchHistory', itemId))
    watchHistory.value = watchHistory.value.filter(item => item.id !== itemId)
  } catch (error) {
    console.error('Error removing from history:', error)
  }
}

const clearHistory = async () => {
  if (!user.value?.uid || !confirm('Hapus semua riwayat tontonan?')) return
  
  try {
    for (const item of watchHistory.value) {
      await deleteDoc(doc(db, 'users', user.value.uid, 'watchHistory', item.id))
    }
    watchHistory.value = []
  } catch (error) {
    console.error('Error clearing history:', error)
  }
}

const removeFromFavorites = async (itemId) => {
  if (!user.value?.uid) return
  
  try {
    await deleteDoc(doc(db, 'users', user.value.uid, 'favorites', itemId))
    favorites.value = favorites.value.filter(item => item.id !== itemId)
  } catch (error) {
    console.error('Error removing from favorites:', error)
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  })
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

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
