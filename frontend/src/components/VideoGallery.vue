<script setup>
import { ref } from 'vue'
import { useProductText } from '@/i18n/product'
import StickySearchBar from './StickySearchBar.vue'
import PerformanceCard from './PerformanceCard.vue'
const emit = defineEmits(['select-video'])
const { t } = useProductText()
const source = ref(null), results = ref([]), error = ref(''), searched = ref(false)
function searchResults(data) { results.value = data.videos; error.value = data.error || ''; searched.value = true }
function select(video) { emit('select-video', { url: `https://www.youtube.com/watch?v=${video.videoId}`, mode: 'live', startTime: 0 }) }
</script>
<template>
 <section class="video-gallery">
  <StickySearchBar ref="source" @search-results="searchResults" @analyze="payload => emit('select-video', payload)" />
  <div class="beginner-search"><p>{{ t('home.new') }}</p><button class="button" data-beginner-search @click="source?.searchFor('wayang kulit')">{{ t('explore.begin') }}<span aria-hidden="true">→</span></button></div>
  <div v-if="error" class="notice" role="status"><div><p>{{ t('source.failed') }}</p><button class="button mt-3" @click="source?.searchFor('wayang kulit')">{{ t('explore.retry') }}</button></div></div>
  <div v-if="!results.length && !error" class="browse-empty" role="status"><h2>{{ searched ? t('explore.noResults') : t('explore.empty') }}</h2><p>{{ t('explore.emptyNote') }}</p></div>
  <section v-if="results.length" class="search-results" :aria-label="t('explore.results')"><h2>{{ t('explore.results') }}</h2><div class="performance-grid"><PerformanceCard v-for="video in results" :key="video.videoId" :video="video" @select="select" /></div></section>
 </section>
</template>
<style scoped>
.beginner-search { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin: 24px 0; font-size: 15px; }.browse-empty { padding: 30px 0; }.browse-empty h2 { font-size: 18px; }.browse-empty p { color: var(--muted); font-size: 14px; line-height: 1.7; margin-top: 10px; }.search-results > h2 { font-size: 22px; margin: 24px 0; }
</style>