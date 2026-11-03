<script setup>
import { ref, onErrorCaptured } from 'vue'
const error = ref(false)
const retry = ref(0)
onErrorCaptured(() => { error.value = true; return false })
</script>
<template><section v-if="error" class="surface empty-state" role="alert"><h1>Tampilan belum dapat dimuat.</h1><p>Coba muat ulang tampilan. Sesi lain tetap dapat diakses melalui sidebar.</p><button class="button" @click="error = false; retry++">Coba lagi</button></section><div v-else :key="retry"><slot /></div></template>
