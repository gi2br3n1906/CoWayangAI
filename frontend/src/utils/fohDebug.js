// In-memory only. Export is a whitelist: never retain requests, blobs or error messages.
export function createFohDebug({ now = () => performance.now(), limit = 200 } = {}) {
 let origin = null, serial = 0, entries = [], dropped = 0, permissionPendingMs = null, stoppedMs = null
 const elapsed = () => Math.max(0, Math.round(now() - origin))
 const find = id => entries.find(entry => entry.id === id)
 const isSending = entry => entry && ['sending', 'sending_after_stop'].includes(entry.status)
 const isOpen = entry => entry && ['capture_pending', 'queued'].includes(entry.status)
 return {
  start() { origin = now(); entries = []; dropped = 0; permissionPendingMs = null; stoppedMs = null },
  permissionGranted() { if (origin !== null && stoppedMs === null) permissionPendingMs = elapsed() },
  capture(threshold, model = null) {
   if (origin === null || stoppedMs !== null) return null
   const entry = { id: ++serial, startMs: elapsed(), endMs: null, status: 'capture_pending', model, threshold: Number(threshold), rms: null, queueMs: null, requestMs: null, httpStatus: null, errorCategory: null, subtitle: null }
   entries.push(entry)
   if (entries.length > limit) { entries.shift(); dropped++ }
   return entry.id
  },
  cutoff(id) { const entry = find(id); if (entry?.status === 'capture_pending' && entry.endMs === null) entry.endMs = elapsed() },
  queue(id, rms) { const entry = find(id); if (entry?.status !== 'capture_pending') return; this.cutoff(id); entry.queuedMs = elapsed(); entry.rms = Number.isFinite(rms) ? rms : null; entry.status = 'queued' },
  sending(id) { const entry = find(id); if (entry?.status !== 'queued') return; entry.sentMs = elapsed(); entry.queueMs = entry.sentMs - entry.queuedMs; entry.status = 'sending' },
  finish(id, response, token = '') {
   const entry = find(id); if (!isSending(entry)) return
   entry.requestMs = elapsed() - entry.sentMs; delete entry.sentMs
   entry.httpStatus = Number.isInteger(response?.status) ? response.status : null
   if (['gemini-3.5-flash-lite', 'gemini-3.8-flash'].includes(response?.data?.model)) entry.actualModel = response.data.model
   const subtitle = response?.data?.subtitle
   if (!subtitle || typeof subtitle !== 'object' || Array.isArray(subtitle)) { entry.status = 'protocol_error'; entry.errorCategory = 'protocol'; return }
   if (subtitle && typeof subtitle === 'object' && !Array.isArray(subtitle)) {
    entry.subtitle = Object.fromEntries(['jawa', 'indonesia', 'inggris'].map(key => {
     const text = typeof subtitle[key] === 'string' ? subtitle[key] : ''
     return [key, (token ? text.split(token).join('[redacted]') : text).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 4000)]
    }))
   }
   entry.status = response?.data?.silent === true ? 'silent' : Object.values(entry.subtitle || {}).some(Boolean) ? 'success' : 'empty'
  },
  fail(id, cause) {
   const entry = find(id); if (!isOpen(entry) && !isSending(entry)) return
   if (isSending(entry)) { entry.requestMs = elapsed() - entry.sentMs; delete entry.sentMs }
   entry.httpStatus = Number.isInteger(cause?.response?.status) ? cause.response.status : null
   entry.errorCategory = entry.httpStatus ? 'http' : cause?.code === 'ERR_CANCELED' ? 'cancelled' : ['ECONNABORTED', 'ETIMEDOUT'].includes(cause?.code) ? 'timeout' : 'network'
   entry.status = entry.errorCategory === 'cancelled' ? 'cancelled' : 'error'
  },
  cancel(id) { const entry = find(id); if (!isOpen(entry)) return; if (entry.status === 'capture_pending' && entry.endMs === null) entry.endMs = elapsed(); entry.status = 'cancelled' },
  stop() { if (origin === null || stoppedMs !== null) return; stoppedMs = elapsed(); for (const entry of entries) { if (entry.status === 'sending') entry.status = 'sending_after_stop'; else this.cancel(entry.id) } },
  snapshot() { return { version: 1, timingNote: 'Milliseconds relative to start click; capture bounds approximate VAD recorder bounds, not word timestamps. Silence and missed speech cannot be inferred.', permissionPendingMs, capturePending: origin !== null && permissionPendingMs === null && stoppedMs === null, stoppedMs, dropped, chunks: entries.map(({ sentMs, ...entry }) => ({ ...entry, subtitle: entry.subtitle ? { ...entry.subtitle } : null })) } },
 }
}
