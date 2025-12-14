<template>
  <div class="bg-white/10 rounded-2xl h-full max-h-full border border-white/15 flex flex-col overflow-hidden shadow-xl backdrop-blur">
    
    <!-- Header -->
    <div class="bg-gradient-to-r from-[#781D42]/80 to-[#A3423C]/80 p-3 border-b border-white/10 flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-[#F0D290]">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-white text-sm uppercase tracking-wider">Panel AI</h3>
          <p class="text-[10px] text-white/70">Deteksi & Kontrol</p>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0">
      
      <!-- Statistik Deteksi -->
      <div class="bg-white/5 rounded-xl p-3 border border-white/10">
        <h4 class="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-2">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Statistik
        </h4>
        
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-white/5 rounded-lg p-2 text-center">
            <div class="text-xl font-bold text-[#F0D290]">{{ characters.length }}</div>
            <div class="text-[9px] text-white/50 uppercase">Objek</div>
          </div>
          <div class="bg-white/5 rounded-lg p-2 text-center">
            <div class="text-xl font-bold text-green-400">{{ averageConfidence }}%</div>
            <div class="text-[9px] text-white/50 uppercase">Confidence</div>
          </div>
          <div class="bg-white/5 rounded-lg p-2 text-center">
            <div class="text-xl font-bold text-blue-400">{{ uniqueCharacters.length }}</div>
            <div class="text-[9px] text-white/50 uppercase">Unik</div>
          </div>
          <div class="bg-white/5 rounded-lg p-2 text-center">
            <div class="text-xl font-bold" :class="aiConnected ? 'text-green-400' : 'text-red-400'">
              {{ aiConnected ? 'ON' : 'OFF' }}
            </div>
            <div class="text-[9px] text-white/50 uppercase">Status AI</div>
          </div>
        </div>
      </div>

      <!-- Tokoh Terdeteksi -->
      <div class="bg-white/5 rounded-xl p-3 border border-white/10">
        <h4 class="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-2">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Tokoh
        </h4>
        
        <div v-if="uniqueCharacters.length === 0" class="text-center py-3 text-white/40 text-xs">
          <svg class="w-6 h-6 mx-auto mb-1 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Menunggu...
        </div>
        
        <div v-else class="flex flex-wrap gap-1.5">
          <div 
            v-for="char in uniqueCharacters" 
            :key="char.name"
            class="px-2 py-1 rounded-full text-[10px] font-medium border flex items-center gap-1"
            :style="{ 
              backgroundColor: char.color + '20', 
              borderColor: char.color,
              color: char.color 
            }"
          >
            <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: char.color }"></span>
            {{ char.name }}
            <span class="opacity-60">({{ char.count }})</span>
          </div>
        </div>
      </div>

      <!-- Kontrol AI -->
      <div class="bg-white/5 rounded-xl p-3 border border-white/10">
        <h4 class="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-2">
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Kontrol
        </h4>
        
        <div class="space-y-2">
          <!-- Toggle Bounding Box -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/70">Bounding Box</span>
            <button 
              @click="$emit('toggle-bbox', !showBoundingBox)"
              class="relative w-10 h-5 rounded-full transition-colors"
              :class="showBoundingBox ? 'bg-green-500' : 'bg-white/20'"
            >
              <span 
                class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                :class="showBoundingBox ? 'left-5' : 'left-0.5'"
              ></span>
            </button>
          </div>
          
          <!-- Toggle Labels -->
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/70">Label Nama</span>
            <button 
              @click="$emit('toggle-labels', !showLabels)"
              class="relative w-10 h-5 rounded-full transition-colors"
              :class="showLabels ? 'bg-green-500' : 'bg-white/20'"
            >
              <span 
                class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform"
                :class="showLabels ? 'left-5' : 'left-0.5'"
              ></span>
            </button>
          </div>
          
          <!-- Confidence Threshold -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/70">Min Confidence</span>
              <span class="text-[10px] text-[#F0D290] font-mono">{{ confidenceThreshold }}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              :value="confidenceThreshold"
              @input="$emit('update-confidence', parseInt($event.target.value))"
              class="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer slider"
            />
          </div>
          
          <!-- Language Selector -->
          <div class="space-y-1 pt-2 border-t border-white/10">
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/70">Bahasa Terjemahan</span>
            </div>
            <div class="flex gap-2">
              <button 
                @click="$emit('change-language', 'id')"
                class="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                :class="targetLanguage === 'id' ? 'bg-[#F0D290] text-wayang-dark' : 'bg-white/10 text-white/70 hover:bg-white/20'"
              >
                🇮🇩 Indonesia
              </button>
              <button 
                @click="$emit('change-language', 'en')"
                class="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                :class="targetLanguage === 'en' ? 'bg-[#F0D290] text-wayang-dark' : 'bg-white/10 text-white/70 hover:bg-white/20'"
              >
                🇬🇧 English
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  characters: {
    type: Array,
    default: () => []
  },
  aiConnected: {
    type: Boolean,
    default: false
  },
  videoInfo: {
    type: Object,
    default: null
  },
  currentTime: {
    type: Number,
    default: 0
  },
  showBoundingBox: {
    type: Boolean,
    default: true
  },
  showLabels: {
    type: Boolean,
    default: true
  },
  confidenceThreshold: {
    type: Number,
    default: 50
  },
  targetLanguage: {
    type: String,
    default: 'id'
  }
});

defineEmits(['toggle-bbox', 'toggle-labels', 'update-confidence', 'change-language']);

// Warna untuk setiap karakter
const characterColors = {
  'Arjuna': '#3B82F6',
  'Bima': '#EF4444',
  'Werkudara': '#EF4444',
  'Gatotkaca': '#F59E0B',
  'Kresna': '#8B5CF6',
  'Semar': '#10B981',
  'Petruk': '#EC4899',
  'Gareng': '#06B6D4',
  'Bagong': '#84CC16',
  'Yudistira': '#6366F1',
  'Nakula': '#14B8A6',
  'Sadewa': '#F97316',
  'Duryudana': '#DC2626',
  'Dursasana': '#B91C1C',
  'Sengkuni': '#7C3AED',
  'Karna': '#FBBF24',
  'Baladewa': '#2563EB',
  'Antareja': '#059669',
  'Antasena': '#0891B2',
  'Wisanggeni': '#D946EF',
  'Abimanyu': '#F472B6',
  'Srikandi': '#FB7185'
};

const getCharacterColor = (name) => {
  return characterColors[name] || '#9CA3AF';
};

// Hitung rata-rata confidence
const averageConfidence = computed(() => {
  if (props.characters.length === 0) return 0;
  const sum = props.characters.reduce((acc, char) => acc + (char.confidence || 0), 0);
  return Math.round(sum / props.characters.length);
});

// Dapatkan karakter unik dengan jumlah
const uniqueCharacters = computed(() => {
  const charMap = new Map();
  props.characters.forEach(char => {
    const name = char.name || char.class || 'Unknown';
    if (charMap.has(name)) {
      charMap.get(name).count++;
    } else {
      charMap.set(name, { 
        name, 
        count: 1,
        color: getCharacterColor(name)
      });
    }
  });
  return Array.from(charMap.values());
});

// Format waktu
const formatTime = (seconds) => {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: #F0D290;
  border-radius: 50%;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #F0D290;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}
</style>
