import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { messages } from '../src/i18n/product.js'
import SavedView from '../src/views/SavedView.vue'

// Synthetic service adapters only: no live Firebase account/configuration is loaded.
const service = vi.hoisted(() => ({ getDocs: vi.fn(), collection: vi.fn(), firebaseLoaded: vi.fn() }))
vi.mock('firebase/firestore', () => ({ getDocs: service.getDocs, collection: service.collection }))
vi.mock('@/firebase', () => {
  service.firebaseLoaded()
  return { db: { synthetic: true } }
})

const wrappers = []
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function snapshot(items = []) {
  return { docs: items.map(({ id, ...data }) => ({ id, data: () => data })) }
}
async function render(account = shallowRef(null), locale = ref('id'), provideAccount = true) {
  const requestAccount = vi.fn()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/gallery', component: { template: '<div />' } },
    { path: '/saved', component: SavedView },
  ] })
  await router.push('/saved')
  await router.isReady()
  const provide = { 'product-locale': locale }
  if (provideAccount) Object.assign(provide, { 'account-state': account, 'request-account': requestAccount })
  const wrapper = mount(SavedView, { global: { plugins: [router], provide } })
  wrappers.push(wrapper)
  return { wrapper, router, requestAccount, account, locale }
}
const text = key => messages.id[key]
const buttonWith = (wrapper, label) => wrapper.findAll('button').find(button => button.text() === label)

beforeEach(() => {
  service.getDocs.mockReset()
  service.collection.mockReset().mockImplementation((db, ...path) => ({ db, path }))
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })

