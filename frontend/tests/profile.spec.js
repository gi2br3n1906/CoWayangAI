import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
const state = vi.hoisted(() => ({ getDocs: vi.fn(async () => ({ docs: [] })), user: { uid: 'qa-user', displayName: 'Tester' } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: state.user }) }))
vi.mock('@/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), deleteDoc: vi.fn(), collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), getDocs: (...args) => state.getDocs(...args) }))
import UserProfileModal from '../src/components/UserProfileModal.vue'
it('can mount a signed-in profile and fetch account records without a setup ordering error', async () => {
 const wrapper = mount(UserProfileModal, { props: { isOpen: true } })
 await flushPromises()
 expect(state.getDocs).toHaveBeenCalledTimes(2)
 wrapper.unmount()
})
