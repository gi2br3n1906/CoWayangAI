import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StickySearchBar from '../src/components/StickySearchBar.vue'

it('shows a readable source heading and visible labels in both source modes', async () => {
 const wrapper = mount(StickySearchBar)
 expect(wrapper.find('h2').text()).toBe('Cari pertunjukan')
 expect(wrapper.find('label[for="video-search"]').classes()).not.toContain('sr-only')
 const buttons = wrapper.findAll('.source-modes button')
 expect(buttons[0].attributes('aria-pressed')).toBe('true')
 await buttons[1].trigger('click')
 expect(buttons[1].attributes('aria-pressed')).toBe('true')
 expect(wrapper.find('label[for="video-url"]').classes()).not.toContain('sr-only')
 expect(wrapper.findAll('option').map(option => option.attributes('value'))).toEqual(['live', 'analysis', 'transcript'])
 expect(wrapper.text()).not.toMatch(/HTTP|legacy|worker/)
 wrapper.unmount()
})

it('keeps gallery prefill and Enter submission while showing invalid URL feedback', async () => {
 const wrapper = mount(StickySearchBar)
 wrapper.vm.setVideoUrl('https://youtu.be/aOtB-yw9GSE')
 await wrapper.vm.$nextTick()
 expect(wrapper.find('#video-url').element.value).toBe('https://youtu.be/aOtB-yw9GSE')
 await wrapper.find('#start-time').setValue('1:02.5')
 await wrapper.find('#video-url').trigger('keyup.enter')
 expect(wrapper.emitted('analyze')[0][0]).toEqual({ url: 'https://youtu.be/aOtB-yw9GSE', startTime: '1:02.5', mode: 'live' })
 await wrapper.find('#video-url').setValue('https://invalid.test')
 await wrapper.find('#video-url').trigger('keyup.enter')
 expect(wrapper.find('[role="alert"]').text()).toContain('tautan YouTube yang valid')
 expect(wrapper.emitted('analyze')).toHaveLength(1)
 wrapper.unmount()
})

it('preserves loading and maintenance blocking without claiming readiness', async () => {
 const wrapper = mount(StickySearchBar, { props: { maintenance: true } })
 wrapper.vm.setVideoUrl('https://youtu.be/aOtB-yw9GSE')
 await wrapper.vm.$nextTick()
 expect(wrapper.find('.source-form .button').attributes('disabled')).toBeDefined()
 await wrapper.find('#video-url').trigger('keyup.enter')
 expect(wrapper.emitted('analyze')).toBeUndefined()
 expect(wrapper.text()).toContain('Panduan dinonaktifkan sementara')
 await wrapper.setProps({ maintenance: false, loading: true })
 expect(wrapper.find('.source-form .button').text()).toContain('Membuka tontonan')
 await wrapper.find('#video-url').trigger('keyup.enter')
 expect(wrapper.emitted('analyze')).toBeUndefined()
 wrapper.unmount()
})
