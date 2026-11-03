<script setup>
import { computed } from 'vue'
import { useProductText } from '@/i18n/product'
const { t } = useProductText()
const props = defineProps({ characters: { type: Array, default: () => [] }, aiConnected: Boolean, currentTime: { type: Number, default: 0 } })
const unique = computed(() => [...new Set(props.characters.map(character => character.name || character.class || t('characters.unknown')))])
</script>
<template>
 <section class="surface detection-panel">
  <div class="panel-heading"><h2>{{ t('characters.title') }}</h2><span class="panel-status"><span class="status-dot" :class="{ connected: aiConnected }" aria-hidden="true" />{{ aiConnected ? t('characters.connected') : t('characters.offline') }}</span></div>
  <div v-if="!unique.length" class="empty-state"><p>{{ aiConnected ? t('characters.empty') : t('characters.waiting') }}</p><span>{{ aiConnected ? t('characters.emptyNote') : t('characters.offlineNote') }}</span><RouterLink to="/performance" class="inline-link">{{ t('watch.service') }} →</RouterLink></div>
  <ul v-else class="detection-list" tabindex="0" :aria-label="t('characters.list')"><li v-for="name in unique" :key="name"><strong>{{ name }}</strong><small>{{ t('characters.uncertain') }}</small></li></ul>
  <p class="character-caution">{{ t('characters.caution') }}</p>
  <RouterLink class="panel-settings" to="/settings">{{ t('characters.settings') }} →</RouterLink>
 </section>
</template>
<style scoped>
.detection-panel { display: flex; flex-direction: column; min-height: 260px; max-height: 460px; overflow: hidden; }
.panel-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding: 16px; border-bottom: 1px solid var(--line); flex-shrink: 0; }.panel-heading h2 { font-size: 16px; font-weight: 500; }.panel-status { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 13px; }
.empty-state { padding: 24px 16px; }.empty-state p { font-size: 15px; line-height: 1.7; margin-bottom: 10px; }.empty-state > span { font-size: 14px; line-height: 1.7; color: var(--muted); display: block; }.empty-state .inline-link { display: inline-flex; margin-top: 12px; min-height: 44px; align-items: center; }
.detection-list { padding: 4px 16px 16px; overflow-y: auto; min-height: 0; overflow-wrap: anywhere; }.detection-list li { font-size: 15px; line-height: 1.5; padding: 12px 0; border-bottom: 1px solid var(--line); }.detection-list strong { font-weight: 500; }.detection-list small { display: block; font-size: 13px; color: var(--muted); margin-top: 5px; }.character-caution { font-size: 13px; line-height: 1.7; padding: 12px 16px; color: var(--muted); }.panel-settings { margin-top: auto; padding: 16px; min-height: 44px; font-size: 14px; color: var(--latte); border-top: 1px solid var(--line); flex-shrink: 0; }
</style>
