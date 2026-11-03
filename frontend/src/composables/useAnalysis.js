import { ref, computed, onScopeDispose } from 'vue'
import { api, apiError } from '@/services/api'
import { getYouTubeVideoId, parseTimeToSeconds, normalizeSubtitle } from '@/utils/video'
export function useAnalysis({ client = api, notify = () => {}, maintenance = false, createSocket = null, targetLanguage = () => 'id' } = {}) {
 const currentVideo = ref(null), shouldAutoPlay = ref(false), loading = ref(false), characters = ref([]), subtitles = ref([]), currentTime = ref(0), connected = ref(false)
 let controller = null, socket = null, generation = 0, disposed = false, sequence = 0, connecting = null, cleanup = null
 const subtitleLimit = 500
 const syncedSubtitles = computed(() => subtitles.value.filter(sub => sub.start_time <= currentTime.value + 1).map(sub => ({ ...sub, isCurrent: currentTime.value >= sub.start_time && currentTime.value <= sub.end_time, isNew: Date.now() - sub.receivedAt < 3000 })))
 const queueCount = computed(() => subtitles.value.filter(sub => sub.start_time > currentTime.value + 1).length)
 function reset() { characters.value = []; subtitles.value = []; currentTime.value = 0; connected.value = false; shouldAutoPlay.value = false }
 function receive(payload) {
  if (!currentVideo.value || !payload || (payload.videoUrl && payload.videoUrl !== currentVideo.value.url)) return
  if (payload.type === 'active_scene' && Array.isArray(payload.data)) characters.value = payload.data.slice(0, 100)
  if (payload.type === 'character' && payload.data?.name && !characters.value.some(char => char.name === payload.data.name)) characters.value = [payload.data, ...characters.value].slice(0, 100)
  if (payload.type === 'subtitle') {
   const subtitle = normalizeSubtitle(payload.data)
   if (subtitle && !subtitles.value.some(sub => sub.id === subtitle.id)) subtitles.value = [...subtitles.value, subtitle].sort((a,b) => a.start_time - b.start_time).slice(-subtitleLimit)
  }
 }
 async function connectResults() {
  if (socket || !createSocket) return
  if (!connecting) connecting = Promise.resolve().then(createSocket).then(next => {
   if (disposed) { next.disconnect(); return }
   socket = next
   socket.on('ai-result', receive)
  }).finally(() => { connecting = null })
  await connecting
 }
 function cleanupPrevious(previous) {
  if (previous && previous.mode !== 'live') {
   cleanup = (cleanup || Promise.resolve()).then(() => client.post('/api/stop-asr', {}, { timeout: 5000 })).catch(() => {
    if (!disposed) notify('Sesi ditutup di browser, tetapi penghentian ASR belum dapat dikonfirmasi.')
   })
  }
  return cleanup
 }
 async function start({ url, startTime = 0, mode = 'live' }) {
  if (maintenance) { notify('Analisis sedang dalam pemeliharaan. Silakan jelajahi galeri atau almanak.'); return }
  const cleanUrl = typeof url === 'string' ? url.trim() : ''
  const isCamera = /^camera:\/\/[0-9]+$/i.test(cleanUrl)
  const id = isCamera ? null : getYouTubeVideoId(cleanUrl)
  if (!id && !isCamera) { notify('Gunakan URL YouTube atau sumber kamera yang valid.'); return }
  let seconds
  try { seconds = parseTimeToSeconds(startTime) } catch (error) { notify(error.message); return }
  const token = ++generation
  const previous = currentVideo.value
  const stopping = cleanupPrevious(previous)
  controller?.abort(); controller = new AbortController()
  reset(); loading.value = true
  currentVideo.value = { id, url: url.trim(), mode, isCamera, startTime: seconds, targetLanguage: targetLanguage(), key: ++sequence }
  currentTime.value = seconds
  try {
   if (stopping) await stopping
   if (token !== generation || disposed) return
   await connectResults()
   if (token !== generation || disposed) return
   if (mode !== 'live') {
    const { data } = await client.post(mode === 'transcript' ? '/api/start-asr' : '/api/analyze', { videoUrl: url.trim(), startTime: seconds, targetLanguage: targetLanguage(), socketId: socket?.id }, { signal: controller.signal })
    if (data?.status !== 'success') throw new Error(data?.message || 'Analisis belum tersedia.')
   }
   if (token === generation && !disposed) shouldAutoPlay.value = true
  } catch (error) {
   if (token === generation && !disposed && error.code !== 'ERR_CANCELED') {
    notify(apiError(error, error.message || 'Layanan analisis belum tersedia.')); currentVideo.value = null; reset()
   }
  } finally { if (token === generation) loading.value = false }
 }
 async function close() {
  ++generation; controller?.abort(); controller = null
  const previous = currentVideo.value
  currentVideo.value = null; loading.value = false; reset()
  await cleanupPrevious(previous)
 }
 onScopeDispose(() => { disposed = true; close(); socket?.off('ai-result', receive); socket?.disconnect() })
 return { currentVideo, shouldAutoPlay, loading, characters, currentTime, connected, syncedSubtitles, queueCount, start, close, receive }
}
