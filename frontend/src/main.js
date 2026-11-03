import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { useNotifications } from './stores/notifications'
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.config.errorHandler = () => useNotifications(pinia).notify('Terjadi kesalahan pada tampilan. Muat ulang halaman atau pilih tampilan lain.')
router.onError(() => useNotifications(pinia).notify('Tampilan gagal dimuat. Periksa koneksi lalu muat ulang halaman.'))
app.mount('#app')
