<template>
  <div class="bg-wayang-card rounded-2xl h-full border border-white/10 flex flex-col overflow-hidden shadow-xl">
    
    <div class="bg-gradient-to-r from-slate-800 to-slate-900 p-4 border-b border-white/5 flex-shrink-0 flex justify-between items-center">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-wayang-primary/20 rounded-lg flex items-center justify-center text-wayang-primary">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-white text-sm uppercase tracking-wider">Tokoh di Layar</h3>
          <p class="text-xs text-gray-400">{{ characters.length }} terdeteksi</p>
        </div>
      </div>
      <div v-if="characters.length > 0" class="flex items-center gap-1.5">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
        <span class="text-[10px] font-bold text-green-400">LIVE</span>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-4 relative">
      
      <div v-if="characters.length === 0" class="absolute inset-0 flex flex-col items-center justify-center text-gray-600 space-y-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <p class="text-sm">Menunggu Wayang...</p>
      </div>

      <TransitionGroup name="list" tag="div" class="space-y-3">
        <div 
          v-for="(char, index) in characters" 
          :key="char.name + index" 
          class="bg-slate-800/50 p-3 rounded-xl border border-white/5 flex gap-3 items-center hover:bg-slate-800 transition-colors group"
        >
          <div class="w-24 aspect-video flex-shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black relative">
             
            <img 
              v-if="char.image"
              :src="`data:image/jpeg;base64,${char.image}`" 
              alt="Wayang Frame"
              class="w-full h-full object-contain opacity-80"
            />
            <div v-else class="w-full h-full flex items-center justify-center bg-slate-700">
               <span class="text-xs text-gray-500">?</span>
            </div>

            <div 
              v-if="char.box"
              class="absolute border-2 border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)] transition-all duration-300"
              :style="{
                left: char.box.left + '%',
                top: char.box.top + '%',
                width: char.box.width + '%',
                height: char.box.height + '%'
              }"
            >
              <div class="absolute top-1/2 left-1/2 w-1 h-1 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
            
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start mb-1">
              <h3 class="font-bold text-white text-base truncate group-hover:text-wayang-gold transition-colors">{{ char.name }}</h3>
            </div>
            
            <div class="flex items-center gap-2 mt-2">
                <div class="flex-1 bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    :style="{ width: char.confidence + '%' }"
                  ></div>
                </div>
                <span class="text-[10px] text-wayang-primary font-bold">{{ char.confidence }}%</span>
            </div>
          </div>
        </div>
      </TransitionGroup>

    </div>
  </div>
</template>

<script setup>
defineProps({
  characters: {
    type: Array,
    default: () => []
  }
})
</script>

<style scoped>
/* Custom Scrollbar & Transitions sama seperti sebelumnya */
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }

.list-enter-active, .list-leave-active { transition: all 0.4s ease; }
.list-enter-from { opacity: 0; transform: translateX(-20px); }
.list-leave-to { opacity: 0; transform: translateX(20px); }
.list-leave-active { position: absolute; width: 100%; }
</style>