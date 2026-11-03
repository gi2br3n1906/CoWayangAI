// Every initialization owns a scope; invalidating it also guards queued callbacks.
export function createResourceScope(timers = globalThis) {
  let disposed = false;
  const cleanups = new Set();
  const add = cleanup => {
    let active = true;
    const cancel = () => {
      if (!active) return;
      active = false;
      cleanups.delete(cancel);
      cleanup();
    };
    if (disposed) cancel();
    else cleanups.add(cancel);
    return cancel;
  };
  return {
    get disposed() { return disposed; },
    add,
    listen(target, event, listener, options) {
      target.addEventListener(event, listener, options);
      return add(() => target.removeEventListener(event, listener, options));
    },
    timeout(callback, delay) {
      let cleanup;
      let cancelled = false;
      const id = timers.setTimeout(() => {
        cleanups.delete(cleanup);
        if (!disposed && !cancelled) callback();
      }, delay);
      cleanup = add(() => { cancelled = true; timers.clearTimeout(id); });
      return cleanup;
    },
    interval(callback, delay) {
      let cancelled = false;
      const id = timers.setInterval(() => { if (!disposed && !cancelled) callback(); }, delay);
      return add(() => { cancelled = true; timers.clearInterval(id); });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of [...cleanups].reverse()) cleanup();
      cleanups.clear();
    },
  };
}

export function createFrameScheduler(draw, clock = globalThis) {
  let frame = null;
  let disposed = false;
  return {
    request() {
      if (disposed || frame !== null) return;
      frame = clock.requestAnimationFrame(() => {
        frame = null;
        if (!disposed) draw();
      });
    },
    dispose() {
      disposed = true;
      if (frame !== null) clock.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
