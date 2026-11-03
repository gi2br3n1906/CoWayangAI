import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
const calls = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(async () => ({ data: { status: 'success' } })) }))
vi.mock('@/services/api', () => ({ api: calls, apiError: () => 'Service unavailable' }))
vi.mock('socket.io-client', () => ({ io: () => ({ on() {}, off() {}, disconnect() {} }) }))
// Test adapters deliberately render no YouTube, account or inference success.
vi.mock('@/components/VideoPlayer.vue', () => ({ __esModule: true, default: { props: ['videoId', 'targetLanguage'], template: '<div data-player-adapter>{{ videoId }} / {{ targetLanguage }}</div>' } }))
import HomeView from '../src/views/HomeView.vue'
import { useSettings } from '../src/stores/settings.js'

async function setup(path = '/') {
 const pinia = createPinia()
 const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: HomeView }, ...['/gallery', '/almanac', '/performance', '/settings'].map(path => ({ path, component: { template: '<div />' } }))] })
 await router.push(path); await router.isReady()
 const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } })
 await flushPromises()
 return { wrapper, settings: useSettings(pinia), router }
}
it('opens a validated source and returns to the source without losing its URL', async () => {
 const { wrapper } = await setup()
 wrapper.findComponent({ name: 'StickySearchBar' }).vm.setVideoUrl('https://youtu.be/aOtB-yw9GSE')
 await wrapper.vm.$nextTick()
 await wrapper.find('#video-url').trigger('keyup.enter'); await flushPromises()
 expect(wrapper.find('[data-player-adapter]').text()).toContain('aOtB-yw9GSE')
 expect(wrapper.find('.context-empty').text()).toContain('belum tersedia')
 await wrapper.find('.analysis-heading button').trigger('click'); await flushPromises()
 expect(wrapper.find('[data-player-adapter]').exists()).toBe(false)
 expect(wrapper.find('#video-url').element.value).toBe('https://youtu.be/aOtB-yw9GSE')
 wrapper.unmount()
})
it('opens an explicit selection query while preserving mode and fractional start', async () => {
 calls.post.mockClear()
 const { wrapper } = await setup('/?video=https%3A%2F%2Fyoutu.be%2FaOtB-yw9GSE&open=1&mode=transcript&startTime=62.5')
 expect(wrapper.find('[data-player-adapter]').exists()).toBe(true)
 expect(calls.post).toHaveBeenCalledWith('/api/start-asr', expect.objectContaining({ startTime: 62.5, videoUrl: 'https://youtu.be/aOtB-yw9GSE' }), expect.any(Object))
 wrapper.unmount(); await flushPromises()
})
it('snapshots the guide language per session rather than relabelling existing results', async () => {
 const { wrapper, settings } = await setup()
 settings.targetLanguage = 'en'
 wrapper.findComponent({ name: 'StickySearchBar' }).vm.setVideoUrl('https://youtu.be/aOtB-yw9GSE')
 await wrapper.vm.$nextTick(); await wrapper.find('#video-url').trigger('keyup.enter'); await flushPromises()
 expect(wrapper.find('[data-player-adapter]').text()).toContain('/ en')
 settings.targetLanguage = 'id'; await wrapper.vm.$nextTick()
 expect(wrapper.find('[data-player-adapter]').text()).toContain('/ en')
 wrapper.unmount()
})

it('restores the chosen source when an experimental guide request fails', async () => {
 calls.post.mockRejectedValueOnce(new Error('Synthetic unavailable service'))
 const { wrapper } = await setup()
 wrapper.findComponent({ name: 'StickySearchBar' }).vm.setVideoUrl('https://youtu.be/aOtB-yw9GSE')
 await wrapper.vm.$nextTick(); await wrapper.find('#analysis-mode').setValue('transcript')
 await wrapper.find('#video-url').trigger('keyup.enter'); await flushPromises()
 expect(wrapper.find('[data-player-adapter]').exists()).toBe(false)
 expect(wrapper.find('#video-url').exists()).toBe(true)
 expect(wrapper.find('#video-url').element.value).toBe('https://youtu.be/aOtB-yw9GSE')
 wrapper.unmount()
})
