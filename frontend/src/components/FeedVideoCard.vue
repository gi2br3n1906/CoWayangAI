<script setup>
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useProductText } from '@/i18n/product'
const props = defineProps({ video: { type: Object, required: true }, disabled: Boolean })
defineEmits(['select'])
const { t } = useProductText()
const failed = ref(false)
watch(() => props.video.thumbnail, () => { failed.value = false })
</script>
<template>
 <article class="feed-card">
  <button class="feed-card-action" :disabled="disabled" :aria-label="`${t('source.watch')}: ${video.title}`" @click="$emit('select', video)">
   <div class="feed-thumbnail">
    <img v-if="video.thumbnail && !failed" :src="video.thumbnail" alt="" width="480" height="270" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" @error="failed = true" />
    <span v-else class="thumbnail-missing"><AppIcon name="stream" />{{ t('card.imageMissing') }}</span>
    <span class="feed-play" aria-hidden="true"><AppIcon name="stream" /></span>
    <span v-if="video.duration" class="feed-duration">{{ video.duration }}</span>
   </div>
   <div class="feed-metadata">
    <span class="channel-avatar" aria-hidden="true"><AppIcon name="user" /></span>
    <div class="feed-copy"><h2>{{ video.title || t('card.untitled') }}</h2><p>{{ video.channelTitle || t('card.channel') }}</p><span v-if="video.isLive === true" class="feed-badge live">Live</span><span v-else-if="video.definition === 'hd'" class="feed-badge">HD</span></div>
   </div>
  </button>
 </article>
</template>
<style scoped>
.feed-card { min-width: 0; }
.feed-card-action { width: 100%; text-align: left; border-radius: 14px; transition: transform .18s, box-shadow .18s; color: var(--text); }
.feed-card-action:hover:not(:disabled),.feed-card-action:focus-visible { box-shadow: 0 10px 24px #29272215; transform: translateY(-2px); }
.feed-card-action:disabled { opacity: .6; }
.feed-thumbnail { aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; background: var(--player-bg); color: var(--player-text); position: relative; }
.feed-thumbnail img { width: 100%; height: 100%; object-fit: cover; transition: transform .28s; }
.feed-card-action:hover img { transform: scale(1.045); }
.feed-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(.9); width: 52px; height: 52px; border-radius: 50%; background: #10070BD9; color: #fff; display: grid; place-items: center; opacity: 0; transition: opacity .18s, transform .18s; }
.feed-play svg { width: 28px; height: 28px; }.feed-card-action:hover .feed-play,.feed-card-action:focus-visible .feed-play { opacity: 1; transform: translate(-50%,-50%) scale(1); }
.feed-duration { position: absolute; bottom: 8px; right: 8px; background: #10070BEE; color: #fff; font-size: 12px; font-weight: 600; padding: 2px 5px; border-radius: 4px; }
.thumbnail-missing { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; height: 100%; font-size: 13px; }.thumbnail-missing svg { width: 30px; height: 30px; }
.feed-metadata { display: flex; align-items: flex-start; gap: 10px; padding: 13px 4px 14px; }
.channel-avatar { flex: 0 0 36px; height: 36px; border: 1px solid var(--line); border-radius: 50%; display: grid; place-items: center; background: var(--panel); color: var(--gold); }.channel-avatar svg { width: 19px; height: 19px; }
.feed-copy { min-width: 0; }.feed-copy h2 { color: var(--text); font-size: 14px; line-height: 1.5; font-weight: 650; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.feed-copy p { font-size: 12px; line-height: 1.6; color: var(--muted); margin-top: 5px; }.feed-badge { display: inline-block; margin-top: 5px; border: 1px solid var(--control-border); color: var(--muted); border-radius: 4px; padding: 0 4px; font: 600 10px/1.6 sans-serif; }.feed-badge.live { color: var(--gold); border-color: var(--gold); }
@media(prefers-reduced-motion:reduce) { .feed-card-action,.feed-thumbnail img,.feed-play { transition: none; transform: none; }.feed-card-action:hover:not(:disabled),.feed-card-action:focus-visible,.feed-card-action:hover img { transform: none; }.feed-play,.feed-card-action:hover .feed-play,.feed-card-action:focus-visible .feed-play { transform: translate(-50%,-50%); } }
</style>
