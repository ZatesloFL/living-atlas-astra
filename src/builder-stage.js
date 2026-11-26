import * as THREE from '../vendor/three/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const FLOOR = new THREE.Plane(UP, 0);
const clamp = THREE.MathUtils.clamp;
const NAV_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
const BLUEPRINT_LABEL = 'Build canvas. Drag to move the camera. Tap to select or place a piece. Use arrow keys to pan.';

/** Owns an isolated draft or visitor-preview World and its independent camera. */
export class BuilderStage {
  constructor({canvas, onSelect, canPlace = () => false, onPlace}) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.canPlace = canPlace;
    this.onPlace = onPlace;
    this.canvasLabel = canvas.getAttribute('aria-label');
    this.camera = new THREE.PerspectiveCamera(55, 1, .08, 135);
    this.ray = new THREE.Raycaster();
    this.target = new THREE.Vector3();
    this.flyPosition = new THREE.Vector3();
    this.flyAngles = new THREE.Euler(0, 0, 0, 'YXZ');
    this.keys = new Set();
    this.pointers = new Map();
    this.events = new AbortController();
    const options = {signal: this.events.signal};
    canvas.addEventListener('pointerdown', event => this.pointerDown(event), options);
    canvas.addEventListener('pointermove', event => this.pointerMove(event), options);
    canvas.addEventListener('pointerup', event => this.pointerUp(event), options);
    for (const type of ['pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, event => this.pointers.delete(event.pointerId), options);
    }
    canvas.addEventListener('wheel', event => {
      if (!this.active) return;
      event.preventDefault();
      this.zoom(clamp(event.deltaY * (event.deltaMode ? .035 : .0016), -.35, .35));
    }, {...options, passive: false});
    window.addEventListener('keydown', event => {
      if (!this.active || !NAV_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey ||
        event.target?.closest?.('input, select, textarea, button, [contenteditable], dialog')) return;
      event.preventDefault();
      this.keys.add(event.code);
    }, options);
    window.addEventListener('keyup', event => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.resetInput(), options);
    document.addEventListener('visibilitychange', () => this.resetInput(), options);
  }

  get active() { return !!this.world; }

  show({world, roomKey, layout, pieces = [], selectedId = null, camera = 'orbit', preview = false, focus = [], audience}) {
    const newRoom = !this.active || roomKey !== this.roomKey;
    const newWorld = world !== this.world;
    const newMode = !!preview !== this.preview;
    const newAudience = audience !== this.audience;
    if (newWorld) this.releaseWorld();
    this.world = world;
    this.roomKey = roomKey;
    this.layout = layout;
    this.preview = !!preview;
    this.audience = audience;
    this.pieces = pieces;
    this.byBlock = new Map(pieces.filter(piece => piece.block?.id).map(piece => [piece.block.id, piece.id]));

    if (newRoom || newMode || newAudience) {
      this.target.set(layout.slot[0], .7, layout.slot[1]);
      this.yaw = .35;
      this.elevation = .77;
      this.distance = clamp(Math.max(layout.width ?? 10, layout.depth ?? 10) * (layout.scale ?? 1) * 1.3, 10, 38);
      if (focus.length) {
        const centers = focus.map(piece => this.pieceCenter(piece));
        this.target.set(0,0,0);
        for (const center of centers) this.target.add(center);
        this.target.divideScalar(centers.length);
        this.target.y += .8;
        this.distance = clamp(8 + Math.max(...centers.map(center => center.distanceTo(this.target))) * 2.8, 10, 38);
      }
      this.mode = 'orbit';
      this.updateCamera();
    }
    this.setCamera(camera);
    if (newWorld || newMode) {
      this.removeBlueprint();
      if (!this.preview) this.blueprint();
      this.shadowDirty = true;
    }
    this.canvas.setAttribute('aria-label', this.preview ? 'Visitor preview canvas. Drag to inspect.' : BLUEPRINT_LABEL);
    this.setSelection(this.preview ? null : selectedId);
  }

