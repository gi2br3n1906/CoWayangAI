<script setup>
import { useProductText } from '@/i18n/product'
const { t } = useProductText()
</script>
<template><div class="stream-hero"><h1>{{ t('home.title') }}</h1><p>{{ t('home.description') }}</p></div></template>
<style scoped>
.stream-hero { padding: 6px 0 28px; max-width: 740px; }
h1 { font: 500 clamp(32px,4vw,52px)/1.13 Georgia,serif; text-wrap: balance; }
p { max-width: 590px; margin-top: 18px; font-size: 16px; line-height: 1.75; color: var(--muted); }
@media(max-width:639px) { .stream-hero { padding-bottom: 24px; } h1 { font-size: 34px; } p { font-size: 15px; } }
</style>