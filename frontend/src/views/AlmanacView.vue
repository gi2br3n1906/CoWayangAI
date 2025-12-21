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
          Jelajahi ensiklopedia 21 tokoh wayang legendaris dari berbagai golongan: Pandawa, Kurawa, dan Punakawan.
        </p>
        
        <!-- Stats -->
        <div class="flex justify-center gap-6 mt-6">
          <div class="bg-white/10 px-5 py-3 rounded-xl border border-white/10">
            <p class="text-2xl font-bold text-wayang-gold">{{ characters.length }}</p>
            <p class="text-xs text-white/60 uppercase tracking-wider">Total Tokoh</p>
          </div>
          <div class="bg-white/10 px-5 py-3 rounded-xl border border-white/10">
            <p class="text-2xl font-bold text-green-400">{{ pandawaCount }}</p>
            <p class="text-xs text-white/60 uppercase tracking-wider">Pandawa</p>
          </div>
          <div class="bg-white/10 px-5 py-3 rounded-xl border border-white/10">
            <p class="text-2xl font-bold text-red-400">{{ kurawaCount }}</p>
            <p class="text-xs text-white/60 uppercase tracking-wider">Kurawa</p>
          </div>
          <div class="bg-white/10 px-5 py-3 rounded-xl border border-white/10">
            <p class="text-2xl font-bold text-yellow-400">{{ punakawanCount }}</p>
            <p class="text-xs text-white/60 uppercase tracking-wider">Punakawan</p>
          </div>
        </div>
      </header>

      <div class="flex flex-wrap justify-center gap-3 mb-10">
        <button
          v-for="tier in tiers"
          :key="tier"
          class="px-5 py-2 rounded-full text-sm font-semibold border transition-all"
          :class="selectedTier === tier
            ? tierButtonClass(tier)
            : 'bg-white/5 text-white/70 border-white/10 hover:text-white'"
          @click="selectedTier = tier"
        >
          {{ tier }}
        </button>
      </div>

      <section class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <article
          v-for="character in filteredCharacters"
          :key="character.id"
          class="relative bg-black/30 border border-white/10 rounded-3xl overflow-hidden group cursor-pointer hover:-translate-y-1 transition-transform duration-300"
          @click="openDetail(character)">
          <div class="aspect-[3/4] w-full overflow-hidden">
            <img
              :src="character.imageUrl"
              :alt="character.name"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              @error="handleImageError"
            />
            <!-- Tier Badge -->
            <div 
              class="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
              :class="tierBadgeClass(character.tier)"
            >
              {{ character.tier }}
            </div>
          </div>
          <div class="p-5 space-y-1">
            <h3 class="text-2xl font-semibold text-white group-hover:text-wayang-gold transition-colors">
              {{ character.name }}
            </h3>
            <p class="text-sm text-white/60 line-clamp-2">
              {{ character.description }}
            </p>
          </div>
          <!-- Hover glow effect -->
          <div class="absolute inset-0 pointer-events-none border-2 border-transparent rounded-3xl group-hover:border-wayang-gold/50 transition-colors"></div>
        </article>
      </section>

      <!-- Detail Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <dialog v-if="selectedCharacter" open class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div class="relative w-full max-w-4xl bg-gradient-to-br from-black/90 via-black/80 to-black/90 border border-white/15 rounded-[32px] shadow-[0_20px_80px_rgba(0,0,0,0.7)] overflow-hidden max-h-[90vh] overflow-y-auto">
              <button
                class="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10"
                @click="closeDetail">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </button>

              <div class="grid md:grid-cols-2">
                <div class="bg-black/40 p-6 flex flex-col items-center justify-center">
                  <img
                    :src="selectedCharacter.imageUrl"
                    :alt="selectedCharacter.name"
                    class="rounded-2xl shadow-[0_25px_45px_rgba(0,0,0,0.5)] max-h-[420px] object-cover"
                    @error="handleImageError"
                  />
                  <span 
                    class="mt-4 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
                    :class="tierBadgeClass(selectedCharacter.tier)"
                  >
                    {{ selectedCharacter.tier }}
                  </span>
                </div>

                <div class="p-8 space-y-5 text-white">
                  <div>
                    <h2 class="text-4xl font-bold text-wayang-gold">
                      {{ selectedCharacter.name }}
                    </h2>
                    <p class="italic text-white/70 mt-1">
                      Alias: {{ selectedCharacter.aliases.join(', ') }}
                    </p>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div class="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <p class="text-xs uppercase tracking-[0.3em] text-white/50 mb-1">Senjata</p>
                      <p class="text-base font-semibold">
                        {{ selectedCharacter.weapon }}
                      </p>
                    </div>
                    <div class="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <p class="text-xs uppercase tracking-[0.3em] text-white/50 mb-1">Watak</p>
                      <p class="text-base font-semibold">
                        {{ selectedCharacter.temperament }}
                      </p>
                    </div>
                    <div class="bg-white/5 rounded-2xl p-4 border border-white/10 col-span-2">
                      <p class="text-xs uppercase tracking-[0.3em] text-white/50 mb-1">Keluarga</p>
                      <p>
                        <span class="text-white/60">Ayah:</span> {{ selectedCharacter.family.father }}<br>
                        <span class="text-white/60">Ibu:</span> {{ selectedCharacter.family.mother }}
                      </p>
                    </div>
                  </div>

                  <div class="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p class="text-xs uppercase tracking-[0.3em] text-white/50 mb-2">Kisah</p>
                    <p class="leading-relaxed text-white/80">
                      {{ selectedCharacter.description }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </dialog>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getCharacters } from '@/services/firebase'

