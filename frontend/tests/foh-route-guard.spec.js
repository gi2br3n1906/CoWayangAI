import { describe, expect, it, vi } from 'vitest'
import { requireAuthenticatedRoute } from '../src/router/guards.js'

describe('FOH route authentication guard', () => {
  it('waits for Firebase restoration before deciding', async () => {
    let resolveReady
    const authStore = { ready: new Promise(resolve => { resolveReady = resolve }), isAuthenticated: false }
    const navigation = requireAuthenticatedRoute({ fullPath: '/foh-admin' }, authStore)
    resolveReady()
    await expect(navigation).resolves.toEqual({ path: '/', query: { auth: 'required', redirect: '/foh-admin' } })
  })

  it('allows an authenticated account through', async () => {
    const authStore = { ready: Promise.resolve(), isAuthenticated: true }
    await expect(requireAuthenticatedRoute({ fullPath: '/foh-admin' }, authStore)).resolves.toBe(true)
  })
})
