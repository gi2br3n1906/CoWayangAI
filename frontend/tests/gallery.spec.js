import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
const calls = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({ api: { get: (...args) => calls.get(...args) }, apiError: () => 'Search unavailable' }))
import VideoGallery from '../src/components/VideoGallery.vue'

it('uses explicit real-search requests, then offers keyboard-accessible result actions', async () => {
 // Synthetic service adapter; never supplied as production catalog content.
 calls.get.mockResolvedValue({ data: { status: 'success', videos: [{ videoId: 'abcdefghijk', title: 'Synthetic search response', channelTitle: 'Test channel' }] } })
 const wrapper = mount(VideoGallery)
 expect(calls.get).not.toHaveBeenCalled()
 expect(wrapper.findAll('.video-card')).toHaveLength(0)
 await wrapper.find('[data-beginner-search]').trigger('click'); await flushPromises()
 expect(calls.get).toHaveBeenCalledWith('/api/search-youtube', expect.objectContaining({ params: { q: 'wayang kulit' } }))
 const button = wrapper.find('.video-card'); expect(button.element.tagName).toBe('BUTTON')
 await button.trigger('click')
 expect(wrapper.emitted('select-video')[0][0]).toEqual({ url: 'https://www.youtube.com/watch?v=abcdefghijk', mode: 'live', startTime: 0 })
 expect(wrapper.text()).toContain('Belum tercantum')
 wrapper.unmount()
})
it('distinguishes search failure from empty results without a fallback catalog', async () => {
 calls.get.mockRejectedValue(new Error('Search unavailable'))
 const wrapper = mount(VideoGallery)
 await wrapper.find('[data-beginner-search]').trigger('click'); await flushPromises()
 expect(wrapper.find('[role="status"]').text()).toContain('Pencarian belum tersedia')
 expect(wrapper.findAll('.video-card')).toHaveLength(0)
 wrapper.unmount()
})
