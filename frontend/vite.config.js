import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
 plugins: [vue()],
 resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
 server: { proxy: { '/api': 'http://127.0.0.1:3000', '/health': 'http://127.0.0.1:3000', '/socket.io': { target: 'http://127.0.0.1:3000', ws: true } } },
 build: { rollupOptions: { output: { manualChunks(id) {
  if (id.includes('node_modules')) {
   if (id.includes('firebase') || id.includes('@firebase')) return 'firebase'
   if (id.includes('socket.io') || id.includes('engine.io')) return 'realtime'
  }
 } } } }
})
