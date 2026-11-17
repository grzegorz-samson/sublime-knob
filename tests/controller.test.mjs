import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstrumentController } from '../src/instrument/controller.mjs';

test('local controls update synchronously and notify only meaningful changes', () => {
  const instrument = createInstrumentController();
  const snapshots = [];
  const unsubscribe = instrument.subscribe((snapshot) => snapshots.push(snapshot));
  assert.equal(snapshots.length, 1);
  instrument.setPosition(NaN);
  instrument.tick(0.05);
  instrument.turnFine(0);
  assert.equal(snapshots.length, 1);
  const changed = instrument.turnFine(1);
  assert.equal(changed.fine, 1);
  assert.equal(snapshots.at(-1).frequencyHz, changed.frequencyHz);
  unsubscribe();
  instrument.turnFine(1);
  assert.equal(snapshots.length, 2);
});

test('preset recall advances by frame delta and stops at its destination', () => {
  const instrument = createInstrumentController();
  instrument.setPosition(640.5);
  instrument.savePreset();
  instrument.setPosition(100);
  instrument.recallPreset();
  assert.equal(instrument.snapshot().motorActive, true);
  assert.equal(instrument.tick(0.025).position, 115);
  for (let i = 0; i < 100 && instrument.snapshot().motorActive; i++) instrument.tick(1 / 60);
  assert.equal(instrument.snapshot().position, 640.5);
  assert.equal(instrument.snapshot().motorActive, false);
  const revision = instrument.snapshot().revision;
  instrument.tick(0.05);
  assert.equal(instrument.snapshot().revision, revision);
});

test('manual movement cancels recall, and snapshots cannot mutate presets', () => {
  const instrument = createInstrumentController();
  instrument.turnPreset(4);
  instrument.recallPreset();
  instrument.setPosition(420.25);
  assert.equal(instrument.snapshot().motorActive, false);
  const snapshot = instrument.snapshot();
  snapshot.presets[4] = 0;
  assert.equal(instrument.snapshot().presets[4], 400);
  instrument.tick(0.05);
  assert.equal(instrument.snapshot().position, 420.25);
});

test('closing a local instrument stops mutation and notifications', () => {
  const instrument = createInstrumentController();
  let calls = 0;
  instrument.subscribe(() => calls++);
  const before = instrument.snapshot();
  instrument.close();
  instrument.turnFine(4);
  instrument.setPosition(100);
  instrument.tick(0.05);
  instrument.subscribe(() => calls++);
  assert.deepEqual(instrument.snapshot(), before);
  assert.equal(calls, 1);
});
