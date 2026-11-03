<script setup>
import { ref, shallowRef, defineAsyncComponent, onMounted, onUnmounted, watch, nextTick, provide, toRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import TopNavbar from '@/components/TopNavbar.vue'
import AppIcon from '@/components/AppIcon.vue'
import ToastRegion from '@/components/ToastRegion.vue'
import RouteBoundary from '@/components/RouteBoundary.vue'

import { useNotifications } from './stores/notifications'
import { useSettings } from './stores/settings'
import { useAuthStore } from './stores/auth'
import { useProductText } from './i18n/product'
const route = useRoute(), router = useRouter()
const notifications = useNotifications()
const settings = useSettings()
provide('product-locale', toRef(settings, 'uiLanguage'))
// Descendants receive this provider; App itself passes the locale explicitly.
const { t } = useProductText(toRef(settings, 'uiLanguage'))
const mobileOpen = ref(false), modal = ref(null), account = shallowRef(null), hubSearchResult = ref(null), navbar = ref(null)
provide('account-state', account)
provide('request-account', openAccount)
provide('hub-search-result', hubSearchResult)
provide('hub-source-control', { setVideoUrl: url => navbar.value?.setVideoUrl(url) })

const modals = {
 login: defineAsyncComponent(() => import('@/components/LoginModal.vue')),
 register: defineAsyncComponent(() => import('@/components/RegisterModal.vue')),
 forgot: defineAsyncComponent(() => import('@/components/ForgotPasswordModal.vue')),
 profile: defineAsyncComponent(() => import('@/components/UserProfileModal.vue')),
 shortcuts: defineAsyncComponent(() => import('@/components/KeyboardShortcutsModal.vue')),
 tutorial: defineAsyncComponent(() => import('@/components/TutorialModal.vue'))
}
let disposed = false, unsubscribe = null, previousFocus = null
async function loadAccount() {
 if (disposed) return null
 account.value = useAuthStore()
 unsubscribe = account.value.initAuth()
 return account.value
}
async function openAccount() {
 try {
  const auth = account.value || await loadAccount()
  if (auth) modal.value = auth.isAuthenticated ? 'profile' : 'login'
 } catch { notifications.notify('Layanan akun belum tersedia. Periksa konfigurasi Firebase.') }
}
async function completeAccountLogin() {
 modal.value = null
 if (route.query.auth !== 'required') return
 const destination = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/foh-admin') ? route.query.redirect : '/foh-admin'
 await router.replace(destination)
}
async function logout() {
 const result = await account.value?.logout()
 if (result && !result.success) notifications.notify('Belum dapat keluar dari akun. Coba lagi.')
}
function handleHubSearch(data) {
 hubSearchResult.value = data
 if (route.path !== '/tonton' && route.path !== '/') router.push('/tonton')
}
async function handleHubAnalyze(payload) {
 await router.push({ path: '/tonton', query: { video: payload.url, open: '1', mode: payload.mode || 'live', startTime: String(payload.startTime || 0) } })
}
const maintenance = import.meta.env.VITE_AI_MAINTENANCE === 'true'
function keyboard(event) {
 if (event.key === 'Escape') { modal.value = null; mobileOpen.value = false; return }
 if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
 if (event.key === '?' && !mobileOpen.value) { event.preventDefault(); modal.value = modal.value ? null : 'shortcuts' }
}
const focusModal = () => document.querySelector('.account-modal button, .account-modal input')?.focus()
watch(modal, async (value, previous) => {
 if (value) mobileOpen.value = false
 if (value && !previous) previousFocus = document.activeElement
 await nextTick()
 if (value) focusModal()
 else previousFocus?.focus()
})
watch(() => [route.path, route.meta.title, settings.uiLanguage], () => { document.title = `${route.meta.titleKey ? t(route.meta.titleKey) : route.meta.title || 'CoWayangAI'} · CoWayangAI`; document.documentElement.lang = settings.uiLanguage; mobileOpen.value = false }, { immediate: true })
watch(mobileOpen, value => { if (typeof document !== 'undefined') document.body.classList.toggle('drawer-open', value) })
onMounted(async () => {
 window.addEventListener('keydown', keyboard)
 if (import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
  try {
   const authStore = await loadAccount()
   await authStore?.waitUntilReady()
   if (route.query.auth === 'required' && authStore?.isAuthenticated) completeAccountLogin()
   else if (route.query.auth === 'required') modal.value = 'login'
  } catch { notifications.notify('Layanan akun tidak dapat dimuat.') }
 }
})
onUnmounted(() => { disposed = true; unsubscribe?.(); notifications.clear(); window.removeEventListener('keydown', keyboard); document.body.classList.remove('drawer-open') })
function playHistory(url) { modal.value = null; router.push({ path: '/tonton', query: { video: url } }) }
</script>
<template>
 <RouterView v-if="route.meta.standalone" />
 <div v-else class="workspace-shell" :data-drawer-open="mobileOpen">
  <a href="#main-content" class="skip-link">{{ t('app.skip') }}</a>
  <AppSidebar :disabled="Boolean(modal)" :collapsed="false" :mobile-open="mobileOpen" :user="account?.user || null" @close="mobileOpen = false" @account="openAccount" @logout="logout" @shortcuts="modal = 'shortcuts'" @tutorial="modal = 'tutorial'" />
  <TopNavbar ref="navbar" :inert="modal ? true : undefined" :loading="false" :maintenance="maintenance" :language="settings.uiLanguage" @open-drawer="mobileOpen = true" @account="openAccount" @language-change="settings.uiLanguage = $event" @search-results="handleHubSearch" @analyze="handleHubAnalyze" />
  <main id="main-content" class="workspace-main" :inert="mobileOpen || modal ? true : undefined" tabindex="-1">
   <div class="workspace-content max-w-7xl mx-auto">
    <div v-if="maintenance" class="maintenance-notice" role="status"><span class="status-dot" />{{ t('app.maintenance') }}</div>
    <RouteBoundary :key="route.path"><RouterView v-slot="{ Component }"><component :is="Component" /></RouterView></RouteBoundary>
    <footer class="workspace-footer"><span>CoWayangAI · {{ t('app.footer') }}</span><RouterLink to="/about">{{ t('nav.about') }}</RouterLink></footer>
   </div>
  </main>
  <div v-if="modal" class="account-modal" role="dialog" aria-modal="true" :aria-label="modal === 'profile' ? 'Profil akun' : 'Dialog CoWayangAI'" @keydown.tab="($event) => {
   const elements = [...$event.currentTarget.querySelectorAll('button, input, a, select, textarea')].filter(el => !el.disabled && el.getClientRects().length)
   const first = elements[0], last = elements.at(-1)
   if ($event.shiftKey && document.activeElement === first) { $event.preventDefault(); last?.focus() }
   else if (!$event.shiftKey && document.activeElement === last) { $event.preventDefault(); first?.focus() }
  }">
   <component :is="modals[modal]" :is-open="true" @vue:mounted="focusModal" @close="modal = null" @login="completeAccountLogin" @register="completeAccountLogin" @complete="modal = null" @switch-to-register="modal = 'register'" @switch-to-login="modal = 'login'" @forgot-password="modal = 'forgot'" @play-video="playHistory" />
  </div>
  <ToastRegion />
 </div>
</template>