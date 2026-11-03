<template>
 <div id="video-player-section" class="viewer-player">
  <div class="player-frame">
   <div v-if="props.isMaintenance" class="player-unavailable"><p>{{ t('player.unavailable') }}</p><RouterLink to="/almanac" class="button">{{ t('home.almanac') }}</RouterLink></div>
   <div v-if="isCameraMode" class="player-canvas-host"><img class="camera-preview" :src="props.cameraPreviewUrl" alt="Preview kamera lokal" /><canvas ref="overlayCanvas" class="video-markers"></canvas></div>
   <div v-else-if="isLiveMode" class="player-canvas-host"><div ref="playerHost" class="youtube-host"></div><canvas ref="overlayCanvas" class="video-markers"></canvas></div>
   <div v-else class="player-canvas-host"><div ref="playerHost" class="youtube-host"></div><canvas ref="normalOverlayCanvas" class="video-markers"></canvas></div>
  </div>
  <p v-if="isWaitingForBackend && !props.isMaintenance" class="player-loading" role="status">{{ t('player.loading') }} {{ t('player.loadNote') }}</p>
  <div v-if="playbackError" class="player-error" role="alert"><p>{{ t('player.loadNote') }}</p><button class="button" @click="initPlayer">{{ t('explore.retry') }}</button></div>
  <div v-if="sessionError" class="player-error" role="status"><p>{{ t('player.unavailable') }}</p><div class="player-actions"><button class="button" :disabled="isRequestingSession" @click="requestSession">{{ isRequestingSession ? t('player.retrying') : t('player.retry') }}</button><RouterLink to="/performance" class="button">{{ t('watch.service') }}</RouterLink></div></div>
  <div class="player-toolbar"><p>{{ t('player.note') }}</p><div class="player-actions"><button v-if="isCameraMode" class="button" :aria-pressed="props.showBoundingBox" @click="emit('toggle-bounding-box')">Tampilkan Kotak: {{ props.showBoundingBox ? 'ON' : 'OFF' }}</button><button v-if="isAuthenticated" class="button" :disabled="savingFavorite" :aria-pressed="isFavorited" @click="toggleFavorite">{{ savingFavorite ? t('player.saving') : isFavorited ? t('player.unsave') : t('player.save') }}</button><button class="button" @click="handleClose">{{ t('player.close') }}</button></div></div>
 </div>
</template>
<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { io } from 'socket.io-client';
import { loadYouTubeAPI } from '../services/youtube.js';
import { createResourceScope, createFrameScheduler } from '../utils/playerLifecycle.js';
import { getYouTubeVideoId } from '../utils/video.js';
import { useProductText } from '../i18n/product.js';
const { t } = useProductText();

