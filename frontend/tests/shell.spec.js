import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: null, isAuthenticated: false }) }))
vi.mock('socket.io-client', () => ({ default: () => ({ on() {}, off() {}, disconnect() {} }) }))
import App from '../src/App.vue'
import router from '../src/router/index.js'

describe('YouTube overlay application shell', () => {
  it('renders sticky top navbar, closed drawer and no legacy rail', () => {
    const memory = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    const wrapper = shallowMount(App, { global: { plugins: [createPinia(), memory], renderStubDefaultSlot: true } })
    expect(wrapper.find('top-navbar-stub').exists()).toBe(true)
    expect(wrapper.find('.workspace-shell').attributes('data-drawer-open')).toBe('false')
    expect(wrapper.find('router-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })
  it('updates the home document title when initial route metadata resolves at the same path', async () => {
    const memory = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' }, meta: { title: 'Tonton Wayang' } }] })
    const wrapper = shallowMount(App, { global: { plugins: [createPinia(), memory], renderStubDefaultSlot: true } })
    try {
      await memory.push('/'); await memory.isReady(); await flushPromises()
      expect(document.title).toBe('Tonton Wayang · CoWayangAI')
    } finally { wrapper.unmount() }
  })
  it('keeps Tonton alias and lazy routes for each workspace feature', () => {
    expect(router.resolve('/tonton').name).toBe('home')
    expect(router.resolve('/foh-output/tmii-test').meta.standalone).toBe(true)
    expect(router.resolve('/foh-admin').name).toBe('foh-admin')
    for (const path of ['/', '/gallery', '/almanac', '/performance', '/settings', '/about']) {
      const route = router.options.routes.find(route => route.path === path)
      expect(route, path).toBeDefined()
      expect(typeof route.component, path).toBe('function')
    }
  })
  it('renders standalone output without navigation chrome', async () => {
    const memory = createRouter({ history: createMemoryHistory(), routes: [{ path: '/foh-output/:streamKey', component: { template: '<div class="output-only" />' }, meta: { standalone: true } }] })
    await memory.push('/foh-output/test'); await memory.isReady()
    const wrapper = shallowMount(App, { global: { plugins: [createPinia(), memory], renderStubDefaultSlot: true } })
    expect(wrapper.find('.workspace-shell').exists()).toBe(false)
    expect(wrapper.find('top-navbar-stub').exists()).toBe(false)
    wrapper.unmount()
  })
})
