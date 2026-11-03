<script setup>
defineProps({ name: { type: String, default: 'spark' } })
const paths = {
 stream: 'm9 6 10 6-10 6V6ZM3 5v14', gallery: 'M3 3h18v18H3zM3 15l5-5 4 4 3-3 6 6M16 7h.01', globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
 book: 'M12 5v16M12 5C8 2 4 3 2 4v16c3-2 7-2 10 1 3-3 7-3 10-1V4c-2-1-6-2-10 1Z',
 monitor: 'M3 3h18v14H3zM8 21h8M12 17v4M6 11l3-3 4 4 5-6',
 settings: 'M4 7h16M4 17h16M9 4v6M16 14v6', story: 'M12 8v1m0 3v5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
 menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M6 18 18 6', collapse: 'M3 3h18v18H3zM8 3v18m8-13-4 4 4 4',
 user: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
 spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z', arrow: 'M4 12h16m-6-6 6 6-6 6',
 search: 'm21 21-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', keyboard: 'M2 5h20v14H2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h8',
 logout: 'M9 3H3v18h6M9 12h12m-5-5 5 5-5 5'
}
</script>
<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.spark" /></svg></template>
