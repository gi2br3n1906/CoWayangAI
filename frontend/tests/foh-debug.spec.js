import { describe, it, expect } from 'vitest'
import { createFohDebug } from '../src/utils/fohDebug.js'

describe('FOH debug timeline', () => {
 it('preserves requested model on failure and records the actual successful model safely', () => {
  const debug = createFohDebug(); debug.start()
  const failed = debug.capture(0.05, 'gemini-3.8-flash'); debug.queue(failed, 0.1); debug.sending(failed)
  debug.fail(failed, { code: 'ETIMEDOUT', config: { data: 'audio-secret' } })
  const succeeded = debug.capture(0.05, 'gemini-3.8-flash'); debug.queue(succeeded, 0.1); debug.sending(succeeded)
  debug.finish(succeeded, { status: 200, data: { model: 'gemini-3.5-flash-lite', subtitle: {} } })
  expect(debug.snapshot().chunks).toMatchObject([
   { model: 'gemini-3.8-flash', status: 'error', errorCategory: 'timeout' },
   { model: 'gemini-3.8-flash', actualModel: 'gemini-3.5-flash-lite' },
  ])
  expect(JSON.stringify(debug.snapshot())).not.toContain('audio-secret')
 })
 it('uses the start click as origin and tracks a successful upload', () => {
  let now = 1000
  const debug = createFohDebug({ now: () => now })
  debug.start(); now = 1120; debug.permissionGranted()
  now = 1300; const id = debug.capture(0.035)
  now = 2200; debug.queue(id, 0.08)
  now = 2250; debug.sending(id)
  now = 2450; debug.finish(id, { status: 200, data: { subtitle: { jawa: 'Halo', indonesia: 'Hai', inggris: 'Hi', token: 'secret' }, token: 'secret' } })
  expect(debug.snapshot()).toMatchObject({ permissionPendingMs: 120, chunks: [{ id, startMs: 300, endMs: 1200, queueMs: 50, requestMs: 200, status: 'success', httpStatus: 200, threshold: 0.035, rms: 0.08, subtitle: { jawa: 'Halo', indonesia: 'Hai', inggris: 'Hi' } }] })
  expect(JSON.stringify(debug.snapshot())).not.toContain('secret')
 })
 it('tracks dispatched requests after stop and ignores stale completions after restart', () => {
  let now = 0; const debug = createFohDebug({ now: () => now })
  debug.start(); const pending = debug.capture(0.02); now = 30; debug.queue(pending, 0.1); debug.sending(pending)
  now = 50; debug.stop(); expect(debug.snapshot().chunks[0].status).toBe('sending_after_stop')
  now = 70; debug.finish(pending, { status: 200, data: { subtitle: { jawa: 'late' } } })
  expect(debug.snapshot().chunks[0]).toMatchObject({ status: 'success', requestMs: 40 })
  debug.start(); const next = debug.capture(0.03); expect(next).not.toBe(pending)
  debug.finish(pending, { status: 200 }); expect(debug.snapshot().chunks).toHaveLength(1)
  expect(debug.snapshot().chunks[0].status).toBe('capture_pending')
 })
 it('cancels queued and capturing chunks on stop, without cancelling an upload', () => {
  let now = 0; const debug = createFohDebug({ now: () => now }); debug.start()
  const queued = debug.capture(0.1); debug.queue(queued, 0.2)
  const capturing = debug.capture(0.1)
  const sent = debug.capture(0.1); debug.queue(sent, 0.2); debug.sending(sent)
  now = 20; debug.stop(); debug.sending(queued); debug.queue(capturing, 0.2)
  expect(debug.snapshot().chunks.map(c => c.status)).toEqual(['cancelled', 'cancelled', 'sending_after_stop'])
  debug.fail(sent, { code: 'ETIMEDOUT' })
  expect(debug.snapshot().chunks[2]).toMatchObject({ status: 'error', errorCategory: 'timeout', requestMs: 20 })
 })
 it('records silent, empty, safe HTTP and network failures without secrets', () => {
  const debug = createFohDebug(); debug.start()
  const run = () => { const id = debug.capture(0.05); debug.queue(id, 0.2); debug.sending(id); return id }
  debug.finish(run(), { status: 200, data: { silent: true, subtitle: { jawa: '', indonesia: '', inggris: '' } } })
  debug.finish(run(), { status: 200, data: { subtitle: { jawa: '', indonesia: '', inggris: '' } } })
  debug.fail(run(), { response: { status: 500, data: { error: 'secret-token' } }, config: { data: 'audio-bytes' } })
  debug.fail(run(), { message: 'secret-token' })
  const snapshot = debug.snapshot()
  expect(snapshot.chunks.map(c => c.status)).toEqual(['silent', 'empty', 'error', 'error'])
  expect(snapshot.chunks[2]).toMatchObject({ httpStatus: 500, errorCategory: 'http' })
  expect(snapshot.chunks[3].errorCategory).toBe('network')
  expect(JSON.stringify(snapshot)).not.toMatch(/secret-token|audio-bytes/)
 })
 it('distinguishes timeouts and malformed success from network errors', () => {
  const debug = createFohDebug(); debug.start()
  const run = () => { const id = debug.capture(0.05); debug.queue(id, 0.2); debug.sending(id); return id }
  debug.finish(run(), { status: 200, data: {} })
  debug.finish(run(), { status: 200, data: { subtitle: null } })
  debug.finish(run(), { status: 200, data: { silent: true } })
  debug.fail(run(), { code: 'ECONNABORTED' })
  debug.fail(run(), { code: 'ETIMEDOUT' })
  debug.fail(run(), { code: 'ERR_NETWORK' })
  expect(debug.snapshot().chunks.map(c => [c.status, c.errorCategory])).toEqual([
   ['protocol_error', 'protocol'], ['protocol_error', 'protocol'], ['protocol_error', 'protocol'], ['error', 'timeout'], ['error', 'timeout'], ['error', 'network'],
  ])
 })
 it('redacts the upload token even if returned inside a subtitle', () => {
  const debug = createFohDebug(); debug.start(); const id = debug.capture(0.05); debug.queue(id, 0.1); debug.sending(id)
  debug.finish(id, { status: 200, data: { subtitle: { jawa: 'heard secret-token here' } } }, 'secret-token')
  expect(JSON.stringify(debug.snapshot())).not.toContain('secret-token')
 })
 it('bounds history and exposes dropped entries and sequence gaps', () => {
  const debug = createFohDebug({ limit: 2 }); debug.start()
  const ids = [debug.capture(0.1), debug.capture(0.1), debug.capture(0.1)]
  expect(debug.snapshot()).toMatchObject({ dropped: 1, chunks: [{ id: ids[1] }, { id: ids[2] }] })
 })
})
