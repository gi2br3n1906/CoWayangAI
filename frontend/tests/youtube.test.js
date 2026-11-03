import test from 'node:test';
import assert from 'node:assert/strict';

async function loader() {
  const service = await import('../src/services/youtube.js').catch(() => ({}));
  assert.equal(typeof service.createYouTubeLoader, 'function', 'finite loader must exist');
  return service.createYouTubeLoader;
}

function environment() {
  const window = {};
  const scripts = [];
  const document = {
    querySelector: () => scripts[0],
    createElement: () => {
      const script = new EventTarget();
      script.remove = () => scripts.splice(scripts.indexOf(script), 1);
      return script;
    },
    head: { appendChild: script => scripts.push(script) },
  };
  return { window, document, scripts };
}

test('YouTube loader shares one script and resolves on API readiness', async () => {
  const create = await loader();
  const env = environment();
  const load = create(env);
  const first = load();
  const second = load();
  assert.equal(env.scripts.length, 1);
  env.window.YT = { Player() {} };
  env.window.onYouTubeIframeAPIReady();
  assert.equal(await first, env.window.YT);
  assert.equal(await second, env.window.YT);
});

test('YouTube loader times out, restores prior callback, and permits retry', async () => {
  const create = await loader();
  const env = environment();
  const previous = () => {};
  env.window.onYouTubeIframeAPIReady = previous;
  const load = create(env);
  await assert.rejects(load({ timeoutMs: 5 }), /timed out/i);
  assert.equal(env.window.onYouTubeIframeAPIReady, previous);
  assert.equal(env.scripts.length, 0);
  const retry = load({ timeoutMs: 100 });
  env.window.YT = { Player() {} };
  env.window.onYouTubeIframeAPIReady();
  await retry;
});

test('aborting one YouTube waiter does not cancel another', async () => {
  const create = await loader();
  const env = environment();
  const load = create(env);
  const controller = new AbortController();
  const cancelled = load({ signal: controller.signal, timeoutMs: 50 });
  const remaining = load({ timeoutMs: 100 });
  const rejection = assert.rejects(cancelled, { name: 'AbortError' });
  controller.abort();
  await rejection;
  assert.equal(env.scripts.length, 1);
  env.window.YT = { Player() {} };
  env.window.onYouTubeIframeAPIReady();
  await remaining;
});

test('last YouTube waiter cancellation releases script and callback', async () => {
  const create = await loader();
  const env = environment();
  const controller = new AbortController();
  const loading = create(env)({ signal: controller.signal, timeoutMs: 50 });
  const rejection = assert.rejects(loading, { name: 'AbortError' });
  controller.abort();
  await rejection;
  assert.equal(env.scripts.length, 0);
  assert.equal(env.window.onYouTubeIframeAPIReady, undefined);
});

test('YouTube script error rejects promptly and permits a fresh script', async () => {
  const create = await loader();
  const env = environment();
  const load = create(env);
  const loading = load({ timeoutMs: 50 });
  const rejection = assert.rejects(loading, /failed to load/i);
  env.scripts[0].dispatchEvent(new Event('error'));
  await rejection;
  assert.equal(env.scripts.length, 0);
  const retry = load({ timeoutMs: 50 });
  env.window.YT = { Player() {} };
  env.window.onYouTubeIframeAPIReady();
  await retry;
});
