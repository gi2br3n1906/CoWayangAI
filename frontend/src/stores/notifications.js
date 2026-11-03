import { ref } from 'vue'
import { defineStore } from 'pinia'
export const useNotifications = defineStore('notifications', () => {
 const items = ref([])
 let sequence = 0
 const timers = new Map()
 function dismiss(id) { clearTimeout(timers.get(id)); timers.delete(id); items.value = items.value.filter(item => item.id !== id) }
 function notify(message, kind = 'error') {
  const id = ++sequence
  if (items.value.length >= 4) dismiss(items.value[0].id)
  items.value.push({ id, message, kind }); timers.set(id, setTimeout(() => dismiss(id), 6000))
  return id
 }
 function clear() { for (const id of timers.keys()) dismiss(id) }
 return { items, notify, dismiss, clear }
})
