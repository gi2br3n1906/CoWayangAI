<script setup>
import { useRouter } from 'vue-router'
import { useProductText } from '@/i18n/product'
import VideoGallery from '@/components/VideoGallery.vue'
const router = useRouter(), { t } = useProductText()
const select = payload => router.push({ name: 'home', query: { video: payload.url, open: '1', mode: payload.mode || 'live', startTime: String(payload.startTime ?? 0) } })
</script>
<template><section><div class="page-heading"><h1>{{ t('explore.title') }}</h1><p>{{ t('explore.description') }}</p></div><VideoGallery @select-video="select" /></section></template>
