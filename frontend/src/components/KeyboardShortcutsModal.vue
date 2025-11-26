<template>
  <!-- Keyboard Shortcuts Modal -->
  <transition name="modal">
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div class="relative w-full max-w-lg bg-wayang-card rounded-2xl shadow-2xl p-6 border border-wayang-card">
        <!-- Close Button -->
        <button
          @click="$emit('close')"
          class="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Header -->
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 bg-wayang-primary/20 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-wayang-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">Keyboard Shortcuts</h2>
            <p class="text-sm text-gray-400">Navigasi cepat dengan keyboard</p>
          </div>
        </div>

        <!-- Shortcuts List -->
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <!-- Video Controls -->
            <div class="col-span-2 text-xs font-semibold text-wayang-gold uppercase tracking-wider mb-1 mt-2">
              Video Controls
            </div>
            
            <ShortcutItem keys="Space" description="Play / Pause" />
            <ShortcutItem keys="←" description="Mundur 5 detik" />
            <ShortcutItem keys="→" description="Maju 5 detik" />
            <ShortcutItem keys="↑" description="Volume naik" />
            <ShortcutItem keys="↓" description="Volume turun" />
            <ShortcutItem keys="M" description="Mute / Unmute" />
            <ShortcutItem keys="F" description="Fullscreen" />

            <!-- Navigation -->
            <div class="col-span-2 text-xs font-semibold text-wayang-gold uppercase tracking-wider mb-1 mt-4">
              Navigasi
            </div>
            
            <ShortcutItem keys="?" description="Tampilkan shortcuts" />
            <ShortcutItem keys="Esc" description="Tutup modal / video" />
            <ShortcutItem keys="/" description="Fokus ke pencarian" />
            <ShortcutItem keys="H" description="Kembali ke Home" />
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-6 pt-4 border-t border-wayang-card/50 text-center">
          <p class="text-xs text-gray-500">
            Tekan <kbd class="px-1.5 py-0.5 bg-wayang-dark rounded text-gray-300 text-xs">?</kbd> kapan saja untuk melihat shortcuts
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

defineEmits(['close'])

// Shortcut Item Component (inline)
const ShortcutItem = {
  props: ['keys', 'description'],
  template: `
    <div class="flex items-center justify-between p-2 bg-wayang-dark/50 rounded-lg">
      <span class="text-sm text-gray-300">{{ description }}</span>
      <kbd class="px-2 py-1 bg-wayang-dark rounded text-xs font-mono text-wayang-gold border border-wayang-card">
        {{ keys }}
      </kbd>
    </div>
  `
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
