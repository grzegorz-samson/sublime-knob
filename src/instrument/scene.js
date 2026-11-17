import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const CONTROL_ROLES = ['fine', 'preset', 'save'];

/** Articulation and picking for the existing GLB. No labels are drawn over the stage. */
export class InstrumentScene {
  constructor({ model, camera, canvas, orbit, onAction, onDirty, onInteraction }) {
    Object.assign(this, { model, camera, canvas, orbit, onAction, onDirty, onInteraction });
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.drag = null;
    this.lastSnapshot = null;
    this.encoderTurns = { fine: 0, preset: 0 };
    this.pressed = { fine: 0, preset: 0, save: 0 };
    this.poseDirty = true;
    this.nextPoseChange = Infinity;
    this.posePosition = new THREE.Vector3();
    this.poseQuaternion = new THREE.Quaternion();
    this.turnQuaternion = new THREE.Quaternion();
    this.poseAxis = new THREE.Vector3(0, 1, 0);
    this.listeners = [];
    const find = (name) => {
      const object =
        model.getObjectByName(name) ?? model.getObjectByName(name.replaceAll(' ', '_'));
      if (!object) throw new Error(`Brak części modelu: ${name}`);
      return object;
    };
    const knob = find('Main hand knob');
    const hub = find('Pointer hub');
    const pointer = find('Long black pointer');
    model.updateMatrixWorld(true);
    this.normal = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(knob.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    this.up = new THREE.Vector3(0, 1, 0).projectOnPlane(this.normal).normalize();
    this.right = this.up.clone().cross(this.normal).normalize();
    this.center = hub.getWorldPosition(new THREE.Vector3());
    this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.center);
    this.main = new THREE.Group();
    this.main.name = 'Interactive main shaft';
    hub.parent.add(this.main);
    this.main.position.copy(this.main.parent.worldToLocal(this.center.clone()));
    this.main.updateMatrixWorld(true);
    // Determine the photographed pointer's initial angle from its actual longest vertex.
    let longest = new THREE.Vector3(),
      length = 0;
    const positions = pointer.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const v = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(pointer.matrixWorld)
        .sub(this.center);
      if (v.lengthSq() > length) {
        longest = v;
        length = v.lengthSq();
      }
    }
    this.initialAngle = deg(Math.atan2(longest.dot(this.right), longest.dot(this.up)));
    this.localNormal = this.normal
      .clone()
      .applyQuaternion(this.main.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
    for (const part of [knob, hub, pointer]) this.main.attach(part);
    this.main.userData.instrumentRole = 'main';
    this.parts = {
      main: this.main,
      fine: find('Encoder A'),
      preset: find('Encoder B'),
      save: find('Save button dome'),
    };
    this.bases = {};
    for (const [role, part] of Object.entries(this.parts)) {
      part.userData.instrumentRole = role;
      this.bases[role] = { position: part.position.clone(), quaternion: part.quaternion.clone() };
      if (role !== 'main') {
        this.bases[role].normal =
          role === 'save'
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 1, 0).applyQuaternion(part.quaternion);
      }
    }
    // A slightly larger invisible pick surface makes the small knobs usable on touch screens.
    for (const [role, part] of Object.entries(this.parts)) {
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(role === 'main' ? 0.022 : 0.014, 16, 12),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.name = `${role} interaction surface`;
      if (role === 'main') {
        knob.add(proxy);
        proxy.position.y = 0.009;
      } else {
        part.add(proxy);
        proxy.position.y = role === 'save' ? 0 : 0.009;
      }
    }
    this.makeLCD(find('LCD display'), find('LCD first line'), find('LCD second line'));
    this.listen('pointerdown', (e) => this.pointerDown(e), { capture: true });
    this.listen('pointermove', (e) => this.pointerMove(e), { capture: true });
    this.listen('pointerup', (e) => this.pointerUp(e), { capture: true });
    this.listen('pointercancel', (e) => this.cancel(e), { capture: true });
    this.listen('lostpointercapture', (e) => this.cancel(e), { capture: true });
    this.listen('pointerleave', () => {
      if (!this.drag) canvas.style.cursor = '';
    });
    this.listen('wheel', (e) => this.wheel(e), { capture: true, passive: false });
  }

  listen(type, fn, options) {
    this.canvas.addEventListener(type, fn, options);
    this.listeners.push([type, fn, options]);
  }

  setRay(event) {
    const b = this.canvas.getBoundingClientRect();
    this.mouse.set(
      ((event.clientX - b.left) / b.width) * 2 - 1,
      (-(event.clientY - b.top) / b.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.model.updateMatrixWorld(true);
    this.ray.setFromCamera(this.mouse, this.camera);
  }

  pick(event) {
    this.setRay(event);
    // The nearest surface occludes controls behind the cabinet or the detached cover.
    for (const hit of this.ray.intersectObject(this.model, true)) {
      let visible = true;
      for (let node = hit.object; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      for (let node = hit.object; node; node = node.parent) {
        if (node.userData.instrumentRole) return node.userData.instrumentRole;
      }
      return null;
    }
    return null;
  }

  pointerAngle(event, minimumRadius = 0.006) {
    this.setRay(event);
    const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!point) return null;
    point.sub(this.center);
    if (point.length() < minimumRadius) return null;
    return deg(Math.atan2(point.dot(this.right), point.dot(this.up)));
  }

  block(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary || this.drag) return;
    const role = this.pick(event);
    if (!role) return;
    this.block(event);
    this.onInteraction();
    const initialAngle = this.pointerAngle(event, 0.028);
    this.drag = {
      id: event.pointerId,
      role,
      x: event.clientX,
      y: event.clientY,
      lastY: event.clientY,
      lastAngle: initialAngle,
      angular: initialAngle !== null,
      moved: false,
      accumulator: 0,
      time: event.timeStamp,
      ctrl: event.ctrlKey,
      orbitEnabled: this.orbit.enabled,
    };
    this.orbit.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    if (role !== 'main') this.pressed[role] = Infinity;
    this.poseDirty = true;
    this.canvas.style.cursor = role === 'save' ? 'pointer' : 'grabbing';
    this.onDirty();
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) {
      if (!drag) this.canvas.style.cursor = this.pick(event) ? 'grab' : '';
      return;
    }
    this.block(event);
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true;
    if (drag.role === 'main') {
      const angle = this.pointerAngle(event);
      let delta;
      if (drag.angular && angle !== null && drag.lastAngle !== null) {
        delta = ((angle - drag.lastAngle + 540) % 360) - 180;
      } else {
        delta = (drag.lastY - event.clientY) * 0.7;
      }
      const current = this.lastSnapshot?.angleDeg ?? 0;
      this.onAction('position', ((clamp(current + delta, -135, 135) + 135) / 270) * 1023);
      drag.lastAngle = angle;
    } else if (drag.role !== 'save' && drag.moved) {
      drag.accumulator += (drag.lastY - event.clientY) / 9;
      const steps = Math.trunc(drag.accumulator);
      if (steps) {
        this.turn(drag.role, steps);
        drag.accumulator -= steps;
      }
    }
    drag.lastY = event.clientY;
  }

  pointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.block(event);
    if (drag.ctrl && !drag.moved && drag.role !== 'save') {
      if (drag.role === 'main') this.onAction('position', 0);
      else if (drag.role === 'fine') this.onAction('resetFine');
      else if (drag.role === 'preset') this.onAction('resetPreset');
    } else if (!drag.moved && drag.role !== 'main') {
      const long = event.timeStamp - drag.time >= 1000;
      this.onAction(drag.role === 'preset' && long ? 'resetFine' : `${drag.role}Press`);
    }
    this.release();
  }

  cancel(event) {
    if (this.drag && event.pointerId === this.drag.id) this.release();
  }

  release() {
    if (!this.drag) return;
    const { id, role, orbitEnabled } = this.drag;
    this.drag = null;
    this.orbit.enabled = orbitEnabled;
    if (role !== 'main') this.pressed[role] = performance.now() + 100;
    this.poseDirty = true;
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.canvas.style.cursor = '';
    this.onDirty();
  }

  turn(role, steps) {
    this.onAction(role === 'fine' ? 'fineTurn' : 'presetTurn', steps);
    this.onDirty();
  }

  spin(role, steps) {
    this.encoderTurns[role] += (steps * Math.PI) / 12;
    this.poseDirty = true;
    this.onDirty();
  }

  resetEncoder(role) {
    if (role in this.encoderTurns) {
      this.encoderTurns[role] = 0;
      this.poseDirty = true;
      this.onDirty();
    }
  }

  pulse(role) {
    this.pressed[role] = performance.now() + 140;
    this.poseDirty = true;
    this.onDirty();
  }

  nextVisualChange(now = performance.now()) {
    let next = Infinity;
    for (const role of CONTROL_ROLES) {
      const end = this.pressed[role];
      if (Number.isFinite(end) && end > now) next = Math.min(next, end);
    }
    return Number.isFinite(next) ? next : null;
  }

  wheel(event) {
    const role = this.pick(event);
    if (!role || role === 'save' || event.deltaY === 0) return;
    this.block(event);
    this.onInteraction();
    const direction = event.deltaY < 0 ? 1 : -1;
    if (role === 'main')
      this.onAction('position', (this.lastSnapshot?.position ?? 0) + direction * 8);
    else this.turn(role, direction);
  }

  makeLCD(parent, line1, line2) {
    line1.visible = false;
    line2.visible = false;
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 512;
    this.lcdCanvas.height = 144;
    this.lcdContext = this.lcdCanvas.getContext('2d');
    this.lcdTexture = new THREE.CanvasTexture(this.lcdCanvas);
    this.lcdTexture.colorSpace = THREE.SRGBColorSpace;
    this.lcdTexture.minFilter = THREE.LinearFilter;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.084, 0.023),
      new THREE.MeshBasicMaterial({ map: this.lcdTexture, toneMapped: false }),
    );
    screen.name = 'Live LCD screen';
    screen.position.y = 0.0015;
    screen.rotation.x = -Math.PI / 2;
    parent.add(screen);
  }

  update(snapshot, now = performance.now()) {
    const changed = !this.lastSnapshot || this.lastSnapshot.revision !== snapshot.revision;
    if (!changed && !this.poseDirty && now < this.nextPoseChange) return;
    const angleChanged = !this.lastSnapshot || this.lastSnapshot.angleDeg !== snapshot.angleDeg;
    let lcdChanged = false;
    if (angleChanged) {
      this.main.quaternion.setFromAxisAngle(
        this.localNormal,
        -rad(snapshot.angleDeg - this.initialAngle),
      );
    }
    if (changed) {
      const firstLine = `${String(Math.round(snapshot.frequencyHz)).padStart(5, '0')}Hz SET:${String(snapshot.presetIndex).padStart(2, '0')}`;
      const secondLine = `${snapshot.note} ${snapshot.tuningMode === 'hz' ? 'Hz' : '25c'} ${snapshot.fine >= 0 ? '+' : ''}${snapshot.fine}`;
      if (firstLine !== this.lcdFirstLine || secondLine !== this.lcdSecondLine) {
        const c = this.lcdContext;
        c.fillStyle = '#1029a6';
        c.fillRect(0, 0, 512, 144);
        c.fillStyle = '#bcdfff';
        c.font = '32px monospace';
        c.textBaseline = 'top';
        c.fillText(firstLine, 12, 20);
        c.fillText(secondLine, 12, 82);
        this.lcdTexture.needsUpdate = true;
        this.lcdFirstLine = firstLine;
        this.lcdSecondLine = secondLine;
        lcdChanged = true;
      }
    }
    let animated = false;
    for (const role of CONTROL_ROLES) {
      const part = this.parts[role],
        base = this.bases[role];
      const pushed = now < this.pressed[role] ? 0.002 : 0;
      const desired = this.posePosition.copy(base.position).addScaledVector(base.normal, -pushed);
      if (part.position.distanceToSquared(desired) > 1e-12) {
        part.position.copy(desired);
        animated = true;
      }
      if (role !== 'save') {
        const q = this.poseQuaternion
          .copy(base.quaternion)
          .multiply(this.turnQuaternion.setFromAxisAngle(this.poseAxis, -this.encoderTurns[role]));
        // GLB quaternions are float-quantized: dot(q,q) can be below 1 even
        // when the pose is identical. Compare deterministic components instead.
        if (!part.quaternion.equals(q)) {
          part.quaternion.copy(q);
          animated = true;
        }
      }
    }
    this.lastSnapshot = snapshot;
    this.poseDirty = false;
    this.nextPoseChange = this.nextVisualChange(now) ?? Infinity;
    if (angleChanged || lcdChanged || animated) this.onDirty(angleChanged || animated);
  }

  /** Read-only screen coordinates for browser checks and accessible navigation diagnostics. */
  diagnostics() {
    const b = this.canvas.getBoundingClientRect();
    const project = (p) => {
      const v = p.clone().project(this.camera);
      return { x: b.left + ((v.x + 1) * b.width) / 2, y: b.top + ((1 - v.y) * b.height) / 2 };
    };
    this.model.updateMatrixWorld(true);
    return {
      angleDeg: this.lastSnapshot?.angleDeg,
      initialAngleDeg: this.initialAngle,
      activeControl: this.drag?.role ?? null,
      pointerRotation: this.main.quaternion.toArray(),
      controls: Object.fromEntries(
        Object.entries(this.parts).map(([role, part]) => {
          const center =
            role === 'main'
              ? this.center.clone().addScaledVector(this.normal, 0.02)
              : part.localToWorld(new THREE.Vector3(0, role === 'save' ? 0.003 : 0.016, 0));
          return [role, project(center)];
        }),
      ),
      arc: Object.fromEntries(
        [-180, -160, -135, -90, -45, 0, 45, 90, 135, 160, 180].map((angle) => [
          angle,
          project(
            this.center
              .clone()
              .addScaledVector(this.up, 0.075 * Math.cos(rad(angle)))
              .addScaledVector(this.right, 0.075 * Math.sin(rad(angle))),
          ),
        ]),
      ),
    };
  }
}
