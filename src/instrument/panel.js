const STEP_PIXELS = 16;
const HOLD_MS = 1000;
const PRESS_FEEDBACK_MS = 150;

function wirePressFeedback(button, pressTarget = button) {
  let pulseTimer = null;
  let pressedPointer = null;
  const setPressed = (pressed) => pressTarget.classList.toggle('is-pressed', pressed);

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    pressedPointer = event.pointerId;
    setPressed(true);
  });
  const releasePointer = (event) => {
    if (
      pressedPointer === null ||
      (event.pointerId !== undefined && event.pointerId !== pressedPointer)
    )
      return;
    pressedPointer = null;
    setPressed(false);
  };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  button.addEventListener('lostpointercapture', releasePointer);
  window.addEventListener('blur', () => {
    pressedPointer = null;
    setPressed(false);
  });
  button.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) setPressed(true);
  });
  button.addEventListener('keyup', (event) => {
    if (event.key === 'Enter' || event.key === ' ') setPressed(false);
  });
  button.addEventListener('blur', () => setPressed(false));
  button.addEventListener('click', () => {
    clearTimeout(pulseTimer);
    pressTarget.classList.remove('is-click-pulse');
    // Restart the short mechanical response for pointer, keyboard, and .click().
    pressTarget.getBoundingClientRect();
    pressTarget.classList.add('is-click-pulse');
    pulseTimer = setTimeout(
      () => pressTarget.classList.remove('is-click-pulse'),
      PRESS_FEEDBACK_MS,
    );
  });
}

function knobMarkup(id) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><linearGradient id="${id}-rim" gradientUnits="userSpaceOnUse" x1="15" y1="5" x2="85" y2="95"><stop stop-color="#777874"/><stop offset=".4" stop-color="#41423f"/><stop offset="1" stop-color="#232521"/></linearGradient>
    <linearGradient id="${id}-cap" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eeeae0"/><stop offset=".48" stop-color="#d4d0c4"/><stop offset="1" stop-color="#b0ad9f"/></linearGradient></defs>
    <path class="encoder-rim" fill="url(#${id}-rim)" stroke="#30312e" stroke-width="1"/>
    <circle cx="50" cy="50" r="34" fill="url(#${id}-cap)" stroke="#868578" stroke-width="1.5"/>
    <circle cx="50" cy="50" r="32.5" fill="none" stroke="#ffffff55"/>
    <path class="encoder-marker" stroke="#66665d" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

function wireEncoder(button, { turn, press, hold, reset }) {
  let gesture = null;
  let skipClick = false;
  let timer = null;
  let resetClick = false;

  function finish() {
    clearTimeout(timer);
    gesture = null;
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    skipClick = false;
    resetClick = event.ctrlKey;
    gesture = { id: event.pointerId, startY: event.clientY, steps: 0 };
    button.setPointerCapture(event.pointerId);
    if (hold && !event.ctrlKey) {
      timer = setTimeout(() => {
        skipClick = true;
        hold();
      }, HOLD_MS);
    }
  });

  button.addEventListener('pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    const distance = gesture.startY - event.clientY;
    if (Math.abs(distance) > 5) {
      skipClick = true;
      clearTimeout(timer);
    }
    const steps = Math.trunc(distance / STEP_PIXELS);
    const delta = steps - gesture.steps;
    if (delta) {
      gesture.steps = steps;
      turn(delta);
    }
  });

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (gesture?.id === event.pointerId) finish();
    });
  }

  button.addEventListener('click', (event) => {
    const shouldReset = (event.ctrlKey || resetClick) && !skipClick;
    resetClick = false;
    if (shouldReset) {
      reset?.();
      skipClick = false;
      return;
    }
    if (!event.detail || !skipClick) press();
    skipClick = false;
  });
  button.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      turn(-Math.sign(event.deltaY));
    },
    { passive: false },
  );
  button.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        event.preventDefault();
        turn(1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        event.preventDefault();
        turn(-1);
        break;
      case 'Delete':
        if (!hold) return;
        event.preventDefault();
        hold();
        break;
      case 'Enter':
        if (event.ctrlKey && reset) {
          event.preventDefault();
          reset();
        }
        break;
    }
  });
}

