import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
const calls = vi.hoisted(() => ({ pending: [], get: vi.fn() }))
vi.mock('axios', () => ({ default: { get: (...args) => calls.get(...args) } }))
vi.mock('@/services/api', () => ({ api: { get: (...args) => calls.get(...args) }, apiError: () => 'Layanan tidak tersedia' }))
import StickySearchBar from '../src/components/StickySearchBar.vue'
it('ignores obsolete search responses', async () => {
 calls.get.mockImplementation(() => new Promise(resolve => calls.pending.push(resolve)))
 const wrapper = mount(StickySearchBar)
 const input = wrapper.find('input')
 await input.setValue('arjuna'); await input.trigger('keyup.enter')
 await input.setValue('bima'); await input.trigger('keyup.enter')
 calls.pending[1]({ data: { status: 'success', videos: [{ videoId: 'latest' }] } }); await flushPromises()
 calls.pending[0]({ data: { status: 'success', videos: [{ videoId: 'obsolete' }] } }); await flushPromises()
 expect(wrapper.emitted('search-results').at(-1)[0].videos[0].videoId).toBe('latest')
 wrapper.unmount()
})
