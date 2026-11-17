import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createInstrumentController } from './instrument/controller.mjs';
import { InstrumentAudio } from './instrument/audio.mjs';
import { InstrumentScene } from './instrument/scene.js';
import { AudioControls } from './instrument/audio-controls.js';
import { ExhibitionPanel } from './instrument/panel.js';
import { createExhibitionPreferences } from './ui/preferences.js';
import { loadFeedback } from './ui/load-feedback.js';
import { ExhibitionDrawer } from './ui/drawer.js';
import { CoverDrag } from './viewer/cover-drag.js';
import { ModelTheme } from './viewer/model-theme.js';

const MODEL_URL = `${import.meta.env.BASE_URL}media/sublime-knob.glb`;
let refreshExhibitionUI = loadFeedback.translate;
const preferences = createExhibitionPreferences({ onChange: () => refreshExhibitionUI() });
const t = preferences.t;
const exhibitionZoom = document.querySelector('#exhibition-zoom');
const orbitMinDistance = 0.055;
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.querySelector('#stage');
const grabHint = document.querySelector('#model-grab-hint');
let modelTouched = false;
stage.addEventListener(
  'pointerdown',
  () => {
    modelTouched = true;
    grabHint.hidden = true;
  },
  { capture: true, once: true },
);
const viewerSection = document.querySelector('.viewer-section');
const audioHome = document.querySelector('#exhibition-audio-slot');
const audioPanel = document.querySelector('#exhibition-aux');
const fullscreenToggle = document.querySelector('#fullscreen-toggle');
const fullscreenLabel = document.querySelector('#fullscreen-label');
const viewButtons = [...document.querySelectorAll('.view-tab')];

const scene = new THREE.Scene();
const stageColor = () =>
  document.documentElement.dataset.theme === 'dark' ? '#292725' : '#e8e3d9';
scene.background = new THREE.Color(stageColor());
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
camera.position.set(0.75, 0.47, 0.95);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
function labelCanvas() {
  grabHint.textContent = t('Grab me', 'Chwyć');
  renderer.domElement.setAttribute(
    'aria-label',
    t(
      'Sublime Knob 3D model. Drag to rotate the view.',
      'Model 3D instrumentu Sublime Knob. Użyj myszy lub ekranu dotykowego, aby obracać widok.',
    ),
  );
}
labelCanvas();
renderer.domElement.setAttribute('role', 'img');
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.22, 0.015);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.58;
controls.panSpeed = 0.75;
controls.minDistance = orbitMinDistance;
controls.maxDistance = 2.2;
controls.maxPolarAngle = Math.PI * 0.88;
controls.update();

scene.add(new THREE.HemisphereLight(0xf9f4e9, 0x746d61, 2.1));
const keyLight = new THREE.DirectionalLight(0xfff2dc, 3.1);
keyLight.position.set(-0.65, 1.05, 0.75);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -0.8;
keyLight.shadow.camera.right = 0.8;
keyLight.shadow.camera.top = 0.8;
keyLight.shadow.camera.bottom = -0.8;
keyLight.shadow.bias = -0.00018;
keyLight.shadow.normalBias = 0.001;
keyLight.shadow.camera.near = 0.01;
keyLight.shadow.camera.far = 4;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd6e1ea, 1.25);
fillLight.position.set(0.75, 0.38, -0.75);
scene.add(fillLight);

