import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstrumentController } from '../src/instrument/controller.mjs';
import { createInstrumentClock } from '../src/instrument/clock.mjs';

function createHarness() {
  const controller = createInstrumentController();
  const visibility = new EventTarget();
  visibility.hidden = false;
  const frames = new Map();
  let nextHandle = 0;
  const clock = createInstrumentClock(controller, {
    visibilityTarget: visibility,
    requestFrame(callback) {
      frames.set(++nextHandle, callback);
      return nextHandle;
    },
    cancelFrame(handle) {
      frames.delete(handle);
    },
  });
  return {
    controller,
    clock,
    frames,
    frame(now) {
      assert.equal(frames.size, 1);
      const [handle, callback] = frames.entries().next().value;
      frames.delete(handle);
      callback(now);
    },
    hidden(value) {
      visibility.hidden = value;
      visibility.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

test('idle controls do not start a frame loop', () => {
  const h = createHarness();
  h.controller.turnFine(1);
  h.controller.setPosition(200);
  assert.equal(h.frames.size, 0);
  h.clock.dispose();
});

test('recall advances independently of a viewer and stops at its target', () => {
  const h = createHarness();
  h.controller.setPosition(100);
  h.controller.savePreset();
  h.controller.setPosition(400);
  h.controller.recallPreset();
  assert.equal(h.frames.size, 1);
  h.frame(1000);
  assert.equal(h.controller.snapshot().position, 400);
  h.frame(1025);
  assert.equal(h.controller.snapshot().position, 385);
  for (let time = 1050; h.frames.size; time += 25) h.frame(time);
  assert.equal(h.controller.snapshot().position, 100);
  assert.equal(h.controller.snapshot().motorActive, false);
  assert.equal(h.frames.size, 0);
});

test('manual movement cancels the pending recall frame', () => {
  const h = createHarness();
  h.controller.recallPreset();
  assert.equal(h.frames.size, 1);
  h.controller.setPosition(420.25);
  assert.equal(h.frames.size, 0);
  assert.equal(h.controller.snapshot().position, 420.25);
  h.clock.dispose();
});

test('hidden pages pause recall and resume without applying elapsed background time', () => {
  const h = createHarness();
  h.controller.recallPreset();
  h.frame(1000);
  h.frame(1025);
  const position = h.controller.snapshot().position;
  h.hidden(true);
  assert.equal(h.frames.size, 0);
  h.hidden(false);
  assert.equal(h.frames.size, 1);
  h.frame(10000);
  assert.equal(h.controller.snapshot().position, position);
  h.frame(10025);
  assert.equal(h.controller.snapshot().position, position - 15);
  h.clock.dispose();
});

test('disposal removes the frame and visibility/subscription wakeups', () => {
  const h = createHarness();
  h.controller.recallPreset();
  h.clock.dispose();
  assert.equal(h.frames.size, 0);
  h.hidden(true);
  h.hidden(false);
  h.controller.setPosition(500);
  h.controller.recallPreset();
  assert.equal(h.frames.size, 0);
});
