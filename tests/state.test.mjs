import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstrumentState } from '../src/instrument/state.mjs';
import { InstrumentAudio } from '../src/instrument/audio.mjs';

test('starts near A4 and exposes bounded dial coordinates and standard note', () => {
  const state = createInstrumentState().snapshot();
  assert.ok(Math.abs(state.frequencyHz - 440) < 1e-8);
  assert.equal(state.note, 'A4');
  assert.ok(state.position >= 0 && state.position <= 1023);
  assert.ok(state.angleDeg >= -135 && state.angleDeg <= 135);
});

test('manual position clamps, cancels motor, and invalid values are ignored', () => {
  const model = createInstrumentState();
  model.turnPreset(1);
  model.recallPreset();
  assert.equal(model.snapshot().motorActive, true);
  model.setPosition(Infinity);
  assert.equal(model.snapshot().motorActive, true);
  model.setPosition(2000);
  assert.equal(model.snapshot().position, 1023);
  assert.equal(model.snapshot().motorActive, false);
  model.setPosition(NaN);
  assert.equal(model.snapshot().position, 1023);
});

test('fine steps are bounded and modes use semitone cents versus additive hertz', () => {
  const model = createInstrumentState();
  const base = model.snapshot().frequencyHz;
  model.turnFine(1);
  assert.equal(model.snapshot().frequencyHz, base + 1);
  model.pressFine();
  const centsBase = model.snapshot().frequencyHz;
  model.turnFine(1);
  assert.ok(Math.abs(model.snapshot().frequencyHz - centsBase * 2 ** (1 / 48)) < 1e-9);
  model.turnFine(10000);
  assert.equal(model.snapshot().fine, 130);
  for (let i = 0; i < 32; i++) model.turnFine(128);
  assert.equal(model.snapshot().fine, 4096);
  model.turnFine(-Infinity);
  assert.equal(model.snapshot().fine, 4096);
});

test('encoder clicks switch mode and overwrite selected preset; separate button recalls it', () => {
  const model = createInstrumentState();
  assert.equal(model.snapshot().tuningMode, 'hz');
  model.pressFine();
  assert.equal(model.snapshot().tuningMode, 'cents');
  model.pressFine();
  assert.equal(model.snapshot().tuningMode, 'hz');

  model.turnPreset(1);
  model.setPosition(321);
  model.pressPreset();
  assert.equal(model.snapshot().presets[1], 321);
  assert.equal(model.snapshot().motorActive, false);

  model.setPosition(800);
  model.recallPreset();
  assert.equal(model.snapshot().target, 321);
  assert.equal(model.snapshot().motorActive, true);
});

test('preset wraps, updates target, save copies current position, and motor snaps at target', () => {
  const model = createInstrumentState();
  model.turnPreset(-1);
  assert.equal(model.snapshot().presetIndex, 10);
  assert.equal(model.snapshot().target, 1000);
  model.turnPreset(1);
  assert.equal(model.snapshot().presetIndex, 0);
  model.setPosition(275.5);
  model.savePreset();
  const saved = model.snapshot();
  assert.equal(saved.presets[0], 275.5);
  saved.presets[0] = 999;
  assert.equal(model.snapshot().presets[0], 275.5);
  model.turnPreset(1);
  model.recallPreset();
  model.tick(1);
  assert.equal(model.snapshot().position, 245.5);
  model.setPosition(89);
  model.recallPreset();
  model.tick(0.05);
  assert.equal(model.snapshot().position, model.snapshot().target);
  assert.equal(model.snapshot().motorActive, false);
});

test('saving an active preset stores the current position, stops its motor, and recalls without changing slot', () => {
  const model = createInstrumentState();
  model.turnPreset(1);
  model.recallPreset();
  assert.equal(model.snapshot().motorActive, true);
  model.setPosition(320);
  model.savePreset();
  assert.equal(model.snapshot().presets[1], 320);
  assert.equal(model.snapshot().target, 320);
  assert.equal(model.snapshot().motorActive, false);
  model.setPosition(700);
  model.recallPreset();
  model.tick(0.05);
  assert.equal(model.snapshot().presetIndex, 1);
  assert.equal(model.snapshot().target, 320);
  assert.equal(model.snapshot().position, 670);
});

test('revision changes only for meaningful state transitions', () => {
  const model = createInstrumentState();
  const revision = model.snapshot().revision;
  model.turnFine(0);
  model.tick(NaN);
  assert.equal(model.snapshot().revision, revision);
  model.turnFine(1);
  assert.equal(model.snapshot().revision, revision + 1);
});

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.ramps = [];
  }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {
    this.heldValue = this.value;
  }
  setValueAtTime(value) {
    this.value = value;
  }
  linearRampToValueAtTime(value, time) {
    this.ramps.push([value, time]);
    this.value = value;
  }
  setTargetAtTime(value) {
    this.value = value;
  }
}

