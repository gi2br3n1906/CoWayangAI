<script setup>
import { ref, computed, watch, nextTick, defineAsyncComponent, onMounted, onUnmounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import StickySearchBar from '@/components/StickySearchBar.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSettings } from '@/stores/settings'
import { useNotifications } from '@/stores/notifications'
import { useAnalysis } from '@/composables/useAnalysis'
import { useProductText } from '@/i18n/product'
import curatedData from '@/data/curated-videos.json'
import FeedVideoCard from '@/components/FeedVideoCard.vue'

import LoadingView from '@/components/LoadingView.vue'
const VideoPlayer = defineAsyncComponent({ loader: () => import('@/components/VideoPlayer.vue'), loadingComponent: LoadingView, delay: 120 })
const DetectionPanel = defineAsyncComponent(() => import('@/components/DetectionPanel.vue'))
const LiveTranscription = defineAsyncComponent(() => import('@/components/LiveTranscription.vue'))
const { t } = useProductText()
const featured = curatedData.videos.map(video => ({
 videoId: video.videoId,
 title: video.title,
 channelTitle: video.authorName,
 thumbnail: video.thumbnailUrl,
 duration: video.duration,
 definition: video.hd === true ? 'hd' : undefined,
 isLive: video.live === true,
 categories: [video.category],
 sourceUrl: video.sourceUrl
}))
const categories = ['Dalang Cilik', 'Bharatayuddha', 'Ki Seno Nugroho', 'Ki Anom Suroto', 'Goro-Goro', 'Perang Kembang']
const category = ref('')
const feedVideos = computed(() => searched.value && !searchError.value ? results.value : featured)
const visibleVideos = computed(() => category.value ? feedVideos.value.filter(video => `${video.title} ${video.channelTitle || ''} ${(video.categories || []).join(' ')}`.toLowerCase().replace(/[^a-z0-9]/g, '').includes(category.value.toLowerCase().replace(/[^a-z0-9]/g, ''))) : feedVideos.value)
const route = useRoute(), router = useRouter(), settings = useSettings(), notifications = useNotifications()
const hubSearchResult = inject('hub-search-result', ref(null)), sourceControl = inject('hub-source-control', null)
const standaloneSource = ref(null)
const setSourceUrl = url => sourceControl ? sourceControl.setVideoUrl(url) : standaloneSource.value?.setVideoUrl(url)
const player = ref(null), results = ref([]), searchError = ref(''), searched = ref(false)
const { currentVideo, shouldAutoPlay, loading, characters, currentTime, connected, syncedSubtitles, queueCount, start, close } = useAnalysis({
 notify: notifications.notify, maintenance: settings.maintenance, targetLanguage: () => settings.targetLanguage,
 createSocket: async () => { const { io } = await import('socket.io-client'); return io(import.meta.env.VITE_SOCKET_URL || '/', { path: '/socket.io', reconnectionAttempts: 3, reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 8000 }) }
})
function searchResults(data) { results.value = data.videos; searchError.value = data.error || ''; searched.value = true }
watch(hubSearchResult, data => { if (data) searchResults(data) }, { immediate: true })
let viewingGeneration = 0
async function startViewing(payload) {
 const token = ++viewingGeneration
 await start(payload)
 if (token !== viewingGeneration || currentVideo.value) return
 await nextTick()
 setSourceUrl(payload.url)
}
function selectVideo(video) { startViewing({ url: `https://www.youtube.com/watch?v=${video.videoId}`, mode: 'live' }); results.value = []; searched.value = false }
function resetFeed() { category.value = ''; searched.value = false; results.value = []; searchError.value = '' }
async function closeViewing() { ++viewingGeneration; const url = currentVideo.value?.url; await close(); await nextTick(); if (url) setSourceUrl(url); globalThis.document?.getElementById('video-url')?.focus(); if (route.query.open === '1') await router.replace({ path: '/tonton', query: {} }) }
watch(() => [route.query.video, route.query.open], async ([url, open]) => { if (typeof url === 'string') { await nextTick(); setSourceUrl(url); if (open === '1') startViewing({ url, startTime: typeof route.query.startTime === 'string' ? route.query.startTime : 0, mode: ['live', 'analysis', 'transcript'].includes(route.query.mode) ? route.query.mode : 'live' }) } }, { immediate: true, flush: 'post' })
function keyboard(event) {
 if (!currentVideo.value || document.querySelector('.account-modal') || event.target.closest?.('input, textarea, select, button, a, summary, [contenteditable="true"]')) return
 const actions = { ' ': () => player.value?.togglePlayPause?.(), ArrowLeft: () => player.value?.seekRelative?.(-10), ArrowRight: () => player.value?.seekRelative?.(10), ArrowUp: () => player.value?.changeVolume?.(10), ArrowDown: () => player.value?.changeVolume?.(-10), m: () => player.value?.toggleMute?.(), f: () => player.value?.toggleFullscreen?.(), h: closeViewing }
 const action = actions[event.key] || actions[event.key.toLowerCase()]
 if (action) { event.preventDefault(); action() }
}
onMounted(() => window.addEventListener('keydown', keyboard))
onUnmounted(() => { ++viewingGeneration; window.removeEventListener('keydown', keyboard) })
</script>
<template><section class="video-hub">
 <template v-if="!currentVideo">
  <h1 class="sr-only">{{ t('nav.watch') }}</h1>
  <div class="hub-toolbar">
   <StickySearchBar v-if="!sourceControl" ref="standaloneSource" compact :loading="loading" :maintenance="settings.maintenance" @analyze="startViewing" @search-results="searchResults" />
   <div class="category-pills" role="group" :aria-label="t('hub.categories')"><button :aria-pressed="!category" @click="category = ''">{{ t('hub.all') }}</button><button v-for="tag in categories" :key="tag" :aria-pressed="category === tag" @click="category = tag">{{ tag }}</button></div>
  </div>
  <div v-if="searchError" class="hub-feedback" role="status">{{ t('source.failed') }}</div>
  <div v-if="searched" class="feed-result-heading"><span>{{ searchError ? t('hub.curated') : t('explore.results') }}</span><button class="inline-link" @click="resetFeed">{{ t('hub.reset') }}</button></div>
  <div v-if="visibleVideos.length" class="feed-grid" :aria-label="t('hub.feed')"><FeedVideoCard v-for="video in visibleVideos" :key="video.videoId" :video="video" :disabled="loading || settings.maintenance" @select="selectVideo" /></div>
  <div v-else class="hub-no-results" role="status"><AppIcon name="search" /><p>{{ t('explore.noResults') }}</p><button class="button" @click="resetFeed">{{ t('hub.reset') }}</button></div>
 </template>
 <template v-else>
  <div class="analysis-heading"><h1>{{ t('watch.title') }}</h1><button class="button" @click="closeViewing"><AppIcon name="close" />{{ t('watch.back') }}</button></div>
  <div class="watch-layout">
   <div class="analysis-stage"><VideoPlayer :key="currentVideo.key" ref="player" :video-id="currentVideo.id" :target-language="currentVideo.targetLanguage" :stream-url="currentVideo.mode === 'live' || currentVideo.isCamera ? 'socket-relay' : ''" :live-video-url="currentVideo.url" :start-time="currentVideo.startTime" :auto-play="shouldAutoPlay" :characters="characters" :show-bounding-box="settings.showBoundingBox" :show-labels="settings.showLabels" :confidence-threshold="settings.confidenceThreshold" :is-maintenance="settings.maintenance" @toggle-bounding-box="settings.showBoundingBox = !settings.showBoundingBox" @close="closeViewing" @time-update="currentTime = $event" @ai-connected="connected = $event" @boxes-update="characters = $event" @error="notifications.notify" />
    <div class="viewing-status" role="status"><span class="status-dot" :class="{ connected }" aria-hidden="true" /><p>{{ connected ? t('watch.received') : t('watch.waiting') }}<small>{{ t('watch.pending') }}</small></p><RouterLink to="/performance" class="inline-link">{{ t('watch.service') }}</RouterLink></div>
   </div>
   <aside class="watch-guide" :aria-label="t('watch.guide')"><h2>{{ t('watch.guide') }}</h2>
    <details open><summary>{{ t('watch.characters') }}</summary><DetectionPanel :characters="characters" :ai-connected="connected" :current-time="currentTime" /></details>
    <details open><summary>{{ t('watch.dialogue') }}</summary><LiveTranscription :subtitles="syncedSubtitles" :current-time="currentTime" :queue-count="queueCount" /></details>
    <details><summary>{{ t('watch.context') }}</summary><div class="context-empty"><p>{{ t('watch.contextEmpty') }}</p><p>{{ t('watch.contextNote') }}</p><RouterLink to="/almanac" class="inline-link">{{ t('home.almanac') }} <span aria-hidden="true">→</span></RouterLink></div></details>
    <label for="guide-language" class="guide-language">{{ t('watch.language') }}<select id="guide-language" v-model="settings.targetLanguage" class="input"><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></label><p class="guide-language-note">{{ t('watch.languageNote') }}</p>
   </aside>
  </div>
 </template>
</section></template>
<style scoped>
.hub-toolbar { position: sticky; top: 0; z-index: 30; background: var(--canvas); padding: 12px 0 16px; }
.category-pills { display: flex; gap: 8px; overflow-x: auto; padding: 18px 30px 4px 2px; scroll-padding-inline: 30px; scrollbar-width: thin; mask-image: linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 22px), transparent 100%); }
.category-pills button { flex-shrink: 0; min-height: 38px; padding: 7px 14px; border-radius: 9px; background: var(--sidebar); color: var(--text); font-size: 13px; font-weight: 550; border: 1px solid transparent; }
.category-pills button:hover { background: var(--active); border-color: var(--primary); }.category-pills button[aria-pressed="true"] { background: var(--text); color: var(--panel); }
.feed-grid { display: grid; grid-template-columns: 1fr; gap: 22px 18px; padding-top: 10px; }
.hub-feedback { padding: 12px 0; color: var(--muted); font-size: 13px; }.feed-result-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 8px 0 16px; font-size: 13px; color: var(--muted); }.feed-result-heading button { min-height: 44px; }
.hub-no-results { display: grid; justify-items: center; gap: 16px; color: var(--muted); padding: 60px 16px; text-align: center; }.hub-no-results > svg { width: 32px; height: 32px; }
@media(min-width:640px) { .feed-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media(min-width:1200px) { .feed-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } }
@media(min-width:1600px) { .feed-grid { grid-template-columns: repeat(4,minmax(0,1fr)); } }
.watch-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(300px,360px); gap: 22px; align-items: start; }.watch-guide { min-width: 0; max-height: calc(100vh - 108px); overflow-y: auto; overscroll-behavior: contain; padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: #3A0F1DAA; scrollbar-width: thin; }.watch-guide > h2 { font-size: 18px; margin-bottom: 12px; }.watch-guide details { border-top: 1px solid var(--line); }.watch-guide summary { cursor: pointer; padding: 12px 0; min-height: 44px; font-size: 14px; color: var(--muted); }.watch-guide :deep(.surface) { background: transparent; border: 0; border-radius: 0; }.viewing-status { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; font-size: 13px; color: var(--muted); }.viewing-status .status-dot { margin-top: 0; }.viewing-status p { flex: 1; min-width: 150px; }.viewing-status small { display: none; }.context-empty { font-size: 13px; line-height: 1.65; padding: 8px 0 14px; }.context-empty p + p { display: none; }.guide-language { display: block; font-size: 13px; margin: 16px 0 8px; }.guide-language select { margin-top: 8px; }.guide-language-note { font-size: 12px; line-height: 1.6; color: var(--muted); }
@media(max-width:1199px) { .watch-layout { grid-template-columns: 1fr; }.watch-guide { max-width: none; max-height: 560px; } }
@media(max-width:639px) { .watch-layout { gap: 18px; }.watch-guide { padding: 16px; max-height: 480px; } }
</style>
