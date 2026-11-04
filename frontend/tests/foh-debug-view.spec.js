// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import FohAdminView from '../src/views/FohAdminView.vue'
import { api } from '@/services/api'
vi.mock('@/services/api', () => ({ api: { get: vi.fn().mockResolvedValue({ data: { streams: [] } }), post: vi.fn(), delete: vi.fn() } }))
describe('FOH debug export', () => {
 it('keeps debug controls accessible before and after capture', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn().mockResolvedValue([]) } })
  const wrapper = mount(FohAdminView); await flushPromises()
  expect(wrapper.text()).toContain('Debug timeline')
  expect(wrapper.text()).toContain('Download JSON')
  expect(wrapper.text()).toContain('Copy JSON')
  wrapper.unmount()
 })
 it.each(['resolve', 'reject', 'timeout', 'resolve-after-restart', 'reject-after-restart', 'reject-after-rotation', 'reject-after-same-token-session'])('tracks in-flight %s without corrupting later runs or authentication', async mode => {
  let time = 1000, loud = true, tick, resolveUpload, rejectUpload
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } })
  vi.stubGlobal('requestAnimationFrame', fn => { tick = fn; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('AudioContext', class { createMediaStreamSource() { return { connect() {} } } createAnalyser() { return { fftSize: 0, getByteTimeDomainData(samples) { samples.fill(loud ? 160 : 128) } } } close() {} })
  vi.stubGlobal('MediaRecorder', class extends EventTarget {
   static isTypeSupported() { return true }
   constructor() { super(); this.mimeType = 'audio/webm'; this.state = 'inactive' }
   start() { this.state = 'recording' }
   stop() { this.state = 'inactive'; this.dispatchEvent(new Event('stop')) }
  })
  api.post.mockImplementation(url => url.endsWith('/session') ? Promise.resolve({ data: { streamKey: 'stage', uploadToken: 'secret-token' } }) : new Promise((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject }))
  const wrapper = mount(FohAdminView); await flushPromises()
  await wrapper.find('form').trigger('submit'); await flushPromises()
  const button = text => wrapper.findAll('button').find(b => b.text().includes(text))
  await button('Mulai tangkap audio').trigger('click'); await flushPromises()
  time = 1400; loud = false; tick(); time = 2200; tick(); await flushPromises()
  expect(wrapper.text()).toContain('sending')
  expect(wrapper.find('details summary').text()).toContain('0.00–1.20 s')
  await button('Stop audio').trigger('click'); expect(wrapper.text()).toContain('sending_after_stop')
  if (mode.endsWith('after-rotation')) wrapper.vm.activateSession({ streamKey: 'new-stage', uploadToken: 'new-token' })
  if (mode.endsWith('after-same-token-session')) wrapper.vm.activateSession({ streamKey: 'new-stage', uploadToken: 'secret-token' })
  if (mode.endsWith('after-restart')) { time = 2300; loud = true; await button('Mulai tangkap audio').trigger('click'); await flushPromises() }
  if (mode.startsWith('resolve')) resolveUpload({ status: 200, data: { subtitle: { jawa: '<img src=x onerror=alert(1)> secret-token' } } })
  else if (mode === 'timeout') rejectUpload({ code: 'ECONNABORTED' })
  else rejectUpload({ response: { status: 401, data: { error: 'secret-token' } } })
  await flushPromises()
  if (mode === 'reject' || mode === 'reject-after-restart') expect(wrapper.text()).not.toContain('SIARAN AKTIF')
  else expect(wrapper.text()).toContain('SIARAN AKTIF')
  await button('Copy JSON').trigger('click'); const exported = JSON.parse(writeText.mock.calls[0][0])
  if (mode === 'reject-after-restart') expect(exported.chunks).toMatchObject([{ status: 'cancelled', startMs: 0 }])
  else if (mode.endsWith('after-restart')) expect(exported.chunks).toMatchObject([{ status: 'capture_pending', startMs: 0 }])
  else if (mode === 'resolve') {
   expect(exported.chunks[0]).toMatchObject({ status: 'success', subtitle: { jawa: '<img src=x onerror=alert(1)> [redacted]' }, startMs: 0, endMs: 1200 })
   expect(wrapper.find('details pre').text()).toContain('<img src=x onerror=alert(1)> [redacted]')
   expect(wrapper.find('details img').exists()).toBe(false)
  }
  else expect(exported.chunks[0]).toMatchObject({ status: 'error', errorCategory: mode === 'timeout' ? 'timeout' : 'http', startMs: 0, endMs: 1200 })
  expect(JSON.stringify(exported)).not.toContain('secret-token')
  wrapper.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals()
 })
})
