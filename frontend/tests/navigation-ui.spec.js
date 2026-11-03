import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '../src/components/AppSidebar.vue'
import appRouter from '../src/router/index.js'

it('uses Indonesian navigation names without changing route paths or compact-rail names', async () => {
 const router = createRouter({ history: createMemoryHistory(), routes: appRouter.options.routes })
 await router.push('/'); await router.isReady()
 const wrapper = mount(AppSidebar, { props: { collapsed: true, mobileOpen: true }, global: { plugins: [router] } })
 for (const [path, label] of [['/tonton', 'Tonton'], ['/gallery', 'Jelajahi'], ['/saved', 'Tersimpan']]) {
  const link = wrapper.find(`a[href="${path}"]`)
  expect(link.attributes('aria-label')).toBe(label)
  expect(link.attributes('title')).toBe(label)
  expect(label).toBeTruthy()
 }
 expect(wrapper.find('.primary-navigation').attributes('aria-label')).toBe('Navigasi utama')
 expect(wrapper.findAll('.primary-navigation a')).toHaveLength(3)
 expect(wrapper.find('.sidebar-secondary a[href="/performance"]').exists()).toBe(true)
 wrapper.unmount()
})
