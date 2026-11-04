<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api } from '@/services/api'
import { MAX_UTTERANCE_MS, shouldCutUtterance } from '@/utils/fohAudioTiming'
import { buildLanguageOutputUrl } from '@/utils/fohOutput'

const requestedKey = ref(''), streamKey = ref(''), uploadToken = ref(''), context = ref(''), outputs = ref({}), savedStreams = ref([])
const devices = ref([]), deviceId = ref(''), threshold = ref(0.035), level = ref(0), state = ref('idle'), error = ref(''), copied = ref('')
const outputLanguages = ['jawa', 'indonesia', 'inggris']
const outputLabels = { jawa: 'Jawa', indonesia: 'Indonesia', inggris: 'Inggris' }
const outputColors = ref({ jawa: 'yellow', indonesia: 'white', inggris: 'cyan' })
const base = computed(() => globalThis.location?.origin || '')
const jsonUrl = computed(() => `${base.value}/api/foh-stream/${streamKey.value}/latest`)
const outputLinks = computed(() => Object.fromEntries(outputLanguages.map(language => [language, buildLanguageOutputUrl(base.value, outputs.value[language]?.outputPath || `/foh-output/${streamKey.value}-${language}`, language, outputColors.value[language])])))
let mediaStream, recorder, audioContext, analyser, animation, chunks = [], activeSince = 0, silenceSince = 0, utteranceRmsSum = 0, utteranceRmsCount = 0, sendQueue = Promise.resolve(), sessionInvalidated = false, captureGeneration = 0
const active = computed(() => Boolean(uploadToken.value))

