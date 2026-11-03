import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { messages } from '../src/i18n/product.js'
import PerformanceCard from '../src/components/PerformanceCard.vue'
import { featuredPerformances } from '../src/data/videos.js'

it('keeps Indonesian and English product dictionaries complete and nonempty', () => {
 expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.id).sort())
 for (const copy of Object.values(messages)) for (const text of Object.values(copy)) expect(typeof text === 'string' && text.length > 0).toBe(true)
})
it('publishes no unverified featured entries or thumbnails', () => {
 for (const entry of featuredPerformances) { expect(entry.metadataVerified).toBe(true); expect(entry.imagePermission).toBeTruthy() }
 expect(featuredPerformances).toHaveLength(0)
})
it('does not infer a dalang, language, duration or image from a search title', async () => {
 const locale = ref('id')
 const wrapper = mount(PerformanceCard, { props: { video: { title: 'Synthetic test title only', videoId: 'abcdefghijk' } }, global: { provide: { 'product-locale': locale } } })
 expect(wrapper.findAll('dd').map(item => item.text())).toEqual(['Belum tercantum', 'Belum tercantum'])
 expect(wrapper.find('img').exists()).toBe(false)
 expect(wrapper.find('.performance-duration').exists()).toBe(false)
 locale.value = 'en'; await wrapper.vm.$nextTick()
 expect(wrapper.find('h3').text()).toBe('Synthetic test title only')
 expect(wrapper.find('button').text()).toContain('Watch with guidance')
 wrapper.unmount()
})
it('renders only supplied metadata and handles image failure without invented artwork', async () => {
 const wrapper = mount(PerformanceCard, { props: { video: { title: 'Synthetic adapter', videoId: 'abcdefghijk', dalang: 'Test supplied name', language: 'Test supplied language', duration: '00:42', thumbnail: '/test-only.jpg' } } })
 expect(wrapper.find('.performance-duration').text()).toBe('00:42')
 await wrapper.find('img').trigger('error')
 expect(wrapper.find('img').exists()).toBe(false)
 expect(wrapper.text()).toContain('Gambar belum tersedia')
 wrapper.unmount()
})