  blueprint() {
    const scene = this.world.scene;
    const original = {background: scene.background, fog: scene.fog};
    const concealed = [];
    // The campus's procedural night sky is a mesh over the scene background.
    scene.traverse(node => {
      if (!node.visible || node.geometry?.type !== 'SphereGeometry' || !node.material?.isShaderMaterial ||
        node.material.side !== THREE.BackSide || node.material.depthWrite) return;
      concealed.push(node);
      node.visible = false;
    });
    scene.background = new THREE.Color('#13324c');
    scene.fog = new THREE.Fog('#13324c', 15, 45);

    const grid = new THREE.GridHelper(24, 48, '#aad8ff', '#5b9bce');
    grid.name = 'Build blueprint grid';
    grid.rotation.y = this.layout.facing ?? 0;
    grid.position.set(this.layout.slot[0], .065, this.layout.slot[1]);
    grid.scale.setScalar(this.layout.scale ?? 1);
    grid.material.transparent = true;
    grid.material.opacity = .47;
    grid.material.depthWrite = false;
    const workLight = new THREE.HemisphereLight('#d6eeff', '#3f6481', 1.45);
    scene.add(grid, workLight);
    this.removeBlueprint = () => {
      scene.remove(grid, workLight);
      grid.geometry.dispose();
      grid.material.dispose();
      scene.background = original.background;
      scene.fog = original.fog;
      concealed.forEach(node => { node.visible = true; });
      this.removeBlueprint = () => {};
    };
  }

  removeBlueprint() {}

  setCamera(mode) {
    if (mode === 'top') mode = 'top-down';
    if (!['orbit','fly','top-down'].includes(mode) || this.mode === mode) return;
    if (mode === 'fly') {
      this.updateCamera();
      this.flyPosition.copy(this.camera.position);
      this.flyAngles.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.flyAngles.x = clamp(this.flyAngles.x, -1.38, 1.38);
      this.flyAngles.z = 0;
    }
    this.mode = mode;
    this.updateCamera();
  }

  updateCamera() {
    const {clientWidth: width, clientHeight: height} = this.canvas;
    const aspect = Math.max(.1, width / Math.max(1, height));
    if (aspect !== this.camera.aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    if (this.mode === 'fly') {
      this.camera.position.copy(this.flyPosition);
      this.camera.rotation.copy(this.flyAngles);
      this.camera.updateMatrixWorld();
      return;
    }
    const distance = this.distance * (aspect < 1 ? 1 + (1 - aspect) * .65 : 1);
    if (this.mode === 'top-down') {
      this.camera.position.copy(this.target).add(new THREE.Vector3(0, distance, .01));
    } else {
      const horizontal = distance * Math.cos(this.elevation);
      this.camera.position.set(this.target.x + Math.sin(this.yaw) * horizontal,
        this.target.y + distance * Math.sin(this.elevation), this.target.z + Math.cos(this.yaw) * horizontal);
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  pan(x, z) {
    const yaw = this.mode === 'top-down' ? 0 : this.yaw;
    this.target.x += Math.cos(yaw) * x + Math.sin(yaw) * z;
    this.target.z += -Math.sin(yaw) * x + Math.cos(yaw) * z;
  }

  zoom(change) {
    if (this.mode === 'fly') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      this.flyPosition.addScaledVector(direction, -6 * change);
      this.flyPosition.y = clamp(this.flyPosition.y, 1, 52);
    } else this.distance = clamp(this.distance * Math.exp(change), 3, 55);
  }

  pointerDown(event) {
    if (!this.active || event.button > 0 && event.pointerType === 'mouse') return;
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY, moved: 0});
    if (this.pointers.size > 1) for (const pointer of this.pointers.values()) pointer.moved = 12;
  }

  pointerMove(event) {
    const point = this.pointers.get(event.pointerId);
    if (!point) return;
    const dx = event.clientX - point.x, dy = event.clientY - point.y;
    point.moved += Math.hypot(dx, dy);
    const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(point.x - other.x, point.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (before > 5 && after > 5) this.zoom(clamp(Math.log(before / after), -.2, .2));
    } else if (this.mode === 'fly') {
      this.flyAngles.y -= dx * .005;
      this.flyAngles.x = clamp(this.flyAngles.x - dy * .005, -1.38, 1.38);
    } else if (this.mode === 'top-down' || event.shiftKey) {
      const step = this.distance / Math.max(240, this.canvas.clientHeight);
      this.pan(-dx * step, -dy * step);
    } else {
      this.yaw -= dx * .007;
      this.elevation = clamp(this.elevation + dy * .007, .18, 1.47);
    }
    point.x = event.clientX;
    point.y = event.clientY;
  }

  pointerUp(event) {
    const point = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (!point || point.moved > 10 || this.preview) return;
    const at = {x: event.clientX, y: event.clientY};
    if (this.canPlace()) {
      const local = this.pickPosition(at);
      if (local) this.onPlace?.(local);
    } else {
      const id = this.pickPiece(at);
      if (!id) return;
      this.focusPiece(id);
      this.onSelect?.(id);
    }
  }

  resetInput() {
    for (const id of this.pointers.keys()) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.pointers.clear();
    this.keys.clear();
  }

