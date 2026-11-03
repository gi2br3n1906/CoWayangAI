import { it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StickySearchBar from '../src/components/StickySearchBar.vue'
import FeedVideoCard from '../src/components/FeedVideoCard.vue'
afterEach(() => vi.unstubAllGlobals())
it('compact source removes explanatory copy and focuses search with slash', async () => {
 const wrapper = mount(StickySearchBar, { props: { compact: true }, attachTo: document.body })
 expect(wrapper.find('.source-heading').exists()).toBe(false)
 expect(wrapper.find('#video-search').attributes('placeholder')).toContain('Cari video wayang')
 window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); await flushPromises()
 expect(document.activeElement.id).toBe('video-search')
 wrapper.unmount()
})
it('clipboard selection starts a valid YouTube source directly', async () => {
 vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => 'https://youtu.be/aOtB-yw9GSE') } })
 const wrapper = mount(StickySearchBar, { props: { compact: true } })
 await wrapper.find('.paste-url').trigger('click'); await flushPromises()
 expect(wrapper.emitted('analyze')[0][0]).toEqual({ url: 'https://youtu.be/aOtB-yw9GSE', mode: 'live', startTime: '0' })
 wrapper.unmount()
})
it('denied clipboard access leaves a manual URL field without starting analysis', async () => {
 vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => { throw new Error('Permission denied') }) } })
 const wrapper = mount(StickySearchBar, { props: { compact: true } })
 await wrapper.find('.paste-url').trigger('click'); await flushPromises()
 expect(wrapper.find('#video-url').exists()).toBe(true)
 expect(wrapper.emitted('analyze')).toBeUndefined()
 wrapper.unmount()
})
it('video card is one keyboard button and renders only supplied metadata', async () => {
 const video = { videoId: 'aOtB-yw9GSE', title: 'Synthetic test video', channelTitle: 'Test channel', thumbnail: 'https://i.ytimg.com/vi/aOtB-yw9GSE/hqdefault.jpg' }
 const wrapper = mount(FeedVideoCard, { props: { video } })
 expect(wrapper.findAll('button')).toHaveLength(1)
 expect(wrapper.find('.feed-duration').exists()).toBe(false)
 expect(wrapper.find('.feed-badge').exists()).toBe(false)
 await wrapper.find('button').trigger('click')
 expect(wrapper.emitted('select')[0][0]).toEqual(video)
 await wrapper.setProps({ video: { ...video, duration: '1:23', definition: 'hd' } })
 expect(wrapper.find('.feed-duration').text()).toBe('1:23')
 expect(wrapper.find('.feed-badge').text()).toBe('HD')
 await wrapper.setProps({ video: { ...video, isLive: true } })
 expect(wrapper.find('.live').text()).toBe('Live')
 wrapper.unmount()
})
