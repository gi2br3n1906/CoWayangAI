<script setup>
import { useNotifications } from '@/stores/notifications'
import AppIcon from './AppIcon.vue'
const notifications = useNotifications()
</script>
<template><div class="toast-region" aria-live="polite" aria-atomic="false"><div v-for="item in notifications.items" :key="item.id" class="toast" :class="item.kind"><p>{{ item.message }}</p><button class="icon-button" aria-label="Tutup notifikasi" @click="notifications.dismiss(item.id)"><AppIcon name="close" /></button></div></div></template>
