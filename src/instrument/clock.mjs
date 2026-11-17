/** Advances preset recall while the instrument is moving and the page is visible. */
export function createInstrumentClock(controller, options = {}) {
  const requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const visibilityTarget = options.visibilityTarget ?? globalThis.document;
  let handle = null;
  let lastTime = null;
  let inFrame = false;
  let disposed = false;

  function synchronize() {
    if (disposed) return;
    if (visibilityTarget?.hidden || !controller.snapshot().motorActive) {
      if (handle !== null) cancelFrame(handle);
      handle = null;
      lastTime = null;
      return;
    }
    if (handle === null && !inFrame) handle = requestFrame(advance);
  }

  function advance(now) {
    handle = null;
    if (disposed || visibilityTarget?.hidden) {
      lastTime = null;
      return;
    }
    inFrame = true;
    try {
      if (lastTime !== null) controller.tick(Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
    } finally {
      inFrame = false;
      synchronize();
    }
  }

  const unsubscribe = controller.subscribe(synchronize);
  visibilityTarget?.addEventListener('visibilitychange', synchronize);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      visibilityTarget?.removeEventListener('visibilitychange', synchronize);
      if (handle !== null) cancelFrame(handle);
      handle = null;
      lastTime = null;
    },
  };
}