export class ExhibitionPanel {
  constructor({ root, onAction, t }) {
    this.root = root;
    this.t = t;
    this.angles = { fine: 0, preset: 0 };
    root.classList.add('exhibition-panel');
    root.setAttribute('role', 'group');
    root.innerHTML = `
      <div class="exhibition-face">
        <span class="panel-screw panel-screw--top-left" aria-hidden="true"></span>
        <span class="panel-screw panel-screw--top-right" aria-hidden="true"></span>
        <span class="panel-screw panel-screw--bottom-left" aria-hidden="true"></span>
        <span class="panel-screw panel-screw--bottom-right" aria-hidden="true"></span>
        <div class="exhibition-lcd"><span></span><span></span></div>
        <div class="exhibition-hints">
          <p id="exhibition-recall-tip"></p>
          <p id="exhibition-tune-tip"></p>
          <p id="exhibition-preset-tip"></p>
        </div>
        <div class="exhibition-hardware exhibition-hardware--recall">
          <button type="button" class="exhibition-recall" aria-describedby="exhibition-recall-tip"></button>
        </div>
        <div class="exhibition-hardware exhibition-hardware--tune">
          <button type="button" class="exhibition-dial" aria-describedby="exhibition-tune-tip">${knobMarkup('tune')}</button>
        </div>
        <div class="exhibition-hardware exhibition-hardware--preset">
          <button type="button" class="exhibition-dial" aria-describedby="exhibition-preset-tip">${knobMarkup('preset')}</button>
        </div>
      </div>`;
    this.lcd = root.querySelector('.exhibition-lcd');
    this.lines = [...this.lcd.children];
    this.recall = root.querySelector('.exhibition-recall');
    [this.tune, this.preset] = root.querySelectorAll('.exhibition-dial');
    wirePressFeedback(this.tune, this.tune.querySelector('svg'));
    wirePressFeedback(this.preset, this.preset.querySelector('svg'));
    wireEncoder(this.tune, {
      turn: (value) => onAction('fineTurn', value),
      press: () => onAction('finePress'),
      reset: () => onAction('resetFine'),
    });
    wireEncoder(this.preset, {
      turn: (value) => onAction('presetTurn', value),
      press: () => onAction('presetPress'),
      hold: () => onAction('resetFine'),
      reset: () => onAction('resetPreset'),
    });
    wirePressFeedback(this.recall);
    this.recall.addEventListener('click', () => onAction('savePress'));
    this.paintKnob('fine');
    this.paintKnob('preset');
    this.translate();
  }

  spin(role, steps) {
    this.angles[role] += steps * 15;
    this.paintKnob(role);
  }

  resetRotation(role) {
    if (!(role in this.angles)) return;
    this.angles[role] = 0;
    this.paintKnob(role);
  }

  paintKnob(role) {
    const button = role === 'fine' ? this.tune : this.preset;
    const angle = (this.angles[role] * Math.PI) / 180;
    const points = Array.from({ length: 160 }, (_, index) => {
      const phase = (index / 160) * Math.PI * 2;
      const radius = 46 + Math.cos(phase * 10) * 2;
      return `${50 + Math.sin(phase + angle) * radius},${50 - Math.cos(phase + angle) * radius}`;
    });
    button.querySelector('.encoder-rim').setAttribute('d', `M${points.join(' L')} Z`);
    const point = (radius) => `${50 + Math.sin(angle) * radius},${50 - Math.cos(angle) * radius}`;
    button.querySelector('.encoder-marker').setAttribute('d', `M${point(24)} L${point(30)}`);
    button.dataset.rotation = String(this.angles[role]);
  }

  translate() {
    const t = this.t;
    this.root.setAttribute(
      'aria-label',
      t('Instrument control panel', 'Panel sterowania instrumentu'),
    );
    this.lcd.setAttribute('aria-label', t('Instrument display', 'Wyświetlacz instrumentu'));
    this.recall.setAttribute('aria-label', t('Recall preset', 'Przywołaj preset'));
    this.tune.setAttribute('aria-label', t('Fine tuning encoder', 'Enkoder dostrojenia'));
    this.preset.setAttribute('aria-label', t('Preset encoder', 'Enkoder presetów'));
    this.root.querySelector('#exhibition-recall-tip').textContent = t(
      'Recall the selected preset.',
      'Przywołaj wybrany preset.',
    );
    this.root.querySelector('#exhibition-tune-tip').textContent = t(
      'Turn to fine-tune. Press to switch Hz/cents. Ctrl-click to reset.',
      'Obróć, aby dostroić. Naciśnij, aby zmienić Hz/centy. Ctrl+klik zeruje.',
    );
    this.root.querySelector('#exhibition-preset-tip').textContent = t(
      'Turn to select. Press to save. Hold/Delete resets fine tuning. Ctrl-click resets preset.',
      'Obróć, aby wybrać. Naciśnij, aby zapisać. Przytrzymaj/Delete zeruje strojenie; Ctrl+klik zeruje preset.',
    );
  }

  update(snapshot) {
    const frequency = String(Math.round(snapshot.frequencyHz)).padStart(5, '0');
    const preset = String(snapshot.presetIndex).padStart(2, '0');
    const fine = `${snapshot.fine >= 0 ? '+' : ''}${snapshot.fine}`;
    const unit = snapshot.tuningMode === 'hz' ? 'Hz' : '25c';
    const lines = [`${frequency}Hz SET:${preset}`, `${snapshot.note} ${unit} ${fine}`];
    this.lines.forEach((line, index) => {
      if (line.textContent !== lines[index]) line.textContent = lines[index];
    });
  }
}
