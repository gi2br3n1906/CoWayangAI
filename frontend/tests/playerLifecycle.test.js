import test from 'node:test';
import assert from 'node:assert/strict';

async function helpers() {
  return import('../src/utils/playerLifecycle.js').catch(() => ({}));
}

test('resource scope removes exact listeners and cancels owned timers on disposal', async () => {
  const { createResourceScope } = await helpers();
  assert.equal(typeof createResourceScope, 'function');
  const calls = [];
  const timers = {
    setTimeout: fn => { calls.push(fn); return 7; },
    clearTimeout: id => calls.push(['clear', id]),
  };
  const target = new EventTarget();
  let fired = 0;
  const listener = () => fired++;
  const scope = createResourceScope(timers);
  scope.listen(target, 'resize', listener);
  scope.timeout(listener, 10);
  target.dispatchEvent(new Event('resize'));
  assert.equal(fired, 1);
  scope.dispose();
  scope.dispose();
  target.dispatchEvent(new Event('resize'));
  calls[0](); // a queued callback cannot mutate disposed state
  assert.equal(fired, 1);
  assert.deepEqual(calls.slice(1), [['clear', 7]]);
});

test('frame scheduler coalesces updates and cancels drawing on disposal', async () => {
  const { createFrameScheduler } = await helpers();
  assert.equal(typeof createFrameScheduler, 'function');
  const frames = new Map();
  let id = 0;
  const clock = {
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: frame => frames.delete(frame),
  };
  let draws = 0;
  const scheduler = createFrameScheduler(() => draws++, clock);
  scheduler.request();
  scheduler.request();
  assert.equal(frames.size, 1);
  const frame = frames.get(1);
  frames.delete(1);
  frame();
  assert.equal(draws, 1);
  scheduler.request();
  scheduler.dispose();
  scheduler.request();
  assert.equal(frames.size, 0);
});

test('resource scope stops intervals including callbacks already queued', async () => {
  const { createResourceScope } = await helpers();
  let tick;
  let cleared;
  let count = 0;
  const scope = createResourceScope({
    setInterval: fn => { tick = fn; return 8; },
    clearInterval: id => { cleared = id; },
  });
  assert.equal(typeof scope.interval, 'function');
  scope.interval(() => count++, 500);
  tick();
  scope.dispose();
  tick();
  assert.equal(count, 1);
  assert.equal(cleared, 8);
});

test('explicit cancellation blocks queued timeout and interval callbacks while scope remains active', async () => {
  const { createResourceScope } = await helpers();
  let timeout;
  let interval;
  let count = 0;
  const scope = createResourceScope({
    setTimeout: fn => { timeout = fn; return 1; }, clearTimeout() {},
    setInterval: fn => { interval = fn; return 2; }, clearInterval() {},
  });
  const cancelTimeout = scope.timeout(() => count++, 1);
  const cancelInterval = scope.interval(() => count++, 1);
  cancelTimeout();
  cancelInterval();
  timeout();
  interval();
  assert.equal(count, 0);
  assert.equal(scope.disposed, false);
  scope.dispose();
});
