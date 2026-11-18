import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { InstrumentScene } from '../instrument/scene.js';
import { CoverDrag } from './cover-drag.js';
import { ModelTheme } from './model-theme.js';

const RESET_VIEW_DURATION = 0.95;

function disposeGraph(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
    node.shadow?.dispose();
  });
  for (const resource of [...textures, ...materials, ...geometries]) resource.dispose();
}

function releaseResources(cleanups) {
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      cleanup();
    } catch {}
  }
}

export function createExhibitionViewer(options) {
  const cleanups = [];
  try {
    return buildViewer(options, cleanups);
  } catch (error) {
    releaseResources(cleanups);
    throw error;
  }
}

function buildViewer(
  {
    stage,
    grabHint,
    t,
    modelUrl,
    initialSnapshot,
    initialTurns = {},
    onAction,
    onGesture = () => {},
    onReady = () => {},
    onError = () => {},
    visible = true,
  },
  cleanups,
) {
  let disposed = false;
  let active = visible;
  let readyPending = false;
  let modelTouched = false;
  let instrumentScene = null;
  const pendingTurns = { fine: initialTurns.fine ?? 0, preset: initialTurns.preset ?? 0 };
  const events = new AbortController();
  cleanups.push(() => events.abort());
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orbitMinDistance = 0.055;
  stage.addEventListener(
    'pointerdown',
    () => {
      modelTouched = true;
      grabHint.hidden = true;
    },
    { capture: true, once: true, signal: events.signal },
  );
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
  cleanups.push(() => {
    renderer.dispose();
    renderer.domElement.remove();
  });
  cleanups.push(() => disposeGraph(scene));
  renderer.domElement.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      fail('context', new Error('WebGL context lost'));
    },
    { signal: events.signal },
  );
  renderer.domElement.addEventListener(
    'pointerdown',
    (event) => {
      if (instrumentScene?.pick(event)) onGesture();
    },
    { capture: true, signal: events.signal },
  );
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.debug.onShaderError = () => {
    throw new Error('Could not compile the 3D material');
  };
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
  cleanups.push(() => controls.dispose());
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
  cleanups.push(() => scene.environment.dispose());
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
  let resetElapsed = null;
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
  let latestInstrumentState = initialSnapshot;
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

  function focusView(name, smoothReset = false) {
    const preset = lookPresets[name];
    if (!preset) return;
    controls.minDistance = orbitMinDistance * viewportDistanceScale;
    if (preset.opens !== coverOpen) setCover(preset.opens);
    cameraGoal.position.copy(preset.position);
    cameraGoal.target.copy(preset.target);
    cameraGoal.position
      .sub(cameraGoal.target)
      .multiplyScalar(viewportDistanceScale)
      .add(cameraGoal.target);
    cameraTransition = true;
    resetElapsed = smoothReset ? 0 : null;
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
    let amount = 1 - Math.exp(-delta * 4.2);
    if (resetElapsed !== null) {
      const previous = THREE.MathUtils.smoothstep(resetElapsed, 0, RESET_VIEW_DURATION);
      resetElapsed += delta;
      const eased = THREE.MathUtils.smoothstep(resetElapsed, 0, RESET_VIEW_DURATION);
      amount = (eased - previous) / (1 - previous);
      renderDirty = true;
    }
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
      resetElapsed !== null
        ? resetElapsed >= RESET_VIEW_DURATION
        : camera.position.distanceToSquared(cameraGoal.position) < 0.000025 &&
          controls.target.distanceToSquared(cameraGoal.target) < 0.000025
    ) {
      camera.position.copy(cameraGoal.position);
      controls.target.copy(cameraGoal.target);
      cameraTransition = false;
      resetElapsed = null;
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
  const observer = new ResizeObserver(() => safely(resize));
  observer.observe(stage);
  cleanups.push(() => observer.disconnect());
  resize();

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

  function markInstrumentDirty(shadows = true) {
    if (shadows) renderer.shadowMap.needsUpdate = true;
    markViewDirty();
  }

  function scheduleVisualWake(now) {
    const next =
      disposed || !active || document.hidden
        ? null
        : (instrumentScene?.nextVisualChange(now) ?? null);
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

  new GLTFLoader().load(
    modelUrl,
    (gltf) => {
      if (disposed) {
        disposeGraph(gltf.scene);
        return;
      }
      try {
        modelRoot = gltf.scene;
        scene.add(modelRoot);
        modelTheme = new ModelTheme({ model: modelRoot });
        cleanups.push(() => {
          modelTheme.faceGrain.dispose();
          for (const material of modelTheme.originals.keys()) material.dispose();
          for (const candidate of [modelTheme.pointerDarkMaterial, modelTheme.bottomDarkMaterial]) {
            for (const material of Array.isArray(candidate) ? candidate : [candidate])
              material?.dispose();
          }
        });
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
        if (coverDrag) cleanups.push(() => coverDrag.dispose());
        instrumentScene = new InstrumentScene({
          model: modelRoot,
          camera,
          canvas: renderer.domElement,
          orbit: controls,
          onAction,
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
          }
        }
        cleanups.push(() => {
          for (const [type, listener, options] of instrumentScene.listeners) {
            renderer.domElement.removeEventListener(type, listener, options);
          }
        });
        cleanups.push(() => instrumentScene.release());
        for (const role of ['fine', 'preset']) instrumentScene.spin(role, pendingTurns[role]);
        if (latestInstrumentState) instrumentScene.update(latestInstrumentState);
        loaded = true;
        markInstrumentDirty();
        focusView('front');
        readyPending = true;
        if (!active || document.hidden) {
          readyPending = false;
          onReady({ inside: Boolean(rearCover), display: Boolean(lookPresets.display) });
        }
      } catch (error) {
        fail('model', error);
      }
    },
    undefined,
    (error) => {
      fail('model', error);
    },
  );

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
    if (disposed || !active || document.hidden) {
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
      if (latestInstrumentState) {
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
        if (readyPending) {
          readyPending = false;
          onReady({ inside: Boolean(rearCover), display: Boolean(lookPresets.display) });
        }
      }
      continuing =
        cameraTransition ||
        Boolean(transition) ||
        orbitInteracting ||
        (controls.enableDamping && orbitChanged);
    } catch (error) {
      fail('graphics', error);
    } finally {
      inFrame = false;
      performanceCounters.frameCpuMs += performance.now() - started;
      if (!disposed) scheduleVisualWake(performance.now());
      if (!disposed && continuing) scheduleFrame();
      else lastFrameTime = null;
    }
  }
  scheduleFrame();

  function stopFrames() {
    if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lastFrameTime = null;
    clearTimeout(visualWakeTimer);
    visualWakeTimer = null;
    visualWakeAt = null;
  }
  function cancelInteractions() {
    coverDrag?.cancel();
    instrumentScene?.release();
    orbitInteracting = false;
    cameraTransition = false;
  }

  function resetView() {
    // Clear the orbit's pending motion while retaining the current camera pose.
    const position = camera.position.clone();
    const target = controls.target.clone();
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(position);
    controls.target.copy(target);
    controls.enableDamping = damping;
    controls.update();

    setCover(false);
    focusView('front', true);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    loaded = false;
    readyPending = false;
    stopFrames();
    releaseResources(cleanups);
    grabHint.hidden = true;
  }
  function fail(reason, error) {
    if (disposed) return;
    dispose();
    onError(reason, error);
  }
  function safely(callback) {
    if (disposed) return;
    try {
      return callback();
    } catch (error) {
      fail('graphics', error);
    }
  }
  function scheduleFrame() {
    if (disposed || !active || document.hidden || frameHandle !== null || inFrame) return;
    frameHandle = requestAnimationFrame(animate);
  }
  function translate() {
    scene.background.set(stageColor());
    const dark = document.documentElement.dataset.theme === 'dark';
    floor.material.color.setHex(dark ? 0x000000 : 0x514b42);
    floor.material.opacity = dark ? 0.4 : 0.2;
    modelTheme?.apply(dark);
    labelCanvas();
    markViewDirty();
  }
  function markViewDirty() {
    renderDirty = true;
    scheduleFrame();
  }
  return {
    update(snapshot) {
      latestInstrumentState = snapshot;
      if (loaded) safely(scheduleFrame);
    },
    translate() {
      safely(translate);
    },
    interaction() {
      if (!disposed) instrumentInteraction();
    },
    spin(role, steps) {
      if (disposed || !(role in pendingTurns)) return;
      pendingTurns[role] += steps;
      safely(() => {
        instrumentScene?.spin(role, steps);
        markInstrumentDirty();
      });
    },
    resetEncoder(role) {
      if (disposed || !(role in pendingTurns)) return;
      pendingTurns[role] = 0;
      safely(() => {
        instrumentScene?.resetEncoder(role);
        markInstrumentDirty();
      });
    },
    pulse(role) {
      safely(() => {
        instrumentScene?.pulse(role);
        markInstrumentDirty();
      });
    },
    focusView(name) {
      if (loaded) safely(() => focusView(name));
    },
    resetView() {
      if (loaded) safely(resetView);
    },
    closeCover() {
      if (loaded && coverOpen) safely(() => setCover(false));
    },
    cancelInteractions() {
      safely(cancelInteractions);
    },
    setVisible(visible) {
      if (disposed) return;
      active = visible;
      if (visible)
        safely(() => {
          resize();
          markViewDirty();
        });
      else {
        stopFrames();
        safely(cancelInteractions);
      }
    },
    resize() {
      safely(resize);
    },
    dispose,
    diagnostics() {
      return {
        loaded,
        coverOpen,
        coverPosition: rearCover?.position.toArray() ?? null,
        coverDrag: coverDrag?.diagnostics() ?? null,
        meshCount,
        cameraPosition: camera.position.toArray(),
        target: controls.target.toArray(),
        orbitEnabled: controls.enabled,
        visual: instrumentScene?.diagnostics() ?? null,
      };
    },
    performance() {
      return {
        ...performanceCounters,
        framePending: frameHandle !== null,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
    },
  };
}
