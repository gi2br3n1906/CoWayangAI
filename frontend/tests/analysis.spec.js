import { describe, it, expect, vi } from 'vitest'
import { effectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useAnalysis } from '../src/composables/useAnalysis.js'
const url = 'https://youtu.be/aOtB-yw9GSE'
describe('analysis request lifecycle', () => {
 it('does not autoplay after video closes while start is pending', async () => {
  let resolve
  const client = { post: vi.fn(path => path === '/api/analyze' ? new Promise(done => { resolve = done }) : Promise.resolve({ data: { status: 'success' } })) }
  const scope = effectScope(); const analysis = scope.run(() => useAnalysis({ client }))
  const request = analysis.start({ url, mode: 'analysis' })
  await flushPromises(); expect(client.post).toHaveBeenCalledWith('/api/analyze', expect.any(Object), expect.any(Object))
  const closing = analysis.close(); resolve({ data: { status: 'success' } }); await Promise.all([request, closing])
  expect(analysis.currentVideo.value).toBeNull()
  expect(analysis.shouldAutoPlay.value).toBe(false)
  scope.stop()
 })
 it('does not contact inference while maintenance is active', async () => {
  const client = { post: vi.fn(async () => ({ data: { status: 'success' } })) }, notify = vi.fn()
  const scope = effectScope(); const analysis = scope.run(() => useAnalysis({ client, notify, maintenance: true }))
  await analysis.start({ url, mode: 'live' })
  expect(client.post).not.toHaveBeenCalled()
  expect(analysis.currentVideo.value).toBeNull()
  expect(notify).toHaveBeenCalled()
  scope.stop()
 })
 it('keeps generic local camera sources while rejecting the removed FOH scheme', async () => {
  const client = { post: vi.fn(async () => ({ data: { status: 'success' } })) }, notify = vi.fn()
  const scope = effectScope(); const analysis = scope.run(() => useAnalysis({ client, notify }))
  await analysis.start({ url: 'camera://0', mode: 'live' })
  expect(analysis.currentVideo.value).toMatchObject({ url: 'camera://0', isCamera: true })
  await analysis.close()
  await analysis.start({ url: 'foh://0', mode: 'live' })
  expect(analysis.currentVideo.value).toBeNull()
  expect(notify).toHaveBeenCalledWith('Gunakan URL YouTube atau sumber kamera yang valid.')
  expect(client.post).not.toHaveBeenCalled()
  scope.stop()
 })
})

it('keeps the latest start when an earlier replacement is waiting for old ASR cleanup', async () => {
 let releaseStop
 const stop = new Promise(resolve => { releaseStop = resolve })
 const client = { post: vi.fn((path) => path === '/api/stop-asr' ? stop : Promise.resolve({ data: { status: 'success' } })) }
 const scope = effectScope(); const analysis = scope.run(() => useAnalysis({ client }))
 await analysis.start({ url, mode: 'transcript' })
 const earlier = analysis.start({ url: 'https://youtu.be/example0001', mode: 'transcript' })
 const latest = analysis.start({ url: 'https://youtu.be/other000001', mode: 'transcript' })
 releaseStop({ data: { status: 'success' } }); await Promise.all([earlier, latest])
 expect(analysis.currentVideo.value.url).toBe('https://youtu.be/other000001')
 scope.stop()
})
