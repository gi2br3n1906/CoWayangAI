<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/services/api'
import { auth } from '@/firebase'

const props = defineProps({ streamKey: { type: String, required: true }, uploadToken: { type: String, required: true }, selectedModel: { type: String, required: true }, scriptCursor: { type: Object, default: null }, subtitleMode: { type: String, default: 'legacy' } })
const emit = defineEmits(['cursorChanged'])
const indexText = ref(''), cueId = ref(''), audioFile = ref(null), error = ref(''), result = ref(null), pending = ref(false), scriptChoices = ref([])
const config = ref({ lookBehind: 1, lookAhead: 2, boundarySize: 1, nextActSize: 1, minScore: 0.7, minMargin: 0.2 })
const selectedAct = ref(null)
const index = computed(() => {
  try {
    const value = JSON.parse(indexText.value)
    if (!value || typeof value.id !== 'string' || !value.id.trim() || typeof value.revision !== 'string' || !value.revision.trim() || !Array.isArray(value.cues) || !value.cues.length) return null
    let act = 0, page = 0
    const ids = new Set(), kinds = ['dialog', 'sulukan', 'ada-ada', 'janturan', 'pocapan', 'other']
    for (const [i, cue] of value.cues.entries()) {
      if (!cue || typeof cue.id !== 'string' || !cue.id.trim() || ids.has(cue.id) || cue.order !== i + 1 || !Number.isSafeInteger(cue.act) || cue.act < 1 || cue.act < act || cue.act > act + 1 || !kinds.includes(cue.kind) || typeof cue.text !== 'string' || !cue.text.trim() || !Number.isSafeInteger(cue.page) || cue.page < 1 || cue.page < page) return null
      ids.add(cue.id); act = cue.act; page = cue.page
    }
    return value
  } catch { return null }
})
const acts = computed(() => {
  if (!index.value) return []
  const grouped = new Map()
  for (const cue of index.value.cues) {
    if (!grouped.has(cue.act)) grouped.set(cue.act, [])
    grouped.get(cue.act).push(cue)
  }
  return [...grouped].map(([act, cues]) => ({ act, cues, first: cues[0], last: cues[cues.length - 1], rawText: cues.map(cue => cue.text).join('') }))
})
const activeAct = computed(() => acts.value.find(item => item.act === selectedAct.value) || null)
const cursorMatches = computed(() => {
  const c = props.scriptCursor
  return Boolean(index.value && c && c.scriptId === index.value.id && c.scriptRevision === index.value.revision && Number.isSafeInteger(c.revision) && c.revision >= 0 && ['auto', 'manual'].includes(c.mode) && index.value.cues.some(cue => cue.id === c.cueId && cue.act === c.act))
})
let generation = 0, controller = null
watch([index, () => props.scriptCursor], () => {
  cueId.value = cursorMatches.value ? '__cursor__' : index.value?.cues[0]?.id || ''
  selectedAct.value = cursorMatches.value ? props.scriptCursor.act : acts.value[0]?.act ?? null
  result.value = null
}, { immediate: true })
watch(() => [props.streamKey, props.uploadToken], async ([streamKey, uploadToken]) => {
  scriptChoices.value = []
  if (!streamKey || !uploadToken) return
  const responseGeneration = generation
  try {
    if (!auth.currentUser) return
    const idToken = await auth.currentUser.getIdToken()
    if (generation !== responseGeneration || props.streamKey !== streamKey || props.uploadToken !== uploadToken) return
    const { data } = await api.get('/api/foh-scripts', { headers: { Authorization: `Bearer ${idToken}` } })
    if (generation === responseGeneration && props.streamKey === streamKey && props.uploadToken === uploadToken) scriptChoices.value = data.scripts || []
  } catch { /* Keep manual file loading available if the catalog is unavailable. */ }
}, { immediate: true })
function invalidate() { generation++; controller?.abort(); result.value = null }
watch([indexText, audioFile, cueId, config, () => props.streamKey, () => props.uploadToken, () => props.selectedModel, () => props.scriptCursor], invalidate, { deep: true, flush: 'sync' })
onBeforeUnmount(invalidate)
function loadIndex(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 1024 * 1024) { error.value = 'Indeks naskah maksimal 1 MB.'; return }
  invalidate()
  const currentGeneration = generation
  const reader = new FileReader()
  reader.onload = () => { if (generation === currentGeneration) indexText.value = String(reader.result) }
  reader.onerror = () => { if (generation === currentGeneration) error.value = 'Indeks naskah tidak dapat dibaca.' }
  reader.readAsText(file, 'utf-8')
}
async function loadCatalogScript(id) {
  if (!id) return
  error.value = ''
  try {
    if (!auth.currentUser) throw new Error('Authentication required')
    const idToken = await auth.currentUser.getIdToken()
    const { data } = await api.get(`/api/foh-scripts/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${idToken}` } })
    indexText.value = JSON.stringify(data, null, 2)
  } catch (e) { error.value = e?.response?.data?.error || 'Naskah tidak dapat dimuat.' }
}
function selectAct(act) {
  const group = acts.value.find(item => item.act === act)
  if (!group) return
  selectedAct.value = act
  cueId.value = group.first.id
  error.value = ''
}
function selectCue(id) {
  cueId.value = id
  const cue = index.value?.cues.find(item => item.id === id)
  if (cue) selectedAct.value = cue.act
}
function readAudio(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read audio file.'))
    reader.onabort = () => reject(new Error('Audio file reading was aborted.'))
    reader.readAsDataURL(file)
  })
}
async function setCursorMode(mode) {
  if (pending.value || !index.value || !props.scriptCursor) return
  error.value = ''; pending.value = true
  try {
    if (!auth.currentUser) throw new Error('Authentication required')
    const idToken = await auth.currentUser.getIdToken()
    const { data } = await api.post(`/api/foh-stream/${encodeURIComponent(props.streamKey)}/script-position`, { index: index.value, expectedRevision: props.scriptCursor.revision, action: 'mode', mode }, { headers: { 'x-foh-token': props.uploadToken, Authorization: `Bearer ${idToken}` } })
    emit('cursorChanged', data.cursor)
  } catch (e) { error.value = e?.response?.data?.error || e?.message || 'Gagal mengubah kontrol posisi.' }
  finally { pending.value = false }
}
async function preview() {
  if (pending.value) return
  error.value = ''; result.value = null
  if (!index.value) { error.value = 'Load a valid reviewed script index.'; return }
  if (!props.streamKey || !props.uploadToken || !props.selectedModel) { error.value = 'Stream, upload token and model are required.'; return }
  const cue = index.value.cues.find(item => item.id === cueId.value)
  const cursor = cueId.value === '__cursor__' && cursorMatches.value ? { ...props.scriptCursor, mode: 'auto' } : cue ? { scriptId: index.value.id, scriptRevision: index.value.revision, revision: 0, act: cue.act, cueId: cue.id, mode: 'auto' } : null
  if (!cursor) { error.value = 'Select a valid cue.'; return }
  const file = audioFile.value
  const mime = { webm: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav' }[file?.name.split('.').pop().toLowerCase()]
  if (!file || !mime || !file.size) { error.value = 'Choose a nonempty .webm, .ogg or .wav audio file.'; return }
  if (file.size < 128) { error.value = 'Audio minimal 128 byte.'; return }
  if (file.size > 8 * 1024 * 1024) { error.value = 'Audio must be at most 8 MB.'; return }
  const settings = { ...config.value }
  if (['lookBehind', 'lookAhead', 'boundarySize', 'nextActSize'].some(key => !Number.isSafeInteger(settings[key]) || settings[key] < 0) || ['minScore', 'minMargin'].some(key => !Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1)) { error.value = 'Window sizes must be nonnegative integers and thresholds must be between 0 and 1.'; return }
  pending.value = true
  const requestGeneration = generation
  controller = new AbortController()
  try {
    if (!auth.currentUser) throw new Error('Authentication required')
    const idToken = await auth.currentUser.getIdToken()
    if (generation !== requestGeneration) return
    const audioBase64 = await readAudio(file)
    if (generation !== requestGeneration) return
    const { data } = await api.post(`/api/foh-stream/${encodeURIComponent(props.streamKey)}/script-preview`, { index: index.value, cursor, config: settings, audioBase64, mimeType: mime, model: props.selectedModel }, { headers: { 'x-foh-token': props.uploadToken, Authorization: `Bearer ${idToken}` }, timeout: 45000, signal: controller.signal })
    if (generation === requestGeneration) result.value = data
  } catch (e) {
    if (generation !== requestGeneration) return
    const serverMessage = e?.response?.data?.error || e?.response?.data?.message
    const message = typeof serverMessage === 'string' ? serverMessage : e?.message || 'Preview failed.'
    error.value = props.uploadToken ? message.split(props.uploadToken).join('[redacted]') : message
  } finally { pending.value = false; controller = null }
}
async function savePosition(action = 'seek') {
  if (pending.value || !index.value) return
  const selected = cueId.value === '__cursor__' && cursorMatches.value ? props.scriptCursor.cueId : cueId.value
  if (!index.value.cues.some(cue => cue.id === selected)) { error.value = 'Pilih cue yang valid.'; return }
  if (action === 'replace' && !globalThis.confirm('Ganti naskah dan posisi tersimpan untuk stream ini?')) return
  if (action !== 'replace' && props.scriptCursor && !cursorMatches.value) { error.value = 'Indeks berbeda dengan posisi tersimpan.'; return }
  error.value = ''; pending.value = true
  const requestGeneration = generation
  controller = new AbortController()
  try {
    if (!auth.currentUser) throw new Error('Authentication required')
    const idToken = await auth.currentUser.getIdToken()
    if (generation !== requestGeneration) return
    const { data } = await api.post(`/api/foh-stream/${encodeURIComponent(props.streamKey)}/script-position`, { index: index.value, expectedRevision: props.scriptCursor?.revision ?? 0, action, cueId: selected }, { headers: { 'x-foh-token': props.uploadToken, Authorization: `Bearer ${idToken}` }, signal: controller.signal })
    if (generation === requestGeneration) emit('cursorChanged', data.cursor)
  } catch (e) {
    if (generation !== requestGeneration) return
    if (e?.response?.status === 409) {
      try {
        const { data } = await api.get(`/api/foh-stream/${encodeURIComponent(props.streamKey)}/script-position`, { headers: { 'x-foh-token': props.uploadToken }, signal: controller.signal })
        if (generation !== requestGeneration) return
        emit('cursorChanged', data.cursor)
        error.value = 'Posisi diperbarui dari server. Periksa posisi atau versi naskah sebelum mencoba lagi.'
        return
      } catch { if (generation !== requestGeneration) return }
    }
    const message = e?.response?.data?.error || e?.message || 'Posisi gagal disimpan.'
    error.value = props.uploadToken ? String(message).split(props.uploadToken).join('[redacted]') : String(message)
  } finally { pending.value = false; controller = null }
}
</script>
<template>
 <section class="surface script-preview">
 <h2>Shadow script preview</h2>
 <p>Preview only: not on-air; hasil preview tidak menyimpan posisi. Audio is sent only when you click Preview. Posisi manual hanya disimpan saat menekan tombol simpan.</p>
 <label v-if="scriptChoices.length">Naskah tersedia<select data-test="script-catalog" @change="loadCatalogScript($event.target.value)"><option value="">Pilih naskah</option><option v-for="script in scriptChoices" :key="script.id" :value="script.id">{{ script.title }} · {{ script.cueCount }} cue</option></select></label>
  <form @submit.prevent="preview">
   <fieldset :disabled="pending">
    <label>File indeks naskah (.json)<input data-test="index-file" type="file" accept=".json,application/json" @change="loadIndex"></label>
    <label>Script index JSON<textarea v-model="indexText" data-test="index" rows="5" /></label>
    <p v-if="!index" role="status">Load a valid script index to preview.</p>
    <p v-if="index?.reviewRequired || index?.cues.some(cue => cue.reviewRequired)" role="status">Cue diambil dari teks dokumen. Pembagian babak dan konteks masih sementara; cocokkan saat tes dan koreksi posisi manual bila meleset.</p>
    <p v-if="index && scriptCursor && !cursorMatches" role="status">Saved cursor does not match this index; choose a cue for this preview.</p>
    <div v-if="index" class="act-picker" data-test="act-picker">
     <span>Babak</span>
     <div class="act-buttons"><button v-for="group in acts" :key="group.act" :data-test="`act-button-${group.act}`" type="button" :aria-pressed="selectedAct === group.act" @click="selectAct(group.act)">Babak {{ group.act }}</button></div>
     <section v-if="activeAct" class="act-source" :data-test="`act-panel-${activeAct.act}`">
      <strong>Babak {{ activeAct.act }}</strong>
      <p data-test="act-range">Cue {{ activeAct.first.id }} → {{ activeAct.last.id }} · hlm. {{ activeAct.first.page }}<template v-if="activeAct.last.page !== activeAct.first.page">–{{ activeAct.last.page }}</template></p>
      <pre data-test="act-raw-text">{{ activeAct.rawText }}</pre>
     </section>
    </div>
    <label v-if="index">Starting cue<select :value="cueId" data-test="cue" @change="selectCue($event.target.value)"><option v-if="cursorMatches" value="__cursor__">Use matching saved cursor ({{ scriptCursor.cueId }})</option><option v-for="cue in index.cues" :key="cue.id" :value="cue.id">Act {{ cue.act }} · {{ cue.id }} · page {{ cue.page }}</option></select></label>
    <button v-if="index" data-test="save-position" type="button" @click="savePosition('seek')">Simpan posisi manual</button>
    <button v-if="index && scriptCursor" data-test="replace-script" type="button" @click="savePosition('replace')">Ganti naskah dan simpan posisi</button>
    <button v-if="index && scriptCursor && subtitleMode === 'script'" data-test="cursor-mode" type="button" @click="setCursorMode(scriptCursor.mode === 'auto' ? 'manual' : 'auto')">{{ scriptCursor.mode === 'auto' ? 'Ambil alih posisi manual' : 'Lanjutkan posisi otomatis' }}</button>
    <label>Local audio (.webm, .ogg, .wav; max 8 MB)<input data-test="audio" type="file" accept=".webm,.ogg,.wav,audio/webm,audio/ogg,audio/wav" @change="audioFile = $event.target.files[0] || null"></label>
    <fieldset class="settings"><legend>Matching controls (uncalibrated)</legend>
     <label v-for="key in ['lookBehind', 'lookAhead', 'boundarySize', 'nextActSize']" :key="key">{{ key }}<input v-model.number="config[key]" :data-test="key" type="number" min="0" step="1"></label>
     <label v-for="key in ['minScore', 'minMargin']" :key="key">{{ key }}<input v-model.number="config[key]" :data-test="key" type="number" min="0" max="1" step="0.01"></label>
    </fieldset>
    <button type="submit">Preview</button>
   </fieldset>
  </form>
  <p v-if="pending" role="status">Previewing…</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <div v-if="result" role="status"><h3>Preview result: {{ result.status }}</h3><p v-if="result.cue">Candidate: {{ result.cue.id }} — {{ result.cue.text }}</p><div v-if="result.subtitle"><p v-for="(text, language) in result.subtitle" :key="language">{{ language }}: {{ text }}</p></div></div>
 </section>
</template>
<style scoped>
.script-preview { padding: 16px; display: grid; gap: 12px; }.script-preview form, .script-preview fieldset { display: grid; gap: 12px; }.script-preview fieldset { border: 0; padding: 0; min-width: 0; }.script-preview label, .act-picker { display: grid; gap: 5px; }.act-buttons { display: flex; flex-wrap: wrap; gap: 8px; }.act-buttons button[aria-pressed="true"] { border-color: var(--accent); }.act-source { min-width: 0; }.act-source p { color: var(--muted-foreground); }.act-source pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }.script-preview textarea, .script-preview input, .script-preview select { width: 100%; }.settings { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }.script-preview p { overflow-wrap: anywhere; }
</style>