const environment = new RoomEnvironment(renderer);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(environment, 0.04).texture;
environment.dispose();
pmrem.dispose();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({
    color: document.documentElement.dataset.theme === 'dark' ? 0x000000 : 0x514b42,
    opacity: document.documentElement.dataset.theme === 'dark' ? 0.4 : 0.2,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
floor.receiveShadow = true;
scene.add(floor);

let modelRoot = null;
let modelTheme = null;
let rearCover = null;
let mainKnobSkirt = null;
let coverDrag = null;
let coverBasePosition = null;
let coverDetachedPosition = null;
let coverOpen = false;
let transition = null;
let cameraTransition = false;
let loaded = false;
let meshCount = 0;
let renderDirty = true;
let viewportDistanceScale = 1;
let frameHandle = null;
let inFrame = false;
let lastFrameTime = null;
let visualWakeTimer = null;
let visualWakeAt = null;
let orbitInteracting = false;
let latestInstrumentState = null;
const performanceCounters = {
  frameCallbacks: 0,
  renders: 0,
  frameCpuMs: 0,
  renderCpuMs: 0,
  lastRenderCpuMs: 0,
};
const lookPresets = {
  front: {
    position: new THREE.Vector3(0.72, 0.47, 0.93),
    target: new THREE.Vector3(0, 0.22, 0.015),
    opens: false,
  },
  inside: {
    position: new THREE.Vector3(-0.42, 0.43, -0.88),
    target: new THREE.Vector3(0.06, 0.22, -0.015),
    opens: true,
  },
};
const cameraGoal = { position: camera.position.clone(), target: controls.target.clone() };

function countMeshes(root) {
  let count = 0;
  root.traverse((node) => {
    if (node.isMesh) {
      count += 1;
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return count;
}

function worldDeltaToParentLocal(parent, worldDelta) {
  const origin = new THREE.Vector3(0, 0, 0);
  const start = parent.localToWorld(origin.clone());
  const end = start.clone().add(worldDelta);
  return parent.worldToLocal(end).sub(origin);
}

function setCover(open, instant = false) {
  if (!rearCover || !coverBasePosition || !coverDetachedPosition) return;
  coverOpen = open;
  const destination = open ? coverDetachedPosition : coverBasePosition;
  transition = {
    type: 'cover',
    from: rearCover.position.clone(),
    to: destination.clone(),
    elapsed: 0,
    duration: instant || prefersReducedMotion ? 0 : 0.62,
  };
  scheduleFrame();
}

function coverProgress() {
  if (!rearCover || !coverBasePosition || !coverDetachedPosition) return 0;
  const travel = coverDetachedPosition.clone().sub(coverBasePosition);
  return THREE.MathUtils.clamp(
    rearCover.position.clone().sub(coverBasePosition).dot(travel) / travel.lengthSq(),
    0,
    1,
  );
}

function previewCover(progress) {
  transition = null;
  rearCover.position.lerpVectors(coverBasePosition, coverDetachedPosition, progress);
  rearCover.visible = true;
  markInstrumentDirty();
}

function coverScreenDirection() {
  const bounds = renderer.domElement.getBoundingClientRect();
  const closed = rearCover.parent.localToWorld(coverBasePosition.clone()).project(camera);
  const open = rearCover.parent.localToWorld(coverDetachedPosition.clone()).project(camera);
  return {
    x: ((open.x - closed.x) * bounds.width) / 2,
    y: ((closed.y - open.y) * bounds.height) / 2,
  };
}

function focusView(name) {
  const preset = lookPresets[name];
  if (!preset) return;
  controls.minDistance = orbitMinDistance * viewportDistanceScale;
  viewButtons.forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (preset.opens !== coverOpen) setCover(preset.opens);
  cameraGoal.position.copy(preset.position);
  cameraGoal.target.copy(preset.target);
  cameraGoal.position
    .sub(cameraGoal.target)
    .multiplyScalar(viewportDistanceScale)
    .add(cameraGoal.target);
  cameraTransition = true;
  if (prefersReducedMotion) {
    camera.position.copy(cameraGoal.position);
    controls.target.copy(cameraGoal.target);
    controls.update();
    cameraTransition = false;
  }
  markViewDirty();
}

function animateCamera(delta) {
  if (!cameraTransition) return;
  const amount = prefersReducedMotion ? 1 : 1 - Math.exp(-delta * 4.2);
  const currentOrbit = new THREE.Spherical().setFromVector3(
    camera.position.clone().sub(controls.target),
  );
  const goalOrbit = new THREE.Spherical().setFromVector3(
    cameraGoal.position.clone().sub(cameraGoal.target),
  );
  const azimuth =
    THREE.MathUtils.euclideanModulo(goalOrbit.theta - currentOrbit.theta + Math.PI, Math.PI * 2) -
    Math.PI;
  currentOrbit.theta += azimuth * amount;
  currentOrbit.phi = THREE.MathUtils.lerp(currentOrbit.phi, goalOrbit.phi, amount);
  currentOrbit.radius = THREE.MathUtils.lerp(currentOrbit.radius, goalOrbit.radius, amount);
  controls.target.lerp(cameraGoal.target, amount);
  camera.position.setFromSpherical(currentOrbit).add(controls.target);
  if (
    camera.position.distanceToSquared(cameraGoal.position) < 0.000025 &&
    controls.target.distanceToSquared(cameraGoal.target) < 0.000025
  ) {
    camera.position.copy(cameraGoal.position);
    controls.target.copy(cameraGoal.target);
    cameraTransition = false;
  }
}

function resize() {
  const bounds = stage.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  camera.aspect = width / height;
  const nextScale = Math.max(1, 1 / camera.aspect);
  const distanceRatio = nextScale / viewportDistanceScale;
  camera.position.sub(controls.target).multiplyScalar(distanceRatio).add(controls.target);
  cameraGoal.position.sub(cameraGoal.target).multiplyScalar(distanceRatio).add(cameraGoal.target);
  viewportDistanceScale = nextScale;
  controls.minDistance = orbitMinDistance * nextScale;
  controls.maxDistance = 2.2 * nextScale;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  markViewDirty();
}
new ResizeObserver(resize).observe(stage);
resize();

function isFullscreen() {
  return (
    document.fullscreenElement === viewerSection || viewerSection.classList.contains('is-expanded')
  );
}

function labelFullscreen() {
  const active = isFullscreen();
  const label = active
    ? t('Exit fullscreen', 'Zamknij pełny ekran')
    : t('Fullscreen', 'Pełny ekran');
  fullscreenToggle.setAttribute('aria-pressed', String(active));
  fullscreenToggle.setAttribute('aria-label', label);
  fullscreenToggle.title = label;
  fullscreenLabel.textContent = label;
}

function syncFullscreen() {
  if (isFullscreen()) viewerSection.prepend(audioPanel);
  else audioHome.append(audioPanel);
  labelFullscreen();
  requestAnimationFrame(resize);
}

let backgroundInert = [];
function setExpandedFallback(active) {
  viewerSection.classList.toggle('is-expanded', active);
  document.body.classList.toggle('viewer-expanded', active);
  if (active) {
    backgroundInert = [...viewerSection.parentElement.children]
      .filter((element) => element !== viewerSection)
      .map((element) => ({ element, inert: element.inert }));
    backgroundInert.forEach(({ element }) => {
      element.inert = true;
    });
  } else {
    backgroundInert.forEach(({ element, inert }) => {
      element.inert = inert;
    });
    backgroundInert = [];
    fullscreenToggle.focus({ preventScroll: true });
  }
  syncFullscreen();
}

fullscreenToggle.addEventListener('click', async () => {
  fullscreenToggle.disabled = true;
  try {
    if (document.fullscreenElement === viewerSection) {
      await document.exitFullscreen();
    } else if (viewerSection.classList.contains('is-expanded')) {
      setExpandedFallback(false);
    } else if (document.fullscreenEnabled && viewerSection.requestFullscreen) {
      try {
        await viewerSection.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        // Embedded browsers may deny native fullscreen; retain the same controls.
        setExpandedFallback(true);
      }
    } else {
      setExpandedFallback(true);
    }
  } finally {
    fullscreenToggle.disabled = false;
    syncFullscreen();
  }
});
document.addEventListener('fullscreenchange', syncFullscreen);

const instrument = createInstrumentController();
const instrumentAudio = new InstrumentAudio();
let instrumentScene = null;
const exhibitionPanel = new ExhibitionPanel({
  root: document.querySelector('#exhibition-panel'),
  onAction: instrumentAction,
  t,
});
const audioControls = new AudioControls({
  root: document.querySelector('.page-shell'),
  audio: instrumentAudio,
  t,
});
const parameterDrawer = new ExhibitionDrawer({ t });
viewerSection.addEventListener(
  'pointerdown',
  (event) => {
    const panelControl = event.target.closest('.exhibition-dial, .exhibition-recall');
    const modelControl = event.target === renderer.domElement && instrumentScene?.pick(event);
    if (panelControl || modelControl) audioControls.activateSound();
  },
  { capture: true },
);
window.addEventListener('exhibitionviewchange', ({ detail }) => {
  if (detail.isGallery) {
    parameterDrawer?.setOpen(false);
    audioControls.suspendAudio();
    coverDrag?.cancel();
    instrumentInteraction();
  }
});
refreshExhibition();
refreshExhibitionUI = refreshExhibition;
instrument.subscribe((snapshot) => {
  latestInstrumentState = snapshot;
  if (!document.hidden) {
    audioControls.update(snapshot);
    exhibitionPanel.update(snapshot);
    instrumentScene?.update(snapshot);
  }
  scheduleFrame();
});
const audioStatusTimer = setInterval(() => {
  if (!document.hidden) audioControls.pollAudio();
}, 250);

function scheduleFrame() {
  if (document.hidden || frameHandle !== null || inFrame) return;
  frameHandle = requestAnimationFrame(animate);
}

function markViewDirty() {
  renderDirty = true;
  scheduleFrame();
}

function positionGrabHint() {
  if (modelTouched || !loaded || !instrumentScene) {
    grabHint.hidden = true;
    return;
  }
  const anchor = instrumentScene.center.clone().addScaledVector(instrumentScene.normal, 0.02);
  const facingCamera = instrumentScene.normal.dot(camera.position.clone().sub(anchor)) > 0;
  camera.updateMatrixWorld();
  anchor.project(camera);
  const visible =
    facingCamera &&
    Math.abs(anchor.x) < 1 &&
    Math.abs(anchor.y) < 1 &&
    anchor.z > -1 &&
    anchor.z < 1;
  grabHint.hidden = !visible;
  if (visible) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const anchorX = ((anchor.x + 1) * width) / 2;
    const labelWidth = grabHint.offsetWidth;
    const onRight = anchorX + 44 + labelWidth <= width - 8;
    const labelX = onRight ? anchorX + 44 : Math.max(8, anchorX - labelWidth - 44);
    let edgeX = anchorX;
    if (mainKnobSkirt) {
      const bounds = new THREE.Box3().setFromObject(mainKnobSkirt);
      const projectedX = [];
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            projectedX.push(((new THREE.Vector3(x, y, z).project(camera).x + 1) * width) / 2);
          }
        }
      }
      edgeX = onRight ? Math.max(...projectedX) + 2 : Math.min(...projectedX) - 2;
    }
    grabHint.style.left = `${labelX}px`;
    grabHint.style.setProperty('--leader-left', `${onRight ? edgeX - labelX : labelWidth}px`);
    grabHint.style.setProperty(
      '--leader-width',
      `${Math.max(0, onRight ? labelX - edgeX : edgeX - labelX - labelWidth)}px`,
    );
    grabHint.style.top = `${((1 - anchor.y) * height) / 2}px`;
  }
}

function refreshExhibition() {
  scene.background.set(stageColor());
  const dark = document.documentElement.dataset.theme === 'dark';
  floor.material.color.setHex(dark ? 0x000000 : 0x514b42);
  floor.material.opacity = dark ? 0.4 : 0.2;
  modelTheme?.apply(document.documentElement.dataset.theme === 'dark');
  labelCanvas();
  labelFullscreen();
  loadFeedback.translate();
  audioControls.translate();
  exhibitionPanel.translate();
  parameterDrawer?.translate();
  markViewDirty();
}

function markInstrumentDirty(shadows = true) {
  if (shadows) renderer.shadowMap.needsUpdate = true;
  markViewDirty();
}

function scheduleVisualWake(now) {
  const next = document.hidden ? null : (instrumentScene?.nextVisualChange(now) ?? null);
  if (next === visualWakeAt && visualWakeTimer !== null) return;
  clearTimeout(visualWakeTimer);
  visualWakeTimer = null;
  visualWakeAt = next;
  if (next !== null) {
    visualWakeTimer = setTimeout(
      () => {
        visualWakeTimer = null;
        visualWakeAt = null;
        scheduleFrame();
      },
      Math.max(1, Math.ceil(next - performance.now()) + 1),
    );
  }
}

function instrumentInteraction() {
  cameraTransition = false;
}

function instrumentAction(action, value) {
  if (!loaded) return;
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
  instrumentInteraction();
  actions[action]();
  if (action === 'resetFine' || action === 'resetPreset') {
    const role = action === 'resetFine' ? 'fine' : 'preset';
    instrumentScene?.resetEncoder(role);
    exhibitionPanel?.resetRotation(role);
  }
  if (action === 'fineTurn' || action === 'presetTurn') {
    const role = action === 'fineTurn' ? 'fine' : 'preset';
    instrumentScene?.spin(role, value);
    exhibitionPanel?.spin(role, value);
  }
  const state = instrument.snapshot();
  if (action.endsWith('Press')) instrumentScene?.pulse(action.replace('Press', ''));
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
  audioControls.update(state);
  instrumentScene?.update(state);
  markInstrumentDirty();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audioControls.suspendAudio();
    coverDrag?.cancel();
    instrumentScene?.release();
    if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lastFrameTime = null;
    orbitInteracting = false;
    clearTimeout(visualWakeTimer);
    visualWakeTimer = null;
    visualWakeAt = null;
  } else if (latestInstrumentState) {
    exhibitionPanel?.update(latestInstrumentState);
  }
  audioControls.paintAudio();
  markViewDirty();
});
window.addEventListener('pagehide', () => {
  coverDrag?.cancel();
  instrumentAudio.disable();
  instrumentScene?.release();
  instrument.close();
  if (frameHandle !== null) cancelAnimationFrame(frameHandle);
  clearTimeout(visualWakeTimer);
  clearInterval(audioStatusTimer);
  frameHandle = null;
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    modelRoot = gltf.scene;
    modelTheme = new ModelTheme({ model: modelRoot });
    modelTheme.apply(document.documentElement.dataset.theme === 'dark');
    mainKnobSkirt =
      modelRoot.getObjectByName('Main hand knob skirt') ??
      modelRoot.getObjectByName('Main_hand_knob_skirt');
    const retainingTape =
      modelRoot.getObjectByName('Harness retaining tape') ??
      modelRoot.getObjectByName('Harness_retaining_tape');
    if (retainingTape) retainingTape.visible = false;
    modelRoot.traverse((node) => {
      if (node.name === 'RearCover' && !rearCover) rearCover = node;
    });
    meshCount = countMeshes(modelRoot);
    if (!rearCover) {
      console.warn('RearCover node was not found; cover controls are unavailable.');
    } else {
      coverBasePosition = rearCover.position.clone();
      const worldOffset = new THREE.Vector3(0.4, 0, -0.1);
      const localOffset = worldDeltaToParentLocal(rearCover.parent, worldOffset);
      coverDetachedPosition = coverBasePosition.clone().add(localOffset);
    }
    scene.add(modelRoot);
    if (rearCover) {
      coverDrag = new CoverDrag({
        model: modelRoot,
        cover: rearCover,
        camera,
        canvas: renderer.domElement,
        orbit: controls,
        getProgress: coverProgress,
        setProgress: previewCover,
        onCommit: setCover,
        getScreenDirection: coverScreenDirection,
        onInteraction: instrumentInteraction,
        onDirty: markInstrumentDirty,
      });
    }
    instrumentScene = new InstrumentScene({
      model: modelRoot,
      camera,
      canvas: renderer.domElement,
      orbit: controls,
      onAction: instrumentAction,
      onDirty: markInstrumentDirty,
      onInteraction: instrumentInteraction,
    });
    {
      const screen = modelRoot.getObjectByName('Live LCD screen');
      if (screen) {
        const target = screen.getWorldPosition(new THREE.Vector3());
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
        const offset = normal
          .add(new THREE.Vector3(0, 0, 0.25))
          .normalize()
          .multiplyScalar(0.17);
        lookPresets.display = { position: target.clone().add(offset), target, opens: false };
        exhibitionZoom.disabled = false;
      }
    }
    loaded = true;
    markInstrumentDirty();
    // Keep the front presentation centered on the complete enclosure.
    focusView('front');
    loadFeedback.ready();
  },
  undefined,
  (error) => {
    console.error('GLB load failed', error);
    loaded = false;
    loadFeedback.fail('model');
  },
);

