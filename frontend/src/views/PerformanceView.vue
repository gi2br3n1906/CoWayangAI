<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '@/services/api'
const status = ref(null), loading = ref(true), error = ref(''), latency = ref(null), updated = ref(null)
let timer = null, controller = null, disposed = false
async function refresh() {
 if (controller || disposed) return
 controller = new AbortController(); const start = performance.now()
 try {
  const { data } = await api.get('/api/worker-status', { signal: controller.signal })
  if (disposed) return
  status.value = data; latency.value = Math.round(performance.now() - start); updated.value = new Date().toLocaleTimeString('id-ID'); error.value = ''
 } catch (reason) { if (!disposed && reason.code !== 'ERR_CANCELED') error.value = 'Status worker belum tersedia. Pastikan API backend berjalan.' }
 finally { controller = null; loading.value = false; if (!disposed) timer = setTimeout(refresh, 10000) }
}
onMounted(refresh)
onUnmounted(() => { disposed = true; clearTimeout(timer); controller?.abort() })
</script>
<template><section>
 <div class="page-heading"><p class="eyebrow">TELEMETRI LAYANAN</p><h1>Memantau ruang<br /><span>di balik panggung.</span></h1><p>Status langsung dari API worker. Latensi di bawah adalah waktu request status, bukan kecepatan inference.</p></div>
 <div class="telemetry-strip"><span class="status-dot" :class="{ connected: status && !error }" /><span>{{ error ? 'API TIDAK TERHUBUNG' : loading ? 'MENGAMBIL STATUS' : 'API TERHUBUNG' }}</span><span class="ml-auto">{{ updated ? `DIPERBARUI ${updated}` : 'BELUM ADA SAMPEL' }}</span></div>
 <div v-if="error" class="notice" role="status">{{ error }} Data terakhir, jika ada, belum tentu terkini.</div>
 <div class="metrics-grid"><article v-for="metric in [{ label: 'Worker tersedia', value: status?.available }, { label: 'Sesi aktif', value: status?.activeSessions }, { label: 'Worker offline', value: status?.offline }, { label: 'API round trip', value: latency, unit: 'ms' }]" :key="metric.label" class="surface metric"><p>{{ metric.label }}</p><strong>{{ metric.value ?? '—' }}<small v-if="metric.value != null && metric.unit"> {{ metric.unit }}</small></strong></article></div>
 <div class="surface worker-panel"><div class="section-heading"><h2>Worker pool</h2><span class="eyebrow">POLL / 10 DETIK</span></div><div v-if="loading" class="skeleton h-32" /><div v-else-if="!status" class="empty-state"><p>Belum ada worker yang dapat ditampilkan.</p></div><div v-else class="worker-grid"><div v-for="worker in status.workers || []" :key="worker.id" class="worker-item"><span class="status-dot" :class="{ connected: worker.hasPython }" /><strong>{{ worker.id }}</strong><span>{{ worker.status }}</span></div></div></div>
</section></template>
