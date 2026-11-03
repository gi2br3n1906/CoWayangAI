import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createRenderer, h, nextTick, getCurrentInstance } from 'vue';

let moduleId = 0;
async function component() {
  const source = await readFile(new URL('../src/components/VideoPlayer.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(source);
  let code = compileScript(descriptor, { id: 'player-test' }).content;
  code = code.replace(/import\.meta\.env\.VITE_SOCKET_URL \|\| '\/'/g, "'/'")
    .replace(/from ['"]vue['"]/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
    .replace(/import \{ useAuthStore \} from ['"]@\/stores\/auth['"];?/, 'const useAuthStore = () => globalThis.__playerTest.auth;')
    .replace(/import \{ io \} from ['"]socket.io-client['"];?/, 'const io = (...args) => globalThis.__playerTest.io(...args);')
    .replace(/from ['"](?:@\/|\.\.\/)services\/youtube(?:\.js)?['"]/g, `from ${JSON.stringify(new URL('../src/services/youtube.js', import.meta.url).href)}`)
    .replace(/from ['"](?:@\/|\.\.\/)utils\/playerLifecycle(?:\.js)?['"]/g, `from ${JSON.stringify(new URL('../src/utils/playerLifecycle.js', import.meta.url).href)}`);
  code = code.replace(/from ['"](?:@\/|\.\.\/)i18n\/product(?:\.js)?['"]/g, `from ${JSON.stringify(new URL('../src/i18n/product.js', import.meta.url).href)}`);
  code = code.replace(/from ['"](?:@\/|\.\.\/)utils\/video(?:\.js)?['"]/g, `from ${JSON.stringify(new URL('../src/utils/video.js', import.meta.url).href)}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code + `\n// ${++moduleId}`).toString('base64')}`)).default;
}

class Node extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tag = tag;
    this.children = [];
    this.offsetWidth = 640;
    this.offsetHeight = 360;
    this.width = 0;
    this.height = 0;
    this.strokes = [];
    this.labels = [];
  }
  appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = []; nodes.forEach(node => this.appendChild(node)); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); }
  getBoundingClientRect() { return { width: this.offsetWidth, height: this.offsetHeight }; }
  getContext() {
    return {
      clearRect: () => { this.strokes = []; this.labels = []; },
      strokeRect: (...args) => this.strokes.push(args),
      measureText: text => ({ width: text.length * 8 }),
      fillRect() {},
      fillText: text => this.labels.push(text),
      setTransform() {},
    };
  }
}

async function mount(t, initial = {}, { apiReady = true } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  const nodes = new Map();
  const players = [];
  const sockets = [];
  const frames = new Map();
  const observers = [];
  let frameId = 0;
  window.devicePixelRatio = 1;
  window.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  class ResizeObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
  }
  window.ResizeObserver = ResizeObserver;
  window.YT = {
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
    Player: class {
      constructor(host, options) {
        this.host = typeof host === 'string' ? nodes.get(host) : host;
        this.options = options;
        this.time = options.playerVars.start;
        this.state = 2;
        players.push(this);
      }
      destroy() { this.destroyed = true; this.host?.remove(); }
      playVideo() { this.state = 1; }
      pauseVideo() { this.state = 2; }
      getCurrentTime() { return this.time; }
      getPlayerState() { return this.state; }
      seekTo(time) { this.time = time; }
      loadVideoById() {}
      getVolume() { return 50; }
      setVolume() {}
      isMuted() { return false; }
      mute() {}
      unMute() {}
    },
  };
  const loadedAPI = window.YT;
  if (!apiReady) window.YT = {};
  document.createElement = tag => new Node(tag);
  document.getElementById = id => nodes.get(id);
  document.querySelector = () => document.head.children.find(node => node.src === 'https://www.youtube.com/iframe_api');
  document.head = new Node();
  const auth = { isAuthenticated: false, isFavorite: async () => false };
  globalThis.__playerTest = {
    auth,
    io: (url, options) => {
      const handlers = new Map();
      const socket = {
        connected: true, options, sent: [], handlers,
        on(event, fn) { handlers.set(event, fn); return this; },
        off(event, fn) { if (handlers.get(event) === fn) handlers.delete(event); },
        emit(event, data) { this.sent.push({ event, data }); },
        server(event, data) { handlers.get(event)?.(data); },
        removeAllListeners() { handlers.clear(); },
        disconnect() { this.connected = false; this.disconnected = true; },
        connect() { this.connectCalls = (this.connectCalls || 0) + 1; },
        io: {
          handlers: new Map(),
          on(event, fn) { this.handlers.set(event, fn); },
          off(event, fn) { if (this.handlers.get(event) === fn) this.handlers.delete(event); },
          server(event, data) { this.handlers.get(event)?.(data); },
        },
      };
      sockets.push(socket);
      return socket;
    },
  };
  const originals = new Map(['window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document, ResizeObserver, requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame });
  const renderer = createRenderer({
    createElement: tag => new Node(tag),
    createText: () => new Node('text'),
    createComment: () => new Node('comment'),
    setText() {}, setElementText() {},
    parentNode: node => node.parentElement,
    nextSibling: () => null,
    insert: (node, parent) => parent.appendChild(node),
    remove: node => node.remove(),
    patchProp(node, key, previous, value) { if (key === 'id') nodes.set(value, node); },
  });
  const Component = await component();
  Component.render = function () {
    const live = getCurrentInstance().setupState.isLiveMode;
    return h('div', { ref: 'root' }, [
      h('div', { ref: 'playerHost' }, [h('div', { id: live ? 'youtube-player-live' : 'youtube-player' })]),
      h('div', {}, [h('canvas', { ref: live ? 'overlayCanvas' : 'normalOverlayCanvas' })]),
    ]);
  };
  const errors = [];
  const ready = [];
  let vnode;
  let props = { videoId: 'abcdefghijk', onError: error => errors.push(error), onPlayerReady: () => ready.push(true), ...initial };
  const container = new Node();
  const render = () => { vnode = h(Component, props); renderer.render(vnode, container); };
  const flush = async () => { for (let i = 0; i < 6; i++) await nextTick(); };
  const unmount = () => renderer.render(null, container);
  t.after(() => {
    unmount();
    for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    delete globalThis.__playerTest;
  });
  render();
  await flush();
  return {
    players, sockets, errors, ready, window, document, frames, observers, auth,
    readyAPI: () => { window.YT = loadedAPI; window.onYouTubeIframeAPIReady?.(); },
    get state() { return vnode.component.setupState; },
    get controls() { return vnode.component.exposed; },
    flush, unmount,
    update: async values => { props = { ...props, ...values }; render(); await flush(); },
    draw: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
  };
}

test('maintenance mounts no YouTube player or socket', async t => {
  const app = await mount(t, { isMaintenance: true });
  assert.equal(app.players.length, 0);
  assert.equal(app.sockets.length, 0);
  app.controls.playVideo();
  assert.equal(app.players.length, 0);
});

test('switches own exactly one player and socket and destroy prior resources', async t => {
  const app = await mount(t);
  assert.equal(app.players.length, 1);
  await app.update({ streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/lmnopqrstuv' });
  assert.equal(app.players.length, 2);
  assert.equal(app.players[0].destroyed, true);
  assert.equal(app.sockets[0].disconnected, true);
  await app.update({ liveVideoUrl: 'https://youtu.be/zyxwvutsrqp' });
  assert.equal(app.players.length, 3);
  assert.equal(app.players[1].destroyed, true);
  await app.update({ streamUrl: '', videoId: 'abcdefghijk' });
  assert.equal(app.players.length, 4);
  assert.equal(app.players.filter(player => !player.destroyed).length, 1);
  assert.equal(app.sockets.filter(socket => !socket.disconnected).length, 1);
  app.unmount();
  assert.ok(app.players.every(player => player.destroyed));
  assert.ok(app.sockets.every(socket => socket.disconnected));
});

test('maintenance transition disposes resources and restarts once when lifted', async t => {
  const app = await mount(t);
  await app.update({ isMaintenance: true });
  assert.ok(app.players[0].destroyed);
  assert.ok(app.sockets[0].disconnected);
  await app.update({ videoId: 'lmnopqrstuv' });
  assert.equal(app.players.length, 1);
  await app.update({ isMaintenance: false });
  assert.equal(app.players.length, 2);
});

test('unmount removes exact resize/orientation/fullscreen listeners and observers', async t => {
  const app = await mount(t);
  const canvas = app.state.normalOverlayCanvas;
  app.draw();
  canvas.parentElement.offsetWidth = 320;
  app.unmount();
  app.window.dispatchEvent(new Event('resize'));
  app.window.dispatchEvent(new Event('orientationchange'));
  app.document.dispatchEvent(new Event('fullscreenchange'));
  await app.flush();
  app.draw();
  assert.equal(canvas.width, 640);
  assert.ok(app.observers.length > 0);
  assert.ok(app.observers.every(observer => observer.disconnected));
});

test('live disconnect clears stale detections and restores the same session on reconnect', async t => {
  const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
  const socket = app.sockets[0];
  socket.server('session-created', { sessionId: 'session-a', workerId: 'worker-1' });
  socket.server('ai-boxes', { sessionId: 'session-a', boxes: [{ name: 'Test', left: 1, top: 1, width: 2, height: 2 }] });
  assert.equal(app.state.aiConnected, true);
  socket.connected = false;
  socket.server('disconnect', 'transport close');
  assert.equal(app.state.aiConnected, false);
  assert.deepEqual(app.state.currentBoxes, []);
  app.players[0].time = 23;
  socket.connected = true;
  socket.server('connect');
  const request = socket.sent.filter(item => item.event === 'start-live-stream').at(-1);
  assert.equal(request.data.existingSessionId, 'session-a');
  assert.equal(request.data.currentTime, 23);
  socket.server('session-created', { sessionId: 'session-a', workerId: 'worker-1', reconnected: true });
  assert.equal(app.state.aiConnected, true);
});

test('session request has a finite timeout and explicit retry is deduplicated', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
  assert.equal(app.state.isRequestingSession, true);
  app.state.requestSession();
  assert.equal(app.sockets[0].sent.filter(item => item.event === 'start-live-stream').length, 1);
  t.mock.timers.tick(10001);
  assert.equal(app.state.isRequestingSession, false);
  assert.ok(app.errors.some(message => /waktu|timed out/i.test(message)));
  app.state.requestSession();
  assert.equal(app.sockets[0].sent.filter(item => item.event === 'start-live-stream').length, 2);
  app.unmount();
  const count = app.errors.length;
  t.mock.timers.tick(20000);
  assert.equal(app.errors.length, count);
});

test('socket reconnect is bounded and failure/retry remains user-visible', async t => {
  const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
  const socket = app.sockets[0];
  assert.ok(socket.options.reconnectionAttempts > 0 && socket.options.reconnectionAttempts <= 5);
  assert.ok(socket.options.timeout > 0 && socket.options.timeout <= 10000);
  assert.equal(socket.options.forceNew, true);
  socket.connected = false;
  socket.server('disconnect', 'transport close');
  socket.io.server('reconnect_failed');
  assert.ok(app.errors.length);
  app.state.requestSession();
  assert.ok(socket.connectCalls >= 2);
  app.unmount();
  assert.equal(socket.io.handlers.size, 0);
});

test('normal confidence zero is filtered and labels retain zero at zero threshold', async t => {
  const box = { left: 10, top: 10, width: 20, height: 20 };
  const app = await mount(t, { characters: [{ name: 'Zero', confidence: 0, box }, { name: 'Known', confidence: 80, box }] });
  app.draw();
  assert.equal(app.state.normalOverlayCanvas.strokes.length, 1);
  await app.update({ confidenceThreshold: 0 });
  app.draw();
  assert.deepEqual(app.state.normalOverlayCanvas.labels, ['Zero 0%', 'Known 80%']);
});

test('live confidence zero is not replaced by 100 and drawing is coalesced', async t => {
  const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
  const socket = app.sockets[0];
  socket.server('session-created', { sessionId: 'a' });
  socket.server('ai-boxes', { sessionId: 'a', boxes: [{ name: 'Zero', confidence: 0, left: 1, top: 2, width: 3, height: 4 }] });
  socket.server('ai-boxes', { sessionId: 'a', boxes: [{ name: 'Zero', confidence: 0, left: 5, top: 6, width: 7, height: 8 }] });
  assert.equal(app.frames.size, 1);
  app.draw();
  assert.equal(app.state.overlayCanvas.strokes.length, 0);
  await app.update({ confidenceThreshold: 0 });
  app.draw();
  assert.deepEqual(app.state.overlayCanvas.labels, ['Zero 0%']);
});

test('fullscreen rejection is caught and emitted without vendor fallback double-call', async t => {
  const app = await mount(t);
  const container = app.state.playerHost.parentElement;
  let fallbackCalls = 0;
  container.requestFullscreen = async () => { throw new Error('Fullscreen denied'); };
  container.webkitRequestFullscreen = () => fallbackCalls++;
  await assert.doesNotReject(async () => app.controls.toggleFullscreen());
  assert.deepEqual(app.errors, ['Fullscreen denied']);
  assert.equal(fallbackCalls, 0);
  app.document.fullscreenElement = container;
  app.document.exitFullscreen = async () => { throw new Error('Exit denied'); };
  await assert.doesNotReject(async () => app.controls.toggleFullscreen());
  assert.deepEqual(app.errors, ['Fullscreen denied', 'Exit denied']);
});

test('favorite failures returned by store do not change favorite state', async t => {
  const app = await mount(t);
  app.auth.isAuthenticated = true;
  app.auth.addToFavorites = async () => ({ success: false, error: 'Firestore unavailable' });
  await app.state.toggleFavorite();
  assert.equal(app.state.isFavorited, false);
  assert.deepEqual(app.errors, ['Firestore unavailable']);
  app.auth.addToFavorites = async () => { throw new Error('Permission denied'); };
  await assert.doesNotReject(() => app.state.toggleFavorite());
  assert.equal(app.state.isFavorited, false);
  assert.deepEqual(app.errors, ['Firestore unavailable', 'Permission denied']);
});

test('favorite lookup catches rejection and ignores a result from an old video', async t => {
  const app = await mount(t);
  app.auth.isAuthenticated = true;
  app.auth.isFavorite = async () => { throw new Error('Lookup failed'); };
  await assert.doesNotReject(() => app.state.checkFavorite());
  assert.deepEqual(app.errors, ['Lookup failed']);
  let resolve;
  app.auth.isFavorite = () => new Promise(done => { resolve = done; });
  const pending = app.state.checkFavorite();
  app.auth.isFavorite = async () => false;
  await app.update({ videoId: 'lmnopqrstuv' });
  resolve(true);
  await pending;
  assert.equal(app.state.isFavorited, false);
});

test('server-ended session clears UI without echoing end and ignores stale session IDs', async t => {
  const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
  const socket = app.sockets[0];
  socket.server('session-created', { sessionId: 'active' });
  socket.server('ai-boxes', { sessionId: 'active', boxes: [{ name: 'Box', left: 0, top: 0, width: 1, height: 1 }] });
  socket.server('session-ended', { sessionId: 'old' });
  assert.equal(app.state.sessionId, 'active');
  socket.server('session-ended', { sessionId: 'active' });
  assert.equal(app.state.sessionId, null);
  assert.deepEqual(app.state.currentBoxes, []);
  assert.equal(app.state.aiConnected, false);
  assert.equal(socket.sent.filter(item => item.event === 'end-session').length, 0);
});

test('unmount cancels an API load and late readiness cannot create resources', async t => {
  const app = await mount(t, {}, { apiReady: false });
  assert.equal(app.document.head.children.length, 1);
  app.unmount();
  assert.equal(app.document.head.children.length, 0);
  app.readyAPI();
  await app.flush();
  assert.equal(app.players.length, 0);
  assert.equal(app.sockets.length, 0);
  assert.deepEqual(app.errors, []);
});

test('rapid pending video/mode switches construct only the latest requested player', async t => {
  const app = await mount(t, {}, { apiReady: false });
  await app.update({ videoId: 'lmnopqrstuv' });
  await app.update({ streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/zyxwvutsrqp' });
  app.readyAPI();
  await app.flush();
  assert.equal(app.players.length, 1);
  assert.equal(app.players[0].options.videoId, 'zyxwvutsrqp');
  assert.equal(app.sockets.length, 1);
  assert.deepEqual(app.errors, []);
});

test('API errors are visible and maintenance during loading suppresses stale errors', async t => {
  const app = await mount(t, {}, { apiReady: false });
  app.document.head.children[0].dispatchEvent(new Event('error'));
  await app.flush();
  assert.equal(app.errors.length, 1);
  assert.equal(app.players.length, 0);
  await app.update({ videoId: 'lmnopqrstuv' });
  await app.update({ isMaintenance: true });
  assert.equal(app.document.head.children.length, 0);
  app.readyAPI();
  await app.flush();
  assert.equal(app.players.length, 0);
  assert.equal(app.errors.length, 1);
});

test('controls preserve public API and time polling has one owned interval', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const app = await mount(t, { startTime: 20 });
  assert.deepEqual(Object.keys(app.controls).sort(), ['playVideo', 'pauseVideo', 'getCurrentTime', 'seekTo', 'togglePlayPause', 'seekRelative', 'changeVolume', 'toggleMute', 'toggleFullscreen'].sort());
  assert.equal(app.controls.getCurrentTime(), 20);
  app.controls.seekRelative(-100);
  assert.equal(app.controls.getCurrentTime(), 0);
  app.controls.seekTo(15);
  app.controls.playVideo();
  assert.equal(app.players[0].state, 1);
  app.controls.togglePlayPause();
  assert.equal(app.players[0].state, 2);
  app.players[0].options.events.onReady({ target: app.players[0] });
  assert.equal(app.ready.length, 1);
  app.players[0].options.events.onStateChange({ data: 1 });
  app.players[0].options.events.onStateChange({ data: 1 });
  t.mock.timers.tick(500);
  assert.equal(app.sockets[0].sent.filter(item => item.event === 'player-state').length, 2);
  app.unmount();
  t.mock.timers.tick(5000);
  assert.equal(app.players[0].destroyed, true);
});

test('YouTube playback error removes waiting state and stream error clears stale AI state', async t => {
  const app = await mount(t);
  app.players[0].options.events.onError({ data: 150 });
  assert.equal(app.state.isWaitingForBackend, false);
  assert.equal(app.errors.length, 1);
  await app.update({ streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
  const socket = app.sockets.at(-1);
  socket.server('session-created', { sessionId: 'session' });
  socket.server('ai-boxes', { sessionId: 'session', boxes: [] });
  socket.server('stream-error', { sessionId: 'session', message: 'Worker failed' });
  assert.equal(app.state.aiConnected, false);
  assert.equal(app.errors.at(-1), 'Worker failed');
  app.state.requestSession();
  assert.equal(socket.sent.filter(item => item.event === 'start-live-stream').length, 2);
});

test('live YouTube URLs support live/shorts routes and reject non-YouTube hosts', async t => {
  const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://www.youtube.com/live/abcdefghijk' });
  assert.equal(app.players.length, 1);
  await app.update({ liveVideoUrl: 'https://www.youtube.com/shorts/lmnopqrstuv' });
  assert.equal(app.players.at(-1).options.videoId, 'lmnopqrstuv');
  await app.update({ liveVideoUrl: 'https://evil.example/watch?v=abcdefghijk' });
  assert.equal(app.players.length, 2);
  assert.equal(app.sockets.filter(socket => !socket.disconnected).length, 0);
  assert.equal(app.errors.at(-1), 'URL YouTube tidak valid.');
});

// Synthetic player/service adapters, not real Firebase or successful inference.
test('default guided viewing can use the existing save API', async t => {
 const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk' });
 app.auth.isAuthenticated = true;
 const saves = [];
 app.auth.addToFavorites = async data => { saves.push(data); return { success: true }; };
 await app.state.toggleFavorite();
 assert.equal(saves.length, 1);
 assert.equal(saves[0].videoId, 'abcdefghijk');
 assert.equal(app.state.isFavorited, true);
});
test('guided viewing forwards the selected language to the existing session API', async t => {
 const app = await mount(t, { streamUrl: 'socket-relay', liveVideoUrl: 'https://youtu.be/abcdefghijk', targetLanguage: 'en' });
 const request = app.sockets[0].sent.find(item => item.event === 'start-live-stream');
 assert.equal(request.data.targetLanguage, 'en');
});
