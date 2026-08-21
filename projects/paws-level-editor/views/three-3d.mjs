import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

import { GAMEPLAY_ASSETS } from "../core/gameplay-assets.mjs";
import {
  GRASS_ATLAS_REGIONS,
  GRASS_PATCHES,
  GRASS_VISUAL_SCALE,
  drawGrassAtlasPatch,
  grassPulseScale,
  grassVariantRotationRadians,
} from "../core/grass-layout.mjs";
import {
  analyzeTileRelations,
  buildIssueSeverityByUid,
} from "../core/tile-relations.mjs";
import {
  buildRenderTiles,
  computeRenderBounds,
  deriveDisplayTiles,
} from "../core/view-model.mjs";
import {
  multiplyHexColor,
  resolveTileVisualTone,
  toneFactorToHex,
} from "../core/tile-visual-tone.mjs";
import { createTileMaterialSet } from "./three-tile-materials.mjs";

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

function makeBlockTexture(image, { blockBackground, lockMask, faceDown = false } = {}) {
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
  if (faceDown && lockMask) {
    context.globalAlpha = 0.72;
    drawTopCrop(context, lockMask);
    context.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function makeGrassTexture(image, variant) {
  const region = GRASS_ATLAS_REGIONS[variant];
  const canvas = document.createElement("canvas");
  canvas.width = region.width;
  canvas.height = region.height;
  const context = canvas.getContext("2d");
  drawGrassAtlasPatch(context, image, variant, {
    centerX: canvas.width / 2,
    baseY: canvas.height,
    rotationRadians: grassVariantRotationRadians(variant),
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

const RELATION_COLORS = Object.freeze({
  "upper-blocker": 0xff9c48,
  "lower-dependent": 0x4fb3ff,
  "side-blocker": 0xb784ff,
});

const RELATION_PRIORITY = Object.freeze({
  "lower-dependent": 1,
  "side-blocker": 2,
  "upper-blocker": 3,
});

export class Three3DView {
  constructor({
    blockImageUrl,
    onSelectionChange = () => {},
    onDelete = () => {},
    onPlayInteract = () => {},
    onStash = () => {},
  } = {}) {
    this.blockImageUrl = blockImageUrl;
    this.callbacks = { onSelectionChange, onDelete, onPlayInteract, onStash };
    this.mode = "edit";
    this.tool = "select";
    this.layerView = { mode: "all", layer: 1 };
    this.layerSeparation = 0;
    this.selection = new Set();
    this.issueSeverity = new Map();
    this.source = null;
    this.meshes = new Map();
    this.textures = new Map();
    this.patternImages = new Map();
    this.loadingPatterns = new Set();
    this.fallbackTextures = new Map();
    this.pointerStart = null;
    this.reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = this.reducedMotionQuery.matches;
    this.onReducedMotionChange = (event) => {
      this.reducedMotion = event.matches;
    };
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
    this.relationGroup = new THREE.Group();
    this.scene.add(this.relationGroup);
    this.groundGeometry = new THREE.PlaneGeometry(60, 60);
    this.groundMaterial = new THREE.MeshBasicMaterial({
      color: srgbColor(0x47bd7f),
    });
    this.ground = new THREE.Mesh(this.groundGeometry, this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.04;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grassGroup = new THREE.Group();
    this.grassGeometries = new Map();
    this.grassMaterials = new Map();
    this.grassTextures = new Map();
    this.scene.add(this.grassGroup);

    this.grid = new THREE.GridHelper(30, 30, 0x257c50, 0x359a68);
    this.grid.position.y = -0.015;
    this.scene.add(this.grid);

    const ambient = new THREE.HemisphereLight(0xfffee8, 0x26744f, 0.82);
    this.scene.add(ambient);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 0.62);
    this.keyLight.position.set(-7, 13, 7);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.0002;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    const rim = new THREE.DirectionalLight(0xbfffa7, 0.16);
    rim.position.set(10, 7, -9);
    this.scene.add(rim);

    this.geometry = new THREE.BoxGeometry(1, 0.16, 1);
    this.sideMaterial = new THREE.MeshStandardMaterial({
      color: srgbColor(0x3f7d0a),
      roughness: 0.9,
      metalness: 0,
    });
    this.textureLoader = new THREE.TextureLoader();
    this.trayGeometry = new THREE.PlaneGeometry(1.28, 1.41);
    this.trayBaseMaterial = new THREE.MeshBasicMaterial({
      color: 0x9b5c1b,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.trayLipMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.trayMeshes = [0, 1].map((slot) => {
      const base = new THREE.Mesh(this.trayGeometry, this.trayBaseMaterial);
      const lip = new THREE.Mesh(this.trayGeometry, this.trayLipMaterial);
      base.rotation.x = -Math.PI / 2;
      lip.rotation.x = -Math.PI / 2;
      base.position.y = 0.015;
      lip.position.y = 0.31;
      base.renderOrder = -2;
      lip.renderOrder = 12;
      base.visible = false;
      lip.visible = false;
      base.userData.traySlot = slot;
      lip.userData.traySlot = slot;
      this.scene.add(base, lip);
      return { slot, base, lip };
    });
    this.loadGameplayArtwork();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.reducedMotionQuery.addEventListener?.("change", this.onReducedMotionChange);
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

  setTool(tool) {
    this.tool = tool;
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.cursor = tool === "delete" ? "not-allowed" : "default";
    }
  }

  setLayerView(layerView) {
    this.layerView = { ...this.layerView, ...layerView };
    this.updateScene();
  }

  setLayerSeparation(value) {
    this.layerSeparation = Math.max(0, Math.min(1, Number(value) || 0));
    this.updateScene();
  }

  setIssues(issues) {
    this.issueSeverity = buildIssueSeverityByUid(issues);
    this.updateScene();
  }

  layerOffset(tile) {
    return this.mode === "edit"
      ? Math.max(0, Number(tile.layer) - 1) * this.layerSeparation * 0.22
      : 0;
  }

  displaySource() {
    if (this.mode === "play") return this.source;
    return {
      ...this.source,
      tiles: deriveDisplayTiles(this.source?.tiles, this.layerView),
    };
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

  buildGrassField(image) {
    for (const child of [...this.grassGroup.children]) this.grassGroup.remove(child);
    for (const geometry of this.grassGeometries.values()) geometry.dispose();
    for (const material of this.grassMaterials.values()) material.dispose();
    for (const texture of this.grassTextures.values()) texture.dispose();
    this.grassGeometries.clear();
    this.grassMaterials.clear();
    this.grassTextures.clear();

    for (const [variant, region] of Object.entries(GRASS_ATLAS_REGIONS)) {
      const texture = makeGrassTexture(image, variant);
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      const geometry = new THREE.PlaneGeometry(
        region.width * 0.025 * GRASS_VISUAL_SCALE,
        region.height * 0.025 * GRASS_VISUAL_SCALE,
      );
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.grassTextures.set(variant, texture);
      this.grassGeometries.set(variant, geometry);
      this.grassMaterials.set(variant, material);
    }

    for (const patch of GRASS_PATCHES) {
      const geometry = this.grassGeometries.get(patch.variant);
      const material = this.grassMaterials.get(patch.variant);
      const height = GRASS_ATLAS_REGIONS[patch.variant].height * 0.025 * GRASS_VISUAL_SCALE;
      const x = (patch.normalizedX - 0.5) * 18;
      const z = (patch.normalizedY - 0.5) * 18;
      const grass = new THREE.Mesh(geometry, material);
      grass.position.set(x, -0.025 + height / 2, z);
      grass.rotation.y = Math.atan2(-x, -z) + patch.rotationRadians;
      grass.userData.baseY = -0.025;
      grass.userData.height = height;
      grass.userData.patchId = patch.id;
      this.grassGroup.add(grass);
    }
    this.grassTexture = this.grassTextures.get("Grass1");
    this.grassGeometry = this.grassGeometries.get("Grass1");
    this.grassMaterial = this.grassMaterials.get("Grass1");
  }

  loadGameplayArtwork() {
    const loadImage = (url, onLoad) => {
      this.textureLoader.load(
        url,
        (texture) => {
          const image = texture.image;
          texture.dispose();
          if (this.destroyed) return;
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
    loadImage(GAMEPLAY_ASSETS.grass, (image) => this.buildGrassField(image));
    const loadTrayTexture = (url, material, property) => {
      this.textureLoader.load(url, (texture) => {
        if (this.destroyed) {
          texture.dispose();
          return;
        }
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this[property] = texture;
        material.map = texture;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
      });
    };
    loadTrayTexture(GAMEPLAY_ASSETS.playTrayBase, this.trayBaseMaterial, "playTrayTexture");
    loadTrayTexture(GAMEPLAY_ASSETS.playTrayLip, this.trayLipMaterial, "playTrayLipTexture");
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
    const textureKey = `${record.type}:${faceDown ? "down" : "up"}`;
    if (this.textures.has(textureKey)) {
      return this.textures.get(textureKey);
    }
    const pattern = this.patternImages.get(record.type);
    if (this.blockBackgroundImage && (faceDown || pattern)) {
      const texture = makeBlockTexture(pattern, {
        blockBackground: this.blockBackgroundImage,
        lockMask: this.lockMaskImage,
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
    const { top, side, materials } = createTileMaterialSet(THREE, {
      texture: this.textureFor(record),
      sideMaterial: this.sideMaterial,
    });
    const mesh = new THREE.Mesh(this.geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.uid = record.uid;
    mesh.userData.topMaterial = top;
    mesh.userData.sideMaterial = side;
    this.tileGroup.add(mesh);
    this.meshes.set(record.uid, mesh);
    return mesh;
  }

  updateMesh(mesh, record) {
    const explodedOffset = this.layerOffset(record);
    const baseY = record.worldY + explodedOffset + 0.08;
    mesh.position.set(record.worldX, baseY, record.worldZ);
    mesh.scale.set(record.width * 0.94, 1, record.depth * 0.94);
    mesh.userData.record = record;
    mesh.userData.baseY = baseY;
    const top = mesh.userData.topMaterial;
    const side = mesh.userData.sideMaterial;
    const texture = this.textureFor(record);
    if (top.map !== texture) {
      top.map = texture;
      top.needsUpdate = true;
    }
    const tone = resolveTileVisualTone(record, { mode: this.mode });
    let color = toneFactorToHex(tone.factor);
    let emissive = record.sideBlocked ? 0x3a2105 : 0x000000;
    let emissiveIntensity = record.sideBlocked ? 0.25 : 0;
    if (this.mode === "edit" && record.relationType) {
      color = RELATION_COLORS[record.relationType];
      emissive = RELATION_COLORS[record.relationType];
      emissiveIntensity = 0.18;
    }
    if (this.mode === "edit" && record.issueSeverity === "warning") {
      color = 0xffd65a;
      emissive = 0x7f5900;
      emissiveIntensity = 0.32;
    }
    if (this.mode === "edit" && record.issueSeverity === "error") {
      color = 0xff7474;
      emissive = 0x8c0000;
      emissiveIntensity = 0.42;
    }
    if (record.selected) {
      color = 0xffffff;
      emissive = 0x6b5900;
      emissiveIntensity = 0.62;
    }
    top.color.setHex(color).convertSRGBToLinear();
    side.emissive.setHex(emissive);
    side.emissiveIntensity = Math.min(0.28, emissiveIntensity);
    side.color
      .setHex(multiplyHexColor(0x3f7d0a, tone.factor))
      .convertSRGBToLinear();
    mesh.renderOrder = record.selected ? 10 : 0;
  }

  clearRelationshipLines() {
    if (!this.relationGroup) return;
    for (const line of [...this.relationGroup.children]) {
      line.geometry?.dispose();
      line.material?.dispose();
      this.relationGroup.remove(line);
    }
  }

  updateRelationshipLines(edges) {
    this.clearRelationshipLines();
    if (this.mode !== "edit" || !edges.length) return;
    const pointsByType = new Map();
    for (const edge of edges) {
      const source = this.meshes.get(edge.sourceUid);
      const target = this.meshes.get(edge.targetUid);
      if (!source || !target) continue;
      const points = pointsByType.get(edge.type) ?? [];
      points.push(
        source.position.clone().add(new THREE.Vector3(0, 0.14, 0)),
        target.position.clone().add(new THREE.Vector3(0, 0.14, 0)),
      );
      pointsByType.set(edge.type, points);
    }
    for (const [type, points] of pointsByType) {
      if (!points.length) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: RELATION_COLORS[type],
        transparent: true,
        opacity: 0.94,
        depthTest: false,
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.renderOrder = 30;
      this.relationGroup.add(lines);
    }
  }

  updateScene() {
    if (!this.scene || !this.source) {
      return;
    }
    const displaySource = this.displaySource();
    const relations = this.mode === "edit"
      ? analyzeTileRelations(displaySource?.tiles, this.selection)
      : { edges: [], relatedUids: new Set() };
    const relationTypes = new Map();
    for (const edge of relations.edges) {
      const previous = relationTypes.get(edge.targetUid);
      if (!previous || RELATION_PRIORITY[edge.type] > RELATION_PRIORITY[previous]) {
        relationTypes.set(edge.targetUid, edge.type);
      }
    }
    const renderTiles = buildRenderTiles(displaySource, { blockImageUrl: this.blockImageUrl }).map(
      (record) => ({
        ...record,
        issueSeverity: this.issueSeverity.get(record.uid) ?? null,
        relationType: relationTypes.get(record.uid) ?? null,
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
        mesh.userData.sideMaterial.dispose();
        this.tileGroup.remove(mesh);
        this.meshes.delete(uid);
      }
    }
    for (const record of renderTiles) {
      const mesh = this.meshes.get(record.uid) ?? this.createMesh(record);
      this.updateMesh(mesh, record);
    }
    this.updateRelationshipLines(relations.edges);
    const bounds = computeRenderBounds(renderTiles);
    const trayRecords = renderTiles.filter((record) => record.location === "tray");
    const trayZ = trayRecords[0]?.worldZ ?? bounds.maxZ + 2;
    const secondSlotUnlocked = this.source?.secondSlotUnlocked === true;
    for (const tray of this.trayMeshes) {
      const visible = this.mode === "play" && (tray.slot === 0 || secondSlotUnlocked);
      const worldX = secondSlotUnlocked ? (tray.slot === 0 ? -1.3 : 1.3) : 0;
      tray.base.visible = visible;
      tray.lip.visible = visible;
      tray.base.position.x = worldX;
      tray.lip.position.x = worldX;
      tray.base.position.z = trayZ;
      tray.lip.position.z = trayZ;
    }
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
    const renderTiles = buildRenderTiles(this.displaySource(), { blockImageUrl: this.blockImageUrl });
    const bounds = computeRenderBounds(renderTiles);
    const size = Math.max(4, bounds.width, bounds.depth + (this.mode === "play" ? 3.4 : 0));
    const maxY = Math.max(
      1,
      ...renderTiles.map((tile) => tile.worldY + this.layerOffset(tile)),
    );
    this.camera.up.set(0, 1, 0);
    this.controls.target.set(0, Math.min(maxY * 0.35, 2), this.mode === "play" ? 0.65 : 0);
    this.camera.position.set(size * 0.9, size * 1.05 + maxY, size * 1.15);
    this.camera.near = 0.1;
    this.camera.far = Math.max(100, size * 12);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  cameraFrame() {
    const renderTiles = buildRenderTiles(this.displaySource(), { blockImageUrl: this.blockImageUrl });
    const bounds = computeRenderBounds(renderTiles);
    const maxY = Math.max(
      1,
      ...renderTiles.map((tile) => tile.worldY + this.layerOffset(tile)),
    );
    const size = Math.max(4, bounds.width, bounds.depth, maxY * 0.8);
    return {
      distance: Math.max(6, size * 1.7 + maxY * 0.35),
      maxY,
      target: new THREE.Vector3(
        (bounds.minX + bounds.maxX) / 2,
        Math.min(maxY * 0.42, maxY - 0.1),
        (bounds.minZ + bounds.maxZ) / 2,
      ),
    };
  }

  setCameraPreset(preset) {
    if (!this.camera || !this.controls) return;
    const normalized = ["iso", "top", "front", "side"].includes(preset)
      ? preset
      : "iso";
    const { distance, target } = this.cameraFrame();
    const offsets = {
      iso: [distance * 0.72, distance * 0.72, distance],
      top: [0, distance * 1.35, 0.001],
      front: [0, distance * 0.38, distance * 1.25],
      side: [distance * 1.25, distance * 0.38, 0],
    };
    this.camera.up.set(0, normalized === "top" ? 0 : 1, normalized === "top" ? -1 : 0);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(...offsets[normalized]));
    this.camera.near = 0.1;
    this.camera.far = Math.max(100, distance * 12);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.controls.update();
  }

  focusSelection() {
    if (!this.camera || !this.controls) return;
    const selectedMeshes = [...this.selection]
      .map((uid) => this.meshes.get(uid))
      .filter(Boolean);
    if (!selectedMeshes.length) {
      this.fitCamera();
      return;
    }
    const box = new THREE.Box3();
    for (const mesh of selectedMeshes) {
      box.expandByObject(mesh);
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < Number.EPSILON) direction.set(1, 1, 1);
    direction.normalize();
    const distance = Math.max(3, Math.max(size.x, size.y, size.z) * 3.8);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.lookAt(center);
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
      if (this.tool === "delete") {
        this.callbacks.onDelete([record.uid]);
        return;
      }
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
    const seconds = performance.now() / 1000;
    const time = seconds * 4;
    for (const mesh of this.meshes.values()) {
      if (mesh.userData.record?.selected) {
        mesh.position.y =
          mesh.userData.baseY + 0.025 + Math.sin(time + mesh.position.x) * 0.015;
      } else if (Number.isFinite(mesh.userData.baseY)) {
        mesh.position.y = mesh.userData.baseY;
      }
    }
    const grassScale = grassPulseScale(seconds, {
      reducedMotion: this.reducedMotion || document.visibilityState !== "visible",
    });
    for (const grass of this.grassGroup.children) {
      grass.scale.y = grassScale;
      grass.position.y = grass.userData.baseY + grass.userData.height * grassScale / 2;
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.abortController?.abort();
    this.resizeObserver?.disconnect();
    this.reducedMotionQuery.removeEventListener?.("change", this.onReducedMotionChange);
    this.controls?.dispose();
    for (const mesh of this.meshes.values()) {
      mesh.userData.topMaterial.dispose();
      mesh.userData.sideMaterial.dispose();
    }
    this.clearRelationshipLines();
    this.meshes.clear();
    this.geometry?.dispose();
    this.sideMaterial?.dispose();
    this.groundGeometry?.dispose();
    this.groundMaterial?.dispose();
    for (const geometry of this.grassGeometries.values()) geometry.dispose();
    for (const material of this.grassMaterials.values()) material.dispose();
    for (const texture of this.grassTextures.values()) texture.dispose();
    this.trayGeometry?.dispose();
    this.trayBaseMaterial?.dispose();
    this.trayLipMaterial?.dispose();
    this.playTrayTexture?.dispose();
    this.playTrayLipTexture?.dispose();
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
