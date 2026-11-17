import { createInstrumentState } from './state.mjs';

/** One page owns its instrument. Frames advance preset recall only while moving. */
export function createInstrumentController(initial = null) {
  const state = createInstrumentState(initial);
  const listeners = new Set();
  let closed = false;

  function update(method, value) {
    if (closed) return state.snapshot();
    const revision = state.snapshot().revision;
    const next = state[method](value);
    if (next.revision !== revision) {
      for (const listener of listeners) listener(state.snapshot());
    }
    return next;
  }

  return {
    snapshot: state.snapshot,
    subscribe(listener) {
      if (closed) return () => {};
      listeners.add(listener);
      listener(state.snapshot());
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
    },
    tick: (seconds) => update('tick', seconds),
    setPosition: (value) => update('setPosition', value),
    turnFine: (steps) => update('turnFine', steps),
    turnPreset: (steps) => update('turnPreset', steps),
    pressFine: () => update('pressFine'),
    pressPreset: () => update('pressPreset'),
    resetFine: () => update('resetFine'),
    savePreset: () => update('savePreset'),
    recallPreset: () => update('recallPreset'),
  };
}
