<script setup>
import { useSettings } from '@/stores/settings'
import { useProductText } from '@/i18n/product'
const settings = useSettings(), { t } = useProductText()
</script>
<template><section>
 <div class="page-heading"><h1>{{ t('settings.title') }}</h1><p>{{ t('settings.description') }}</p></div>
 <div class="settings-layout"><div class="surface settings-card"><h2>{{ t('settings.markers') }}</h2>
 <label class="setting-row"><span><strong>{{ t('settings.box') }}</strong><small>{{ t('settings.boxNote') }}</small></span><input v-model="settings.showBoundingBox" type="checkbox" class="toggle" /></label>
 <label class="setting-row"><span><strong>{{ t('settings.labels') }}</strong><small>{{ t('settings.labelsNote') }}</small></span><input v-model="settings.showLabels" type="checkbox" class="toggle" /></label>
 <label class="setting-range" for="confidence"><span>{{ t('settings.confidence') }} <output>{{ settings.confidenceThreshold }}%</output></span><input id="confidence" v-model.number="settings.confidenceThreshold" type="range" min="0" max="100" /><small>{{ t('settings.confidenceNote') }}</small></label>
 <label class="setting-range" for="language"><span>{{ t('settings.language') }}</span><select id="language" v-model="settings.targetLanguage" class="input"><option value="id">Bahasa Indonesia</option><option value="en">English</option></select><small>{{ t('settings.languageNote') }}</small></label></div>
 <aside class="settings-note"><h2>{{ t('settings.service') }}</h2><p>{{ t('settings.serviceNote') }}</p><RouterLink to="/performance" class="button">{{ t('watch.service') }}</RouterLink></aside></div>
</section></template>
<style scoped>.settings-note { padding: 24px 0; }.settings-note h2 { font: 25px/1.3 Georgia,serif; }.settings-note p { color: var(--muted); font-size: 15px; line-height: 1.8; margin: 18px 0; }</style>
