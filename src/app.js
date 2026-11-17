import { createInstrumentController } from './instrument/controller.mjs';
import { createInstrumentClock } from './instrument/clock.mjs';
import { InstrumentAudio } from './instrument/audio.mjs';
import { AudioControls } from './instrument/audio-controls.js';
import { ExhibitionPanel } from './instrument/panel.js';
import { createExhibitionPreferences } from './ui/preferences.js';
import { ExhibitionDrawer } from './ui/drawer.js';
import { createFullscreenControls } from './ui/fullscreen.js';
import { loadFeedback } from './ui/load-feedback.js';

const viewerSection = document.querySelector('.viewer-section');
const stage = document.querySelector('#stage');
const grabHint = document.querySelector('#model-grab-hint');
const viewButtons = [...document.querySelectorAll('.view-tab')];
const resetButton = document.querySelector('#reset-view');
const instrument = createInstrumentController();
const instrumentAudio = new InstrumentAudio();
const encoderTurns = { fine: 0, preset: 0 };
let viewer = null;
let viewerReady = false;
let viewerUnavailable = false;
let disposed = false;
let refreshUI = loadFeedback.translate;
const preferences = createExhibitionPreferences({ onChange: () => refreshUI() });
const t = preferences.t;
const panel = new ExhibitionPanel({
  root: document.querySelector('#exhibition-panel'),
  onAction: instrumentAction,
  t,
});
const audioControls = new AudioControls({
  root: document.querySelector('.page-shell'),
  audio: instrumentAudio,
  t,
});
const drawer = new ExhibitionDrawer({ t });
const fullscreen = createFullscreenControls({
  section: viewerSection,
  audioHome: document.querySelector('#exhibition-audio-slot'),
  audioPanel: document.querySelector('#exhibition-aux'),
  t,
  onResize: () => viewer?.resize(),
  onEscape: () => viewer?.cancelInteractions(),
});
const unsubscribe = instrument.subscribe((snapshot) => {
  audioControls.update(snapshot);
  panel.update(snapshot);
  viewer?.update(snapshot);
});
const clock = createInstrumentClock(instrument);
const events = new AbortController();
const audioStatusTimer = setInterval(() => {
  if (!document.hidden) audioControls.pollAudio();
}, 250);

function refresh() {
  loadFeedback.translate();
  audioControls.translate();
  panel.translate();
  drawer.translate();
  fullscreen.translate();
  viewer?.translate();
}
refreshUI = refresh;
refresh();

function instrumentAction(action, value) {
  if (disposed) return;
  const actions = {
    position: () => instrument.setPosition(value),
    fineTurn: () => instrument.turnFine(value),
    presetTurn: () => instrument.turnPreset(value),
    finePress: () => instrument.pressFine(),
    presetPress: () => instrument.pressPreset(),
    resetFine: () => instrument.resetFine(),
    resetPreset: () => instrument.turnPreset(-instrument.snapshot().presetIndex),
    savePress: () => instrument.recallPreset(),
  };
  if (!actions[action]) return;
  audioControls.activateSound();
  viewer?.interaction();
  actions[action]();
  if (action === 'resetFine' || action === 'resetPreset') {
    const role = action === 'resetFine' ? 'fine' : 'preset';
    encoderTurns[role] = 0;
    panel.resetRotation(role);
    viewer?.resetEncoder(role);
  }
  if (action === 'fineTurn' || action === 'presetTurn') {
    const role = action === 'fineTurn' ? 'fine' : 'preset';
    encoderTurns[role] += value;
    panel.spin(role, value);
    viewer?.spin(role, value);
  }
  if (action.endsWith('Press')) viewer?.pulse(action.replace('Press', ''));
  const state = instrument.snapshot();
  if (action === 'savePress')
    audioControls.say(
      `Recalling preset ${state.presetIndex}.`,
      `Przywołuję preset ${state.presetIndex}.`,
    );
  if (action === 'presetPress')
    audioControls.say(
      `Saved preset ${state.presetIndex}.`,
      `Zapisano preset ${state.presetIndex}.`,
    );
  if (action === 'finePress') {
    if (state.tuningMode === 'hz')
      audioControls.say('Tuning in 1 Hz steps.', 'Strojenie w krokach po 1 Hz.');
    else audioControls.say('Tuning in 25-cent steps.', 'Strojenie w krokach po 25 centów.');
  }
  if (action === 'resetFine') audioControls.say('Fine tuning reset.', 'Dostrojenie wyzerowane.');
}