const tiers = ['Semua', 'Pandawa', 'Kurawa', 'Punakawan']
const selectedTier = ref('Semua')
const characters = ref([])
const selectedCharacter = ref(null)

const filteredCharacters = computed(() => {
  if (selectedTier.value === 'Semua') return characters.value
  return characters.value.filter(char => char.tier === selectedTier.value)
})

const pandawaCount = computed(() => characters.value.filter(c => c.tier === 'Pandawa').length)
const kurawaCount = computed(() => characters.value.filter(c => c.tier === 'Kurawa').length)
const punakawanCount = computed(() => characters.value.filter(c => c.tier === 'Punakawan').length)

const tierButtonClass = (tier) => {
  const classes = {
    'Semua': 'bg-wayang-primary text-white border-white/40 shadow-[0_10px_30px_rgba(120,29,66,0.45)]',
    'Pandawa': 'bg-green-600 text-white border-green-400/40 shadow-[0_10px_30px_rgba(34,197,94,0.35)]',
    'Kurawa': 'bg-red-600 text-white border-red-400/40 shadow-[0_10px_30px_rgba(239,68,68,0.35)]',
    'Punakawan': 'bg-yellow-600 text-white border-yellow-400/40 shadow-[0_10px_30px_rgba(234,179,8,0.35)]'
  }
  return classes[tier] || classes['Semua']
}

const tierBadgeClass = (tier) => {
  const classes = {
    'Pandawa': 'bg-green-600/80 text-green-100 border border-green-400/30',
    'Kurawa': 'bg-red-600/80 text-red-100 border border-red-400/30',
    'Punakawan': 'bg-yellow-600/80 text-yellow-100 border border-yellow-400/30'
  }
  return classes[tier] || 'bg-white/20 text-white'
}

const handleImageError = (e) => {
  // Fallback to placeholder if image not found
  e.target.src = `https://placehold.co/600x900/1a1a1a/F0D290?text=${encodeURIComponent(e.target.alt || 'Wayang')}`
}

const loadData = async () => {
  characters.value = await getCharacters()
}

const openDetail = (character) => {
  selectedCharacter.value = character
  document.body.style.overflow = 'hidden'
}

const closeDetail = () => {
  selectedCharacter.value = null
  document.body.style.overflow = ''
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from dialog > div,
.modal-leave-to dialog > div {
  transform: scale(0.9);
}
</style>
