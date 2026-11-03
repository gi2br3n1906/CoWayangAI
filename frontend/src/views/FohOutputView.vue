<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { parseSubtitleColor } from '@/utils/fohOutput'

const route = useRoute()
const subtitle = ref({ jawa: '', indonesia: '', inggris: '' })
const connected = ref(false)
let socket, clearTimer
const key = computed(() => String(route.params.streamKey || ''))
const params = computed(() => new URLSearchParams(globalThis.location?.search || ''))
const background = computed(() => ({ transparent: 'transparent', black: '#000', green: '#00ff00' })[params.value.get('bg')] || 'transparent')
const languages = computed(() => {
 const value = params.value.get('lang') || 'all'
 return value === 'all' ? ['jawa', 'indonesia', 'inggris'] : value.split(',').filter(item => ['jawa', 'indonesia', 'inggris', 'id', 'en'].includes(item)).map(item => ({ id: 'indonesia', en: 'inggris' }[item] || item))
})
const size = computed(() => ({ lg: 'clamp(28px, 4vw, 48px)', xl: 'clamp(36px, 5vw, 64px)', '2xl': 'clamp(44px, 6vw, 80px)' })[params.value.get('size')] || 'clamp(36px, 5vw, 64px)')
const alignment = computed(() => params.value.get('align') === 'center' ? 'center' : 'end')
const textColor = computed(() => parseSubtitleColor(params.value.get('color')))
const labels = { jawa: 'JAWA', indonesia: 'INDONESIA', inggris: 'ENGLISH' }
function apply(data) {
 if (data?.streamKey !== key.value) return
 subtitle.value = { jawa: data.jawa || '', indonesia: data.indonesia || '', inggris: data.inggris || '' }
 clearTimeout(clearTimer)
 clearTimer = setTimeout(() => { subtitle.value = { jawa: '', indonesia: '', inggris: '' } }, 12000)
}
function connect() {
 socket?.disconnect()
 socket = io(import.meta.env.VITE_SOCKET_URL || '/', { transports: ['websocket', 'polling'] })
 socket.on('connect', () => { connected.value = true; socket.emit('foh-subscribe', { streamKey: key.value }) })
 socket.on('disconnect', () => { connected.value = false })
 socket.on('foh-subtitle', apply)
}
onMounted(connect)
watch(key, connect)
onUnmounted(() => { clearTimeout(clearTimer); socket?.disconnect() })
</script>

<template>
 <main class="foh-canvas" :style="{ background, justifyContent: alignment }" aria-live="polite" aria-atomic="true">
  <section class="foh-lines" :style="{ '--foh-size': size, '--foh-text-color': textColor }">
   <TransitionGroup name="subtitle">
    <p v-for="language in languages" v-show="subtitle[language]" :key="language" class="foh-line" :data-language="language">
     <span class="foh-language">{{ labels[language] }}</span>{{ subtitle[language] }}
    </p>
   </TransitionGroup>
  </section>
 </main>
</template>

<style>
html:has(.foh-canvas), body:has(.foh-canvas), #app:has(.foh-canvas) { width: 100%; height: 100%; min-height: 100%; margin: 0; overflow: hidden; background: transparent; }
.foh-canvas { width: 100vw; height: 100dvh; box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; padding: 5vh 5vw; color: white; font-family: Arial, Helvetica, sans-serif; }
.foh-lines { width: 100%; display: flex; flex-direction: column; gap: .22em; text-align: center; }
.foh-line { margin: 0; color: var(--foh-text-color, #fff); font-size: var(--foh-size); font-weight: 800; line-height: 1.16; text-shadow: 0 2px 2px #000, 2px 0 2px #000, 0 -2px 2px #000, -2px 0 2px #000, 0 5px 16px #000; overflow-wrap: anywhere; }
.foh-language { display: block; margin-bottom: .25em; font-size: .2em; font-weight: 700; letter-spacing: .08em; text-shadow: 0 2px 4px #000; }
.subtitle-enter-active,.subtitle-leave-active { transition: opacity .25s ease, transform .25s ease; }
.subtitle-enter-from,.subtitle-leave-to { opacity: 0; transform: translateY(10px); }
</style>
