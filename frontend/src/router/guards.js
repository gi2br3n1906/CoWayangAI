export async function requireAuthenticatedRoute(to, authStore) {
  await (authStore.waitUntilReady ? authStore.waitUntilReady() : authStore.ready)
  if (authStore.isAuthenticated) return true
  return { path: '/', query: { auth: 'required', redirect: to.fullPath } }
}
