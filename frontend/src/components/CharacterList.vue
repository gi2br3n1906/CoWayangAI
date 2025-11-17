<template>
  <div class="bg-wayang-card rounded-2xl shadow-2xl border border-white/10 overflow-hidden h-full flex flex-col">
    <!-- Header -->
    <div class="bg-gradient-to-r from-wayang-primary/20 to-wayang-gold/20 p-4 border-b border-white/10 flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-wayang-gold/20 rounded-lg flex items-center justify-center">
          <svg class="w-6 h-6 text-wayang-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-white">Characters</h3>
          <p class="text-xs text-gray-400">{{ characters.length }} detected</p>
        </div>
      </div>
    </div>

    <!-- Characters List -->
    <div class="p-4 overflow-y-auto custom-scrollbar flex-1">
      <TransitionGroup name="list" tag="div" class="space-y-3">
        <div 
          v-for="character in characters" 
          :key="character.id"
          class="bg-wayang-dark/50 rounded-lg p-3 border border-white/5 hover:border-wayang-gold/30 transition-all duration-200 group cursor-pointer"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <h4 class="text-white font-semibold text-sm group-hover:text-wayang-gold transition-colors">
                {{ character.name }}
              </h4>
              <p class="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ character.time }}
              </p>
            </div>
            <div class="text-right">
              <span class="text-xs font-medium text-wayang-primary bg-wayang-primary/10 px-2 py-1 rounded">
                {{ character.confidence }}
              </span>
            </div>
          </div>

          <!-- Confidence Bar -->
          <div class="w-full bg-wayang-dark rounded-full h-1.5 overflow-hidden">
            <div 
              class="h-full bg-gradient-to-r from-wayang-primary to-wayang-gold transition-all duration-500"
              :style="{ width: character.confidence }"
            ></div>
          </div>

          <!-- Description -->
          <div v-if="character.description" class="mt-2 text-xs text-gray-500 line-clamp-2">
            {{ character.description }}
          </div>
        </div>
      </TransitionGroup>

      <!-- Empty State -->
      <div v-if="characters.length === 0" class="text-center py-8">
        <svg class="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p class="text-gray-400 text-sm">Waiting...</p>
        <p class="text-xs text-gray-500 mt-1">Characters will appear here</p>
      </div>
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
/* Custom scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.8);
}

/* List animation */
.list-enter-active {
  transition: all 0.4s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.list-leave-active {
  transition: all 0.3s ease;
}

.list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* Line clamp utility */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
