import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

import { buildRenderTiles, computeRenderBounds, containImageRect } from "../core/view-model.mjs";

function makeLabelTexture(label, { background = "#273032", foreground = "#edf0e9" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, 256, 256);
  context.strokeStyle = "#566260";
  context.lineWidth = 10;
  context.strokeRect(14, 14, 228, 228);
  context.fillStyle = foreground;
  context.font = "700 64px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(label), 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeBlockTexture(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#e7e4d6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const imageRect = containImageRect({
    sourceWidth: image.naturalWidth || image.width,
    sourceHeight: image.naturalHeight || image.height,
    targetWidth: canvas.width,
    targetHeight: canvas.height,
  });
  context.drawImage(image, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

export class Three3DView {
  constructor({
    blockImageUrl,
    onSelectionChange = () => {},
    onPlayInteract = () => {},
    onStash = () => {},
  } = {}) {
    this.blockImageUrl = blockImageUrl;
    this.callbacks = { onSelectionChange, onPlayInteract, onStash };
    this.mode = "edit";
    this.selection = new Set();
    this.source = null;
    this.meshes = new Map();
    this.textures = new Map();
    this.fallbackTextures = new Map();
    this.pointerStart = null;
    this.destroyed = false;
  }

  mount(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1213);
    this.scene.fog = new THREE.Fog(0x0d1213, 12, 34);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(8, 10, 10);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "level-canvas level-canvas-3d";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "3D 关卡视图");
    host.prepend(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 45;
    this.controls.maxPolarAngle = Math.PI * 0.48;

    this.tileGroup = new THREE.Group();
    this.scene.add(this.tileGroup);
    this.grid = new THREE.GridHelper(30, 30, 0x3f4b4a, 0x242d2e);
    this.grid.position.y = 0;
    this.scene.add(this.grid);

    const ambient = new THREE.HemisphereLight(0xdcefe8, 0x151b1c, 1.35);
    this.scene.add(ambient);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.keyLight.position.set(-7, 13, 7);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.keyLight);
    const rim = new THREE.DirectionalLight(0x86f1df, 0.45);
    rim.position.set(10, 7, -9);
    this.scene.add(rim);

    this.geometry = new THREE.BoxGeometry(1, 0.16, 1);
    this.sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x485052,
      roughness: 0.68,
      metalness: 0.05,
    });
    this.backTexture = makeLabelTexture("PAWS", { background: "#263033", foreground: "#d5f06a" });
    this.textureLoader = new THREE.TextureLoader();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.renderer.domElement.addEventListener(
      "pointerdown",
      (event) => {
        this.pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
      },
      { signal },
    );
    this.renderer.domElement.addEventListener("pointerup", (event) => this.onPointerUp(event), { signal });
    this.renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
    return this;
  }

  setDocument(document) {
    this.source = document;
    this.updateScene();
  }

  setPlaySnapshot(snapshot) {
    this.source = snapshot;
    this.updateScene();
  }

  setSelection(tileUids) {
    this.selection = new Set(tileUids);
    this.updateScene();
  }

  setMode(mode) {
    this.mode = mode;
    this.updateScene();
  }

  resize() {
    if (!this.host || !this.renderer) {
      return;
    }
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  textureFor(record) {
    if (record.faceDown) {
      return this.backTexture;
    }
    if (this.textures.has(record.type)) {
      return this.textures.get(record.type);
    }
    if (!this.fallbackTextures.has(record.type)) {
      const label = record.type === 0 ? "R" : record.type === -1 ? "FR" : record.type;
      this.fallbackTextures.set(
        record.type,
        makeLabelTexture(label, {
          background: record.type === 0 ? "#293316" : record.type === -1 ? "#14312f" : "#e7e4d6",
          foreground: record.type <= 0 ? "#edf0e9" : "#293032",
        }),
      );
    }
    if (
      this.blockImageUrl &&
      record.type !== 0 &&
      record.type !== -1 &&
      !this.textures.has(`loading:${record.type}`)
    ) {
      this.textures.set(`loading:${record.type}`, true);
      this.textureLoader.load(
        this.blockImageUrl(record.type),
        (texture) => {
          const blockTexture = makeBlockTexture(texture.image);
          texture.dispose();
          blockTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          this.textures.set(record.type, blockTexture);
          this.textures.delete(`loading:${record.type}`);
          this.updateScene();
        },
        undefined,
        () => {
          this.textures.delete(`loading:${record.type}`);
        },
      );
    }
    return this.fallbackTextures.get(record.type);
  }

  createMesh(record) {
    const top = new THREE.MeshStandardMaterial({
      map: this.textureFor(record),
      color: 0xffffff,
      roughness: 0.63,
      metalness: 0.02,
      emissive: 0x000000,
    });
    const materials = [
      this.sideMaterial,
      this.sideMaterial,
      top,
      this.sideMaterial,
      this.sideMaterial,
      this.sideMaterial,
    ];
    const mesh = new THREE.Mesh(this.geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.uid = record.uid;
    mesh.userData.topMaterial = top;
    this.tileGroup.add(mesh);
    this.meshes.set(record.uid, mesh);
    return mesh;
  }

  updateMesh(mesh, record) {
    mesh.position.set(record.worldX, record.worldY, record.worldZ);
    mesh.scale.set(record.width * 0.94, 1, record.depth * 0.94);
    mesh.userData.record = record;
    const top = mesh.userData.topMaterial;
    const texture = this.textureFor(record);
    if (top.map !== texture) {
      top.map = texture;
      top.needsUpdate = true;
    }
    top.color.setHex(record.blocked ? 0x737978 : record.faceDown ? 0x8b9591 : 0xffffff);
    top.emissive.setHex(record.selected ? 0x4c5c08 : record.sideBlocked ? 0x3a2105 : 0x000000);
    top.emissiveIntensity = record.selected ? 0.9 : record.sideBlocked ? 0.45 : 0;
    mesh.renderOrder = record.selected ? 10 : 0;
  }

  updateScene() {
    if (!this.scene || !this.source) {
      return;
    }
    const renderTiles = buildRenderTiles(this.source, { blockImageUrl: this.blockImageUrl }).map(
      (record) => ({
        ...record,
        selected:
          this.mode === "play"
            ? record.uid === this.source.selectedTileUid
            : this.selection.has(record.uid),
      }),
    );
    const activeUids = new Set(renderTiles.map((record) => record.uid));
    for (const [uid, mesh] of this.meshes) {
      if (!activeUids.has(uid)) {
        mesh.userData.topMaterial.dispose();
        this.tileGroup.remove(mesh);
        this.meshes.delete(uid);
      }
    }
    for (const record of renderTiles) {
      const mesh = this.meshes.get(record.uid) ?? this.createMesh(record);
      this.updateMesh(mesh, record);
    }
    const bounds = computeRenderBounds(renderTiles);
    this.grid.scale.set(
      Math.max(0.35, Math.min(1, bounds.width / 30 + 0.25)),
      1,
      Math.max(0.35, Math.min(1, bounds.depth / 30 + 0.25)),
    );
  }

  fitCamera() {
    if (!this.source) {
      return;
    }
    const renderTiles = buildRenderTiles(this.source, { blockImageUrl: this.blockImageUrl });
    const bounds = computeRenderBounds(renderTiles);
    const size = Math.max(4, bounds.width, bounds.depth);
    const maxY = Math.max(1, ...renderTiles.map((tile) => tile.worldY));
    this.controls.target.set(0, Math.min(maxY * 0.35, 2), 0);
    this.camera.position.set(size * 0.9, size * 1.05 + maxY, size * 1.15);
    this.camera.near = 0.1;
    this.camera.far = Math.max(100, size * 12);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  pick(event) {
    const rectangle = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rectangle.left) / rectangle.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rectangle.top) / rectangle.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.meshes.values()], false);
    return intersections[0]?.object?.userData?.record ?? null;
  }

  onPointerUp(event) {
    if (!this.pointerStart) {
      return;
    }
    const movement = Math.hypot(
      event.clientX - this.pointerStart.x,
      event.clientY - this.pointerStart.y,
    );
    const button = this.pointerStart.button;
    this.pointerStart = null;
    if (movement > 5) {
      return;
    }
    const record = this.pick(event);
    if (!record) {
      if (this.mode === "edit" && button === 0 && !event.shiftKey && !event.altKey) {
        this.callbacks.onSelectionChange(new Set());
      }
      return;
    }
    if (this.mode === "play") {
      if (button === 2 && record.location === "board") {
        this.callbacks.onStash(record.uid);
      } else if (button === 0) {
        this.callbacks.onPlayInteract(record.uid);
      }
      return;
    }
    if (button === 0) {
      const next = new Set(event.shiftKey || event.altKey ? this.selection : []);
      if (event.altKey) {
        next.delete(record.uid);
      } else {
        next.add(record.uid);
      }
      this.callbacks.onSelectionChange(next);
    }
  }

  animate() {
    if (this.destroyed) {
      return;
    }
    this.animationFrame = requestAnimationFrame(() => this.animate());
    this.controls.update();
    const time = performance.now() * 0.004;
    for (const mesh of this.meshes.values()) {
      if (mesh.userData.record?.selected) {
        mesh.position.y =
          mesh.userData.record.worldY + 0.025 + Math.sin(time + mesh.position.x) * 0.015;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.abortController?.abort();
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    for (const mesh of this.meshes.values()) {
      mesh.userData.topMaterial.dispose();
    }
    this.meshes.clear();
    this.geometry?.dispose();
    this.sideMaterial?.dispose();
    this.backTexture?.dispose();
    for (const [key, texture] of this.textures) {
      if (typeof key === "number") {
        texture.dispose();
      }
    }
    for (const texture of this.fallbackTextures.values()) {
      texture.dispose();
    }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
