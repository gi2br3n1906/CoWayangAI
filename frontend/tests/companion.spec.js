import { beforeEach, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import HeroSection from '../src/components/HeroSection.vue'
import StickySearchBar from '../src/components/StickySearchBar.vue'
import VideoGallery from '../src/components/VideoGallery.vue'
import LiveTranscription from '../src/components/LiveTranscription.vue'

it('states the viewing benefit and avoids ornamental slogans', () => {
 const wrapper = mount(HeroSection)
 expect(wrapper.find('h1').text()).toBe('Nikmati wayang. Ikuti ceritanya.')
 expect(wrapper.find('svg').exists()).toBe(false)
 wrapper.unmount()
})
it('switches product copy reactively without changing source mode contracts', async () => {
 const locale = ref('en')
 const wrapper = mount(StickySearchBar, { global: { provide: { 'product-locale': locale } } })
 expect(wrapper.text()).toContain('Find a performance')
 locale.value = 'id'; await wrapper.vm.$nextTick()
 expect(wrapper.text()).toContain('Cari pertunjukan')
 wrapper.vm.setVideoUrl('https://youtu.be/aOtB-yw9GSE'); await wrapper.vm.$nextTick()
 expect(wrapper.find('button[type="submit"]').text()).toContain('Tonton dengan panduan')
 wrapper.unmount()
})
it('does not invent a catalog before an explicit YouTube search', () => {
 const wrapper = mount(VideoGallery)
 expect(wrapper.findAll('.video-card')).toHaveLength(0)
 expect(wrapper.text()).toContain('Belum ada pertunjukan untuk ditampilkan')
 expect(wrapper.find('[data-beginner-search]').exists()).toBe(true)
 wrapper.unmount()
})
it('hides future dialog even if callers provide it', async () => {
 const wrapper = mount(LiveTranscription, { props: { currentTime: 5, subtitles: [
  { id: 'past', start_time: 1, end_time: 4, text: 'Dialog sebelumnya' },
  { id: 'future', start_time: 9, end_time: 12, text: 'Spoiler berikutnya' }
 ] } })
 expect(wrapper.text()).toContain('Dialog sebelumnya')
 expect(wrapper.text()).not.toContain('Spoiler berikutnya')
 await wrapper.setProps({ currentTime: 10 }); expect(wrapper.text()).toContain('Spoiler berikutnya')
 wrapper.unmount()
})
