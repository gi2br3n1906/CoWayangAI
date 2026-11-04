const PRIVATE_FOH_PATH = /^\/api\/foh-stream(?:\/session|s(?:\/|$)|\/[^/]+\/(?:resume|session|audio|subtitle-mode|script-mode|script-position|script-preview))$/

export function createFohAuthInterceptor(auth) {
  return async config => {
    if (!PRIVATE_FOH_PATH.test(config.url || '')) return config
    const user = auth.currentUser
    if (!user) throw Object.assign(new Error('Authentication required'), { code: 'auth/required' })
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${await user.getIdToken()}`
    return config
  }
}
