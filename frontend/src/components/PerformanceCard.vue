<script setup>
import { ref, watch } from 'vue'
import { useProductText } from '@/i18n/product'
const props = defineProps({ video: { type: Object, required: true } })
const emit = defineEmits(['select'])
const { t } = useProductText()
const imageFailed = ref(false)
watch(() => props.video.thumbnail, () => { imageFailed.value = false })
</script>
<template>
 <article class="performance-card">
  <div class="performance-image">
   <img v-if="video.thumbnail && !imageFailed" :src="video.thumbnail" :alt="video.title || t('card.untitled')" width="480" height="270" loading="lazy" @error="imageFailed = true" />
   <p v-else>{{ t('card.imageMissing') }}</p>
   <span v-if="video.duration" class="performance-duration">{{ video.duration }}</span>
  </div>
  <div class="performance-copy">
   <h3>{{ video.title || t('card.untitled') }}</h3>
   <p v-if="video.channelTitle" class="performance-channel">{{ t('card.channel') }}: {{ video.channelTitle }}</p>
   <dl><div><dt>{{ t('card.dalang') }}</dt><dd>{{ video.dalang || t('card.unknownDalang') }}</dd></div><div><dt>{{ t('card.language') }}</dt><dd>{{ video.language || t('card.unknownLanguage') }}</dd></div></dl>
   <button class="button button-primary video-card" :aria-label="`${t('source.watch')}: ${video.title || t('card.untitled')}`" @click="emit('select', video)">{{ t('source.watch') }}<span aria-hidden="true">→</span></button>
  </div>
 </article>
</template>
<style scoped>
.performance-card { min-width: 0; border-bottom: 1px solid var(--line); padding-bottom: 20px; }
.performance-image { aspect-ratio: 16/9; background: var(--raised); border-radius: 10px; overflow: hidden; position: relative; }
.performance-image img { width: 100%; height: 100%; object-fit: cover; }.performance-image > p { display: grid; place-content: center; height: 100%; font-size: 14px; color: var(--muted); }
.performance-duration { position: absolute; bottom: 10px; right: 10px; background: var(--canvas); padding: 3px 7px; border-radius: 4px; font-size: 13px; }
.performance-copy { padding-top: 16px; }.performance-copy h3 { font-size: 18px; line-height: 1.5; font-weight: 500; overflow-wrap: anywhere; }
.performance-channel { color: var(--muted); font-size: 13px; margin-top: 8px; }dl { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 14px 0 18px; font-size: 13px; }dt { color: var(--muted); margin-bottom: 3px; }dd { color: var(--cream); }.button { width: 100%; }
</style>
