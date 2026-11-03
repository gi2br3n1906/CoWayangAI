<script setup>
const features = [
 { code: '01 / VISION', title: 'Melihat tokoh', description: 'Worker Python memproses frame dan mengirim koordinat deteksi. Browser menggambar overlay di atas video YouTube.' },
 { code: '02 / LANGUAGE', title: 'Mengikuti dialog', description: 'Layanan ASR bahasa Jawa menyediakan transkripsi. Terjemahan mengikuti layanan dan konfigurasi yang tersedia di server.' },
 { code: '03 / CULTURE', title: 'Mengenal kisah', description: 'Almanak lokal membuka cerita, alias, watak, dan hubungan keluarga tokoh tanpa memerlukan worker AI.' }
]
</script>
<template><section><div class="story-features"><article v-for="feature in features" :key="feature.code" class="surface"><p class="eyebrow">{{ feature.code }}</p><h2>{{ feature.title }}</h2><p>{{ feature.description }}</p></article></div><div class="story-note"><div><p class="eyebrow">TRADISI BUKAN SEKADAR DATA</p><h2>Teknologi sebagai pendamping,<br />bukan pengganti pengalaman.</h2></div><p>CoWayangAI menghubungkan penjelajahan budaya dengan computer vision dan pengolahan bahasa. Hasil deteksi maupun transkripsi dapat keliru; gunakan sebagai bantuan untuk mengenal pertunjukan, bukan sebagai sumber tunggal kebenaran.</p></div><div class="telemetry-strip"><span>VUE 3</span><span>EXPRESS / SOCKET.IO</span><span>PYTHON / YOLO WORKER</span><span>FIREBASE AUTH</span></div></section></template>
<style scoped>
.story-features { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 20px; }.story-features article { padding: 28px; }.story-features h2 { font-size: 22px; margin: 22px 0 14px; }.story-features article > p:last-child { font-size: 12px; color: var(--muted); line-height: 1.9; }.story-note { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; border-block: 1px solid var(--line); margin: 40px 0; padding: 36px 0; }.story-note h2 { font: 28px/1.4 Georgia,serif; color: var(--latte); margin-top: 18px; }.story-note > p { color: var(--muted); font-size: 13px; line-height: 1.9; }
@media(max-width:767px) { .story-features,.story-note { grid-template-columns: 1fr; }.story-note { gap: 24px; } }
</style>
