<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useProductText } from '@/i18n/product'
const { t } = useProductText()
const props = defineProps({ collapsed: Boolean, mobileOpen: Boolean, disabled: Boolean, user: { type: Object, default: null } })
const emit = defineEmits(['collapse', 'close', 'account', 'shortcuts', 'tutorial', 'logout'])
const route = useRoute()
const sidebar = ref(null)
let previousFocus = null
const links = [
 { to: '/tonton', key: 'nav.watch', icon: 'stream' },
 { to: '/gallery', key: 'nav.explore', icon: 'gallery' },
 { to: '/saved', key: 'nav.saved', icon: 'book' }
]
const secondary = [
 { to: '/settings', key: 'nav.settings', icon: 'settings' },
 { to: '/performance', key: 'nav.service', icon: 'monitor' },
 { to: '/almanac', key: 'nav.almanac', icon: 'book' },
 { to: '/about', key: 'nav.about', icon: 'story' }
]
const focusable = () => [...(sidebar.value?.querySelectorAll('a, button') || [])].filter(el => el.getClientRects().length)
const closeDrawer = () => emit('close')
const handleKey = (event) => {
 if (!props.mobileOpen) return
 if (event.key === 'Escape') { event.preventDefault(); closeDrawer() }
 if (event.key === 'Tab') {
  const elements = focusable(), first = elements[0], last = elements.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
 }
}
watch(() => props.mobileOpen, async open => {
 if (open) { previousFocus = document.activeElement; await nextTick(); sidebar.value?.querySelector('.primary-navigation a')?.focus() }
 else { await nextTick(); previousFocus?.focus(); previousFocus = null }
})
watch(() => route.path, closeDrawer)
const handleBreakpoint = () => { if (window.innerWidth >= 1024 && props.mobileOpen) closeDrawer() }
onMounted(() => { window.addEventListener('keydown', handleKey); window.addEventListener('resize', handleBreakpoint) })
onUnmounted(() => { window.removeEventListener('keydown', handleKey); window.removeEventListener('resize', handleBreakpoint) })
</script>
<template>
 <button v-if="mobileOpen" class="sidebar-backdrop" :aria-label="t('nav.close')" tabindex="-1" @click="closeDrawer" />
 <aside id="workspace-sidebar" ref="sidebar" class="workspace-sidebar" :class="{ 'is-collapsed': collapsed, 'is-open': mobileOpen }" :aria-label="t('nav.primary')" :aria-hidden="!mobileOpen" :inert="disabled || !mobileOpen || undefined">
  <div class="sidebar-brand"><img src="/brand-mark.webp" width="36" height="36" alt="" /><div class="sidebar-label"><strong>CoWayang<span>AI</span></strong><small>Wayang kulit</small></div><button class="icon-button drawer-close" :aria-label="t('nav.close')" @click="closeDrawer"><AppIcon name="close" /></button></div>
  <nav :aria-label="t('nav.primary')" class="primary-navigation">
   <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="sidebar-link" :class="{ active: route.path === link.to || (route.name === 'home' && link.to === '/tonton') }" :title="collapsed ? t(link.key) : undefined" :aria-label="t(link.key)" :aria-current="route.path === link.to || (route.name === 'home' && link.to === '/tonton') ? 'page' : undefined"><AppIcon :name="link.icon" /><span class="sidebar-label">{{ t(link.key) }}</span><span v-if="route.path === link.to || (route.name === 'home' && link.to === '/tonton')" class="active-mark sidebar-label" /></RouterLink>
  </nav>
  <div class="sidebar-secondary"><p class="sidebar-section-label sidebar-label">{{ t('nav.secondary') }}</p><nav :aria-label="t('nav.secondary')">
   <RouterLink v-for="link in secondary" :key="link.to" :to="link.to" class="sidebar-link" :class="{ active: route.path === link.to }" :title="collapsed ? t(link.key) : undefined" :aria-label="t(link.key)" :aria-current="route.path === link.to ? 'page' : undefined"><AppIcon :name="link.icon" /><span class="sidebar-label">{{ t(link.key) }}</span></RouterLink>
  </nav></div>
  <div class="sidebar-bottom">
   <button class="sidebar-link" :aria-label="t('nav.help')" :title="t('nav.help')" @click="emit('tutorial')"><AppIcon name="story" /><span class="sidebar-label">{{ t('nav.help') }}</span></button>
   <button class="sidebar-link" :aria-label="t('nav.shortcuts')" :title="t('nav.shortcuts')" @click="emit('shortcuts')"><AppIcon name="keyboard" /><span class="sidebar-label">{{ t('nav.shortcuts') }}</span><kbd class="sidebar-label">?</kbd></button>
   <button class="sidebar-account" :aria-label="user ? t('nav.profile') : t('nav.account')" :title="user ? t('nav.profile') : t('nav.account')" @click="emit('account')"><span class="avatar"><AppIcon name="user" /></span><span class="sidebar-label"><strong>{{ user?.displayName || t('nav.personal') }}</strong><small>{{ user ? t('nav.profileNote') : t('nav.signIn') }}</small></span></button>
   <button v-if="user" class="sidebar-link" :aria-label="t('nav.logout')" @click="emit('logout')"><AppIcon name="logout" /><span class="sidebar-label">{{ t('nav.logout') }}</span></button>
   <button class="sidebar-link desktop-collapse" :aria-label="collapsed ? t('nav.expand') : t('nav.compact')" :aria-expanded="!collapsed" @click="emit('collapse')"><AppIcon name="collapse" /><span class="sidebar-label">{{ t('nav.compact') }}</span></button>
  </div>
 </aside>
</template>
