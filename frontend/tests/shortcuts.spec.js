import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KeyboardShortcutsModal from '../src/components/KeyboardShortcutsModal.vue'
it('renders shortcut help without the runtime template compiler', () => {
 const wrapper = mount(KeyboardShortcutsModal, { props: { isOpen: true } })
 expect(wrapper.text()).toContain('Mundur 10 detik')
 expect(wrapper.text()).toContain('Maju 10 detik')
 wrapper.unmount()
})
