const ADC_MAX = 1023;
const FINE_LIMIT = 4096;
const MOTOR_SPEED = 600;
const DEADZONE = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function rawFrequency(position) {
  return 80 * Math.pow(16001 / 80, (Math.max(1, position) - 1) / 1022);
}

function positionForFrequency(hz) {
  return 1 + (1022 * Math.log(hz / 80)) / Math.log(16001 / 80);
}

export function createInstrumentState(initial = null) {
  let position = positionForFrequency(440);
  let fine = 0;
  let tuningMode = 'hz';
  let presetIndex = 0;
  let presets = Array.from({ length: 11 }, (_, i) => i * 100);
  let target = 0;
  let motorActive = false;
  let revision = 0;

  // Restore starting values from an optional snapshot.
  if (initial && typeof initial === 'object') {
    if (isFiniteNumber(initial.position)) position = clamp(initial.position, 0, ADC_MAX);
    if (isFiniteNumber(initial.fine))
      fine = Math.trunc(clamp(initial.fine, -FINE_LIMIT, FINE_LIMIT));
    if (['hz', 'cents'].includes(initial.tuningMode)) tuningMode = initial.tuningMode;
    if (Number.isInteger(initial.presetIndex)) presetIndex = clamp(initial.presetIndex, 0, 10);
    if (
      Array.isArray(initial.presets) &&
      initial.presets.length === 11 &&
      initial.presets.every(isFiniteNumber)
    ) {
      presets = initial.presets.map((value) => clamp(value, 0, ADC_MAX));
    }
    if (isFiniteNumber(initial.target)) target = clamp(initial.target, 0, ADC_MAX);
    motorActive = initial.motorActive === true;
    if (Number.isSafeInteger(initial.revision) && initial.revision >= 0)
      revision = initial.revision;
  }

  const changed = () => {
    revision += 1;
  };
  const effectiveFrequency = () =>
    clamp(
      tuningMode === 'hz'
        ? rawFrequency(position) + fine
        : rawFrequency(position) * Math.pow(2, fine / 48),
      20,
      20000,
    );

  function snapshot() {
    const frequencyHz = effectiveFrequency();
    const midi = 69 + 12 * Math.log2(frequencyHz / 440);
    const noteNumber = Math.round(midi);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return {
      position,
      angleDeg: clamp(-135 + (position / ADC_MAX) * 270, -135, 135),
      fine,
      tuningMode,
      presetIndex,
      presets: presets.slice(),
      target,
      motorActive,
      frequencyHz,
      note: `${names[((noteNumber % 12) + 12) % 12]}${Math.floor(noteNumber / 12) - 1}`,
      revision,
    };
  }

  function setPosition(adc) {
    if (!isFiniteNumber(adc)) return snapshot();
    const next = clamp(adc, 0, ADC_MAX);
    const didChange = next !== position || motorActive;
    position = next;
    motorActive = false;
    if (didChange) changed();
    return snapshot();
  }

  function stepValue(steps) {
    if (!isFiniteNumber(steps)) return 0;
    return Math.trunc(clamp(steps, -128, 128));
  }

  function turnFine(steps) {
    const amount = stepValue(steps);
    if (amount) {
      const next = clamp(fine + amount, -FINE_LIMIT, FINE_LIMIT);
      if (next !== fine) {
        fine = next;
        changed();
      }
    }
    return snapshot();
  }

  function turnPreset(steps) {
    const amount = stepValue(steps);
    if (amount) {
      const next = (((presetIndex + amount) % presets.length) + presets.length) % presets.length;
      if (next !== presetIndex) {
        presetIndex = next;
        target = presets[next];
        changed();
      }
    }
    return snapshot();
  }

  function pressFine() {
    tuningMode = tuningMode === 'hz' ? 'cents' : 'hz';
    changed();
    return snapshot();
  }

  function pressPreset() {
    return savePreset();
  }

  function recallPreset() {
    const nextActive = Math.abs(target - position) > DEADZONE;
    if (nextActive !== motorActive) {
      motorActive = nextActive;
      changed();
    }
    return snapshot();
  }

  function resetFine() {
    if (fine !== 0) {
      fine = 0;
      changed();
    }
    return snapshot();
  }

  function savePreset() {
    const nextTarget = position;
    const didChange = presets[presetIndex] !== nextTarget || target !== nextTarget || motorActive;
    if (presets[presetIndex] !== nextTarget) {
      presets = presets.slice();
      presets[presetIndex] = nextTarget;
    }
    target = nextTarget;
    motorActive = false;
    if (didChange) changed();
    return snapshot();
  }

  function tick(deltaSeconds) {
    if (!isFiniteNumber(deltaSeconds) || deltaSeconds <= 0 || !motorActive) return snapshot();
    const dt = Math.min(deltaSeconds, 0.05);
    const distance = target - position;
    if (Math.abs(distance) <= DEADZONE) {
      if (position !== target || motorActive) {
        position = target;
        motorActive = false;
        changed();
      }
      return snapshot();
    }
    const movement = Math.min(Math.abs(distance), MOTOR_SPEED * dt) * Math.sign(distance);
    position += movement;
    if (Math.abs(target - position) <= DEADZONE) {
      position = target;
      motorActive = false;
    }
    changed();
    return snapshot();
  }

  return {
    snapshot,
    setPosition,
    turnFine,
    turnPreset,
    pressFine,
    pressPreset,
    recallPreset,
    resetFine,
    savePreset,
    tick,
  };
}
