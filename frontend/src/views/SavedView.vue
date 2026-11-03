<script setup>
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useProductText } from '@/i18n/product'
import { useRouter } from 'vue-router'
import { getYouTubeVideoId } from '@/utils/video'

const router = useRouter()

const { t } = useProductText()
const account = inject('account-state', shallowRef(null))
const requestAccount = inject('request-account', () => {})
const uid = computed(() => account.value?.user?.uid || null)
const favorites = ref([])
const loading = ref(false)
const failed = ref(false)
let generation = 0
let disposed = false

async function loadFavorites() {
  const request = ++generation
  const ownerUid = uid.value
  favorites.value = []
  failed.value = false
  loading.value = false
  if (disposed || !ownerUid) return
  const current = () => !disposed && request === generation && uid.value === ownerUid
  loading.value = true
  try {
    const [{ collection, getDocs }, { db }] = await Promise.all([
      import('firebase/firestore'),
      import('@/firebase'),
    ])
    if (!current()) return
    const result = await getDocs(collection(db, 'users', ownerUid, 'favorites'))
    if (!current()) return
    favorites.value = result.docs.map(document => {
      const data = document.data() ?? {}
      return {
        id: document.id,
        videoId: data.videoId,
        videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '',
        title: typeof data.title === 'string' ? data.title.trim() : '',
        thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail.trim() : '',
        addedAt: data.addedAt,
        imageFailed: false,
      }
    })
  } catch {
    if (current()) failed.value = true
  } finally {
    if (current()) loading.value = false
  }
}
// Synchronous invalidation prevents old-account data surviving a logout or UID change.
watch([uid, () => account.value], loadFavorites, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  generation++
  favorites.value = []
})

function watchFavorite(item) {
  if (disposed || !uid.value || !favorites.value.includes(item)) return
  if (getYouTubeVideoId(item.videoUrl)) router.push({ name: 'home', query: { video: item.videoUrl, open: '1' } })
}
</script>

<template>
  <section class="saved-view">
    <header class="page-heading">
      <h1>{{ t('saved.title') }}</h1>
      <p>{{ t('saved.description') }}</p>
    </header>
    <div v-if="!uid" class="surface saved-state">
      <h2>{{ t('saved.signIn') }}</h2>
      <p>{{ t('saved.signInNote') }}</p>
      <div class="saved-actions">
        <button type="button" class="button" @click="requestAccount">{{ t('saved.login') }}</button>
        <router-link to="/gallery" class="button">{{ t('home.browse') }}</router-link>
      </div>
    </div>
    <div v-else-if="loading" class="surface saved-state" role="status">{{ t('saved.loading') }}</div>
    <div v-else-if="failed" class="surface saved-state" role="alert">
      <h2>{{ t('saved.error') }}</h2>
      <p>{{ t('saved.errorNote') }}</p>
      <button type="button" class="button" @click="loadFavorites">{{ t('saved.retry') }}</button>
    </div>
    <div v-else-if="favorites.length === 0" class="surface saved-state" role="status">
      <h2>{{ t('saved.empty') }}</h2>
      <p>{{ t('saved.emptyNote') }}</p>
      <router-link to="/gallery" class="button">{{ t('home.browse') }}</router-link>
    </div>
    <ul v-else class="saved-grid">
      <li v-for="item in favorites" :key="item.id" class="surface saved-card">
        <img v-if="item.thumbnail && !item.imageFailed" :src="item.thumbnail" :alt="item.title || t('card.untitled')" loading="lazy" class="saved-thumbnail" @error="item.imageFailed = true" />
        <div v-else class="saved-thumbnail saved-image-fallback">{{ t('card.imageMissing') }}</div>
        <div class="saved-card-content">
          <h2>{{ item.title || t('card.untitled') }}</h2>
          <p v-if="!getYouTubeVideoId(item.videoUrl)" :id="`saved-invalid-${item.id}`" class="saved-invalid">{{ t('saved.invalid') }}</p>
          <button type="button" class="button" :disabled="!getYouTubeVideoId(item.videoUrl)" :aria-describedby="!getYouTubeVideoId(item.videoUrl) ? `saved-invalid-${item.id}` : undefined" @click="watchFavorite(item)">{{ t('source.watch') }}</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.saved-state { padding: clamp(20px, 4vw, 32px); }
.saved-state h2, .saved-card h2 { font-size: 20px; line-height: 1.4; overflow-wrap: anywhere; }
.saved-state p { margin: 12px 0 20px; color: var(--muted); line-height: 1.7; }
.saved-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.saved-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 20px; list-style: none; padding: 0; margin: 0; }
.saved-card { overflow: hidden; display: flex; flex-direction: column; }
.saved-thumbnail { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
.saved-image-fallback { display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .12); color: var(--muted); font-size: 14px; }
.saved-card-content { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 20px; flex: 1; min-width: 0; }
.saved-card-content .button { margin-top: auto; max-width: 100%; }
.saved-invalid { color: var(--muted); line-height: 1.6; font-size: 14px; }
.button:disabled { opacity: .55; cursor: not-allowed; }
</style>
