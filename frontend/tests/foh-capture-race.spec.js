import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FohAdminView from '@/views/FohAdminView.vue'
import { api } from '@/services/api'

vi.mock('@/services/api', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

describe('FOH capture stop while recorder is stopping', () => {
 let wrapper, frame, now, amplitude, recorders
 const tick = async (time, loud) => {
  now = time; amplitude = loud ? 160 : 128
  const callback = frame; frame = null; callback()
  await flushPromises()
 }
 const button = label => wrapper.findAll('button').find(item => item.text() === label)
 const finish = recorder => {
  recorder.ondataavailable?.({ data: new Blob([recorder.payload]) })
  recorder.dispatchEvent(new Event('stop'))
 }
 beforeEach(async () => {
  now = 100; amplitude = 160; recorders = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', callback => { frame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { frame = null })
  vi.stubGlobal('AudioContext', class {
   createMediaStreamSource() { return { connect() {} } }
   createAnalyser() { return { fftSize: 0, getByteTimeDomainData(samples) { samples.fill(amplitude) } } }
   close() {}
  })
  vi.stubGlobal('MediaRecorder', class extends EventTarget {
   static isTypeSupported() { return true }
   constructor() { super(); this.state = 'inactive'; this.mimeType = 'audio/webm'; this.payload = `chunk${recorders.length}`; recorders.push(this) }
   start() { this.state = 'recording' }
   stop() { this.state = 'inactive' }
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
   enumerateDevices: vi.fn().mockResolvedValue([]),
   getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }),
  } })
  api.get.mockResolvedValue({ data: { streams: [] } })
  api.post.mockImplementation(url => Promise.resolve({ data: url.endsWith('/session') ? { streamKey: 'test', uploadToken: 'token' } : {} }))
  wrapper = mount(FohAdminView)
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  await button('Mulai tangkap audio').trigger('click')
  await flushPromises()
  await tick(400, false)
  await tick(1200, false)
  expect(recorders[0].state).toBe('inactive')
 })
 afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete navigator.mediaDevices })

 it('offers a labelled model choice with the lite default', async () => {
  const label = wrapper.findAll('label').find(item => item.text().includes('Model Gemini'))
  expect(label).toBeTruthy()
  const select = label.find('select')
  expect(select.element.value).toBe('gemini-3.5-flash-lite')
  expect(select.findAll('option').map(option => option.element.value)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash'])
  expect(wrapper.text()).toMatch(/45.*detik/i)
  expect(wrapper.text()).toMatch(/antrean/i)
  expect(wrapper.text()).toMatch(/biaya/i)
  await select.setValue('gemini-3.8-flash')
  wrapper.unmount()
  wrapper = mount(FohAdminView); await flushPromises()
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('select[aria-describedby="foh-model-warning"]').element.value).toBe('gemini-3.5-flash-lite')
 })

 it('allows VAD threshold values between 0.005 and 0.010', async () => {
  const slider = wrapper.find('input[type="range"]')
  expect(slider.attributes('step')).toBe('0.001')
  await slider.setValue('0.007')
  expect(wrapper.find('.setting-range output').text()).toBe('0.007')
 })

 it('snapshots the model at capture start, including while queued', async () => {
  let resolveFirst
  api.post.mockImplementation(url => url.endsWith('/audio') ? new Promise(resolve => { resolveFirst = resolve }) : Promise.resolve({ data: {} }))
  const select = wrapper.find('select[aria-describedby="foh-model-warning"]')
  await select.setValue('gemini-3.8-flash')
  finish(recorders[0]); await flushPromises()
  let uploads = api.post.mock.calls.filter(([url]) => url.endsWith('/audio'))
  expect(uploads[0][2].headers['x-foh-model']).toBe('gemini-3.5-flash-lite')
  expect(uploads[0][2].timeout).toBeUndefined()
  await tick(1400, true)
  await select.setValue('gemini-3.5-flash-lite')
  await tick(1700, false); await tick(2500, false)
  finish(recorders[1]); await flushPromises()
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('/audio'))).toHaveLength(1)
  resolveFirst({ status: 200, data: { model: 'gemini-3.5-flash-lite', subtitle: {} } }); await flushPromises()
  uploads = api.post.mock.calls.filter(([url]) => url.endsWith('/audio'))
  expect(uploads).toHaveLength(2)
  expect(uploads[1][2].headers['x-foh-model']).toBe('gemini-3.8-flash')
  expect(uploads[1][2].timeout).toBe(45000)
  resolveFirst({ status: 200, data: { model: 'gemini-3.8-flash', subtitle: {} } }); await flushPromises()
  const copy = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  await button('Copy JSON').trigger('click')
  expect(JSON.parse(copy.mock.calls[0][0]).chunks.map(chunk => chunk.model)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash'])
 })

 it('cancels a queued model snapshot on stop without disturbing a restarted run', async () => {
  let rejectFirst
  api.post.mockImplementation(url => url.endsWith('/audio') ? new Promise((resolve, reject) => { rejectFirst = reject }) : Promise.resolve({ data: {} }))
  finish(recorders[0]); await flushPromises()
  await wrapper.find('select[aria-describedby="foh-model-warning"]').setValue('gemini-3.8-flash')
  await tick(1400, true); await tick(1700, false); await tick(2500, false)
  finish(recorders[1]); await flushPromises()
  await button('Stop audio').trigger('click')
  now = 2600; amplitude = 160
  await button('Mulai tangkap audio').trigger('click'); await flushPromises()
  rejectFirst({ code: 'ETIMEDOUT' }); await flushPromises()
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('/audio'))).toHaveLength(1)
  expect(wrapper.find('.foh-state').text()).toBe('speaking')
  const copy = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  await button('Copy JSON').trigger('click')
  expect(JSON.parse(copy.mock.calls[0][0]).chunks).toMatchObject([{ model: 'gemini-3.8-flash', status: 'capture_pending' }])
 })

 it('records recorder cutoff before the delayed stop event and queue wait separately', async () => {
  now = 1800
  finish(recorders[0]); await flushPromises()
  const copy = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  await button('Copy JSON').trigger('click')
  const chunk = JSON.parse(copy.mock.calls[0][0]).chunks[0]
  expect(chunk.endMs).toBe(1100)
  expect(chunk.queueMs).toBe(0)
  expect(chunk.queuedMs).toBe(1700)
 })

 it('cuts an overdue recording immediately even when the next frame is quiet', async () => {
  finish(recorders[0]); await flushPromises()
  await tick(1400, true)
  expect(recorders[1].state).toBe('recording')
  await tick(8000, false)
  expect(recorders[1].state).toBe('inactive')
 })

 it('cuts an active recording at its deadline without another animation frame', async () => {
  finish(recorders[0]); await flushPromises()
  const originalSetTimeout = globalThis.setTimeout
  let deadline
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
   if (delay === 4000) { deadline = callback; return 12345 }
   return originalSetTimeout(callback, delay, ...args)
  })
  await tick(1400, true)
  expect(deadline).toBeTypeOf('function')
  now = 5400
  deadline()
  expect(recorders[1].state).toBe('inactive')
 })

 it('ignores a stale deadline after capture has stopped and restarted', async () => {
  finish(recorders[0]); await flushPromises()
  const originalSetTimeout = globalThis.setTimeout
  const deadlines = []
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
   if (delay === 4000) { deadlines.push(callback); return 12345 + deadlines.length }
   return originalSetTimeout(callback, delay, ...args)
  })
  await tick(1400, true)
  await button('Stop audio').trigger('click')
  now = 1500; amplitude = 160
  await button('Mulai tangkap audio').trigger('click'); await flushPromises()
  expect(recorders[2].state).toBe('recording')
  deadlines[0]()
  expect(recorders[2].state).toBe('recording')
 })

 it('remains idle and does not upload after delayed stop event', async () => {
  await button('Stop audio').trigger('click')
  finish(recorders[0])
  await flushPromises()
  expect(wrapper.find('.foh-state').text()).toBe('idle')
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('/audio'))).toHaveLength(0)
  const copy = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  await button('Copy JSON').trigger('click')
  expect(JSON.parse(copy.mock.calls[0][0]).chunks[0]).toMatchObject({ status: 'cancelled', endMs: 1100 })
 })

 it('does not let an old delayed stop corrupt a restarted capture', async () => {
  await button('Stop audio').trigger('click')
  now = 1300; amplitude = 160
  await button('Mulai tangkap audio').trigger('click')
  await flushPromises()
  expect(recorders).toHaveLength(2)
  finish(recorders[0])
  await flushPromises()
  expect(wrapper.find('.foh-state').text()).toBe('speaking')
  await tick(1600, false)
  await tick(2400, false)
  finish(recorders[1])
  await flushPromises()
  const uploads = api.post.mock.calls.filter(([url]) => url.endsWith('/audio'))
  expect(uploads).toHaveLength(1)
  expect(await uploads[0][1].text()).toBe('chunk1')
 })
})