  focusPiece(id) {
    const piece = this.pieces.find(candidate => candidate.id === id);
    if (!piece || this.mode === 'fly') return;
    this.target.copy(this.pieceCenter(piece));
    this.target.y += .7;
  }

  setRay({x, y}) {
    if (!this.active) return false;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;
    this.updateCamera();
    this.ray.setFromCamera(new THREE.Vector2((x - bounds.left) / bounds.width * 2 - 1,
      1 - (y - bounds.top) / bounds.height * 2), this.camera);
    return true;
  }

  pickPosition(at) {
    if (this.preview || !this.setRay(at)) return null;
    const point = this.ray.ray.intersectPlane(FLOOR, new THREE.Vector3());
    if (!point) return null;
    point.sub(new THREE.Vector3(this.layout.slot[0], 0, this.layout.slot[1]));
    point.applyAxisAngle(UP, -(this.layout.facing ?? 0)).divideScalar(this.layout.scale ?? 1);
    return {x: point.x, z: point.z};
  }

  pickPiece(at) {
    if (!this.setRay(at)) return null;
    const prefix = 'exhibit:' + this.roomKey + ':';
    for (const hit of this.ray.intersectObjects(this.world.pickables, false)) {
      const data = hit.object.userData;
      const id = data.id ?? data.faceIds?.[hit.faceIndex] ?? data.ids?.[hit.instanceId];
      if (id?.startsWith(prefix)) {
        const block = id.slice(prefix.length).replace(/:\d+$/, '');
        if (this.byBlock.has(block)) return this.byBlock.get(block);
      }
      if (id?.startsWith('builder:') && this.pieces.some(piece => 'builder:' + piece.id === id)) return id.slice(8);
    }
    return null;
  }

  setSelection(id) {
    this.removeOutline();
    const piece = this.pieces.find(piece => piece.id === id);
    if (!piece) return;
    const {yaw, scale} = piece.transform;
    const ring = new THREE.RingGeometry(.96, 1.05, 4, 1, Math.PI / 4);
    const material = new THREE.MeshBasicMaterial({color: '#c2f9ff', side: THREE.DoubleSide, depthWrite: false});
    const outline = new THREE.Mesh(ring, material);
    const size = scale * (this.layout.scale ?? 1) * 1.3;
    outline.name = 'Selected build piece';
    outline.position.copy(this.pieceCenter(piece));
    outline.position.y += .12;
    outline.rotation.set(-Math.PI / 2, 0, yaw + (this.layout.facing ?? 0), 'YXZ');
    outline.scale.setScalar(size);
    this.world.scene.add(outline);
    this.removeOutline = () => {
      outline.removeFromParent();
      ring.dispose();
      material.dispose();
      this.removeOutline = () => {};
    };
  }

  pieceCenter(piece) {
    const center = new THREE.Vector3(...piece.transform.position).multiplyScalar(this.layout.scale ?? 1)
      .applyAxisAngle(UP, this.layout.facing ?? 0);
    center.x += this.layout.slot[0];
    center.z += this.layout.slot[1];
    return center;
  }

  removeOutline() {}

  moveCamera(dt) {
    const key = (...codes) => Number(codes.some(code => this.keys.has(code)));
    const x = key('KeyD','ArrowRight') - key('KeyA','ArrowLeft');
    const z = key('KeyS','ArrowDown') - key('KeyW','ArrowUp');
    const y = key('KeyE') - key('KeyQ');
    if (this.mode !== 'fly') {
      if (x || z) this.pan(x * dt * 6, z * dt * 6);
      return;
    }
    if (x || y || z) {
      const movement = new THREE.Vector3(x, 0, z).applyQuaternion(this.camera.quaternion);
      movement.y += y;
      this.flyPosition.addScaledVector(movement, dt * 6);
      this.flyPosition.y = clamp(this.flyPosition.y, 1, 52);
    }
  }

  render(graphics, dt = 0) {
    if (!this.world) return;
    this.moveCamera(Math.min(.05, Math.max(0, dt)));
    this.updateCamera();
    if (this.shadowDirty) {
      const shadows = graphics.renderer.shadowMap;
      if (shadows.enabled) shadows.needsUpdate = true;
      this.shadowDirty = false;
    }
    graphics.render(this.world.scene, this.camera);
  }

  releaseWorld() {
    this.removeOutline();
    this.removeBlueprint();
    this.world?.dispose();
    this.world = null;
  }

  clear() {
    this.resetInput();
    this.releaseWorld();
    if (this.canvasLabel === null) this.canvas.removeAttribute('aria-label');
    else this.canvas.setAttribute('aria-label', this.canvasLabel);
  }

  dispose() {
    this.clear();
    this.events.abort();
  }
}
