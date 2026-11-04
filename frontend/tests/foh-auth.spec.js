import { describe, expect, it, vi } from 'vitest'
import { createFohAuthInterceptor } from '../src/services/fohAuth.js'

describe('FOH API authentication', () => {
  it('attaches a Firebase bearer token to private FOH requests', async () => {
    const interceptor = createFohAuthInterceptor({ currentUser: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') } })
    const config = await interceptor({ url: '/api/foh-stream/session', headers: {} })
    expect(config.headers.Authorization).toBe('Bearer firebase-id-token')
  })

  it('attaches Firebase auth to subtitle mode requests', async () => {
    const interceptor = createFohAuthInterceptor({ currentUser: { getIdToken: vi.fn().mockResolvedValue('firebase-id-token') } })
    const config = await interceptor({ url: '/api/foh-stream/uji-foh/subtitle-mode', headers: {} })
    expect(config.headers.Authorization).toBe('Bearer firebase-id-token')
  })

  it('does not require Firebase auth for public output endpoints', async () => {
    const config = { url: '/api/foh-stream/tmii-jawa/latest', headers: {} }
    await expect(createFohAuthInterceptor({ currentUser: null })(config)).resolves.toBe(config)
    expect(config.headers.Authorization).toBeUndefined()
  })
})
