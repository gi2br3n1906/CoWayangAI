import { it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AlmanacView from '../src/views/AlmanacView.vue'
it('restores body scrolling when a character dialog unmounts', async () => {
 document.body.style.overflow = ''
 const wrapper = mount(AlmanacView, { attachTo: document.body })
 await flushPromises()
 const card = wrapper.find('article'); await card.trigger('click')
 wrapper.unmount()
 expect(document.body.style.overflow).toBe('')
})
