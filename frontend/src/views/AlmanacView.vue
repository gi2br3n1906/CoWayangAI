<template>
  <div class="min-h-screen py-24 px-4 bg-gradient-to-b from-black/40 via-transparent to-black/20">
    <div class="max-w-6xl mx-auto">
      <header class="mb-10 text-center space-y-2">
        <p class="uppercase tracking-[0.35em] text-sm text-wayang-gold">
          Almanak Wayang
        </p>
        <h1 class="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">
          Koleksi Tokoh Legendaris
        </h1>
        <p class="text-white/70 max-w-3xl mx-auto">
          Jelajahi ensiklopedia tokoh wayang. Temukan mereka selama menonton video dan lengkapi seluruh daftar untuk membuka kisah rahasia.
        </p>
      </header>

      <div class="flex flex-wrap justify-center gap-3 mb-10">
        <button
          v-for="tier in tiers"
          :key="tier"
          class="px-5 py-2 rounded-full text-sm font-semibold border transition-all"
          :class="selectedTier === tier
            ? 'bg-wayang-primary text-white border-white/40 shadow-[0_10px_30px_rgba(120,29,66,0.45)]'
            : 'bg-white/5 text-white/70 border-white/10 hover:text-white'"
          @click="selectedTier = tier"
        >
          {{ tier }}
        </button>
      </div>

      <section class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="character in filteredCharacters"
          :key="character.id"
          class="relative bg-black/30 border border-white/10 rounded-3xl overflow-hidden group cursor-pointer hover:-translate-y-1 transition-transform duration-300"
          @click="openDetail(character)">
          <div class="aspect-[3/4] w-full overflow-hidden">
            <div
              v-if="!isUnlocked(character.id)"
              class="h-full w-full bg-gradient-to-b from-black via-black/80 to-black/60 flex flex-col items-center justify-center text-center text-white/70">
              <span class="text-5xl font-black mb-2">?</span>
              <p class="tracking-widest text-sm uppercase">Masih Misterius</p>
            </div>
            <img
              v-else
              :src="character.imageUrl"
              :alt="character.name"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          <div class="p-5 space-y-1">
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">{{ character.tier }}</p>
            <h3 class="text-2xl font-semibold text-white">
              {{ isUnlocked(character.id) ? character.name : maskedName(character.name) }}
            </h3>
            <p class="text-sm text-white/60 line-clamp-2">
              {{ isUnlocked(character.id) ? character.description : 'Tonton video untuk membuka informasi.' }}
            </p>
          </div>
          <div v-if="isUnlocked(character.id)" class="absolute inset-0 pointer-events-none border-2 border-wayang-gold/70 rounded-3xl shadow-[0_0_35px_rgba(240,210,144,0.55)]"></div>
        </article>
      </section>

      <dialog v-if="selectedCharacter" open class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
        <div class="relative w-full max-w-4xl bg-black/60 border border-white/15 rounded-[32px] shadow-[0_20px_80px_rgba(0,0,0,0.7)] overflow-hidden">
          <button
            class="absolute top-4 right-4 text-white/70 hover:text-white"
            @click="closeDetail">
            ✕
          </button>

          <div class="grid md:grid-cols-2">
            <div class="bg-black/40 p-6 flex flex-col items-center justify-center">
              <img
                v-if="isUnlocked(selectedCharacter.id)"
                :src="selectedCharacter.imageUrl"
                :alt="selectedCharacter.name"
                class="rounded-2xl shadow-[0_25px_45px_rgba(0,0,0,0.5)] max-h-[420px] object-cover"
              />
              <div v-else class="w-full h-[420px] bg-gradient-to-b from-black via-black/70 to-black/40 flex flex-col items-center justify-center rounded-2xl text-white/70">
                <span class="text-7xl font-black mb-4">?</span>
                <p class="text-center">Tokoh ini masih tersembunyi.<br>Temukan lewat video wayang.</p>
              </div>
              <span v-if="isUnlocked(selectedCharacter.id) && unlockInfo" class="mt-4 text-xs uppercase tracking-[0.4em] text-wayang-gold">
                Ditemukan pada {{ formatDate(unlockInfo.unlockedAt) }}
              </span>
            </div>

            <div class="p-8 space-y-5 text-white">
              <div>
                <p class="text-sm uppercase tracking-[0.4em] text-white/50">{{ selectedCharacter.tier }}</p>
                <h2 class="text-4xl font-bold">
                  {{ isUnlocked(selectedCharacter.id) ? selectedCharacter.name : maskedName(selectedCharacter.name) }}
                </h2>
                <p v-if="isUnlocked(selectedCharacter.id)" class="italic text-white/70">
                  Alias: {{ selectedCharacter.aliases.join(', ') }}
                </p>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p class="text-xs uppercase tracking-[0.3em] text-white/50">Senjata</p>
                  <p class="text-lg font-semibold">
                    {{ isUnlocked(selectedCharacter.id) ? selectedCharacter.weapon : '???' }}
                  </p>
                </div>
                <div class="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <p class="text-xs uppercase tracking-[0.3em] text-white/50">Watak</p>
                  <p class="text-lg font-semibold">
                    {{ isUnlocked(selectedCharacter.id) ? selectedCharacter.temperament : '???' }}
                  </p>
                </div>
                <div class="bg-white/5 rounded-2xl p-4 border border-white/10 col-span-2">
                  <p class="text-xs uppercase tracking-[0.3em] text-white/50">Keluarga</p>
                  <p>
                    Ayah: {{ isUnlocked(selectedCharacter.id) ? selectedCharacter.family.father : '???' }}<br>
                    Ibu: {{ isUnlocked(selectedCharacter.id) ? selectedCharacter.family.mother : '???' }}
                  </p>
                </div>
              </div>

              <div class="bg-white/5 rounded-2xl p-4 border border-white/10 max-h-48 overflow-y-auto">
                <p class="text-xs uppercase tracking-[0.3em] text-white/50 mb-2">Lore</p>
                <p class="leading-relaxed text-white/80">
                  {{ isUnlocked(selectedCharacter.id) ? selectedCharacter.description : 'Narasi ini akan terbuka setelah kamu menemukan sang tokoh.' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getCharacters, getUserProgress } from '@/services/firebase'

const tiers = ['Semua', 'Pandawa', 'Kurawa', 'Punakawan', 'Dewa']
const selectedTier = ref('Semua')
const characters = ref([])
const progress = ref({})
const selectedCharacter = ref(null)
const unlockInfo = ref(null)

const authStore = useAuthStore()

const filteredCharacters = computed(() => {
  if (selectedTier.value === 'Semua') return characters.value
  return characters.value.filter(char => char.tier === selectedTier.value)
})

const maskedName = (name) => {
  if (!name) return '???'
  return name.split('').map((char, idx) => (idx % 2 === 0 ? '?' : char)).join('')
}

const isUnlocked = (characterId) => {
  return Boolean(progress.value[characterId])
}

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

const loadData = async () => {
  characters.value = await getCharacters()
  if (authStore.isAuthenticated) {
    progress.value = await getUserProgress(authStore.user.uid)
  } else {
    progress.value = {}
  }
}

const openDetail = (character) => {
  selectedCharacter.value = character
  unlockInfo.value = progress.value[character.id] || null
}

const closeDetail = () => {
  selectedCharacter.value = null
  unlockInfo.value = null
}

watch(() => authStore.isAuthenticated, loadData, { immediate: true })
</script>