describe('FOH capture pending microphone permission', () => {
 let wrapper, resolveMedia, frames, tracks, contexts
 const button = label => wrapper.findAll('button').find(item => item.text() === label)
 const stream = () => {
  const track = { stop: vi.fn() }; tracks.push(track)
  return { getTracks: () => [track] }
 }
 beforeEach(async () => {
  frames = new Map(); tracks = []; contexts = []
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', callback => { const id = ++nextFrame; frames.set(id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id))
  vi.stubGlobal('AudioContext', class {
   constructor() { contexts.push(this) }
   createMediaStreamSource() { return { connect() {} } }
   createAnalyser() { return { fftSize: 0, getByteTimeDomainData(samples) { samples.fill(128) } } }
   close() {}
  })
  vi.stubGlobal('MediaRecorder', class { static isTypeSupported() { return true } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
   enumerateDevices: vi.fn().mockResolvedValue([]),
   getUserMedia: vi.fn(() => new Promise(resolve => { resolveMedia = resolve })),
  } })
  api.get.mockResolvedValue({ data: { streams: [] } })
  api.post.mockImplementation(url => Promise.resolve({ data: url.endsWith('/session') ? { streamKey: 'test', uploadToken: 'token' } : {} }))
  api.delete.mockResolvedValue({})
  wrapper = mount(FohAdminView)
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  await flushPromises()
 })
 afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete navigator.mediaDevices })

 it('allows at most one capture when start is triggered twice before permission resolves', async () => {
  const start = button('Mulai tangkap audio').element
  start.click(); start.click()
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)
  const acquired = stream(); resolveMedia(acquired)
  await flushPromises()
  expect(contexts).toHaveLength(1)
  expect(frames.size).toBe(1)
  await button('Stop audio').trigger('click')
  expect(tracks[0].stop).toHaveBeenCalledTimes(1)
  expect(frames.size).toBe(0)
 })

 it.each(['stop audio', 'end session', 'unmount'])('stops a late stream after %s during permission', async cancellation => {
  await button('Mulai tangkap audio').trigger('click')
  if (cancellation === 'unmount') { wrapper.unmount(); wrapper = null }
  else if (cancellation === 'stop audio') await button('Stop audio').trigger('click')
  else { await button('Akhiri sesi').trigger('click'); await flushPromises() }
  const acquired = stream(); resolveMedia(acquired)
  await flushPromises()
  expect(tracks[0].stop).toHaveBeenCalledTimes(1)
  expect(contexts).toHaveLength(0)
  expect(frames.size).toBe(0)
 })
})
