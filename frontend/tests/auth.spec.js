import { it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const observer = vi.hoisted(() => ({ subscribe: vi.fn(() => vi.fn()) }))
vi.mock('@/firebase', () => ({ auth: {}, db: {} }))
vi.mock('firebase/auth', async importOriginal => ({ ...(await importOriginal()), onAuthStateChanged: (...args) => observer.subscribe(...args) }))
import { useAuthStore } from '../src/stores/auth'
it('owns a single disposable auth observer', () => {
 setActivePinia(createPinia()); const store = useAuthStore()
 const stop = store.initAuth(); store.initAuth()
 expect(observer.subscribe).toHaveBeenCalledTimes(1)
 expect(typeof stop).toBe('function')
 stop()
})