async function refreshDevices() {
 try {
  const all = await navigator.mediaDevices.enumerateDevices()
  devices.value = all.filter(item => item.kind === 'audioinput')
  if (!deviceId.value) deviceId.value = devices.value[0]?.deviceId || ''
 } catch { error.value = 'Browser tidak dapat membaca daftar input audio.' }
}
async function createSession() {
 error.value = ''
 try {
  const { data } = await api.post('/api/foh-stream/session', { streamKey: requestedKey.value.trim().toLowerCase() })
  activateSession(data)
  requestedKey.value = ''
 } catch (cause) { error.value = cause.response?.data?.error || 'Gagal membuat sesi FOH.' }
}
function activateSession(data) {
 streamKey.value = data.streamKey
 uploadToken.value = data.uploadToken
 outputs.value = data.outputs || {}
 sessionInvalidated = false
 sendQueue = Promise.resolve()
}
async function loadStreams(recoverActive = false) {
 try {
  const { data } = await api.get('/api/foh-streams')
  savedStreams.value = data.streams || []
  const recoverable = recoverActive ? savedStreams.value.find(stream => stream.status === 'active') : null
  if (recoverable) await resumeStream(recoverable.streamKey)
 } catch (cause) { error.value = cause.response?.data?.error || 'Tidak dapat memuat stream akun.' }
}
async function resumeStream(key) {
 error.value = ''
 try {
  const { data } = await api.post(`/api/foh-stream/${encodeURIComponent(key)}/resume`)
  activateSession(data)
 } catch (cause) { error.value = cause.response?.data?.error || 'Gagal memulihkan stream.' }
}
async function startAudio() {
 if (state.value !== 'idle') return
 error.value = ''
 state.value = 'starting'
 const generation = captureGeneration
 try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId.value ? { exact: deviceId.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  if (generation !== captureGeneration) { stream.getTracks().forEach(track => track.stop()); return }
  mediaStream = stream
  await refreshDevices()
  if (generation !== captureGeneration) return
  audioContext = new AudioContext()
  const source = audioContext.createMediaStreamSource(mediaStream)
  analyser = audioContext.createAnalyser(); analyser.fftSize = 1024; source.connect(analyser)
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
  recorder = null
  state.value = 'listening'
  const samples = new Uint8Array(analyser.fftSize)
  const tick = () => {
   if (!analyser) return
   analyser.getByteTimeDomainData(samples)
   let sum = 0
   for (const value of samples) { const delta = (value - 128) / 128; sum += delta * delta }
   const rms = Math.sqrt(sum / samples.length)
   level.value = Math.min(1, rms * 5)
   const now = performance.now()
   if (rms >= Number(threshold.value)) {
    if (!activeSince) {
     activeSince = now; chunks = []; utteranceRmsSum = 0; utteranceRmsCount = 0
     recorder = new MediaRecorder(mediaStream, { mimeType, audioBitsPerSecond: 64000 })
     recorder.ondataavailable = event => { if (generation === captureGeneration && event.data.size) chunks.push(event.data) }
     recorder.start(100)
     state.value = 'speaking'
    }
    silenceSince = 0
    if (activeSince) { utteranceRmsSum += rms; utteranceRmsCount++ }
    if (shouldCutUtterance(now - activeSince)) sendChunk()
   } else if (activeSince) {
    if (!silenceSince) silenceSince = now
    if (now - silenceSince >= 700) sendChunk()
   }
   animation = requestAnimationFrame(tick)
  }
  tick()
 } catch (cause) { if (generation === captureGeneration) { error.value = cause.message || 'Tidak dapat membuka input audio.'; stopAudio() } }
}
async function sendChunk() {
 if (sessionInvalidated || !recorder || !activeSince) return
 const duration = performance.now() - activeSince
 if (duration < 200) { activeSince = 0; silenceSince = 0; chunks = []; utteranceRmsSum = 0; utteranceRmsCount = 0; state.value = 'listening'; return }
 const currentRecorder = recorder
 const generation = captureGeneration
 recorder = null
 const stopped = new Promise(resolve => currentRecorder.addEventListener('stop', resolve, { once: true }))
 currentRecorder.stop(); await stopped
 if (generation !== captureGeneration) return
 const mime = currentRecorder.mimeType.split(';')[0] || 'audio/webm'
 const blob = new Blob(chunks, { type: mime })
 const key = streamKey.value, token = uploadToken.value, lakon = context.value, rms = utteranceRmsCount ? utteranceRmsSum / utteranceRmsCount : 0
 activeSince = 0; silenceSince = 0; chunks = []; utteranceRmsSum = 0; utteranceRmsCount = 0; state.value = 'sending'
 sendQueue = sendQueue.then(() => {
  if (sessionInvalidated || generation !== captureGeneration) return null
  return api.post(`/api/foh-stream/${encodeURIComponent(key)}/audio`, blob, { headers: { 'Content-Type': mime, 'x-foh-token': token, 'x-foh-context': lakon, 'x-foh-rms': String(rms) } })
 })
 sendQueue = sendQueue.catch(cause => {
  if (cause.response?.status === 401) {
   sessionInvalidated = true
   stopAudio()
   uploadToken.value = ''
   streamKey.value = ''
   error.value = 'Sesi FOH sudah tidak berlaku. Buat sesi baru.'
  } else error.value = cause.response?.data?.error || 'Upload/transkripsi audio gagal.'
 }).finally(() => { if (generation === captureGeneration && mediaStream) state.value = activeSince ? 'speaking' : 'listening' })
}
function stopAudio() {
 captureGeneration++
 cancelAnimationFrame(animation); animation = null
 if (recorder && recorder.state !== 'inactive') recorder.stop()
 recorder = null
 mediaStream?.getTracks().forEach(track => track.stop()); mediaStream = null
 audioContext?.close(); audioContext = null; analyser = null; activeSince = 0; silenceSince = 0; utteranceRmsSum = 0; utteranceRmsCount = 0; level.value = 0
 if (state.value !== 'idle') state.value = 'idle'
}
async function endSession() {
 const endingKey = streamKey.value, endingToken = uploadToken.value
 sessionInvalidated = true
 stopAudio()
 await sendQueue.catch(() => {})
 try { await api.delete(`/api/foh-stream/${encodeURIComponent(endingKey)}/session`, { headers: { 'x-foh-token': endingToken } }) }
 catch { error.value = 'Sesi ditutup di browser, tetapi token server belum dapat dicabut.' }
 uploadToken.value = ''; streamKey.value = ''; outputs.value = {}
 await loadStreams()
}
async function copyLink(kind, value) {
 try { await navigator.clipboard.writeText(value); copied.value = kind; setTimeout(() => copied.value = '', 1500) }
 catch { error.value = 'Clipboard tidak tersedia. Salin URL dari kolom.' }
}
onMounted(async () => { await Promise.all([refreshDevices(), loadStreams(true)]) })
onUnmounted(stopAudio)
</script>

