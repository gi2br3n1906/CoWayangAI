// One loader per window: callers share the API script, not their cancellation.
export function createYouTubeLoader({ window, document }) {
  let job = null;
  const cleanup = (current, failed) => {
    if (job === current) job = null;
    current.script.removeEventListener('error', current.error);
    if (window.onYouTubeIframeAPIReady === current.ready) {
      window.onYouTubeIframeAPIReady = current.previous;
    }
    if (failed && current.owned) current.script.remove();
  };
  return function load({ signal, timeoutMs = 15000 } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('YouTube load cancelled', 'AbortError'));
    if (window.YT?.Player) return Promise.resolve(window.YT);
    const first = !job;
    const current = job || { previous: window.onYouTubeIframeAPIReady, waiters: new Set() };
    job = current;
    const promise = new Promise((resolve, reject) => {
      const settle = error => {
        if (!current.waiters.delete(settle)) return;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (!current.waiters.size) cleanup(current, !!error);
        error ? reject(error) : resolve(window.YT);
      };
      const abort = () => settle(new DOMException('YouTube load cancelled', 'AbortError'));
      const timer = setTimeout(() => settle(new Error('YouTube API timed out. Please retry.')), timeoutMs);
      current.waiters.add(settle);
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (first) {
      current.ready = () => {
        try { current.previous?.(); }
        finally {
          if (window.YT?.Player) [...current.waiters].forEach(settle => settle());
        }
      };
      window.onYouTubeIframeAPIReady = current.ready;
      current.script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      current.owned = !current.script;
      if (current.owned) {
        current.script = document.createElement('script');
        current.script.src = 'https://www.youtube.com/iframe_api';
      }
      current.error = () => [...current.waiters].forEach(settle => settle(new Error('YouTube API failed to load. Please retry.')));
      current.script.addEventListener('error', current.error);
      if (current.owned) document.head.appendChild(current.script);
    }
    return promise;
  };
}

const loaders = new WeakMap();
export function loadYouTubeAPI(options) {
  const browser = globalThis.window;
  if (!browser || !globalThis.document) return Promise.reject(new Error('YouTube requires a browser.'));
  if (!loaders.has(browser)) loaders.set(browser, createYouTubeLoader({ window: browser, document: globalThis.document }));
  return loaders.get(browser)(options);
}