function selectView(name) {
  for (const button of viewButtons) {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function setViewerControls(ready, capabilities = {}) {
  for (const button of viewButtons) {
    button.disabled =
      !ready ||
      (button.dataset.view === 'inside' && !capabilities.inside) ||
      (button.dataset.view === 'display' && !capabilities.display);
  }
  resetButton.disabled = !ready;
}

function handleViewerFailure(reason, error) {
  if (disposed || viewerUnavailable) return;
  viewerUnavailable = true;
  viewerReady = false;
  viewer?.dispose();
  viewer = null;
  viewerSection.dataset.viewerState = 'unavailable';
  setViewerControls(false);
  grabHint.hidden = true;
  drawer.setInline(true);
  loadFeedback.fail(reason, error);
}

viewerSection.addEventListener(
  'pointerdown',
  (event) => {
    if (event.target.closest('.exhibition-dial, .exhibition-recall')) audioControls.activateSound();
  },
  { capture: true, signal: events.signal },
);
for (const button of viewButtons)
  button.addEventListener(
    'click',
    () => {
      if (!viewerReady) return;
      viewer.interaction();
      viewer.focusView(button.dataset.view);
      selectView(button.dataset.view);
    },
    { signal: events.signal },
  );
resetButton.addEventListener(
  'click',
  () => {
    if (!viewerReady) return;
    viewer.resetView();
    selectView('front');
  },
  { signal: events.signal },
);

function updateVisibility() {
  viewer?.setVisible(!document.hidden && document.documentElement.dataset.page !== 'gallery');
}
window.addEventListener(
  'exhibitionviewchange',
  ({ detail }) => {
    if (detail.isGallery) {
      drawer.setOpen(false);
      audioControls.suspendAudio();
      viewer?.cancelInteractions();
    }
    updateVisibility();
  },
  { signal: events.signal },
);
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) audioControls.suspendAudio();
    audioControls.paintAudio();
    updateVisibility();
  },
  { signal: events.signal },
);
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape') return;
    viewer?.cancelInteractions();
    if (!event.defaultPrevented && !fullscreen.isActive()) viewer?.closeCover();
  },
  { signal: events.signal },
);
window.addEventListener(
  'pagehide',
  () => {
    disposed = true;
    events.abort();
    clearInterval(audioStatusTimer);
    clock.dispose();
    unsubscribe();
    instrument.close();
    instrumentAudio.dispose();
    viewer?.dispose();
    fullscreen.dispose();
  },
  { once: true },
);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

setViewerControls(false);
viewerSection.dataset.viewerState = 'loading';
document.documentElement.dataset.coreState = 'ready';
loadFeedback.start({ onTimeout: () => handleViewerFailure('timeout') });
import('./viewer/exhibition-viewer.js')
  .then(({ createExhibitionViewer }) => {
    if (disposed || viewerUnavailable) return;
    const created = createExhibitionViewer({
      stage,
      grabHint,
      t,
      modelUrl: `${import.meta.env.BASE_URL}media/sublime-knob.glb`,
      initialSnapshot: instrument.snapshot(),
      initialTurns: { ...encoderTurns },
      visible: !document.hidden && document.documentElement.dataset.page !== 'gallery',
      onAction: instrumentAction,
      onGesture: () => audioControls.activateSound(),
      onReady(capabilities) {
        if (disposed || viewerUnavailable) return;
        viewerReady = true;
        viewerSection.dataset.viewerState = 'ready';
        setViewerControls(true, capabilities);
        selectView('front');
        loadFeedback.ready();
      },
      onError: handleViewerFailure,
    });
    if (disposed || viewerUnavailable) created.dispose();
    else viewer = created;
  })
  .catch((error) => {
    const reason = /WebGL.*context|context.*WebGL/i.test(error?.message) ? 'graphics' : 'startup';
    handleViewerFailure(reason, error);
  });

if (import.meta.env.DEV) {
  window.viewerState = () => {
    const state = viewer?.diagnostics() ?? {};
    return {
      ...state,
      loaded: viewerReady,
      viewerState: viewerSection.dataset.viewerState,
      fullscreen: fullscreen.isActive(),
      instrument: {
        ...instrument.snapshot(),
        audio: instrumentAudio.snapshot(),
        visual: state.visual ?? null,
      },
    };
  };
  window.viewerPerformance = () => viewer?.performance() ?? { framePending: false };
}
