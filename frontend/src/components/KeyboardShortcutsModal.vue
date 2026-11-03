<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ isOpen: Boolean })
defineEmits(['close'])
const shortcuts = [ ['Space', 'Play / Pause'], ['←', 'Mundur 10 detik'], ['→', 'Maju 10 detik'], ['↑ / ↓', 'Volume naik / turun'], ['M', 'Mute / Unmute'], ['F', 'Fullscreen'], ['H', 'Tutup sesi video'], ['?', 'Tampilkan pintasan'], ['Esc', 'Tutup dialog / navigasi'] ]
</script>
<template><div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-wayang-dark/80 backdrop-blur-sm overflow-y-auto" @click.self="$emit('close')"><section class="surface w-full max-w-lg p-6 relative"><button class="icon-button absolute top-3 right-3" aria-label="Tutup pintasan keyboard" @click="$emit('close')"><AppIcon name="close" /></button><p class="eyebrow">KENDALI RUANG ANALISIS</p><h2 class="text-2xl mt-4 mb-6">Pintasan keyboard</h2><dl class="grid gap-2"><div v-for="[keys, description] in shortcuts" :key="keys" class="flex items-center justify-between gap-4 p-3 border border-wayang-gold/10 rounded-lg"><dt class="text-sm text-gray-400">{{ description }}</dt><dd><kbd class="text-xs font-mono text-wayang-gold border border-wayang-gold/20 rounded px-2 py-1">{{ keys }}</kbd></dd></div></dl><p class="text-xs text-gray-400 mt-6 leading-relaxed">Kontrol video aktif hanya selama sesi terbuka dan saat fokus tidak berada di formulir. Hasil AI mengikuti ketersediaan layanan.</p></section></div></template>
<style scoped>
dt,.text-xs { color: var(--muted); }
kbd.text-xs { color: var(--gold); border-color: var(--control-border); background: var(--panel); }
dl > div { border-color: var(--line); }
</style>
