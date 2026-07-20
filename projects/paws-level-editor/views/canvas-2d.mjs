import {
  boardToScreen,
  boxSelect,
  dragDelta,
  modifySelection,
  screenToBoard,
  snapValue,
  topmostHit,
} from "../ui/editor-tools.mjs";
import { containImageRect } from "../core/view-model.mjs";

const TILE_SIZE = 8;

export class Canvas2DView {
  constructor({
    blockImageUrl,
    onSelectionChange = () => {},
    onMove = () => {},
    onPlace = () => {},
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
    this.snapStep = 8;
    this.placeTemplate = { type: 1, layer: 1, presetColorType: 1 };
    this.viewport = { scale: 5, offsetX: 60, offsetY: 60 };
    this.images = new Map();
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
        tool === "pan" ? "grab" : tool === "place" ? "crosshair" : tool === "delete" ? "not-allowed" : "default";
    }
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
      : this.document?.tiles ?? [];
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
    const availableHeight = Math.max(120, this.height - (this.mode === "play" ? 120 : 50));
    this.viewport.scale = Math.max(
      0.5,
      Math.min(11, Math.min((this.width - 80) / boardWidth, (availableHeight - 60) / boardHeight)),
    );
    this.viewport.offsetX =
      this.width / 2 - ((minX + maxX) / 2) * this.viewport.scale;
    this.viewport.offsetY =
      availableHeight / 2 - ((minY + maxY) / 2) * this.viewport.scale + 20;
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

  trayLayout() {
    const slotSize = Math.min(70, Math.max(48, this.width / 10));
    const gap = 12;
    const total = slotSize * 2 + gap;
    const left = (this.width - total) / 2;
    const top = this.height - slotSize - 18;
    return [0, 1].map((slot) => ({
      slot,
      x: left + slot * (slotSize + gap),
      y: top,
      width: slotSize,
      height: slotSize,
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

  drawGrid(context) {
    if (this.mode !== "edit") {
      return;
    }
    const scale = this.viewport.scale;
    const step = scale < 1.2 ? 8 : scale < 3 ? 4 : 1;
    const left = screenToBoard({ x: 0, y: 0 }, this.viewport);
    const right = screenToBoard({ x: this.width, y: this.height }, this.viewport);
    context.save();
    context.lineWidth = 1;
    for (let x = Math.floor(left.x / step) * step; x <= right.x; x += step) {
      const screen = boardToScreen({ x, y: 0 }, this.viewport);
      context.strokeStyle = x % 8 === 0 ? "rgba(143,163,158,.16)" : "rgba(143,163,158,.06)";
      context.beginPath();
      context.moveTo(Math.round(screen.x) + 0.5, 0);
      context.lineTo(Math.round(screen.x) + 0.5, this.height);
      context.stroke();
    }
    for (let y = Math.floor(left.y / step) * step; y <= right.y; y += step) {
      const screen = boardToScreen({ x: 0, y }, this.viewport);
      context.strokeStyle = y % 8 === 0 ? "rgba(143,163,158,.16)" : "rgba(143,163,158,.06)";
      context.beginPath();
      context.moveTo(0, Math.round(screen.y) + 0.5);
      context.lineTo(this.width, Math.round(screen.y) + 0.5);
      context.stroke();
    }
    context.restore();
  }

  drawTile(context, tile) {
    const position = boardToScreen(tile, this.viewport);
    const size = TILE_SIZE * this.viewport.scale;
    const selected =
      this.mode === "play" ? tile.uid === this.snapshot?.selectedTileUid : this.selection.has(tile.uid);
    context.save();
    context.translate(position.x, position.y);
    context.shadowColor = "rgba(0,0,0,.38)";
    context.shadowBlur = Math.min(10, size * 0.14);
    context.shadowOffsetY = Math.min(5, size * 0.08);
    context.fillStyle = tile.faceDown ? "#263033" : "#e7e4d6";
    context.beginPath();
    context.roundRect(0, 0, size, size, Math.max(3, size * 0.08));
    context.fill();
    context.shadowColor = "transparent";

    if (!tile.faceDown) {
      const image = this.getImage(tile.type);
      if (image) {
        const imageRect = containImageRect({
          sourceWidth: image.naturalWidth,
          sourceHeight: image.naturalHeight,
          targetX: size * 0.07,
          targetY: size * 0.07,
          targetWidth: size * 0.86,
          targetHeight: size * 0.86,
        });
        context.drawImage(image, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
      } else {
        context.fillStyle = tile.type < 1 ? "#1d2728" : "#343e3f";
        context.fillRect(size * 0.12, size * 0.12, size * 0.76, size * 0.76);
        context.fillStyle = tile.type === 0 ? "#d5f06a" : tile.type === -1 ? "#6fd7cf" : "#eef0e9";
        context.font = `700 ${Math.max(9, size * 0.22)}px ${getComputedStyle(document.body).fontFamily}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(tile.type === 0 ? "R" : tile.type === -1 ? "FR" : tile.type, size / 2, size / 2);
      }
    } else {
      context.strokeStyle = "rgba(213,240,106,.35)";
      context.lineWidth = Math.max(1, size * 0.035);
      context.strokeRect(size * 0.22, size * 0.22, size * 0.56, size * 0.56);
      context.fillStyle = "#d5f06a";
      context.beginPath();
      context.arc(size / 2, size / 2, Math.max(2, size * 0.07), 0, Math.PI * 2);
      context.fill();
    }

    if (tile.covered || tile.sideBlocked) {
      context.fillStyle = tile.sideBlocked ? "rgba(242,180,93,.38)" : "rgba(7,12,13,.52)";
      context.fillRect(0, 0, size, size);
    }
    context.strokeStyle = selected ? "#d5f06a" : tile.sideBlocked ? "#f2b45d" : "rgba(255,255,255,.2)";
    context.lineWidth = selected ? Math.max(2, size * 0.055) : 1;
    context.strokeRect(0.5, 0.5, size - 1, size - 1);
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
    const layout = this.trayLayout();
    context.save();
    for (const slot of layout) {
      context.fillStyle = "rgba(9,14,15,.82)";
      context.strokeStyle =
        slot.slot === 1 && !this.snapshot?.secondSlotUnlocked
          ? "rgba(242,180,93,.45)"
          : "rgba(143,163,158,.32)";
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(slot.x, slot.y, slot.width, slot.height, 9);
      context.fill();
      context.stroke();
      const uid = this.snapshot?.tray?.[slot.slot];
      if (!uid) {
        context.fillStyle = "#65716f";
        context.font = "10px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          slot.slot === 1 && !this.snapshot?.secondSlotUnlocked ? "LOCK" : `SLOT ${slot.slot + 1}`,
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
      this.viewport.scale = slot.width / TILE_SIZE;
      const originalOffset = { x: this.viewport.offsetX, y: this.viewport.offsetY };
      this.viewport.offsetX = slot.x - tile.x * this.viewport.scale;
      this.viewport.offsetY = slot.y - tile.y * this.viewport.scale;
      this.drawTile(context, tile);
      this.viewport.scale = scale;
      this.viewport.offsetX = originalOffset.x;
      this.viewport.offsetY = originalOffset.y;
      context.restore();
    }
    context.fillStyle = "#909b98";
    context.font = "10px sans-serif";
    context.textAlign = "center";
    context.fillText("右键牌面可暂存", this.width / 2, layout[0].y - 8);
    context.restore();
  }

  draw() {
    if (!this.context || !this.width || this.destroyed) {
      return;
    }
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.drawGrid(context);
    const tiles = this.boardTiles().sort(
      (left, right) => left.layer - right.layer || left.y - right.y || left.x - right.x,
    );
    for (const tile of tiles) {
      this.drawTile(context, tile);
    }
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
  }
}