class FakeAudioContext {
  constructor(sampleRate = 48000) {
    this.state = 'suspended';
    this.sampleRate = sampleRate;
    this.currentTime = 1;
    this.destination = {};
    this.created = 0;
    this.listeners = new Set();
  }
  node() {
    return {
      connect() {},
      gain: new FakeParam(),
      frequency: new FakeParam(440),
      Q: new FakeParam(),
      getFloatTimeDomainData(a) {
        a.fill(0.25);
      },
    };
  }
  createOscillator() {
    this.created++;
    const n = this.node();
    n.start = () => {};
    n.type = '';
    return n;
  }
  createBiquadFilter() {
    const n = this.node();
    n.type = '';
    return n;
  }
  createGain() {
    return this.node();
  }
  createAnalyser() {
    const n = this.node();
    n.fftSize = 8;
    return n;
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
  addEventListener(type, handler) {
    if (type === 'statechange') this.listeners.add(handler);
  }
  removeEventListener(type, handler) {
    if (type === 'statechange') this.listeners.delete(handler);
  }
  changeState(state) {
    this.state = state;
    for (const handler of this.listeners) handler();
  }
}

test('audio reuses graph, ramps safely, mutes without resurrection, and reports RMS', async () => {
  const context = new FakeAudioContext();
  const audio = new InstrumentAudio(() => context);
  await audio.enable();
  await audio.enable();
  assert.equal(context.created, 1);
  assert.equal(audio.snapshot().enabled, true);
  assert.equal(audio.setFrequency(50000).frequencyHz, 20000);
  audio.setFrequency(NaN);
  assert.equal(audio.snapshot().frequencyHz, 20000);
  audio.setVolume(2);
  assert.equal(audio.snapshot().volume, 1);
  assert.ok(Math.abs(audio.snapshot().rms - 0.25) < 1e-9);
  await audio.mute();
  assert.equal(audio.snapshot().enabled, false);
  await audio.disable();
  assert.equal(context.created, 1);
  assert.equal(context.state, 'running');
  await audio.dispose();
  assert.equal(context.state, 'closed');
});

test('a newer disable intent wins over an in-flight resume', async () => {
  const context = new FakeAudioContext();
  let finishResume;
  context.resume = () =>
    new Promise((resolve) => {
      finishResume = () => {
        context.state = 'running';
        resolve();
      };
    });
  const audio = new InstrumentAudio(() => context);
  const enabling = audio.enable();
  await audio.disable();
  finishResume();
  await enabling;
  assert.equal(audio.snapshot().enabled, false);
  assert.equal(context.created, 1);
});

test('pre-enable frequency respects a low sample rate and interruption disables audio until explicit enable', async () => {
  const context = new FakeAudioContext(22050);
  const audio = new InstrumentAudio(() => context);
  audio.setFrequency(20000);
  await audio.enable();
  assert.equal(audio.snapshot().frequencyHz, 22050 * 0.45);
  assert.equal(audio.snapshot().enabled, true);
  context.changeState('suspended');
  assert.equal(audio.snapshot().enabled, false);
  assert.equal(audio.desiredEnabled, false);
  context.changeState('running');
  assert.equal(audio.snapshot().enabled, false);
  assert.equal(context.created, 1);
  await audio.enable();
  assert.equal(audio.snapshot().enabled, true);
});

test('snapshot polling detects a silent context suspension before the statechange event', async () => {
  const context = new FakeAudioContext();
  const audio = new InstrumentAudio(() => context);
  await audio.enable();
  context.state = 'suspended';
  audio.snapshot();
  assert.equal(audio.desiredEnabled, false);
  assert.equal(audio.master.gain.value, 0);
  context.changeState('running');
  assert.equal(audio.snapshot().enabled, false);
  assert.equal(audio.desiredEnabled, false);
  await audio.enable();
  assert.equal(audio.snapshot().enabled, true);
});

test('audio ramps hold the current automation value when supported', async () => {
  const context = new FakeAudioContext();
  const audio = new InstrumentAudio(() => context);
  await audio.enable();
  assert.equal(audio.master.gain.heldValue, 0);
  audio.setVolume(0.25);
  assert.equal(audio.master.gain.heldValue, 0.1);
});

test('polling during an explicit delayed re-enable does not cancel the new request', async () => {
  const context = new FakeAudioContext();
  const audio = new InstrumentAudio(() => context);
  await audio.enable();
  context.changeState('suspended');
  let finishResume;
  context.resume = () =>
    new Promise((resolve) => {
      finishResume = () => {
        context.state = 'running';
        resolve();
      };
    });
  const enabling = audio.enable();
  audio.snapshot();
  assert.equal(audio.desiredEnabled, true);
  finishResume();
  await enabling;
  assert.equal(audio.snapshot().enabled, true);
});

test('failed graph setup is cleaned up and a later explicit enable can retry', async () => {
  const broken = new FakeAudioContext();
  broken.createAnalyser = () => {
    throw new Error('analyser unavailable');
  };
  const healthy = new FakeAudioContext();
  let calls = 0;
  const audio = new InstrumentAudio(() => (++calls === 1 ? broken : healthy));
  await audio.enable();
  assert.equal(audio.snapshot().enabled, false);
  assert.equal(audio.context, null);
  await audio.enable();
  assert.equal(audio.snapshot().enabled, true);
  assert.equal(calls, 2);
});

test('a rejected context resume stays muted', async () => {
  const context = new FakeAudioContext();
  context.resume = async () => {
    throw new Error('resume denied');
  };
  const audio = new InstrumentAudio(() => context);
  await audio.enable();
  assert.equal(audio.snapshot().enabled, false);
  assert.equal(audio.master.gain.value, 0);
});