describe('SavedView with synthetic favorites service adapters', () => {
  it('works without an account provider and leaves Firebase uninitialized', async () => {
    const { wrapper } = await render(shallowRef(null), ref('id'), false)
    await buttonWith(wrapper, text('saved.login')).trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(text('saved.signInNote'))
    expect(service.firebaseLoaded).not.toHaveBeenCalled()
    expect(service.collection).not.toHaveBeenCalled()
    expect(service.getDocs).not.toHaveBeenCalled()
  })

  it('does not open a detached old-account card after logout', async () => {
    service.getDocs.mockResolvedValue(snapshot([{ id: 'old', title: 'Old account', videoUrl: 'https://youtu.be/abcdefghijk' }]))
    const account = shallowRef(reactive({ user: { uid: 'synthetic-user' } }))
    const { wrapper, router } = await render(account)
    await flushPromises()
    const oldButton = buttonWith(wrapper, text('source.watch'))
    account.value.user = null
    await nextTick()
    await oldButton.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/saved')
  })

  it.each(['resolve', 'reject'])('suppresses a stale UID request that later %ss', async (outcome) => {
    const oldRequest = deferred(), newRequest = deferred()
    service.getDocs.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const account = shallowRef(reactive({ user: { uid: 'synthetic-user-a' } }))
    const { wrapper } = await render(account)
    await flushPromises()
    account.value.user = { uid: 'synthetic-user-b' }
    await nextTick()
    await flushPromises()
    expect(service.collection.mock.calls.map(call => call.slice(1))).toEqual([
      ['users', 'synthetic-user-a', 'favorites'], ['users', 'synthetic-user-b', 'favorites'],
    ])
    newRequest.resolve(snapshot([{ id: 'b', title: 'New account favorite', videoUrl: 'https://youtu.be/abcdefghijk' }]))
    await flushPromises()
    if (outcome === 'resolve') oldRequest.resolve(snapshot([{ id: 'a', title: 'Private old favorite' }]))
    else oldRequest.reject(new Error('synthetic stale failure'))
    await flushPromises()
    expect(wrapper.text()).toContain('New account favorite')
    expect(wrapper.text()).not.toContain('Private old favorite')
    expect(wrapper.text()).not.toContain(text('saved.error'))
  })

  it('clears old cards on logout and does not show them while another account loads', async () => {
    const pending = deferred()
    service.getDocs.mockResolvedValueOnce(snapshot([{ id: 'a', title: 'Private old favorite' }])).mockReturnValueOnce(pending.promise)
    const account = shallowRef(reactive({ user: { uid: 'synthetic-user-a' } }))
    const { wrapper } = await render(account)
    await flushPromises()
    expect(wrapper.text()).toContain('Private old favorite')
    account.value.user = null
    await nextTick()
    expect(wrapper.text()).toContain(text('saved.signIn'))
    expect(wrapper.findAll('li')).toHaveLength(0)
    account.value = reactive({ user: { uid: 'synthetic-user-b' } })
    await nextTick()
    await flushPromises()
    expect(wrapper.text()).toContain(text('saved.loading'))
    expect(wrapper.text()).not.toContain('Private old favorite')
    account.value = null
    await nextTick()
    pending.resolve(snapshot([{ id: 'b', title: 'Logged out response' }]))
    await flushPromises()
    expect(wrapper.text()).toContain(text('saved.signIn'))
    expect(wrapper.text()).not.toContain('Logged out response')
    expect(service.getDocs).toHaveBeenCalledTimes(2)
  })

  it('disposes pending requests and UID watching on unmount', async () => {
    const pending = deferred()
    service.getDocs.mockReturnValue(pending.promise)
    const account = shallowRef(reactive({ user: { uid: 'synthetic-user-a' } }))
    const { wrapper } = await render(account)
    await flushPromises()
    wrapper.unmount()
    const data = vi.fn(() => ({ title: 'Disposed response' }))
    pending.resolve({ docs: [{ id: 'disposed', data }] })
    account.value.user = { uid: 'synthetic-user-b' }
    await flushPromises()
    expect(data).not.toHaveBeenCalled()
    expect(service.getDocs).toHaveBeenCalledOnce()
  })

  it('marks missing or unsafe URLs unavailable without reconstructing videos from IDs', async () => {
    const urls = [undefined, '', 'javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=short', 'https://example.test/abcdefghijk']
    service.getDocs.mockResolvedValue(snapshot(urls.map((videoUrl, index) => ({ id: `invalid-${index}`, videoId: 'abcdefghijk', videoUrl }))))
    const { wrapper, router } = await render(shallowRef(reactive({ user: { uid: 'synthetic-user' } })))
    await flushPromises()
    const cards = wrapper.findAll('li')
    expect(cards).toHaveLength(urls.length)
    for (const card of cards) {
      expect(card.text()).toContain(text('saved.invalid'))
      expect(card.text()).toContain(text('card.untitled'))
      expect(card.text()).toContain(text('card.imageMissing'))
      expect(card.find('button').attributes('disabled')).toBeDefined()
      await card.find('button').trigger('click')
    }
    expect(wrapper.find('img').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/saved')
  })

  it('falls back after an existing thumbnail fails without synthesizing another image', async () => {
    service.getDocs.mockResolvedValue(snapshot([{ id: 'image', videoUrl: 'https://youtu.be/abcdefghijk', title: 'Semar', thumbnail: 'https://example.test/broken.jpg' }]))
    const { wrapper } = await render(shallowRef(reactive({ user: { uid: 'synthetic-user' } })))
    await flushPromises()
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain(text('card.imageMissing'))
    expect(wrapper.text()).toContain('Semar')
  })

  it('reports a service failure honestly and retries without claiming empty', async () => {
    service.getDocs.mockRejectedValueOnce(new Error('synthetic service unavailable'))
      .mockResolvedValueOnce(snapshot([{ id: 'retried', title: 'Petruk', videoUrl: 'https://youtu.be/abcdefghijk' }]))
    const { wrapper } = await render(shallowRef(reactive({ user: { uid: 'synthetic-user' } })))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain(text('saved.error'))
    expect(wrapper.text()).toContain(text('saved.errorNote'))
    expect(wrapper.text()).not.toContain(text('saved.empty'))
    await buttonWith(wrapper, text('saved.retry')).trigger('click')
    await flushPromises()
    expect(service.getDocs).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Petruk')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows stored metadata and opens the original validated URL through home', async () => {
    const videoUrl = 'https://youtu.be/abcdefghijk?t=60'
    service.getDocs.mockResolvedValue(snapshot([{ id: 'synthetic-favorite', videoId: 'abcdefghijk', videoUrl, title: 'Bima Suci · Ki Dalang', thumbnail: 'https://example.test/stored-image.jpg', addedAt: '2026-01-01T00:00:00Z' }]))
    const { wrapper, router, locale } = await render(shallowRef(reactive({ user: { uid: 'synthetic-user' } })))
    await flushPromises()
    expect(wrapper.find('h2').text()).toBe('Bima Suci · Ki Dalang')
    expect(wrapper.find('img').attributes('src')).toBe('https://example.test/stored-image.jpg')
    expect(wrapper.find('img').attributes('alt')).toBe('Bima Suci · Ki Dalang')
    locale.value = 'en'
    await nextTick()
    expect(wrapper.find('h2').text()).toBe('Bima Suci · Ki Dalang')
    await buttonWith(wrapper, messages.en['source.watch']).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.query.video).toBe(videoUrl)
    expect(router.currentRoute.value.query.open).toBe('1')
  })

  it('loads only the authenticated favorites collection and distinguishes loading from empty', async () => {
    const pending = deferred()
    service.getDocs.mockReturnValue(pending.promise)
    const { wrapper } = await render(shallowRef(reactive({ user: { uid: 'synthetic-user-a' } })))
    expect(wrapper.text()).toContain(text('saved.loading'))
    expect(wrapper.text()).not.toContain(text('saved.empty'))
    await flushPromises()
    expect(service.collection).toHaveBeenCalledWith({ synthetic: true }, 'users', 'synthetic-user-a', 'favorites')
    expect(service.getDocs).toHaveBeenCalledOnce()
    pending.resolve(snapshot())
    await flushPromises()
    expect(wrapper.text()).toContain(text('saved.empty'))
    expect(wrapper.text()).toContain(text('saved.emptyNote'))
    expect(wrapper.text()).not.toContain(text('saved.loading'))
    expect(wrapper.find('a[href="/gallery"]').exists()).toBe(true)
  })

  it('offers localized sign-in and exploration without loading favorites while signed out', async () => {
    const { wrapper, requestAccount, locale } = await render()
    expect(wrapper.text()).toContain(text('saved.signInNote'))
    expect(wrapper.find('a[href="/gallery"]').text()).toBe(text('home.browse'))
    await buttonWith(wrapper, text('saved.login')).trigger('click')
    expect(requestAccount).toHaveBeenCalledOnce()
    expect(wrapper.text()).not.toContain(text('saved.empty'))
    expect(service.getDocs).not.toHaveBeenCalled()
    locale.value = 'en'
    await nextTick()
    expect(wrapper.text()).toContain(messages.en['saved.signIn'])
    expect(buttonWith(wrapper, messages.en['saved.login'])).toBeDefined()
  })
})
