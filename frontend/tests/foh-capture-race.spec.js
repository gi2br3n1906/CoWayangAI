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
