<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { api, apiError } from '@/services/api'
import { getYouTubeVideoId } from '@/utils/video'
import AppIcon from './AppIcon.vue'
import { useProductText } from '@/i18n/product'
const { t } = useProductText()
const props = defineProps({ loading: Boolean, maintenance: Boolean, compact: Boolean })
const emit = defineEmits(['search-results', 'live-stream', 'analyze'])
const inputMode = ref('search'), searchQuery = ref(''), liveUrl = ref(''), searchLoading = ref(false), startTime = ref('0'), mode = ref('live'), validation = ref('')
let controller = null, sequence = 0, disposed = false, pasting = false
async function handleSearch() {
 if (!searchQuery.value.trim()) return
 const token = ++sequence; controller?.abort(); controller = new AbortController(); searchLoading.value = true; validation.value = ''
 try {
  const { data } = await api.get('/api/search-youtube', { params: { q: searchQuery.value.trim() }, signal: controller.signal })
  if (token !== sequence) return
  emit('search-results', { videos: data.status === 'success' && Array.isArray(data.videos) ? data.videos : [], error: data.status === 'success' ? '' : data.message || t('source.failed') })
 } catch (error) { if (token === sequence && error.code !== 'ERR_CANCELED') emit('search-results', { videos: [], error: apiError(error, t('source.failed')) }) }
 finally { if (token === sequence) searchLoading.value = false }
}
function handleStart() {
 if (props.loading || props.maintenance) return
 if (!getYouTubeVideoId(liveUrl.value)) { validation.value = 'source.invalid'; return }
 validation.value = ''
 emit('analyze', { url: liveUrl.value, startTime: startTime.value, mode: mode.value })
}
function setVideoUrl(url) { liveUrl.value = url; inputMode.value = 'live'; validation.value = '' }
function searchFor(query) { searchQuery.value = query; inputMode.value = 'search'; handleSearch() }
async function pasteUrl() {
 if (pasting || props.loading || props.maintenance) return
 pasting = true
 inputMode.value = 'live'; validation.value = ''
 try {
  const text = await navigator.clipboard.readText()
  if (disposed) return
  if (text.trim()) liveUrl.value = text.trim()
  if (getYouTubeVideoId(liveUrl.value)) handleStart()
 } catch { /* Clipboard access is optional; keep the manual URL input. */ }
 finally { pasting = false }
 if (disposed) return
 await nextTick(); document.getElementById('video-url')?.focus()
}
function focusSearch(event) {
 if (!props.compact || event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('.account-modal') || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
 event.preventDefault(); inputMode.value = 'search'; nextTick(() => document.getElementById('video-search')?.focus())
}
onMounted(() => window.addEventListener('keydown', focusSearch))
defineExpose({ setVideoUrl, searchFor, pasteUrl, resetLiveLoading() {} })
onUnmounted(() => { disposed = true; ++sequence; controller?.abort(); window.removeEventListener('keydown', focusSearch) })
</script>
<template>
 <section id="choose-source" class="source-panel" :class="{ 'hub-source': compact }" :aria-label="t('source.title')">
  <div v-if="!compact" class="source-heading"><h2 id="source-heading">{{ t('source.title') }}</h2><p>{{ t('source.description') }}</p></div>
  <div v-if="!compact" class="source-modes" role="group" :aria-label="t('source.group')">
   <button :aria-pressed="inputMode === 'search'" :class="{ selected: inputMode === 'search' }" @click="inputMode = 'search'"><AppIcon name="search" /><span>{{ t('source.searchMode') }}</span></button>
   <button :aria-pressed="inputMode === 'live'" :class="{ selected: inputMode === 'live' }" @click="inputMode = 'live'"><AppIcon name="stream" /><span>{{ t('source.urlMode') }}</span></button>
  </div>
  <div v-if="inputMode === 'search'" class="source-form">
   <div class="source-field"><label for="video-search" :class="{ 'sr-only': compact }">{{ t('source.searchLabel') }}</label><AppIcon v-if="compact" class="hub-search-icon" name="search" /><input id="video-search" v-model="searchQuery" class="input" type="search" :placeholder="compact ? t('hub.navSearch') : t('source.placeholder')" @keyup.enter="handleSearch" /></div>
   <button class="button button-primary search-submit" type="submit" :aria-label="t('source.search')" :disabled="!searchQuery.trim() || searchLoading" @click="handleSearch"><AppIcon name="search" /><span class="search-submit-label">{{ searchLoading ? t('source.searching') : t('source.search') }}</span></button>
  </div>
  <template v-else>
   <div class="source-form">
    <div class="source-field"><label for="video-url">{{ t('source.urlLabel') }}</label><input id="video-url" v-model="liveUrl" class="input" type="url" placeholder="https://www.youtube.com/watch?v=…" :aria-invalid="validation ? true : undefined" :aria-describedby="validation ? 'source-validation' : undefined" @keyup.enter="handleStart" /></div>
    <button class="button button-primary" type="submit" :aria-label="loading ? t('source.loading') : t('source.watch')" :disabled="loading || maintenance" @click="handleStart"><span class="watch-submit-label">{{ loading ? t('source.loading') : t('source.watch') }}</span><AppIcon name="arrow" /></button>
   </div>
   <details class="source-details"><summary>{{ t('source.options') }}</summary><div class="source-options">
    <label for="analysis-mode">{{ t('source.mode') }}<select id="analysis-mode" v-model="mode" class="input"><option value="live">{{ t('source.live') }}</option><option value="analysis">{{ t('source.analysis') }}</option><option value="transcript">{{ t('source.transcript') }}</option></select></label>
    <label for="start-time">{{ t('source.start') }}<input id="start-time" v-model="startTime" class="input" placeholder="HH:MM:SS" /><small>{{ t('source.timeHelp') }}</small></label>
   </div></details>
  </template>
  <button v-if="compact" class="button paste-url" type="button" :disabled="loading || maintenance" @click="pasteUrl"><AppIcon name="stream" />{{ t('hub.paste') }}</button>
  <button v-if="compact && inputMode === 'live'" class="inline-link return-search" type="button" @click="inputMode = 'search'">{{ t('source.searchMode') }}</button>
  <p v-if="validation" id="source-validation" class="source-note validation-note" role="alert">{{ t(validation) }}</p>
  <p v-else-if="!compact || maintenance" class="source-note">{{ maintenance ? t('source.maintenance') : t('source.note') }}</p>
 </section>
</template>
<style scoped>
.source-panel { padding: 24px 0; border-block: 1px solid var(--line); }
.source-heading { margin-bottom: 16px; }.source-heading h2 { font-size: 22px; font-weight: 500; }.source-heading p { margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.65; }
.source-modes { display: inline-flex; max-width: 100%; gap: 8px; margin-bottom: 18px; }.source-modes button { min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 14px; border-radius: 8px; border: 1px solid var(--line); color: var(--muted); font-size: 14px; }.source-modes svg { width: 17px; height: 17px; flex-shrink: 0; }.source-modes .selected { color: var(--cream); border-color: var(--brass); background: rgba(215,186,137,.06); }
.source-modes button { background: var(--panel); border-color: var(--control-border); }.source-modes button:hover { background: var(--sidebar); color: var(--gold); }.source-modes .selected { background: var(--active); color: var(--gold); border-color: var(--gold); font-weight: 600; }
.source-form { display: flex; align-items: flex-end; gap: 12px; }.source-field { min-width: 0; flex: 1; }.source-field label,.source-options label { display: block; font-size: 14px; color: var(--latte); }.source-field .input { margin-top: 8px; }.source-form .button { flex-shrink: 0; min-height: 48px; }
.source-details { margin-top: 16px; }summary { cursor: pointer; padding: 12px 0; font-size: 14px; color: var(--latte); }.source-options { display: grid; grid-template-columns: minmax(0,1fr) 180px; gap: 16px; margin: 12px 0; }.source-options .input { margin-top: 9px; }.source-options small { display: block; font-size: 13px; margin-top: 7px; color: var(--muted); }.source-note { color: var(--muted); font-size: 13px; line-height: 1.7; margin-top: 16px; }.validation-note { color: var(--cream); }
@media(max-width:639px) { .source-modes { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); width: 100%; }.source-modes button { padding-inline: 8px; font-size: 13px; }.source-form { flex-direction: column; align-items: stretch; }.source-options { grid-template-columns: 1fr; } }
@media(max-width:359px) { .source-modes svg { display: none; } }
.hub-source { position: relative; border: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.hub-source .source-form { flex: 1; min-width: 0; align-items: center; }
.hub-source .source-field { position: relative; }
.hub-source .source-field .input { margin: 0; border-radius: 999px; min-height: 48px; }
.hub-source #video-search { padding-left: 44px; }
.hub-search-icon { position: absolute; left: 16px; top: 15px; width: 18px; height: 18px; color: var(--muted); pointer-events: none; }
.hub-source .source-form .button,.hub-source .paste-url { border-radius: 999px; min-height: 48px; }
.hub-source .search-submit { display: inline-flex; }.hub-source .search-submit svg { width: 19px; height: 19px; }.hub-source .search-submit-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.hub-source .source-details,.hub-source .source-note { width: 100%; margin: 0; }
.return-search { min-height: 44px; }
@media(max-width:639px) { .hub-source { gap: 8px; }.hub-source .source-form { flex-direction: row; width: 100%; flex-basis: 100%; gap: 8px; }.hub-source .source-form .button { padding-inline: 14px; }.hub-source .search-submit { flex: 0 0 44px; width: 44px; padding: 0; }.hub-source .paste-url { min-height: 40px; }.hub-source #video-search { font-size: 13px; } }
@media(min-width:700px) { .hub-source .paste-url { display: none; } }
</style>
