import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

import { GAMEPLAY_ASSETS } from "../core/gameplay-assets.mjs";
import { buildRenderTiles, computeRenderBounds } from "../core/view-model.mjs";

function srgbColor(hex) {
  return new THREE.Color(hex).convertSRGBToLinear();
}

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

function drawTopCrop(context, image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const sourceSize = Math.min(width, height);
  context.drawImage(image, 0, 0, sourceSize, sourceSize, 0, 0, 256, 256);
}

function makeBlockTexture(image, { blockBackground, lockMask, blocked = false, faceDown = false } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#efffc4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (blockBackground) {
    drawTopCrop(context, blockBackground);
  }
  if (!faceDown && image) {
    drawTopCrop(context, image);
  }
  if ((faceDown || blocked) && lockMask) {
    context.globalAlpha = faceDown ? 0.72 : 0.56;
    drawTopCrop(context, lockMask);
    context.globalAlpha = 1;
  }
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
    this.patternImages = new Map();
    this.loadingPatterns = new Set();
    this.fallbackTextures = new Map();
    this.pointerStart = null;
    this.destroyed = false;
  }

  mount(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = srgbColor(0x47bd7f);
    this.scene.fog = new THREE.Fog(srgbColor(0x47bd7f), 18, 48);
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
    this.groundGeometry = new THREE.PlaneGeometry(60, 60);
    this.groundMaterial = new THREE.MeshBasicMaterial({
      color: srgbColor(0x47bd7f),
    });
    this.ground = new THREE.Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.04;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grassGeometry = new THREE.PlaneGeometry(1.5, 1.5 * (34 / 94));
    this.grassMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    this.grassGroup = new THREE.Group();
    const grassPositions = [
      [-7.2, -4.8, -0.18],
      [-6.4, 4.2, 0.35],
      [-2.7, 7.1, -0.26],
      [3.9, 6.2, 0.2],
      [7.1, 2.4, -0.38],
      [6.5, -5.6, 0.28],
      [1.9, -7.2, -0.2],
      [-3.8, -6.8, 0.3],
    ];
    for (const [x, z, rotation] of grassPositions) {
      const grass = new THREE.Mesh(this.grassGeometry, this.grassMaterial);
      grass.rotation.x = -Math.PI / 2;
      grass.rotation.z = rotation;
      grass.position.set(x, -0.025, z);
      this.grassGroup.add(grass);
    }
    this.scene.add(this.grassGroup);

    this.grid = new THREE.GridHelper(30, 30, 0x257c50, 0x359a68);
    this.grid.position.y = -0.015;
    this.scene.add(this.grid);

    const ambient = new THREE.HemisphereLight(0xfffee8, 0x26744f, 1.45);
    this.scene.add(ambient);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.keyLight.position.set(-7, 13, 7);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.keyLight);
    const rim = new THREE.DirectionalLight(0xbfffa7, 0.42);
    rim.position.set(10, 7, -9);
    this.scene.add(rim);

    this.geometry = new THREE.BoxGeometry(1, 0.16, 1);
    this.sideMaterial = new THREE.MeshStandardMaterial({
      color: srgbColor(0x3f7d0a),
      roughness: 0.74,
      metalness: 0,
    });
    this.textureLoader = new THREE.TextureLoader();
    this.trayGeometry = new THREE.PlaneGeometry(3.2, 3.2 * (178 / 256));
    this.trayMaterial = new THREE.MeshBasicMaterial({
      color: 0x9b5c1b,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.trayMesh = new THREE.Mesh(this.trayGeometry, this.trayMaterial);
    this.trayMesh.rotation.x = -Math.PI / 2;
    this.trayMesh.position.y = 0.015;
    this.trayMesh.visible = false;
    this.scene.add(this.trayMesh);
    this.loadGameplayArtwork();
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
    if (this.grid) {
      this.grid.visible = mode === "edit";
    }
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

  loadGameplayArtwork() {
    const loadImage = (url, onLoad) => {
      this.textureLoader.load(
        url,
        (texture) => {
          const image = texture.image;
          texture.dispose();
          onLoad(image);
        },
        undefined,
        () => {},
      );
    };
    loadImage(GAMEPLAY_ASSETS.blockBackground, (image) => {
      this.blockBackgroundImage = image;
      this.invalidateBlockTextures();
    });
    loadImage(GAMEPLAY_ASSETS.lockMask, (image) => {
      this.lockMaskImage = image;
      this.invalidateBlockTextures();
    });
    this.textureLoader.load(GAMEPLAY_ASSETS.grass, (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.grassTexture = texture;
      this.grassMaterial.map = texture;
      this.grassMaterial.needsUpdate = true;
    });
    this.textureLoader.load(GAMEPLAY_ASSETS.playTray, (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.playTrayTexture = texture;
      this.trayMaterial.map = texture;
      this.trayMaterial.color.setHex(0xffffff);
      this.trayMaterial.needsUpdate = true;
    });
  }

  invalidateBlockTextures() {
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();
    this.updateScene();
  }

  loadPattern(record) {
    if (!this.blockImageUrl || record.type <= 0 || this.loadingPatterns.has(record.type)) {
      return;
    }
    this.loadingPatterns.add(record.type);
    this.textureLoader.load(
      this.blockImageUrl(record.type),
      (texture) => {
        this.patternImages.set(record.type, texture.image);
        texture.dispose();
        this.loadingPatterns.delete(record.type);
        this.updateScene();
      },
      undefined,
      () => {
        this.loadingPatterns.delete(record.type);
      },
    );
  }

  textureFor(record) {
    const faceDown = record.faceDown || record.hiddenPattern;
    const textureKey = `${record.type}:${faceDown ? "down" : "up"}:${record.blocked ? "blocked" : "free"}`;
    if (this.textures.has(textureKey)) {
      return this.textures.get(textureKey);
    }
    const pattern = this.patternImages.get(record.type);
    if (this.blockBackgroundImage && (faceDown || pattern)) {
      const texture = makeBlockTexture(pattern, {
        blockBackground: this.blockBackgroundImage,
        lockMask: this.lockMaskImage,
        blocked: record.blocked,
        faceDown,
      });
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.textures.set(textureKey, texture);
      return texture;
    }
    this.loadPattern(record);
    const fallbackKey = faceDown ? "face-down" : record.type;
    if (!this.fallbackTextures.has(fallbackKey)) {
      const label = faceDown ? "●" : record.type === 0 ? "R" : record.type === -1 ? "FR" : record.type;
      this.fallbackTextures.set(
        fallbackKey,
        makeLabelTexture(label, {
          background: faceDown ? "#efffc4" : record.type === 0 ? "#fff2a7" : record.type === -1 ? "#b9f4e4" : "#efffc4",
          foreground: faceDown ? "#31531e" : record.type <= 0 ? "#31531e" : "#293032",
        }),
      );
    }
    return this.fallbackTextures.get(fallbackKey);
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
    const baseY = record.worldY + 0.08;
    mesh.position.set(record.worldX, baseY, record.worldZ);
    mesh.scale.set(record.width * 0.94, 1, record.depth * 0.94);
    mesh.userData.record = record;
    mesh.userData.baseY = baseY;
    const top = mesh.userData.topMaterial;
    const texture = this.textureFor(record);
    if (top.map !== texture) {
      top.map = texture;
      top.needsUpdate = true;
    }
    top.color.setHex(record.blocked ? 0xc7c9ad : 0xffffff);
    top.emissive.setHex(record.selected ? 0x6b5900 : record.sideBlocked ? 0x3a2105 : 0x000000);
    top.emissiveIntensity = record.selected ? 0.62 : record.sideBlocked ? 0.25 : 0;
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
    const trayRecords = renderTiles.filter((record) => record.location === "tray");
    this.trayMesh.visible = this.mode === "play";
    this.trayMesh.position.z = trayRecords[0]?.worldZ ?? bounds.maxZ + 2;
    this.grid.visible = this.mode === "edit";
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
    const size = Math.max(4, bounds.width, bounds.depth + (this.mode === "play" ? 3.4 : 0));
    const maxY = Math.max(1, ...renderTiles.map((tile) => tile.worldY));
    this.controls.target.set(0, Math.min(maxY * 0.35, 2), this.mode === "play" ? 0.65 : 0);
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
          mesh.userData.baseY + 0.025 + Math.sin(time + mesh.position.x) * 0.015;
      } else if (Number.isFinite(mesh.userData.baseY)) {
        mesh.position.y = mesh.userData.baseY;
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
    this.groundGeometry?.dispose();
    this.groundMaterial?.dispose();
    this.grassGeometry?.dispose();
    this.grassMaterial?.dispose();
    this.trayGeometry?.dispose();
    this.trayMaterial?.dispose();
    this.grassTexture?.dispose();
    this.playTrayTexture?.dispose();
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    for (const texture of this.fallbackTextures.values()) {
      texture.dispose();
    }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
