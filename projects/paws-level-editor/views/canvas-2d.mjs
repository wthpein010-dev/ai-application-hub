import {
  boardToScreen,
  boxSelect,
  dragDelta,
  modifySelection,
  screenToBoard,
  snapValue,
  topmostHit,
} from "../ui/editor-tools.mjs";
import { GAMEPLAY_ASSETS } from "../core/gameplay-assets.mjs";
import { deriveDisplayTiles } from "../core/view-model.mjs";
import { buildFillCells } from "../core/fill-tool.mjs";
import { buildFieldGridLayout } from "../core/field-grid-layout.mjs";
import { resolveTileVisualTone } from "../core/tile-visual-tone.mjs";

const TILE_SIZE = 8;
const TILE_ART_ASPECT = 135 / 120;

export class Canvas2DView {
  constructor({
    blockImageUrl,
    onSelectionChange = () => {},
    onMove = () => {},
    onPlace = () => {},
    onFill = () => {},
    onDelete = () => {},
    onPlayInteract = () => {},
    onStash = () => {},
    onCoordinate = () => {},
  } = {}) {
    this.blockImageUrl = blockImageUrl;
    this.callbacks = {
      onSelectionChange,
      onMove,
      onPlace,
      onFill,
      onDelete,
      onPlayInteract,
      onStash,
      onCoordinate,
    };
    this.document = null;
    this.snapshot = null;
    this.selection = new Set();
    this.mode = "edit";
    this.tool = "select";
    this.layerView = { mode: "all", layer: 1 };
    this.snapStep = 8;
    this.placeTemplate = { type: 1, layer: 1, presetColorType: 1, fillStartLayer: 1 };
    this.viewport = { scale: 5, offsetX: 60, offsetY: 60 };
    this.images = new Map();
    this.gameplayImages = new Map();
    this.pointerState = null;
    this.boxRectangle = null;
    this.destroyed = false;
  }