viewButtons.forEach((button) =>
  button.addEventListener('click', () => {
    instrumentInteraction();
    focusView(button.dataset.view);
  }),
);
document.querySelector('#reset-view').addEventListener('click', () => {
  setCover(false);
  focusView('front');
});
controls.addEventListener('start', () => {
  cameraTransition = false;
  orbitInteracting = true;
  scheduleFrame();
});
controls.addEventListener('end', () => {
  orbitInteracting = false;
  scheduleFrame();
});
controls.addEventListener('change', markViewDirty);

function updateCover(delta) {
  if (!transition || transition.type !== 'cover' || !rearCover) return;
  transition.elapsed += delta;
  const progress =
    transition.duration === 0 ? 1 : Math.min(1, transition.elapsed / transition.duration);
  const eased =
    progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  rearCover.position.lerpVectors(transition.from, transition.to, eased);
  markInstrumentDirty();
  if (progress >= 1) transition = null;
}

function animate(now) {
  frameHandle = null;
  if (document.hidden) {
    lastFrameTime = null;
    return;
  }
  const started = performance.now();
  performanceCounters.frameCallbacks++;
  const delta = lastFrameTime === null ? 0 : Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  inFrame = true;
  let continuing = false;
  try {
    instrument.tick(delta);
    if (latestInstrumentState) {
      audioControls.update(latestInstrumentState);
      instrumentScene?.update(latestInstrumentState, now);
    }
    animateCamera(delta);
    updateCover(delta);
    const orbitChanged = controls.update();
    if (renderDirty) {
      positionGrabHint();
      const renderStarted = performance.now();
      renderer.render(scene, camera);
      const renderCpuMs = performance.now() - renderStarted;
      performanceCounters.renders++;
      performanceCounters.renderCpuMs += renderCpuMs;
      performanceCounters.lastRenderCpuMs = renderCpuMs;
      renderDirty = false;
    }
    continuing =
      cameraTransition ||
      Boolean(transition) ||
      orbitInteracting ||
      latestInstrumentState?.motorActive ||
      (controls.enableDamping && orbitChanged);
  } finally {
    inFrame = false;
    performanceCounters.frameCpuMs += performance.now() - started;
    scheduleVisualWake(performance.now());
    if (continuing) scheduleFrame();
    else lastFrameTime = null;
  }
}
scheduleFrame();

// Development-only diagnostics support local interaction and audio regression checks.
if (import.meta.env.DEV) {
  window.viewerPerformance = () => ({
    ...performanceCounters,
    framePending: frameHandle !== null,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  });
  window.viewerState = () => ({
    loaded,
    coverOpen,
    coverPosition: rearCover?.position.toArray() ?? null,
    coverDrag: coverDrag?.diagnostics() ?? null,
    meshCount,
    cameraPosition: camera.position.toArray(),
    target: controls.target.toArray(),
    orbitEnabled: controls.enabled,
    fullscreen: isFullscreen(),
    instrument: {
      ...instrument.snapshot(),
      audio: instrumentAudio.snapshot(),
      visual: instrumentScene?.diagnostics() ?? null,
    },
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') coverDrag?.cancel();
  if (event.key === 'Escape') instrumentScene?.release();
  if (viewerSection.classList.contains('is-expanded')) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setExpandedFallback(false);
      return;
    }
    if (event.key === 'Tab') {
      const buttons = [
        ...viewerSection.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
        ),
      ].filter((element) => element.getClientRects().length);
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }
  if (document.fullscreenElement === viewerSection) return;
  if (event.key === 'Escape' && coverOpen) setCover(false);
});
