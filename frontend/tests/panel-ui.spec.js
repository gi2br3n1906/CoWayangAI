import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveTranscription from '../src/components/LiveTranscription.vue'
import DetectionPanel from '../src/components/DetectionPanel.vue'

it('labels original speech and translation without inventing a target language', () => {
 const wrapper = mount(LiveTranscription, { props: { subtitles: [{ id: 'one', start_time: 0, text: 'Ukara asli', translation: 'Terjemahan uji' }] } })
 expect(wrapper.find('.transcript-label').text()).toBe('Ujaran asli')
 expect(wrapper.find('.translation-label').text()).toBe('Terjemahan')
 expect(wrapper.text()).not.toMatch(/Bahasa Indonesia|English/)
 expect(wrapper.find('.translation').text()).toContain('Terjemahan uji')
 wrapper.unmount()
})

it('does not render a translation section when no translation was received', () => {
 const wrapper = mount(LiveTranscription, { props: { subtitles: [{ id: 'one', start_time: 0, text: 'Ukara asli' }] } })
 expect(wrapper.find('.transcript-label').exists()).toBe(true)
 expect(wrapper.find('.translation-label').exists()).toBe(false)
 expect(wrapper.find('.translation').exists()).toBe(false)
 wrapper.unmount()
})

it('distinguishes no incoming detection from an empty connected result without inventing readiness', async () => {
 const wrapper = mount(DetectionPanel, { global: { stubs: { RouterLink: true } } })
 expect(wrapper.find('.empty-state').text()).toContain('Panduan tokoh belum tersedia')
 expect(wrapper.find('.panel-status').text()).toBe('Belum terhubung')
 await wrapper.setProps({ aiConnected: true })
 expect(wrapper.find('.empty-state').text()).toContain('Belum ada nama tokoh yang diterima')
 expect(wrapper.find('.panel-status').text()).toBe('Terhubung')
 wrapper.unmount()
})