<template>
 <section class="foh-admin-page">
  <header class="page-heading"><p class="eyebrow">FOH BROADCAST</p><h1>Subtitle <span>panggung</span></h1><p>Audio mixer masuk, subtitle tiga bahasa keluar ke overlay operator.</p></header>
  <div v-if="!active" class="surface foh-setup">
   <h2>Stream akun</h2>
   <form @submit.prevent="createSession"><label class="foh-field">Buat stream key<input v-model="requestedKey" class="input" maxlength="48" pattern="[a-z0-9][a-z0-9-]{2,47}" placeholder="contoh: tmii-nov4" required /></label><button class="button" type="submit">Buat stream</button></form>
   <div v-if="savedStreams.length" class="foh-saved-streams"><h3>Stream tersimpan</h3><button v-for="saved in savedStreams" :key="saved.streamKey" class="button" type="button" @click="resumeStream(saved.streamKey)"><span>{{ saved.streamKey }}</span><small>{{ saved.status === 'active' ? 'Pulihkan sesi' : 'Lanjutkan stream' }}</small></button></div>
  </div>
  <template v-else>
   <div class="foh-toolbar"><div><span class="status-dot connected" /> SIARAN AKTIF <code>{{ streamKey }}</code></div><button class="button" @click="endSession">Akhiri sesi</button></div>
   <section class="surface foh-section"><div class="section-heading"><div><h2>Output per bahasa</h2><p>Satu input dan satu hit Gemini diproyeksikan menjadi tiga stream key publik. Pilih warna teks untuk masing-masing output.</p></div></div>
    <div class="foh-language-links"><article v-for="language in outputLanguages" :key="language" class="foh-language-card"><div class="foh-language-card-heading"><strong>{{ outputLabels[language] }}</strong><code>{{ outputs[language]?.streamKey }}</code></div><label class="foh-field">Warna teks<select v-model="outputColors[language]" class="input"><option value="white">Putih</option><option value="yellow">Kuning</option><option value="cyan">Cyan</option><option value="lime">Hijau</option><option value="red">Merah</option><option value="orange">Oranye</option><option value="pink">Pink</option></select></label><input class="input" readonly :value="outputLinks[language]" /><button class="button" @click="copyLink(language, outputLinks[language])">{{ copied === language ? 'Tersalin' : 'Copy link' }}</button></article></div>
    <label class="foh-field">Raw JSON gabungan<input class="input" readonly :value="jsonUrl" /><button class="button" @click="copyLink('json', jsonUrl)">{{ copied === 'json' ? 'Tersalin' : 'Copy link' }}</button></label>
   </section>
   <section class="surface foh-section"><div class="section-heading"><div><h2>Input audio</h2><p>Browser tidak menerapkan echo cancellation, noise suppression, atau auto gain.</p></div><span class="foh-state">{{ state }}</span></div>
    <label class="foh-field">Perangkat input<select v-model="deviceId" class="input"><option v-for="device in devices" :key="device.deviceId" :value="device.deviceId">{{ device.label || `Audio input ${device.deviceId.slice(0, 6)}` }}</option></select></label>
    <div class="foh-meter"><span :style="{ width: `${level * 100}%` }" /></div>
    <label class="setting-range"><span>VAD threshold <output>{{ Number(threshold).toFixed(3) }}</output></span><input v-model="threshold" type="range" min="0.005" max="0.15" step="0.005" /><small>Chunk dikirim setelah hening 700 ms atau maksimal {{ MAX_UTTERANCE_MS / 1000 }} detik bicara.</small></label>
    <label class="foh-field">Konteks lakon & tokoh<textarea v-model="context" class="input" maxlength="2000" rows="3" placeholder="Contoh: Lakon Ramayana; Rama, Sinta, Rahwana…" /></label>
    <div class="foh-actions"><button class="button" :disabled="state !== 'idle'" @click="startAudio">Mulai tangkap audio</button><button class="button" :disabled="state === 'idle'" @click="stopAudio">Stop audio</button></div>
   </section>
  </template>
  <p v-if="error" class="foh-error" role="alert">{{ error }}</p>
 </section>
</template>
