<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { parseSubtitleColor } from '@/utils/fohOutput'

const route = useRoute()
const entries = ref([])
const canvas = ref(null)
const lines = ref(null)
const overflowing = ref(false)
let socket, clearTimer, resizeObserver, lastServerNow = -Infinity
const key = computed(() => String(route.params.streamKey || ''))
const params = computed(() => new URLSearchParams(globalThis.location?.search || ''))
const background = computed(() => ({ transparent: 'transparent', black: '#000', green: '#00ff00' })[params.value.get('bg')] || 'transparent')
const languages = computed(() => {
 const value = params.value.get('lang') || 'all'
 return value === 'all' ? ['jawa', 'indonesia', 'inggris'] : [...new Set(value.split(',').filter(item => ['jawa', 'indonesia', 'inggris', 'id', 'en'].includes(item)).map(item => ({ id: 'indonesia', en: 'inggris' }[item] || item)))]
})
const historyLimit = computed(() => ({ '1': 1, '2': 2, '3': 3 })[params.value.get('history')] || 1)
const size = computed(() => ({ lg: 'clamp(28px, 4vw, 48px)', xl: 'clamp(36px, 5vw, 64px)', '2xl': 'clamp(44px, 6vw, 80px)' })[params.value.get('size')] || 'clamp(36px, 5vw, 64px)')
const alignment = computed(() => params.value.get('align') === 'center' ? 'safe center' : 'safe end')
const textColor = computed(() => parseSubtitleColor(params.value.get('color')))
const labels = { jawa: 'JAWA', indonesia: 'INDONESIA', inggris: 'ENGLISH' }
const displayed = computed(() => entries.value.slice(-historyLimit.value))
const textFor = language => displayed.value.filter(entry => entry[language])
function checkOverflow() {
 if (canvas.value) overflowing.value = canvas.value.scrollHeight > canvas.value.clientHeight + 1
}
watch(entries, checkOverflow, { flush: 'post' })
function scheduleExpiry() {
 clearTimeout(clearTimer)
 if (!entries.value.length) return
 const delay = Math.max(0, Math.min(...entries.value.map(entry => entry.expiresAt)) - performance.now())
 clearTimer = setTimeout(() => {
  entries.value = entries.value.filter(entry => entry.expiresAt > performance.now())
  scheduleExpiry()
 }, delay)
}
function apply(data) {
 if (data?.streamKey !== key.value) return
 const now = performance.now()
 if (Array.isArray(data.history)) {
  const serverNow = Number(data.serverNow)
  if (!Number.isFinite(serverNow) || serverNow < lastServerNow) return
  lastServerNow = serverNow
  const seen = new Set()
  entries.value = data.history.filter(entry => {
   if (!entry || entry.id == null || seen.has(entry.id)) return false
   seen.add(entry.id)
   return true
  }).map(entry => ({
   id: entry.id,
   jawa: typeof entry.jawa === 'string' ? entry.jawa : '',
   indonesia: typeof entry.indonesia === 'string' ? entry.indonesia : '',
   inggris: typeof entry.inggris === 'string' ? entry.inggris : '',
   expiresAt: now + Math.max(0, 12000 - Math.max(0, serverNow - Number(entry.updatedAt))),
  })).filter(entry => Number.isFinite(entry.expiresAt) && entry.expiresAt > now).slice(-3)
 } else {
  if (lastServerNow !== -Infinity) return
  entries.value = [{ id: 'legacy', jawa: data.jawa || '', indonesia: data.indonesia || '', inggris: data.inggris || '', expiresAt: now + 12000 }]
 }
 scheduleExpiry()
}
function connect() {
 clearTimeout(clearTimer)
 entries.value = []
 lastServerNow = -Infinity
 socket?.disconnect()
 socket = io(import.meta.env.VITE_SOCKET_URL || '/', { transports: ['websocket', 'polling'] })
 socket.on('connect', () => { lastServerNow = -Infinity; socket.emit('foh-subscribe', { streamKey: key.value }) })
 socket.on('foh-subtitle', apply)
}
onMounted(() => {
 connect()
 if (typeof ResizeObserver !== 'undefined') {
  resizeObserver = new ResizeObserver(checkOverflow)
  resizeObserver.observe(canvas.value)
  resizeObserver.observe(lines.value)
 }
 globalThis.addEventListener('resize', checkOverflow)
})
watch(key, connect)
onUnmounted(() => { clearTimeout(clearTimer); resizeObserver?.disconnect(); globalThis.removeEventListener('resize', checkOverflow); socket?.disconnect() })
</script>

<template>
 <main ref="canvas" class="foh-canvas" :style="{ background, justifyContent: alignment }" aria-live="polite" aria-atomic="true">
  <div v-if="overflowing" class="foh-overflow-warning">Subtitle exceeds screen — reduce size or history</div>
  <section ref="lines" class="foh-lines" :style="{ '--foh-size': size, '--foh-text-color': textColor }">
   <div v-for="language in languages" :key="language" v-show="textFor(language).length" class="foh-language-group" :data-language="language">
    <span class="foh-language">{{ labels[language] }}</span>
    <TransitionGroup name="subtitle" tag="div" class="foh-entries">
     <p v-for="(entry, index) in textFor(language)" :key="entry.id" class="foh-line" :class="{ 'foh-older': index < textFor(language).length - 1 }">{{ entry[language] }}</p>
    </TransitionGroup>
   </div>
  </section>
 </main>
</template>

<style>
html:has(.foh-canvas), body:has(.foh-canvas), #app:has(.foh-canvas) { width: 100%; height: 100%; min-height: 100%; margin: 0; overflow: hidden; background: transparent; }
.foh-canvas { width: 100vw; height: 100dvh; box-sizing: border-box; display: flex; flex-direction: column; padding: 5vh 5vw; color: white; font-family: Arial, Helvetica, sans-serif; overflow-y: auto; }
.foh-lines { width: 100%; flex: 0 0 auto; display: flex; flex-direction: column; gap: .4em; text-align: center; }
.foh-entries { display: flex; flex-direction: column; gap: .12em; }
.foh-overflow-warning { position: fixed; top: 0; left: 0; z-index: 1; background: #000; color: #fff; font: 700 14px Arial, sans-serif; padding: 4px 8px; }
.foh-line { margin: 0; color: var(--foh-text-color, #fff); font-size: var(--foh-size); font-weight: 800; line-height: 1.16; text-shadow: 0 2px 2px #000, 2px 0 2px #000, 0 -2px 2px #000, -2px 0 2px #000, 0 5px 16px #000; overflow-wrap: anywhere; }
.foh-older { opacity: .7; font-size: calc(var(--foh-size) * .8); }
.foh-language { display: block; margin-bottom: .25em; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-shadow: 0 2px 4px #000; }
.subtitle-enter-active,.subtitle-leave-active { transition: opacity .25s ease, transform .25s ease; }
.subtitle-enter-from,.subtitle-leave-to { opacity: 0; transform: translateY(10px); }
@media (prefers-reduced-motion: reduce) { .subtitle-enter-active,.subtitle-leave-active { transition: none; } }
</style>
