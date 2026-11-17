import * as THREE from 'three';

const clamp = (value) => Math.max(0, Math.min(1, value));

export class CoverDrag {
  constructor({
    model,
    cover,
    camera,
    canvas,
    orbit,
    getProgress,
    setProgress,
    onCommit,
    getScreenDirection,
    onInteraction = () => {},
    onDirty = () => {},
  }) {
    Object.assign(this, {
      model,
      cover,
      camera,
      canvas,
      orbit,
      getProgress,
      setProgress,
      onCommit,
      getScreenDirection,
      onInteraction,
      onDirty,
    });
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.drag = null;
    this.listeners = [];
    this.listen('pointerdown', (event) => this.pointerDown(event));
    this.listen('pointermove', (event) => this.pointerMove(event));
    this.listen('pointerup', (event) => this.pointerUp(event));
    this.listen('pointercancel', (event) => this.cancel(event));
    this.listen('lostpointercapture', (event) => this.cancel(event));
    this.pageHide = () => this.cancel();
    window.addEventListener('pagehide', this.pageHide);
  }

  listen(type, handler) {
    this.canvas.addEventListener(type, handler, { capture: true });
    this.listeners.push([type, handler]);
  }

  hitsCover(x, y) {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    this.pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      (-(y - bounds.top) / bounds.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.model.updateMatrixWorld(true);
    this.ray.setFromCamera(this.pointer, this.camera);
    for (const hit of this.ray.intersectObject(this.model, true)) {
      let visible = true;
      let isCover = false;
      for (let node = hit.object; node; node = node.parent) {
        if (!node.visible) visible = false;
        if (node === this.cover) isCover = true;
      }
      if (visible) return isCover;
    }
    return false;
  }

  block(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  pointerDown(event) {
    if (
      this.drag ||
      !event.isPrimary ||
      event.button !== 0 ||
      !this.hitsCover(event.clientX, event.clientY)
    )
      return;
    this.block(event);
    this.onInteraction();
    const projected = this.getScreenDirection();
    const direction = new THREE.Vector2(projected.x, projected.y);
    if (direction.length() < 1) direction.set(120, 0);
    else if (direction.length() < 80) direction.setLength(80);
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      progress: clamp(this.getProgress()),
      direction,
      orbitEnabled: this.orbit.enabled,
      moved: false,
    };
    this.orbit.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag) {
      if (event.buttons === 0 && this.hitsCover(event.clientX, event.clientY)) {
        this.canvas.style.cursor = 'grab';
        event.stopImmediatePropagation();
      }
      return;
    }
    if (event.pointerId !== drag.id) return;
    this.block(event);
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    const distance = (dx * drag.direction.x + dy * drag.direction.y) / drag.direction.lengthSq();
    this.setProgress(clamp(drag.progress + distance));
    this.onDirty();
  }

  pointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.block(event);
    const open = this.getProgress() >= 0.5;
    this.release();
    if (drag.moved) this.onCommit(open);
  }

  release() {
    if (!this.drag) return;
    const { id, orbitEnabled } = this.drag;
    this.drag = null;
    this.orbit.enabled = orbitEnabled;
    this.canvas.style.cursor = '';
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.onDirty();
  }

  cancel(event) {
    if (!this.drag || (event && event.pointerId !== this.drag.id)) return;
    const progress = this.drag.progress;
    this.release();
    this.setProgress(progress);
    this.onDirty();
  }

  diagnostics() {
    const bounds = this.canvas.getBoundingClientRect();
    const box = new THREE.Box3().setFromObject(this.cover);
    const projected = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(this.camera);
          projected.push({
            x: bounds.left + ((point.x + 1) / 2) * bounds.width,
            y: bounds.top + ((1 - point.y) / 2) * bounds.height,
          });
        }
      }
    }
    const left = Math.max(bounds.left, Math.min(...projected.map((point) => point.x)));
    const right = Math.min(bounds.right, Math.max(...projected.map((point) => point.x)));
    const top = Math.max(bounds.top, Math.min(...projected.map((point) => point.y)));
    const bottom = Math.min(bounds.bottom, Math.max(...projected.map((point) => point.y)));
    const coverPoints = [];
    for (let row = 1; row < 8; row++) {
      for (let column = 1; column < 8; column++) {
        const x = left + ((right - left) * column) / 8;
        const y = top + ((bottom - top) * row) / 8;
        if (this.hitsCover(x, y)) coverPoints.push({ x, y });
      }
    }
    return {
      active: Boolean(this.drag),
      progress: this.getProgress(),
      coverPoints,
      direction: this.getScreenDirection(),
    };
  }

  dispose() {
    this.cancel();
    for (const [type, handler] of this.listeners) {
      this.canvas.removeEventListener(type, handler, { capture: true });
    }
    window.removeEventListener('pagehide', this.pageHide);
  }
}
