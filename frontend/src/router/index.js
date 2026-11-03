import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { requireAuthenticatedRoute } from './guards'
const router = createRouter({
 history: createWebHistory(import.meta.env.BASE_URL),
 routes: [
  { path: '/foh-output/:streamKey', name: 'foh-output', component: () => import('@/views/FohOutputView.vue'), meta: { standalone: true, title: 'FOH Output' } },
  { path: '/foh-admin', name: 'foh-admin', component: () => import('@/views/FohAdminView.vue'), meta: { title: 'FOH Broadcaster', requiresAuth: true } },
  { path: '/', alias: '/tonton', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: 'Tonton', titleKey: 'nav.watch' } },
  { path: '/gallery', name: 'gallery', component: () => import('@/views/GalleryView.vue'), meta: { title: 'Jelajahi', titleKey: 'nav.explore' } },
  { path: '/saved', name: 'saved', component: () => import('@/views/SavedView.vue'), meta: { title: 'Tersimpan', titleKey: 'nav.saved' } },
  { path: '/almanac', name: 'almanac', component: () => import('@/views/AlmanacView.vue'), meta: { title: 'Almanak wayang', titleKey: 'nav.almanac' } },
  { path: '/performance', name: 'performance', component: () => import('@/views/PerformanceView.vue'), meta: { title: 'Informasi layanan', titleKey: 'nav.service' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: 'Pengaturan', titleKey: 'nav.settings' } },
  { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue'), meta: { title: 'Tentang CoWayang', titleKey: 'nav.about' } },
  { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue'), meta: { title: 'Halaman tidak ditemukan', titleKey: 'page.missing' } }
 ],
 scrollBehavior(to, from, savedPosition) { return savedPosition || { top: 0 } }
})
router.beforeEach(to => to.meta.requiresAuth ? requireAuthenticatedRoute(to, useAuthStore()) : true)
export default router
