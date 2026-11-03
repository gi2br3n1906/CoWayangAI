<script setup>
import { ref } from 'vue'
import StickySearchBar from './StickySearchBar.vue'
import AppIcon from './AppIcon.vue'
import { useProductText } from '@/i18n/product'
const props = defineProps({ loading: Boolean, maintenance: Boolean, language: { type: String, default: 'id' } })
const emit = defineEmits(['search-results','analyze','language-change','account','open-drawer'])
const { t } = useProductText()
const source = ref(null)
function searchResults(data) {
 emit('search-results', data)
}
defineExpose({ setVideoUrl: value => source.value?.setVideoUrl(value) })
</script>
<template>
<header class="top-navbar">
 <div class="navbar-left">
  <button class="icon-button navbar-menu" :aria-label="t('nav.open')" aria-controls="workspace-sidebar" @click="emit('open-drawer')"><AppIcon name="menu" /></button>
  <RouterLink to="/tonton" class="navbar-brand"><img src="/brand-mark.webp" width="34" height="34" alt="" /><span>CoWayang<strong>AI</strong></span></RouterLink>
 </div>
 <div class="navbar-search-area">
  <StickySearchBar ref="source" compact :loading="loading" :maintenance="maintenance" @analyze="emit('analyze',$event)" @search-results="searchResults" />
 </div>
 <nav class="navbar-actions" :aria-label="t('nav.secondary')">
  <RouterLink to="/almanac" class="navbar-text-link">{{ t('nav.almanac') }}</RouterLink>
  <RouterLink to="/about" class="navbar-text-link">{{ t('nav.about') }}</RouterLink>
  <label class="navbar-language" :aria-label="t('app.language')"><AppIcon name="globe" /><select :value="language" @change="emit('language-change',$event.target.value)"><option value="id">ID</option><option value="en">EN</option></select></label>
  <button class="icon-button navbar-account" :aria-label="t('nav.account')" @click="emit('account')"><AppIcon name="user" /></button>
 </nav>
 <div class="navbar-quick-actions"><button class="button navbar-paste" :disabled="loading || maintenance" @click="source?.pasteUrl()"><AppIcon name="stream" /><span>{{ t('hub.paste') }}</span></button></div>
</header>
</template>
<script>export default { inheritAttrs: false }</script>
<style scoped>
.top-navbar { position: sticky; top: 0; z-index: 80; min-height: 72px; display: grid; grid-template-columns: 220px minmax(200px,1fr) auto auto; align-items: center; gap: 22px; padding: 10px 24px; border-bottom: 1px solid var(--line); background: var(--header); backdrop-filter: blur(18px); }
.navbar-left,.navbar-brand,.navbar-actions { display: flex; align-items: center; }.navbar-left { gap: 12px; min-width: 0; }.navbar-menu { border-radius: 50%; color: var(--text); }.navbar-brand { gap: 9px; text-decoration: none; color: var(--text); white-space: nowrap; font-weight: 750; letter-spacing: -.04em; }.navbar-brand img { object-fit: contain; }.navbar-brand strong { color: var(--brass); margin-left: 2px; }
.navbar-search-area { position: relative; min-width: 0; max-width: 760px; width: 100%; justify-self: center; }.navbar-search-area :deep(.hub-source) { display: block; }.navbar-search-area :deep(.source-form) { width: 100%; gap: 0; }.navbar-search-area :deep(.hub-source .source-field) { width: 100%; }.navbar-search-area :deep(.hub-source .source-form .button) { display: inline-flex; border-radius: 0 999px 999px 0; border-left: 0; width: 54px; flex: 0 0 54px; min-height: 44px; padding-inline: 0; }.navbar-search-area :deep(.hub-source .source-form .button svg) { width: 19px; height: 19px; }.navbar-search-area :deep(.hub-source .search-submit-label),.navbar-search-area :deep(.hub-source .watch-submit-label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }.navbar-search-area :deep(.paste-url),.navbar-search-area :deep(.source-note:not(.validation-note)),.navbar-search-area :deep(.source-details) { display: none; }.navbar-search-area :deep(.validation-note) { display: block; position: absolute; top: calc(100% + 4px); left: 8px; z-index: 85; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--gold); }.navbar-search-area :deep(.hub-source #video-search) { min-height: 44px; padding-right: 54px; border-radius: 999px 0 0 999px; }
.navbar-actions { justify-content: flex-end; gap: 16px; white-space: nowrap; }.navbar-text-link { color: var(--muted); font-size: 13px; text-decoration: none; }.navbar-text-link:hover { color: var(--gold); }.navbar-language { display: flex; align-items: center; gap: 3px; color: var(--muted); }.navbar-language svg { width: 15px; height: 15px; }.navbar-language select { color: var(--text); background: transparent; min-height: 40px; border: 0; padding: 4px; }.navbar-account { background: var(--panel); border-radius: 50%; border: 1px solid var(--line); color: var(--gold); }.navbar-quick-actions { display:flex; align-items:center; gap:8px; white-space:nowrap; }.navbar-paste { min-height:42px; padding-inline:12px; font-size:12px; }.navbar-paste svg { width:17px; height:17px; }

@media(max-width:1199px) { .top-navbar { grid-template-columns: auto minmax(160px,1fr) auto auto; gap: 12px; padding-inline: 16px; }.navbar-actions .navbar-text-link { display: none; }.navbar-search-area :deep(.hub-source) { max-width: none; } }
@media(max-width:699px) { .top-navbar { min-height: 64px; grid-template-columns: minmax(0,1fr) auto; gap: 4px 8px; padding: 8px 12px; }.navbar-left { grid-column: 1; grid-row: 1; }.navbar-actions { grid-column: 2; grid-row: 1; gap: 8px; }.navbar-actions .navbar-language { display: flex; }.navbar-search-area { grid-column: 1 / 3; grid-row: 2; max-width: none; padding: 4px 0 2px; }.navbar-search-area :deep(.hub-source #video-search) { min-height: 42px; }.navbar-quick-actions { grid-column: 1 / 3; grid-row: 3; justify-content:flex-end; gap:4px; }.navbar-paste { display: inline-flex; min-height: 38px; padding-inline: 8px; font-size: 10px; }.navbar-paste svg { width: 15px; }.navbar-brand img { width: 30px; height: 30px; }.navbar-brand { font-size: 14px; } }
@media(max-width:380px) { .navbar-brand { font-size: 13px; }.navbar-left { gap: 6px; }.navbar-menu { min-width: 40px; min-height: 40px; }.navbar-search-area :deep(.hub-source #video-search) { font-size: 12px; } }
</style>
