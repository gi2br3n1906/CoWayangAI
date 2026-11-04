import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FohOutputView from '../src/views/FohOutputView.vue'

const mocks = vi.hoisted(() => ({ handlers: {}, socket: { on: vi.fn((event, fn) => { mocks.handlers[event] = fn }), emit: vi.fn(), disconnect: vi.fn() } }))
vi.mock('socket.io-client', () => ({ io: () => mocks.socket }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { streamKey: 'stage' } }) }))
const entry = (id, updatedAt) => ({ id, updatedAt, jawa: `j${id}`, indonesia: `i${id}`, inggris: `e${id}` })
const snapshot = (history, serverNow = 10000) => ({ streamKey: 'stage', serverNow, history })
let wrapper
async function send(data) { mocks.handlers['foh-subtitle'](data); await nextTick() }
function show(query = '') { history.replaceState({}, '', `/?${query}`); wrapper = mount(FohOutputView); return wrapper }
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers() })
beforeEach(() => { mocks.handlers = {}; vi.useFakeTimers(); vi.setSystemTime(9000000) })

describe('rolling audience output', () => {
 it('pairs Javanese and Indonesian by chunk with independent colors', async () => {
  show('lang=jawa,indonesia&layout=chunk&history=3&colorJawa=yellow&colorIndonesia=white')
  await send(snapshot([entry('a', 8000), entry('b', 9000), entry('c', 10000)]))
  const chunks = wrapper.findAll('.foh-chunk')
  expect(chunks).toHaveLength(3)
  expect(chunks.map(chunk => chunk.findAll('.foh-line').map(line => line.text()))).toEqual([['ja', 'ia'], ['jb', 'ib'], ['jc', 'ic']])
  expect(chunks[0].classes()).toContain('foh-older')
  expect(chunks[2].classes()).not.toContain('foh-older')
  expect(wrapper.get('.foh-lines').attributes('style')).toContain('--foh-jawa-color: #ffd700')
  expect(wrapper.get('.foh-lines').attributes('style')).toContain('--foh-indonesia-color: #ffffff')
  expect(wrapper.get('.foh-canvas').classes()).toContain('foh-wide')
 })
 it('keeps grouped combined layout in language order and respects history', async () => {
  show('lang=jawa,indonesia&layout=language&history=2&colorJawa=cyan&colorIndonesia=white')
  await send(snapshot([entry('a', 8000), entry('b', 9000), entry('c', 10000)]))
  expect(wrapper.findAll('.foh-line').map(line => line.text())).toEqual(['jb', 'jc', 'ib', 'ic'])
  expect(wrapper.findAll('.foh-color-jawa')).toHaveLength(2)
  expect(wrapper.findAll('.foh-color-indonesia')).toHaveLength(2)
  expect(wrapper.get('.foh-lines').attributes('style')).toContain('--foh-jawa-color: #00ffff')
  expect(wrapper.get('.foh-canvas').classes()).toContain('foh-wide')
 })
 it('pairs only present translations and removes expired chunks', async () => {
  show('lang=jawa,indonesia&layout=chunk&history=3')
  await send(snapshot([{ ...entry('a', 1000), indonesia: '' }, entry('b', 10000)]))
  expect(wrapper.findAll('.foh-chunk').map(chunk => chunk.findAll('.foh-line').map(line => line.text()))).toEqual([['ja'], ['jb', 'ib']])
  await vi.advanceTimersByTimeAsync(3000); await nextTick()
  await vi.advanceTimersByTimeAsync(500); await nextTick()
  expect(wrapper.findAll('.foh-chunk').map(chunk => chunk.findAll('.foh-line').map(line => line.text()))).toEqual([['jb', 'ib']])
 })
 it('shows the latest two entries in oldest-first order', async () => {
  show('lang=en&history=2')
  await send(snapshot([entry('a', 8000), entry('b', 9000), entry('c', 10000)]))
  expect(wrapper.text()).toContain('eb')
  expect(wrapper.text()).toContain('ec')
  expect(wrapper.text()).not.toContain('ea')
  expect(wrapper.text().indexOf('eb')).toBeLessThan(wrapper.text().indexOf('ec'))
 })
 it.each([['', 1], ['history=1', 1], ['history=2', 2], ['history=3', 3], ['history=9', 1]])('limits %s to %i entries per language', async (query, count) => {
  show(query)
  await send(snapshot([entry('a', 8000), entry('b', 9000), entry('c', 10000)]))
  for (const language of ['jawa', 'indonesia', 'inggris']) {
   const lines = wrapper.find(`[data-language="${language}"]`).findAll('.foh-line')
   expect(lines).toHaveLength(count)
   expect(lines.at(-1).classes()).not.toContain('foh-older')
   if (count > 1) expect(lines[0].classes()).toContain('foh-older')
  }
 })
 it('deduplicates snapshots and replaces state on reconnect', async () => {
  show('history=3&lang=id,en')
  const a = entry('a', 8000), b = entry('b', 9000), c = entry('c', 10000)
  await send(snapshot([a, b, b, c]))
  expect(wrapper.find('[data-language="indonesia"]').findAll('.foh-line').map(x => x.text())).toEqual(['ia', 'ib', 'ic'])
  mocks.handlers.connect()
  expect(mocks.socket.emit).toHaveBeenCalledWith('foh-subscribe', { streamKey: 'stage' })
  await send(snapshot([b, c], 11000))
  expect(wrapper.find('[data-language="inggris"]').findAll('.foh-line').map(x => x.text())).toEqual(['eb', 'ec'])
 })
 it('expires entries individually using server age despite skewed local wall clock', async () => {
  show('history=3&lang=en')
  await send(snapshot([entry('a', 1000), entry('b', 9000), entry('c', 10000)]))
  expect(wrapper.findAll('.foh-line').map(x => x.text())).toEqual(['ea', 'eb', 'ec'])
  await vi.advanceTimersByTimeAsync(3000); await nextTick()
  expect(wrapper.findAll('.foh-line').map(x => x.text())).toEqual(['eb', 'ec'])
  await vi.advanceTimersByTimeAsync(8000); await nextTick()
  expect(wrapper.findAll('.foh-line').map(x => x.text())).toEqual(['ec'])
  await vi.advanceTimersByTimeAsync(1000); await nextTick()
  expect(wrapper.findAll('.foh-line')).toHaveLength(0)
 })
 it('clears explicit empty snapshots and ignores older events', async () => {
  show('history=3&lang=en')
  await send(snapshot([entry('a', 10000)]))
  await send(snapshot([], 11000))
  await send(snapshot([entry('a', 10000)], 10000))
  await send({ streamKey: 'stage', inggris: 'old legacy event' })
  expect(wrapper.findAll('.foh-line')).toHaveLength(0)
 })
 it('supports legacy flat events, stream isolation and unmount cleanup', async () => {
  show('history=3&lang=en')
  await send({ streamKey: 'other', inggris: 'wrong' })
  await send({ streamKey: 'stage', inggris: 'legacy' })
  expect(wrapper.find('.foh-line').text()).toBe('legacy')
  expect(vi.getTimerCount()).toBe(1)
  wrapper.unmount(); wrapper = null
  expect(vi.getTimerCount()).toBe(0)
  expect(mocks.socket.disconnect).toHaveBeenCalled()
 })
 it('keeps long text whole and uses transition groups', async () => {
  show('history=3&lang=en')
  const long = 'important '.repeat(500)
  await send(snapshot([{ ...entry('a', 10000), inggris: long }]))
  expect(wrapper.find('.foh-line').text()).toBe(long.trim())
  expect(wrapper.find('.foh-entries').exists()).toBe(true)
 })
 it('warns when content exceeds the visible canvas', async () => {
  show('history=3&lang=en')
  const canvas = wrapper.find('.foh-canvas').element
  Object.defineProperties(canvas, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 500 } })
  await send(snapshot([entry('a', 10000)]))
  await nextTick()
  expect(wrapper.find('.foh-overflow-warning').isVisible()).toBe(true)
 })
})