const props = defineProps({
  targetLanguage: { type: String, default: 'id' },
  videoId: { type: String, default: '' },
  streamUrl: { type: String, default: '' },
  liveVideoUrl: { type: String, default: '' },
  startTime: { type: Number, default: 0 },
  autoPlay: { type: Boolean, default: false },
  characters: { type: Array, default: () => [] },
  showBoundingBox: { type: Boolean, default: true },
  showLabels: { type: Boolean, default: true },
  confidenceThreshold: { type: Number, default: 50 },
  isMaintenance: { type: Boolean, default: false },
  cameraPreviewUrl: { type: String, default: 'http://127.0.0.1:8002/video-feed' },
});
const emit = defineEmits(['close', 'timeUpdate', 'seek', 'playerReady', 'ai-connected', 'boxes-update', 'error', 'toggle-bounding-box']);
const authStore = useAuthStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const isFavorited = ref(false);
const savingFavorite = ref(false);
const playbackError = ref(false);
const isLiveMode = computed(() => props.streamUrl === 'socket-relay');
const isCameraMode = computed(() => /^camera:\/\//i.test(props.liveVideoUrl));
const playerHost = ref(null);
const overlayCanvas = ref(null);
const normalOverlayCanvas = ref(null);
const socket = shallowRef(null);
const aiConnected = ref(false);
const detectedCount = ref(0);
const currentBoxes = ref([]);
const sessionId = ref(null);
const workerId = ref(null);
const sessionError = ref(null);
const isRequestingSession = ref(false);
const workerStatus = ref(null);
const isWaitingForBackend = ref(true);
let player = null;
let scope = null;
let mounted = false;
let restartQueued = false;
let drawScheduler = null;
let stopTimeUpdates = null;
let lastTime = 0;
let restoreSessionId = null;
let cancelSessionTimeout = null;
const COLORS = ['rgba(255,111,97,.9)', 'rgba(97,186,255,.9)', 'rgba(162,155,254,.9)', 'rgba(255,204,112,.9)', 'rgba(76,209,149,.9)', 'rgba(255,118,253,.9)'];
const reportError = error => emit('error', error instanceof Error ? error.message : String(error));
const active = owned => mounted && scope === owned && !owned.disposed && !props.isMaintenance;

watch(aiConnected, value => emit('ai-connected', value));

const checkFavorite = async () => {
  const owned = scope;
  const id = props.videoId;
  isFavorited.value = false;
  if (!authStore.isAuthenticated || !id) return;
  try {
    const result = await authStore.isFavorite(id);
    if (active(owned) && props.videoId === id && authStore.isAuthenticated) isFavorited.value = result;
  } catch (error) {
    if (active(owned)) reportError(error);
  }
};
const toggleFavorite = async () => {
  if (!authStore.isAuthenticated || savingFavorite.value || !scope || !active(scope)) return;
  const owned = scope;
  const id = props.videoId;
  const next = !isFavorited.value;
  savingFavorite.value = true;
  try {
    const result = next
      ? await authStore.addToFavorites({ videoId: id, videoUrl: `https://www.youtube.com/watch?v=${id}`, title: `Video ${id}`, thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg` })
      : await authStore.removeFromFavorites(id);
    if (result?.success === false) throw new Error(result.error || 'Gagal memperbarui favorit.');
    if (active(owned) && props.videoId === id && authStore.isAuthenticated) isFavorited.value = next;
  } catch (error) {
    if (active(owned)) reportError(error);
  } finally { savingFavorite.value = false; }
};

const drawOverlay = () => {
  const canvas = isLiveMode.value || isCameraMode.value ? overlayCanvas.value : normalOverlayCanvas.value;
  if (!canvas?.parentElement) return;
  const width = canvas.parentElement.offsetWidth;
  const height = canvas.parentElement.offsetHeight;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (!props.showBoundingBox) return;
  const boxes = isLiveMode.value || isCameraMode.value ? currentBoxes.value : props.characters;
  boxes.filter(item => (isLiveMode.value || item.box) && (item.confidence ?? 100) >= props.confidenceThreshold).forEach((item, index) => {
    const box = isLiveMode.value ? item : item.box;
    const x = box.left / 100 * width;
    const y = box.top / 100 * height;
    const w = box.width / 100 * width;
    const h = box.height / 100 * height;
    ctx.strokeStyle = COLORS[index % COLORS.length];
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    if (props.showLabels) {
      const label = item.confidence != null ? `${item.name} ${item.confidence}%` : item.name;
      ctx.font = 'bold 14px Arial';
      ctx.fillStyle = COLORS[index % COLORS.length];
      ctx.fillRect(x, y - 24, ctx.measureText(label).width + 10, 24);
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, y - 7);
    }
  });
};
const requestDraw = () => drawScheduler?.request();
const observeCanvas = owned => {
  const scheduler = createFrameScheduler(drawOverlay, window);
  drawScheduler = scheduler;
  owned.add(() => scheduler.dispose());
  const redraw = () => { if (active(owned)) scheduler.request(); };
  owned.listen(window, 'resize', redraw);
  owned.listen(window, 'orientationchange', redraw);
  owned.listen(document, 'fullscreenchange', redraw);
  owned.listen(document, 'webkitfullscreenchange', redraw);
  const canvas = isLiveMode.value || isCameraMode.value ? overlayCanvas.value : normalOverlayCanvas.value;
  if (window.ResizeObserver && canvas?.parentElement) {
    const observer = new window.ResizeObserver(redraw);
    observer.observe(canvas.parentElement);
    owned.add(() => observer.disconnect());
  }
  redraw();
};
watch(() => [props.characters, props.showBoundingBox, props.showLabels, props.confidenceThreshold], requestDraw, { deep: true });

const playVideo = () => {
  if (props.isMaintenance || !player?.playVideo) return;
  player.playVideo();
  isWaitingForBackend.value = false;
};
const pauseVideo = () => player?.pauseVideo?.();
const getCurrentTime = () => player?.getCurrentTime?.() ?? 0;
const seekTo = seconds => player?.seekTo?.(seconds, true);
const togglePlayPause = () => {
  if (!player || props.isMaintenance) return;
  player.getPlayerState() === window.YT.PlayerState.PLAYING ? pauseVideo() : playVideo();
};
const seekRelative = delta => {
  if (!player?.seekTo) return;
  const time = Math.max(0, getCurrentTime() + delta);
  seekTo(time);
  emit('seek', time);
};
const changeVolume = delta => {
  if (player?.getVolume && player?.setVolume) player.setVolume(Math.max(0, Math.min(100, player.getVolume() + delta)));
};
const toggleMute = () => {
  if (!player?.isMuted) return;
  player.isMuted() ? player.unMute() : player.mute();
};
const toggleFullscreen = async () => {
  const owned = scope;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exit) throw new Error('Fullscreen tidak tersedia.');
      await exit.call(document);
    } else {
      const container = playerHost.value?.parentElement;
      const request = container?.requestFullscreen || container?.webkitRequestFullscreen || container?.mozRequestFullScreen;
      if (!request) throw new Error('Fullscreen tidak tersedia.');
      await request.call(container);
    }
  } catch (error) {
    if (owned && active(owned)) reportError(error);
  }
};
defineExpose({ playVideo, pauseVideo, getCurrentTime, seekTo, togglePlayPause, seekRelative, changeVolume, toggleMute, toggleFullscreen });

const sendPlayerEvent = (event, payload) => {
  if (!socket.value?.connected || ((isLiveMode.value || isCameraMode.value) && !sessionId.value)) return;
  socket.value.emit(event, (isLiveMode.value || isCameraMode.value) ? { ...payload, sessionId: sessionId.value } : payload);
};
const stopPolling = () => { stopTimeUpdates?.(); stopTimeUpdates = null; };
const onStateChange = (event, owned) => {
  if (!active(owned)) return;
  stopPolling();
  const states = window.YT.PlayerState;
  if (event.data === states.PLAYING) {
    isWaitingForBackend.value = false;
    lastTime = getCurrentTime();
    sendPlayerEvent('player-state', { state: 'playing', time: lastTime });
    stopTimeUpdates = owned.interval(() => {
      const time = getCurrentTime();
      if (Math.abs(time - lastTime) > 3) {
        emit('seek', time);
        sendPlayerEvent('player-seek', { time });
      }
      if (isLiveMode.value) sendPlayerEvent('player-time', { time });
      emit('timeUpdate', time);
      lastTime = time;
    }, 500);
  } else if (event.data === states.PAUSED || event.data === states.ENDED) {
    emit('timeUpdate', getCurrentTime());
    sendPlayerEvent('player-state', { state: event.data === states.PAUSED ? 'paused' : 'ended', time: getCurrentTime() });
    if (event.data === states.ENDED && isLiveMode.value) endSession('video_ended');
  }
};
const requestSession = () => {
  if (!scope || !active(scope) || (!isLiveMode.value && !isCameraMode.value) || sessionId.value || isRequestingSession.value) return;
  if (!socket.value?.connected) {
    socket.value?.connect();
    return;
  }
  isRequestingSession.value = true;
  sessionError.value = null;
  cancelSessionTimeout?.();
  cancelSessionTimeout = scope.timeout(() => {
    cancelSessionTimeout = null;
    isRequestingSession.value = false;
    sessionError.value = 'Permintaan sesi melewati batas waktu. Silakan coba lagi.';
    reportError(sessionError.value);
  }, 10000);
  socket.value.emit('start-live-stream', { videoUrl: props.liveVideoUrl, existingSessionId: restoreSessionId, currentTime: getCurrentTime(), targetLanguage: ['id', 'en'].includes(props.targetLanguage) ? props.targetLanguage : 'id' });
};
const endSession = (reason, notifyServer = true) => {
  const id = sessionId.value || restoreSessionId;
  if (notifyServer && socket.value?.connected && id) socket.value.emit('end-session', { sessionId: id, reason });
  cancelSessionTimeout?.();
  cancelSessionTimeout = null;
  restoreSessionId = null;
  sessionId.value = null;
  workerId.value = null;
  aiConnected.value = false;
  isRequestingSession.value = false;
  currentBoxes.value = [];
  detectedCount.value = 0;
  requestDraw();
};
const connectSocket = owned => {
  const client = io(import.meta.env.VITE_SOCKET_URL || '/', {
    path: '/socket.io', forceNew: true, autoConnect: false,
    reconnection: true, reconnectionAttempts: 5,
    reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 10000,
  });
  socket.value = client;
  const on = (event, handler) => {
    const guarded = data => { if (active(owned)) handler(data); };
    client.on(event, guarded);
    owned.add(() => client.off(event, guarded));
  };
  owned.add(() => client.disconnect());
  on('connect', () => { if (isLiveMode.value) requestSession(); });
  on('disconnect', () => {
    // Component-local restore identity cannot be stolen by another tab/video.
    restoreSessionId = sessionId.value || restoreSessionId;
    sessionId.value = null;
    workerId.value = null;
    cancelSessionTimeout?.();
    cancelSessionTimeout = null;
    isRequestingSession.value = false;
    aiConnected.value = false;
    currentBoxes.value = [];
    detectedCount.value = 0;
    requestDraw();
  });
  on('connect_error', () => {
    sessionError.value = 'Koneksi AI gagal. Mencoba terhubung kembali.';
    reportError(sessionError.value);
  });
  const reconnectFailed = () => {
    if (!active(owned)) return;
    sessionError.value = 'Koneksi AI terputus. Silakan coba lagi.';
    reportError(sessionError.value);
  };
  client.io.on('reconnect_failed', reconnectFailed);
  owned.add(() => client.io.off('reconnect_failed', reconnectFailed));
  if (isLiveMode.value || isCameraMode.value) {
    on('session-created', data => {
      cancelSessionTimeout?.();
      cancelSessionTimeout = null;
      sessionId.value = data.sessionId;
      restoreSessionId = data.sessionId;
      workerId.value = data.workerId;
      isRequestingSession.value = false;
      sessionError.value = null;
      if (data.reconnected) aiConnected.value = true;
    });
    on('session-error', data => {
      cancelSessionTimeout?.();
      cancelSessionTimeout = null;
      sessionError.value = data.message;
      workerStatus.value = data.status;
      isRequestingSession.value = false;
      reportError(data.message);
    });
    on('session-ended', data => {
      if (data?.sessionId && data.sessionId !== (sessionId.value || restoreSessionId)) return;
      endSession('server_ended', false);
    });
    on('worker-status-update', data => { workerStatus.value = data; });
    on('ai-boxes', data => {
      if (data.sessionId && data.sessionId !== sessionId.value) return;
      currentBoxes.value = data.boxes || [];
      detectedCount.value = currentBoxes.value.length;
      aiConnected.value = true;
      requestDraw();
      emit('boxes-update', currentBoxes.value);
    });
    on('stream-started', data => {
      if (!data.sessionId || data.sessionId === sessionId.value) aiConnected.value = true;
    });
    on('stream-error', data => {
      if (data.sessionId && data.sessionId !== sessionId.value) return;
      endSession('stream_error');
      sessionError.value = data.message;
      reportError(data.message);
    });
  }
  client.connect();
  if (client.connected && isLiveMode.value) requestSession();
};
const disposePlayer = (reason = 'video_changed') => {
  endSession(reason);
  const previous = scope;
  scope = null;
  previous?.dispose();
  stopPolling();
  player = null;
  socket.value = null;
  drawScheduler = null;
  currentBoxes.value = [];
  detectedCount.value = 0;
};
const initPlayer = async () => {
  disposePlayer();
  isWaitingForBackend.value = true;
  sessionError.value = null;
  workerStatus.value = null;
  isFavorited.value = false;
  playbackError.value = false;
  if (!mounted || props.isMaintenance) return;
  const live = isLiveMode.value || isCameraMode.value;
  const videoId = isCameraMode.value ? null : (live ? getYouTubeVideoId(props.liveVideoUrl) : props.videoId);
  if (!videoId && !isCameraMode.value) {
    if (live) reportError('URL YouTube tidak valid.');
    return;
  }
  const owned = createResourceScope();
  scope = owned;
  const controller = new AbortController();
  owned.add(() => controller.abort());
  try {
    await nextTick();
    if (isCameraMode.value) {
      observeCanvas(owned);
      connectSocket(owned);
      isWaitingForBackend.value = false;
      return;
    }
    const yt = await loadYouTubeAPI({ signal: controller.signal });
    if (!active(owned) || !playerHost.value) return;
    observeCanvas(owned);
    const target = document.createElement('div');
    playerHost.value.replaceChildren(target);
    const created = new yt.Player(target, {
      height: '100%', width: '100%', videoId,
      playerVars: { autoplay: live ? 1 : 0, start: props.startTime, rel: 0 },
      events: {
        onReady: event => {
          if (!active(owned)) return;
          lastTime = props.startTime;
          emit('playerReady');
          if (live || props.autoPlay) {
            event.target.playVideo();
            isWaitingForBackend.value = false;
          }
        },
        onStateChange: event => onStateChange(event, owned),
        onError: () => {
          if (!active(owned)) return;
          isWaitingForBackend.value = false;
          playbackError.value = true;
          reportError('YouTube gagal memutar video.');
        },
      },
    });
    player = created;
    owned.add(() => created.destroy());
    connectSocket(owned);
    owned.listen(window, 'beforeunload', () => endSession('tab_close'));
    void checkFavorite();
  } catch (error) {
    if (active(owned) && error?.name !== 'AbortError') {
      playbackError.value = true;
      reportError(error);
      disposePlayer('initialization_failed');
      isWaitingForBackend.value = false;
    }
  }
};
const handleClose = () => { disposePlayer('user_close'); emit('close'); };
onMounted(() => { mounted = true; void initPlayer(); });
onBeforeUnmount(() => { mounted = false; disposePlayer('component_unmount'); });
watch(() => [props.videoId, props.streamUrl, props.liveVideoUrl, props.isMaintenance], () => {
  if (!mounted) return;
  // Invalidate immediately, but read the next coherent batch of parent props.
  disposePlayer();
  if (restartQueued) return;
  restartQueued = true;
  void nextTick().then(() => {
    restartQueued = false;
    if (mounted) void initPlayer();
  });
}, { flush: 'sync' });
watch(() => props.autoPlay, value => { if (value) playVideo(); });
</script>
<style scoped>
.player-frame { --canvas: var(--player-bg); --panel: var(--player-surface); --line: var(--control-border); color-scheme: dark; color: var(--player-text); }
.player-frame .button { background: var(--primary); color: var(--on-primary); border-color: var(--player-text); }
.player-frame .button:hover:not(:disabled) { background: var(--primary-hover); }
.player-frame .button:active:not(:disabled) { background: var(--primary-pressed); }
.player-frame .button:focus-visible { outline-color: var(--player-text); }
.viewer-player { min-width: 0; }.player-frame { aspect-ratio: 16/9; background: var(--canvas); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; position: relative; }.player-canvas-host,.youtube-host { width: 100%; height: 100%; }.camera-preview { width: 100%; height: 100%; object-fit: contain; background: #090207; }.video-markers { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }.player-unavailable { position: absolute; inset: 0; display: grid; place-content: center; gap: 16px; padding: 20px; background: var(--panel); z-index: 1; text-align: center; }.player-loading { font-size: 14px; color: var(--muted); margin: 16px 0; line-height: 1.7; }.player-error { padding: 18px 0; border-bottom: 1px solid var(--line); font-size: 15px; line-height: 1.7; }.player-error p { margin-bottom: 12px; }.player-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding-top: 18px; }.player-toolbar > p { color: var(--muted); font-size: 13px; line-height: 1.7; max-width: 420px; }.player-actions { display: flex; gap: 10px; flex-wrap: wrap; }
@media(max-width:639px) { .player-actions { width: 100%; }.player-actions .button { flex: 1; } }
</style>