  mount(host) {
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "level-canvas level-canvas-2d";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "2D 关卡画布");
    host.prepend(this.canvas);
    this.context = this.canvas.getContext("2d");
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.canvas.addEventListener("wheel", (event) => this.onWheel(event), { signal, passive: false });
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event), { signal });
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event), { signal });
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event), { signal });
    this.canvas.addEventListener("pointercancel", () => this.cancelPointer(), { signal });
    this.canvas.addEventListener("contextmenu", (event) => this.onContextMenu(event), { signal });
    this.resize();
    return this;
  }

  setDocument(document) {
    this.document = document;
    this.snapshot = null;
    this.draw();
  }

  setPlaySnapshot(snapshot) {
    this.snapshot = snapshot;
    this.draw();
  }

  setSelection(tileUids) {
    this.selection = new Set(tileUids);
    this.draw();
  }

  setMode(mode) {
    this.mode = mode;
    this.draw();
  }

  setTool(tool) {
    this.tool = tool;
    if (this.canvas) {
      this.canvas.style.cursor =
        tool === "pan"
          ? "grab"
          : ["place", "fill"].includes(tool)
            ? "crosshair"
            : tool === "delete"
              ? "not-allowed"
              : "default";
    }
  }

  setLayerView(layerView) {
    this.layerView = { ...this.layerView, ...layerView };
    this.draw();
  }

  setSnapStep(step) {
    this.snapStep = Number(step);
  }

  setPlaceTemplate(template) {
    Object.assign(this.placeTemplate, template);
  }

  resize() {
    if (!this.canvas || !this.host) {
      return;
    }
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;
    this.draw();
  }

  currentTiles() {
    return this.mode === "play"
      ? this.snapshot?.tiles ?? []
      : deriveDisplayTiles(this.document?.tiles, this.layerView);
  }

  boardTiles() {
    return this.currentTiles().filter(
      (tile) => !tile.removed && !Number.isInteger(tile.stashedSlot),
    );
  }

  fitCamera() {
    const tiles = this.boardTiles();
    if (!tiles.length || !this.width || !this.height) {
      return;
    }
    const minX = Math.min(...tiles.map((tile) => tile.x));
    const maxX = Math.max(...tiles.map((tile) => tile.x + TILE_SIZE));
    const minY = Math.min(...tiles.map((tile) => tile.y));
    const maxY = Math.max(...tiles.map((tile) => tile.y + TILE_SIZE));
    const boardWidth = Math.max(TILE_SIZE, maxX - minX);
    const boardHeight = Math.max(TILE_SIZE, maxY - minY);
    const topInset = 76;
    const bottomInset = this.mode === "play" ? 285 : 50;
    const availableHeight = Math.max(120, this.height - topInset - bottomInset);
    this.viewport.scale = Math.max(
      0.5,
      Math.min(11, Math.min((this.width - 80) / boardWidth, (availableHeight - 60) / boardHeight)),
    );
    this.viewport.offsetX =
      this.width / 2 - ((minX + maxX) / 2) * this.viewport.scale;
    this.viewport.offsetY =
      topInset + availableHeight / 2 - ((minY + maxY) / 2) * this.viewport.scale;
    this.draw();
  }

  pointFromEvent(event) {
    const rectangle = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }

  hitBoardTile(screenPoint) {
    const boardPoint = screenToBoard(screenPoint, this.viewport);
    return topmostHit(this.boardTiles(), boardPoint);
  }

  trayFrameLayout() {
    const width = Math.min(228, Math.max(176, this.width * 0.29));
    const height = width * (178 / 256);
    return {
      x: (this.width - width) / 2,
      y: this.height - height - 104,
      width,
      height,
    };
  }

  trayLayout() {
    const frame = this.trayFrameLayout();
    return [0, 1].map((slot) => ({
      slot,
      x: frame.x + frame.width * (slot === 0 ? 0.095 : 0.525),
      y: frame.y + frame.height * 0.09,
      width: frame.width * 0.38,
      height: frame.height * 0.61,
    }));
  }

  hitTrayTile(point) {
    if (this.mode !== "play") {
      return null;
    }
    const slot = this.trayLayout().find(
      (item) =>
        point.x >= item.x &&
        point.x <= item.x + item.width &&
        point.y >= item.y &&
        point.y <= item.y + item.height,
    );
    const uid = slot ? this.snapshot?.tray?.[slot.slot] : null;
    return uid ? this.currentTiles().find((tile) => tile.uid === uid) : null;
  }

  onWheel(event) {
    event.preventDefault();
    const point = this.pointFromEvent(event);
    const before = screenToBoard(point, this.viewport);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.viewport.scale = Math.max(0.35, Math.min(18, this.viewport.scale * factor));
    this.viewport.offsetX = point.x - before.x * this.viewport.scale;
    this.viewport.offsetY = point.y - before.y * this.viewport.scale;
    this.draw();
  }

  onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.pointFromEvent(event);
    const boardPoint = screenToBoard(point, this.viewport);
    const pan = event.button === 1 || this.tool === "pan" || event.ctrlKey && event.button === 0;
    if (pan) {
      this.pointerState = {
        kind: "pan",
        pointerId: event.pointerId,
        start: point,
        offsetX: this.viewport.offsetX,
        offsetY: this.viewport.offsetY,
      };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    const trayTile = this.hitTrayTile(point);
    const hit = trayTile ?? this.hitBoardTile(point);
    if (this.mode === "play") {
      if (event.button === 0 && hit) {
        this.callbacks.onPlayInteract(hit.uid);
      }
      return;
    }

    if (this.tool === "place" && event.button === 0) {
      this.callbacks.onPlace({
        x: snapValue(boardPoint.x - TILE_SIZE / 2, this.snapStep),
        y: snapValue(boardPoint.y - TILE_SIZE / 2, this.snapStep),
        ...this.placeTemplate,
      });
      return;
    }

    if (this.tool === "fill" && event.button === 0) {
      const cell = {
        x: snapValue(boardPoint.x - TILE_SIZE / 2, 1),
        y: snapValue(boardPoint.y - TILE_SIZE / 2, 1),
      };
      this.pointerState = {
        kind: "fill",
        pointerId: event.pointerId,
        startBoard: cell,
        currentBoard: cell,
      };
      this.draw();
      return;
    }

    if (this.tool === "delete" && event.button === 0 && hit) {
      this.callbacks.onDelete([hit.uid]);
      return;
    }

    if (this.tool === "box" && event.button === 0) {
      this.pointerState = {
        kind: "box",
        pointerId: event.pointerId,
        startBoard: boardPoint,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      };
      this.boxRectangle = { x1: boardPoint.x, y1: boardPoint.y, x2: boardPoint.x, y2: boardPoint.y };
      this.draw();
      return;
    }

    if (event.button === 0) {
      const next = hit
        ? modifySelection(this.selection, hit.uid, event)
        : event.shiftKey || event.altKey
          ? new Set(this.selection)
          : new Set();
      this.callbacks.onSelectionChange(next);
      if (hit && next.has(hit.uid) && !event.altKey) {
        this.pointerState = {
          kind: "drag",
          pointerId: event.pointerId,
          start: point,
          current: point,
        };
      }
    }
  }

  onPointerMove(event) {
    const point = this.pointFromEvent(event);
    const board = screenToBoard(point, this.viewport);
    this.callbacks.onCoordinate({
      x: Math.round(board.x * 10) / 10,
      y: Math.round(board.y * 10) / 10,
    });
    if (!this.pointerState || this.pointerState.pointerId !== event.pointerId) {
      return;
    }
    if (this.pointerState.kind === "pan") {
      this.viewport.offsetX = this.pointerState.offsetX + point.x - this.pointerState.start.x;
      this.viewport.offsetY = this.pointerState.offsetY + point.y - this.pointerState.start.y;
    } else if (this.pointerState.kind === "box") {
      this.boxRectangle.x2 = board.x;
      this.boxRectangle.y2 = board.y;
    } else if (this.pointerState.kind === "drag") {
      this.pointerState.current = point;
    } else if (this.pointerState.kind === "fill") {
      this.pointerState.currentBoard = {
        x: snapValue(board.x - TILE_SIZE / 2, 1),
        y: snapValue(board.y - TILE_SIZE / 2, 1),
      };
    }
    this.draw();
  }

  onPointerUp(event) {
    if (!this.pointerState || this.pointerState.pointerId !== event.pointerId) {
      return;
    }
    const state = this.pointerState;
    if (state.kind === "box" && this.boxRectangle) {
      const uids = boxSelect(this.boardTiles(), this.boxRectangle);
      let next = new Set(state.shiftKey || state.altKey ? this.selection : []);
      if (state.altKey) {
        uids.forEach((uid) => next.delete(uid));
      } else {
        uids.forEach((uid) => next.add(uid));
      }
      this.callbacks.onSelectionChange(next);
    } else if (state.kind === "drag") {
      const delta = dragDelta(state.start, state.current, this.viewport, this.snapStep);
      if (delta.dx || delta.dy) {
        this.callbacks.onMove([...this.selection], delta);
      }
    } else if (state.kind === "fill") {
      this.callbacks.onFill({
        start: state.startBoard,
        end: state.currentBoard,
      });
    }
    this.cancelPointer();
  }

  cancelPointer() {
    this.pointerState = null;
    this.boxRectangle = null;
    this.setTool(this.tool);
    this.draw();
  }

  onContextMenu(event) {
    event.preventDefault();
    if (this.mode !== "play") {
      return;
    }
    const hit = this.hitBoardTile(this.pointFromEvent(event));
    if (hit) {
      this.callbacks.onStash(hit.uid);
    }
  }

  getImage(type) {
    if (!this.blockImageUrl || type === 0 || type === -1) {
      return null;
    }
    if (!this.images.has(type)) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => this.draw();
      image.onerror = () => {
        image.failed = true;
        this.draw();
      };
      image.src = this.blockImageUrl(type);
      this.images.set(type, image);
    }
    const image = this.images.get(type);
    return image.complete && !image.failed && image.naturalWidth ? image : null;
  }

  getGameplayImage(url) {
    if (!this.gameplayImages.has(url)) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => this.draw();
      image.onerror = () => {
        image.failed = true;
        this.draw();
      };
      image.src = url;
      this.gameplayImages.set(url, image);
    }
    const image = this.gameplayImages.get(url);
    return image.complete && !image.failed && image.naturalWidth ? image : null;
  }

  drawFieldGrid(context) {
    if (this.mode !== "edit" || !this.document?.board) {
      return;
    }
    const layout = buildFieldGridLayout(this.document.board);
    const drawLines = (lines, strokeStyle, lineWidth) => {
      context.strokeStyle = strokeStyle;
      context.lineWidth = lineWidth;
      context.beginPath();
      for (const line of lines) {
        const first = boardToScreen({ x: line.x1, y: line.y1 }, this.viewport);
        const second = boardToScreen({ x: line.x2, y: line.y2 }, this.viewport);
        context.moveTo(first.x, first.y);
        context.lineTo(second.x, second.y);
      }
      context.stroke();
    };

    context.save();
    drawLines(layout.centerLines, "rgba(255,255,255,0.5)", 1);
    drawLines(layout.majorLines, "rgba(255,255,255,0.72)", 1);

    const first = boardToScreen(
      { x: layout.bounds.minX, y: layout.bounds.minY },
      this.viewport,
    );
    const second = boardToScreen(
      { x: layout.bounds.maxX, y: layout.bounds.maxY },
      this.viewport,
    );
    context.strokeStyle = "rgba(255,224,51,0.85)";
    context.lineWidth = 2;
    context.strokeRect(first.x, first.y, second.x - first.x, second.y - first.y);

    context.fillStyle = "rgba(255,255,255,0.86)";
    context.font = "11px sans-serif";
    for (const label of layout.labels) {
      const screen = boardToScreen({ x: label.x, y: label.y }, this.viewport);
      context.textAlign = label.axis === "x" ? "center" : "right";
      context.textBaseline = label.axis === "x" ? "top" : "middle";
      context.fillText(String(label.value), screen.x, screen.y);
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const label of layout.axisLabels) {
      const screen = boardToScreen({ x: label.x, y: label.y }, this.viewport);
      context.fillText(label.text, screen.x, screen.y);
    }
    context.restore();
  }

  drawTile(context, tile) {
    const position = boardToScreen(tile, this.viewport);
    const size = TILE_SIZE * this.viewport.scale;
    const artHeight = size * TILE_ART_ASPECT;
    const selected =
      this.mode === "play" ? tile.uid === this.snapshot?.selectedTileUid : this.selection.has(tile.uid);
    const tone = resolveTileVisualTone(tile, { mode: this.mode });
    const patternHidden = Boolean(tile.faceDown || tile.hiddenPattern);
    context.save();
    context.translate(position.x, position.y);
    context.shadowColor = "rgba(0,0,0,.38)";
    context.shadowBlur = Math.min(10, size * 0.14);
    context.shadowOffsetY = Math.min(5, size * 0.08);
    const blockBackground = this.getGameplayImage(GAMEPLAY_ASSETS.blockBackground);
    if (blockBackground) {
      context.drawImage(blockBackground, 0, 0, size, artHeight);
    } else {
      context.fillStyle = "#efffc4";
      context.beginPath();
      context.roundRect(0, 0, size, artHeight, Math.max(3, size * 0.08));
      context.fill();
      context.fillStyle = "#3f7d0a";
      context.fillRect(0, size * 0.91, size, artHeight - size * 0.91);
    }
    context.shadowColor = "transparent";

    if (!patternHidden) {
      const image = this.getImage(tile.type);
      if (image) {
        context.drawImage(image, 0, 0, size, artHeight);
      } else {
        context.fillStyle = tile.type === 0 ? "#f7ca2f" : tile.type === -1 ? "#56cbd2" : "#31531e";
        context.font = `700 ${Math.max(9, size * 0.22)}px ${getComputedStyle(document.body).fontFamily}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(tile.type === 0 ? "R" : tile.type === -1 ? "FR" : tile.type, size / 2, size / 2);
      }
    }

    if (patternHidden) {
      const lockMask = this.getGameplayImage(GAMEPLAY_ASSETS.lockMask);
      if (lockMask) {
        context.globalAlpha = tile.faceDown ? 0.72 : 0.58;
        context.drawImage(lockMask, 0, 0, size, artHeight);
        context.globalAlpha = 1;
      } else {
        context.fillStyle = "rgba(24,35,18,.56)";
        context.fillRect(0, 0, size, artHeight);
      }
    }
    if (tone.blocked) {
      context.fillStyle = `rgba(0,0,0,${tone.overlayAlpha})`;
      context.fillRect(0, 0, size, artHeight);
      context.strokeStyle = `rgba(0,0,0,${tone.innerShadowAlpha})`;
      context.lineWidth = Math.max(2, size * 0.065);
      context.beginPath();
      context.roundRect(
        context.lineWidth / 2,
        context.lineWidth / 2,
        size - context.lineWidth,
        artHeight - context.lineWidth,
        Math.max(3, size * 0.08),
      );
      context.stroke();
      if (
        tone.contactShadowAlpha > 0
        && Array.isArray(tile.occlusionPatches)
      ) {
        context.save();
        context.beginPath();
        context.roundRect(
          0,
          0,
          size,
          artHeight,
          Math.max(3, size * 0.08),
        );
        context.clip();
        for (const patch of tile.occlusionPatches) {
          const patchX = patch.x / TILE_SIZE * size;
          const patchY = patch.y / TILE_SIZE * size;
          const patchWidth = patch.width / TILE_SIZE * size;
          const patchHeight = patch.height / TILE_SIZE * size;
          const magnitude = Math.hypot(patch.dx, patch.dy) || 1;
          const exactStack = patch.dx === 0 && patch.dy === 0;
          const directionX = exactStack ? 0 : patch.dx / magnitude;
          const directionY = exactStack ? -1 : patch.dy / magnitude;
          const centerX = patchX + patchWidth / 2;
          const centerY = patchY + patchHeight / 2;
          const reach = Math.max(patchWidth, patchHeight, size * 0.18) / 2;
          const gradient = context.createLinearGradient(
            centerX - directionX * reach,
            centerY - directionY * reach,
            centerX + directionX * reach,
            centerY + directionY * reach,
          );
          gradient.addColorStop(
            0,
            `rgba(0,0,0,${tone.contactShadowAlpha})`,
          );
          gradient.addColorStop(1, "rgba(0,0,0,0)");
          context.fillStyle = gradient;
          context.fillRect(patchX, patchY, patchWidth, patchHeight);
        }
        context.restore();
      }
    }
    context.strokeStyle = selected ? "#ffd42f" : tile.sideBlocked ? "#f2b45d" : "rgba(40,79,18,.28)";
    context.lineWidth = selected ? Math.max(2, size * 0.055) : 1;
    context.beginPath();
    context.roundRect(0.5, 0.5, size - 1, artHeight - 1, Math.max(3, size * 0.08));
    context.stroke();
    if (this.mode === "edit" && size > 34) {
      context.fillStyle = "rgba(11,16,17,.82)";
      context.fillRect(3, 3, Math.min(28, size * 0.34), Math.min(17, size * 0.2));
      context.fillStyle = "#edf0e9";
      context.font = `600 ${Math.max(8, size * 0.12)}px monospace`;
      context.textAlign = "left";
      context.textBaseline = "top";
      context.fillText(`L${tile.layer}`, 6, 5);
    }
    context.restore();
  }

  drawTray(context) {
    if (this.mode !== "play") {
      return;
    }
    const frame = this.trayFrameLayout();
    const layout = this.trayLayout();
    context.save();
    const frameImage = this.getGameplayImage(GAMEPLAY_ASSETS.playTray);
    if (frameImage) {
      context.drawImage(frameImage, frame.x, frame.y, frame.width, frame.height);
    } else {
      context.fillStyle = "#9b5c1b";
      context.strokeStyle = "#e8a436";
      context.lineWidth = 5;
      context.beginPath();
      context.roundRect(frame.x, frame.y, frame.width, frame.height, 12);
      context.fill();
      context.stroke();
    }
    for (const slot of layout) {
      const uid = this.snapshot?.tray?.[slot.slot];
      if (!uid) {
        context.fillStyle = "rgba(255,226,151,.7)";
        context.font = `800 ${Math.max(16, frame.width * 0.1)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          slot.slot === 1 && !this.snapshot?.secondSlotUnlocked ? "×" : slot.slot === 1 ? "+" : "",
          slot.x + slot.width / 2,
          slot.y + slot.height / 2,
        );
        continue;
      }
      const tile = this.currentTiles().find((item) => item.uid === uid);
      if (!tile) {
        continue;
      }
      context.save();
      const scale = this.viewport.scale;
      const tileSize = Math.min(slot.width * 0.88, (slot.height / TILE_ART_ASPECT) * 0.9);
      this.viewport.scale = tileSize / TILE_SIZE;
      const originalOffset = { x: this.viewport.offsetX, y: this.viewport.offsetY };
      this.viewport.offsetX = slot.x + (slot.width - tileSize) / 2 - tile.x * this.viewport.scale;
      this.viewport.offsetY = slot.y + (slot.height - tileSize * TILE_ART_ASPECT) / 2 - tile.y * this.viewport.scale;
      this.drawTile(context, tile);
      this.viewport.scale = scale;
      this.viewport.offsetX = originalOffset.x;
      this.viewport.offsetY = originalOffset.y;
      context.restore();
    }
    context.fillStyle = "rgba(22,77,52,.84)";
    context.font = "700 11px sans-serif";
    context.textAlign = "center";
    context.fillText("右键可用砖块暂存", this.width / 2, frame.y - 8);
    context.restore();
  }

  drawFillPreview(context) {
    if (this.pointerState?.kind !== "fill" || !this.document?.board) {
      return;
    }
    const cells = buildFillCells(
      this.pointerState.startBoard,
      this.pointerState.currentBoard,
      this.document.board,
    );
    const size = TILE_SIZE * this.viewport.scale;
    const artHeight = size * TILE_ART_ASPECT;
    const firstLayer = Math.max(1, Math.round(Number(this.placeTemplate.fillStartLayer) || 1));
    context.save();
    context.setLineDash([5, 4]);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${Math.max(9, size * 0.16)}px monospace`;
    for (const [index, cell] of cells.entries()) {
      const position = boardToScreen(cell, this.viewport);
      context.fillStyle = "rgba(86,203,210,.26)";
      context.strokeStyle = "#6fd7cf";
      context.lineWidth = 1.5;
      context.fillRect(position.x, position.y, size, artHeight);
      context.strokeRect(position.x, position.y, size, artHeight);
      context.fillStyle = "#efffff";
      context.fillText(`L${firstLayer + index}`, position.x + size / 2, position.y + artHeight / 2);
    }
    context.restore();
  }

  draw() {
    if (!this.context || !this.width || this.destroyed) {
      return;
    }
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.drawFieldGrid(context);
    const tiles = this.boardTiles().sort(
      (left, right) => left.layer - right.layer || left.y - right.y || left.x - right.x,
    );
    for (const tile of tiles) {
      this.drawTile(context, tile);
    }
    this.drawFillPreview(context);
    this.drawTray(context);
    if (this.boxRectangle) {
      const first = boardToScreen(
        { x: this.boxRectangle.x1, y: this.boxRectangle.y1 },
        this.viewport,
      );
      const second = boardToScreen(
        { x: this.boxRectangle.x2, y: this.boxRectangle.y2 },
        this.viewport,
      );
      context.save();
      context.fillStyle = "rgba(111,215,207,.1)";
      context.strokeStyle = "#6fd7cf";
      context.setLineDash([5, 4]);
      context.fillRect(first.x, first.y, second.x - first.x, second.y - first.y);
      context.strokeRect(first.x, first.y, second.x - first.x, second.y - first.y);
      context.restore();
    }
  }

  destroy() {
    this.destroyed = true;
    this.abortController?.abort();
    this.resizeObserver?.disconnect();
    this.canvas?.remove();
    this.images.clear();
    this.gameplayImages.clear();
  }
}
