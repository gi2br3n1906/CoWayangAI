<script setup>
import { ref, watch, computed, nextTick, onUnmounted } from 'vue'
import { useProductText } from '@/i18n/product'
const { t } = useProductText()
const props = defineProps({ subtitles: { type: Array, default: () => [] }, currentTime: { type: Number, default: 0 }, queueCount: { type: Number, default: 0 } })
const container = ref(null), follow = ref(true)
let disposed = false
const ordered = computed(() => props.subtitles.filter(subtitle => Number.isFinite(subtitle.start_time) && subtitle.start_time <= props.currentTime).sort((a,b) => a.start_time - b.start_time))
const activeId = computed(() => ordered.value.find(subtitle => subtitle.isCurrent)?.id)
watch([activeId, () => props.subtitles.length], async ([id]) => {
 if (!follow.value) return
 await nextTick()
 if (disposed || !container.value) return
 const element = [...container.value.querySelectorAll('[data-subtitle]')].find(node => node.dataset.subtitle === String(id))
 const top = element ? element.offsetTop - container.value.offsetTop - 20 : container.value.scrollHeight
 container.value.scrollTo?.({ top: Math.max(0,top), behavior: 'auto' })
})
onUnmounted(() => { disposed = true })
</script>
<template>
 <section class="surface transcription-panel" :class="{ 'is-empty': !ordered.length }">
  <div class="transcription-heading">
   <div><h2>{{ t('dialogue.title') }}</h2><p>{{ t('dialogue.description') }}</p></div>
   <label class="follow-control" :title="t('dialogue.follow')"><input v-model="follow" type="checkbox" :aria-label="t('dialogue.follow')" /><span>{{ t('dialogue.followShort') }}</span></label>
  </div>
  <div ref="container" class="transcription-content" tabindex="0" role="region" :aria-label="t('dialogue.list')">
   <div v-if="!ordered.length" class="empty-state"><p>{{ t('dialogue.empty') }}</p><span>{{ t('dialogue.emptyNote') }}</span></div>
   <article v-for="subtitle in ordered" :key="subtitle.id" :data-subtitle="subtitle.id" class="subtitle" :class="{ current: subtitle.isCurrent }">
    <div class="subtitle-meta"><time>{{ subtitle.timestamp || `${Math.floor(subtitle.start_time / 60).toString().padStart(2,'0')}:${Math.floor(subtitle.start_time % 60).toString().padStart(2,'0')}` }}</time><span v-if="subtitle.isCurrent">{{ t('dialogue.now') }}</span></div>
    <span class="transcript-label">{{ t('dialogue.original') }}</span><p class="transcript-text">{{ subtitle.text }}</p>
    <div v-if="subtitle.translation" class="translation"><span class="translation-label">{{ t('dialogue.translation') }}</span><p>{{ subtitle.translation }}</p></div>
    <div v-if="subtitle.translation_en" class="translation"><span class="translation-label">English</span><p>{{ subtitle.translation_en }}</p></div>
   </article>
  </div>
  <p class="dialogue-disclaimer">{{ t('dialogue.disclaimer') }}</p>
 </section>
</template>
<style scoped>
.transcription-panel { display: flex; flex-direction: column; height: clamp(380px,62vh,600px); overflow: hidden; }
.transcription-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.transcription-heading h2 { font-size: 16px; font-weight: 500; }
.transcription-heading p { font-size: 12px; line-height: 1.6; color: var(--muted); margin-top: 6px; }
.follow-control { display: flex; align-items: center; gap: 8px; min-height: 44px; flex-shrink: 0; font-size: 12px; color: var(--latte); cursor: pointer; }
.follow-control input { width: 18px; height: 18px; }
.transcription-content { position: relative; overflow-y: auto; overflow-wrap: anywhere; padding: 16px; flex: 1; min-height: 0; }
.subtitle { padding: 16px; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(215,186,137,.025); }
.subtitle.current { border-color: var(--brass); background: rgba(215,186,137,.07);  }
.subtitle-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font: 11px ui-monospace,monospace; color: var(--brass); margin-bottom: 12px; }
.transcript-label,.translation-label { display: block; font-size: 13px; font-weight: 500; color: var(--latte); margin-bottom: 5px; }
.subtitle p { font-size: 15px; line-height: 1.8; }
.translation { padding-top: 12px; border-top: 1px solid var(--line); margin-top: 12px; }
.translation p { color: var(--muted); }
.empty-state { padding: 36px 8px; }
.empty-state p { font-size: 14px; margin-bottom: 10px; }
.empty-state span { font-size: 13px; line-height: 1.7; color: var(--muted); }
.dialogue-disclaimer { padding: 12px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; line-height: 1.7; }
.transcription-panel.is-empty { height: auto; min-height: 230px; }
</style>
