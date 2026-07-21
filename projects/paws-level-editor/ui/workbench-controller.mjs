import { createApiClient, isValidLevelFileName } from "../static-api-client.mjs";
import { EditHistory, createAddTilesCommand, createDeleteTilesCommand, createMoveTilesCommand, createPatchTilesCommand } from "../core/edit-history.mjs";
import { parseLevelDocument, serializeLevelDocument } from "../core/level-adapter.mjs";
import { validateLevel } from "../core/level-validator.mjs";
import { createPlaySession } from "../core/play-engine.mjs";
import { generateAiLevel } from "../core/ai-level-generator.mjs";
import { scoreLevelDifficulty } from "../core/level-difficulty.mjs";
import { solveLevel } from "../core/level-solver.mjs";
import { InspectorPanel } from "./inspector.mjs";
import { formatLevelId, formatLevelModifiedAt } from "./level-summary.mjs";
import { Canvas2DView } from "../views/canvas-2d.mjs";
import { Three3DView } from "../views/three-3d.mjs";
import {
  activateImportedLevel,
  chooseImportedFileName,
  prepareImportedLevel,
} from "./local-level-import.mjs";
import {
  describeGenerationOptions,
  getDifficultyDefaults,
  normalizeGenerationOptions,
} from "./ai-level-dialog.mjs";

function setPressed(button, active) {
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
}

function setNested(target, path, value) {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function getNested(target, path) {
  return path.split(".").reduce((value, key) => value[key], target);
}

function nextSeed() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return random[0] | 0;
}

export class WorkbenchController {
  constructor(root = document.querySelector("#app"), { api = createApiClient() } = {}) {
    this.root = root;
    this.api = api;
    this.levels = [];
    this.defaultFileName = "";
    this.document = null;
    this.history = null;
    this.selection = new Set();
    this.issues = [];
    this.mode = "edit";
    this.view = "2d";
    this.tool = "select";
    this.snapStep = 8;
    this.placement = { type: 1, layer: 1, presetColorType: 1 };
    this.playSession = null;
    this.playSnapshot = null;
    this.seed = nextSeed();
    this.seedLocked = false;
    this.renderer = null;
    this.toastTimer = null;
    this.uidCounter = 0;
    this.aiGenerationPending = false;
    this.lastAiGeneration = null;
    this.currentDifficulty = null;
    this.readonly = matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    if (this.readonly) {
      this.mode = "play";
    }
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    this.inspector = new InspectorPanel({
      onDocumentPatch: (path, value) => this.patchDocument(path, value),
      onTilePatch: (patch) => this.patchSelectedTiles(patch),
      onPlacementPatch: (patch) => this.patchPlacement(patch),
      onSnapStep: (step) => this.setSnapStep(step),
      onSelectionChange: (selection) => this.setSelection(selection),
      onValidate: () => this.validate(),
      onSave: () => this.save(),
      onSaveAs: () => this.promptSaveAs(),
      onRestart: () => this.restartPlay(),
      onRerandomize: () => this.rerandomize(),
    }).mount(this.elements.inspector);
    this.updateUI();
    await this.connect();
  }

  cacheElements() {
    const byId = (id) => this.root.querySelector(`#${id}`);
    this.elements = {
      connection: byId("connection-state"),
      levelList: byId("level-list"),
      levelSearch: byId("level-search"),
      levelCount: byId("level-count"),
      refresh: byId("refresh-levels"),
      resetLevel: byId("reset-level"),
      newLevel: byId("new-level"),
      importLevel: byId("import-level"),
      importLevelInput: byId("import-level-input"),
      generateAi: byId("generate-ai-level"),
      aiLevelDialog: byId("ai-level-dialog"),
      aiLevelForm: byId("ai-level-form"),
      aiLevelHint: byId("ai-level-hint"),
      aiLevelError: byId("ai-level-error"),
      aiCurrentReference: byId("ai-reference-current"),
      aiTileCount: byId("ai-tile-count"),
      aiLayerCount: byId("ai-layer-count"),
      aiTargetScore: byId("ai-target-score"),
      confirmAiLevel: byId("confirm-ai-level"),
      modeEdit: byId("mode-edit"),
      modePlay: byId("mode-play"),
      view2d: byId("view-2d"),
      view3d: byId("view-3d"),
      canvasHost: byId("canvas-host"),
      emptyStage: byId("empty-stage"),
      toast: byId("stage-toast"),
      inspector: byId("inspector"),
      dirty: byId("dirty-indicator"),
      undo: byId("undo"),
      redo: byId("redo"),
      fit: byId("fit-view"),
      fitPlay: byId("fit-play-view"),
      gameplayFit: byId("gameplay-fit"),
      gameplayLevelTitle: byId("gameplay-level-title"),
      restart: byId("restart-play"),
      rerandomize: byId("rerandomize"),
      lockSeed: byId("lock-seed"),
      statusLevel: byId("status-level"),
      statusTiles: byId("status-tiles"),
      statusLayers: byId("status-layers"),
      statusDifficulty: byId("status-difficulty"),
      statusCoordinates: byId("status-coordinates"),
      statusSeed: byId("status-seed"),
      validationSummary: byId("validation-summary"),
      conflictDialog: byId("conflict-dialog"),
      saveAsDialog: byId("save-as-dialog"),
      saveAsForm: byId("save-as-form"),
      saveAsName: byId("save-as-name"),
      saveAsError: byId("save-as-error"),
      libraryPanel: byId("library-panel"),
      inspectorPanel: byId("inspector-panel"),
      toggleLibrary: byId("toggle-library"),
      toggleInspector: byId("toggle-inspector"),
    };
  }

  bindEvents() {
    this.elements.refresh.addEventListener("click", () => this.refreshLevels());
    this.elements.resetLevel.addEventListener("click", () => this.resetCurrentLevel());
    this.elements.newLevel.addEventListener("click", () => this.createNewLevel());
    this.elements.importLevel.addEventListener("click", () => this.requestLocalImport());
    this.elements.importLevelInput.addEventListener("change", () =>
      this.importLocalLevel(this.elements.importLevelInput.files?.[0]),
    );
    this.elements.generateAi.addEventListener("click", () =>
      this.requestAiGeneration());
    this.elements.aiLevelForm.addEventListener("submit", (event) =>
      this.submitAiGeneration(event));
    this.elements.aiLevelForm.querySelectorAll("input[type=radio]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.name === "ai-difficulty") {
          this.applyAiDifficultyDefaults(input.value);
          return;
        }
        this.updateAiGenerationHint();
      });
    });
    [
      this.elements.aiTileCount,
      this.elements.aiLayerCount,
      this.elements.aiTargetScore,
    ].forEach((input) => {
      input.addEventListener("input", () => this.updateAiGenerationHint());
    });
    this.elements.levelSearch.addEventListener("input", () => this.renderLevelList());
    this.elements.modeEdit.addEventListener("click", () => this.switchMode("edit"));
    this.elements.modePlay.addEventListener("click", () => this.switchMode("play"));
    this.elements.view2d.addEventListener("click", () => this.switchView("2d"));
    this.elements.view3d.addEventListener("click", () => this.switchView("3d"));
    this.root.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => this.setTool(button.dataset.tool));
    });
    this.elements.undo.addEventListener("click", () => this.undo());
    this.elements.redo.addEventListener("click", () => this.redo());
    this.elements.fit.addEventListener("click", () => this.renderer?.fitCamera());
    this.elements.fitPlay.addEventListener("click", () => this.renderer?.fitCamera());
    this.elements.gameplayFit.addEventListener("click", () => this.renderer?.fitCamera());
    this.elements.restart.addEventListener("click", () => this.restartPlay());
    this.elements.rerandomize.addEventListener("click", () => this.rerandomize());
    this.elements.lockSeed.addEventListener("change", () => {
      this.seedLocked = this.elements.lockSeed.checked;
    });
    this.elements.toggleLibrary.addEventListener("click", () => {
      this.elements.libraryPanel.classList.toggle("is-open");
      this.elements.inspectorPanel.classList.remove("is-open");
    });
    this.elements.toggleInspector.addEventListener("click", () => {
      this.elements.inspectorPanel.classList.toggle("is-open");
      this.elements.libraryPanel.classList.remove("is-open");
    });
    this.elements.saveAsForm.addEventListener("submit", (event) => this.submitSaveAs(event));
    this.elements.saveAsDialog.addEventListener("close", () => {
      if (this.saveAsResolver) {
        this.saveAsResolver(
          this.elements.saveAsDialog.returnValue === "success"
            ? this.elements.saveAsName.value
            : null,
        );
        this.saveAsResolver = null;
      }
    });
    this.root.querySelector("#conflict-reload").addEventListener("click", () => {
      const fileName = this.document?.fileName;
      if (fileName) {
        this.openLevel(fileName, { discardDirty: true });
      }
    });
    this.root.querySelector("#conflict-save-as").addEventListener("click", () => this.promptSaveAs());
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("beforeunload", (event) => {
      if (this.isDirty()) {
        event.preventDefault();
      }
    });
  }

  async connect() {
    this.setConnection("connecting", "正在连接关卡服务");
    try {
      const health = await this.api.health();
      if (!health.online) {
        this.setConnection("error", health.directoryError || "关卡目录不可读");
        return;
      }
      this.setConnection("online", "关卡库在线 · 编辑只保存到当前浏览器");
      await this.refreshLevels();
    } catch (error) {
      this.setConnection("error", error.message);
      this.showToast(error.message, "error");
    }
  }

  setConnection(state, text) {
    this.elements.connection.className = `connection-state is-${state}`;
    this.elements.connection.querySelector("span:last-child").textContent = text;
  }

  async refreshLevels() {
    this.elements.levelList.innerHTML = `<div class="loading-card"><span class="loader"></span><p>正在读取工程关卡…</p></div>`;
    try {
      const catalog = await this.api.listLevelCatalog();
      this.levels = catalog.levels;
      this.defaultFileName = catalog.defaultFileName;
      this.renderLevelList();
      this.setConnection("online", "关卡库在线 · 编辑只保存到当前浏览器");
      if (this.levels.length && !this.document) {
        const level = this.levels.find(
          ({ fileName }) => fileName === this.defaultFileName,
        ) ?? this.levels[0];
        await this.openLevel(level.fileName, {
          recoverable: level.recoverable,
        });
      }
    } catch (error) {
      this.elements.levelList.innerHTML = `<div class="list-empty"><p>${error.message}</p></div>`;
      this.setConnection("error", error.message);
    }
  }

  renderLevelList() {
    const query = this.elements.levelSearch.value.trim().toLowerCase();
    const visible = this.levels.filter((level) =>
      [level.id, level.name, level.fileName].some((value) =>
        String(value ?? "").toLowerCase().includes(query),
      ),
    );
    this.elements.levelCount.textContent = String(this.levels.length);
    this.elements.levelList.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "list-empty";
      empty.innerHTML = "<p>没有匹配的关卡。</p>";
      this.elements.levelList.append(empty);
      return;
    }
    for (const level of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `level-card${level.fileName === this.document?.fileName ? " is-active" : ""}${level.broken ? " is-broken" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(level.fileName === this.document?.fileName));
      const head = document.createElement("div");
      head.className = "level-card-head";
      const name = document.createElement("strong");
      name.textContent = level.name;
      const id = document.createElement("span");
      id.className = "level-id";
      id.textContent = formatLevelId(level);
      head.append(name, id);
      const file = document.createElement("p");
      file.className = "level-file";
      file.textContent = level.fileName;
      const meta = document.createElement("div");
      meta.className = "level-card-meta";
      const count = document.createElement("span");
      count.textContent = level.tileCount === null ? "— tiles" : `${level.tileCount} tiles`;
      const date = document.createElement("span");
      date.textContent = formatLevelModifiedAt(level.modifiedAt);
      meta.append(count, date);
      button.append(head, file, meta);
      button.addEventListener("click", () =>
        this.openLevel(level.fileName, { recoverable: level.recoverable }));
      this.elements.levelList.append(button);
    }
  }

  async openLevel(
    fileName,
    { discardDirty = false, recoverable = false, recoveryAttempted = false } = {},
  ) {
    if (!discardDirty && this.isDirty() && !confirm("当前关卡有未保存修改，确定打开其他关卡吗？")) {
      return;
    }
    if (recoverable) {
      if (!confirm("浏览器保存已损坏，是否清除并恢复内置示例？")) {
        return;
      }
      try {
        await this.api.resetLevel(fileName);
      } catch (error) {
        this.showToast(error.message, "error");
        return;
      }
    }
    this.showToast(`正在打开 ${fileName}…`);
    try {
      const response = await this.api.loadLevel(fileName);
      this.document = parseLevelDocument(response.value, {
        fileName,
        version: response.version,
      });
      this.document.bundled = response.bundled === true;
      this.currentDifficulty = scoreLevelDifficulty(this.document, {
        maxNodes: 5000,
      });
      this.history = new EditHistory(this.document);
      this.history.markSaved();
      this.selection = new Set();
      this.validate(false);
      this.seed = nextSeed();
      this.playSession = null;
      this.playSnapshot = null;
      if (this.mode === "play") {
        this.startPlay();
      } else {
        this.mountRenderer(true);
      }
      this.elements.emptyStage.hidden = true;
      this.renderLevelList();
      this.updateUI();
      if (this.document.warnings.length) {
        this.showToast(this.document.warnings.map((warning) => warning.message).join(" "), "error");
      } else {
        this.showToast(`已打开 ${this.document.name || fileName}`);
      }
      this.elements.libraryPanel.classList.remove("is-open");
    } catch (error) {
      if (error.code === "invalid-local-record" && !recoveryAttempted) {
        if (confirm("浏览器保存已损坏，是否清除并恢复内置示例？")) {
          try {
            await this.api.resetLevel(fileName);
            return this.openLevel(fileName, {
              discardDirty: true,
              recoveryAttempted: true,
            });
          } catch (resetError) {
            this.showToast(resetError.message, "error");
            return;
          }
        }
      }
      this.showToast(error.message, "error");
    }
  }

  async resetCurrentLevel() {
    const { document } = this;
    if (!document?.bundled) {
      return;
    }
    if (!confirm("确定清除当前浏览器保存并恢复内置示例吗？")) {
      return;
    }
    const fileName = document.fileName;
    try {
      await this.api.resetLevel(document.fileName);
      await this.openLevel(fileName, { discardDirty: true });
      this.showToast("已恢复内置示例");
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  requestLocalImport() {
    if (this.readonly) return;
    if (this.isDirty() && !confirm("当前关卡有未保存修改，确定导入本地关卡吗？")) return;
    this.elements.importLevelInput.value = "";
    this.elements.importLevelInput.click();
  }

  async importLocalLevel(file) {
    if (this.readonly || !file) return;
    try {
      const { fileName, value } = await prepareImportedLevel(file, {
        occupiedFileNames: this.levels.map((level) => level.fileName),
      });
      await this.api.saveLevel({
        fileName,
        value,
        expectedVersion: "",
        saveAs: true,
      });
      await activateImportedLevel(fileName, {
        refreshLevels: () => this.refreshLevels(),
        getLevels: () => this.levels,
        openLevel: () => this.openLevel(fileName, { discardDirty: true }),
        getDocument: () => this.document,
      });
      this.showToast(`已导入 ${fileName}，仅保存在当前浏览器。`);
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.elements.importLevelInput.value = "";
    }
  }

  requestAiGeneration() {
    if (this.readonly || this.aiGenerationPending) {
      return;
    }
    if (this.isDirty() && !confirm("当前关卡有未保存修改，确定生成并打开其他关卡吗？")) {
      return;
    }
    this.elements.aiLevelError.textContent = "";
    this.elements.aiCurrentReference.disabled = !this.document;
    if (!this.document && this.elements.aiCurrentReference.checked) {
      this.elements.aiLevelForm.querySelector(
        'input[name="ai-reference"][value="all"]',
      ).checked = true;
    }
    this.updateAiGenerationHint();
    this.elements.aiLevelDialog.showModal();
  }

  updateAiGenerationHint() {
    try {
      const options = normalizeGenerationOptions(
        new FormData(this.elements.aiLevelForm),
      );
      this.elements.aiLevelHint.textContent = describeGenerationOptions(options);
      this.elements.aiLevelError.textContent = "";
    } catch (error) {
      this.elements.aiLevelError.textContent = error.message;
    }
  }

  applyAiDifficultyDefaults(difficulty) {
    try {
      const defaults = getDifficultyDefaults(difficulty);
      this.elements.aiTileCount.value = String(defaults.tileCount);
      this.elements.aiLayerCount.value = String(defaults.layerCount);
      this.elements.aiTargetScore.value = String(defaults.targetScore);
      this.updateAiGenerationHint();
    } catch (error) {
      this.elements.aiLevelError.textContent = error.message;
    }
  }

  async submitAiGeneration(event) {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      this.elements.aiLevelDialog.close("cancel");
      return;
    }
    let options;
    try {
      options = normalizeGenerationOptions(
        new FormData(this.elements.aiLevelForm),
      );
    } catch (error) {
      this.elements.aiLevelError.textContent = error.message;
      return;
    }
    if (await this.generateAiLevelFromDialog(options)) {
      this.elements.aiLevelDialog.close("generated");
    }
  }

  async loadAiReferenceDocuments() {
    const levels = this.levels.filter(({ bundled }) => bundled);
    const settled = await Promise.allSettled(levels.map(async ({ fileName }) => {
      const response = await this.api.loadLevel(fileName);
      return parseLevelDocument(response.value, {
        fileName,
        version: response.version,
      });
    }));
    const references = settled
      .filter(({ status }) => status === "fulfilled")
      .map(({ value }) => value);
    if (!references.length) {
      throw new Error("没有可用于学习的参考关卡。");
    }
    return references;
  }

  async generateAiLevelFromDialog(options) {
    if (this.readonly || this.aiGenerationPending) {
      return false;
    }
    this.aiGenerationPending = true;
    this.elements.aiLevelError.textContent = "";
    this.updateUI();
    try {
      const references = options.reference === "current"
        ? [this.document].filter(Boolean)
        : await this.loadAiReferenceDocuments();
      if (!references.length) {
        throw new Error("没有可用于学习的参考关卡。");
      }
      const requestedSeed = nextSeed();
      const generated = generateAiLevel({
        references,
        difficulty: options.difficulty,
        layout: options.layout,
        tileCount: options.tileCount,
        layerCount: options.layerCount,
        targetScore: options.targetScore,
        seed: requestedSeed,
      });
      generated.document.designerNote.aiGeneration.options.reference =
        options.reference;
      const unsignedSeed = generated.seed >>> 0;
      const fileName = chooseImportedFileName(
        `ai_level_${unsignedSeed}.json`,
        this.levels.map((level) => level.fileName),
      );
      await this.api.saveLevel({
        fileName,
        value: serializeLevelDocument(generated.document),
        expectedVersion: "",
        saveAs: true,
      });
      await activateImportedLevel(fileName, {
        refreshLevels: () => this.refreshLevels(),
        getLevels: () => this.levels,
        openLevel: () => this.openLevel(fileName, { discardDirty: true }),
        getDocument: () => this.document,
      });
      const reopenedReport = solveLevel(this.document);
      if (!reopenedReport.solvable) {
        throw new Error("生成关卡重新打开后未通过可解性校验。");
      }
      this.lastAiGeneration = {
        fileName,
        seed: unsignedSeed,
        attempts: generated.attempts,
        options: structuredClone(options),
        report: structuredClone({
          ...generated.report,
          ...reopenedReport,
          statistics: generated.report.statistics,
        }),
      };
      const difficulty = generated.report.difficulty;
      const statistics = generated.report.statistics;
      this.showToast(
        `已生成 ${statistics.tileCount} 张 / ${statistics.effectiveLayerCount} 层，`
        + `难度 ${difficulty.score}（${difficulty.rating.label}），可解。`,
      );
      return true;
    } catch (error) {
      this.elements.aiLevelError.textContent = error.message;
      this.showToast(error.message, "error");
      return false;
    } finally {
      this.aiGenerationPending = false;
      this.updateUI();
    }
  }

  createNewLevel() {
    if (this.readonly) {
      return;
    }
    if (this.isDirty() && !confirm("当前关卡有未保存修改，确定新建关卡吗？")) {
      return;
    }
    const note = {
      widthNum: 8,
      heightNum: 10,
      boardScale: 1,
      blockTypeCount: 32,
      fullRandomTypeMin: 1,
      fullRandomTypeMax: 32,
      levelData: {},
    };
    this.document = parseLevelDocument({
      id: 0,
      name: "新关卡",
      difficulty: "Normal",
      gridUnit: "sheep_8x10_mini8",
      designerNote: JSON.stringify(note),
      features: {},
      tiles: [],
    });
    this.currentDifficulty = scoreLevelDifficulty(this.document, {
      maxNodes: 5000,
    });
    this.history = new EditHistory(this.document);
    this.history.markSaved();
    this.selection = new Set();
    this.issues = validateLevel(this.document);
    this.elements.emptyStage.hidden = true;
    this.switchMode("edit");
    this.mountRenderer(true);
    this.updateUI();
    this.showToast("已创建内存关卡，使用“另存为”保存在当前浏览器。");
  }

  isDirty() {
    return Boolean(this.document && (!this.document.fileName || this.history?.dirty));
  }

  validate(showToast = true) {
    this.issues = this.document ? validateLevel(this.document) : [];
    if (showToast && this.document) {
      this.currentDifficulty = scoreLevelDifficulty(this.document, {
        maxNodes: 5000,
      });
    }
    this.updateUI();
    if (showToast && this.document) {
      this.showToast(
        this.issues.length ? `发现 ${this.issues.length} 项问题，请查看右侧校验列表。` : "关卡通过规则校验。",
        this.issues.length ? "error" : "normal",
      );
    }
    return this.issues;
  }

  execute(command) {
    if (this.readonly || !this.history) {
      return;
    }
    this.history.execute(command);
    this.currentDifficulty = null;
    this.validate(false);
    this.refreshRenderer();
    this.updateUI();
  }

  patchDocument(path, value) {
    if (!this.document || this.readonly) {
      return;
    }
    const before = structuredClone(getNested(this.document, path));
    this.execute({
      label: `修改 ${path}`,
      apply: (target) => setNested(target, path, structuredClone(value)),
      revert: (target) => setNested(target, path, structuredClone(before)),
    });
  }

  patchSelectedTiles(patch) {
    if (!this.selection.size) {
      return;
    }
    this.execute(createPatchTilesCommand([...this.selection], patch));
  }

  patchPlacement(patch) {
    Object.assign(this.placement, patch);
    this.renderer?.setPlaceTemplate?.(this.placement);
    this.updateUI();
  }

  setSnapStep(step) {
    this.snapStep = step;
    this.renderer?.setSnapStep?.(step);
    this.updateUI();
  }

  placeTile(tile) {
    const uid = `tile-web-${Date.now()}-${++this.uidCounter}`;
    this.execute(
      createAddTilesCommand([
        {
          uid,
          x: tile.x,
          y: tile.y,
          layer: tile.layer,
          type: tile.type,
          moldType: 1,
          metaType: 0,
          metaData: 0,
          presetColorType: tile.presetColorType,
        },
      ]),
    );
    this.setSelection(new Set([uid]));
  }

  moveTiles(tileUids, { dx, dy }) {
    if (tileUids.length && (dx || dy)) {
      this.execute(createMoveTilesCommand(tileUids, dx, dy, 0));
    }
  }

  deleteTiles(tileUids) {
    const targets = tileUids.length ? tileUids : [...this.selection];
    if (!targets.length) {
      return;
    }
    this.execute(createDeleteTilesCommand(targets));
    this.setSelection(new Set([...this.selection].filter((uid) => !targets.includes(uid))));
  }

  setSelection(selection) {
    this.selection = new Set(selection);
    this.renderer?.setSelection?.(this.selection);
    this.updateUI();
  }

  undo() {
    if (this.mode !== "edit" || !this.history?.undo()) {
      return;
    }
    this.selection = new Set(
      [...this.selection].filter((uid) => this.document.tiles.some((tile) => tile.uid === uid)),
    );
    this.validate(false);
    this.refreshRenderer();
    this.updateUI();
  }

  redo() {
    if (this.mode !== "edit" || !this.history?.redo()) {
      return;
    }
    this.validate(false);
    this.refreshRenderer();
    this.updateUI();
  }

  setTool(tool) {
    if (this.readonly || this.mode !== "edit") {
      return;
    }
    if (this.view === "3d" && ["place", "box", "pan"].includes(tool)) {
      this.showToast("3D 编辑检查支持点选、删除和属性修改；放置与拖动请切换到 2D。");
      return;
    }
    this.tool = tool;
    this.renderer?.setTool?.(tool);
    this.updateUI();
  }

  switchMode(mode) {
    if (mode === "edit" && this.readonly) {
      return;
    }
    if (mode === this.mode && (mode !== "play" || this.playSession)) {
      return;
    }
    this.mode = mode;
    this.root.dataset.mode = mode;
    if (!this.document) {
      this.updateUI();
      return;
    }
    if (mode === "play") {
      this.startPlay();
    } else {
      this.playSession = null;
      this.playSnapshot = null;
      this.mountRenderer(true);
      this.showToast("已返回编辑状态，试玩修改未写入关卡。");
    }
    this.updateUI();
  }

  startPlay() {
    try {
      this.playSession = createPlaySession(this.document, this.seed, {
        secondSlotUnlocked: true,
      });
      this.playSnapshot = this.playSession.getSnapshot();
      this.mountRenderer(true);
      this.showToast("试玩已开始。左键配对，右键可把可用牌暂存。");
    } catch (error) {
      this.mode = "edit";
      this.root.dataset.mode = "edit";
      this.showToast(`无法开始试玩：${error.message}`, "error");
      this.mountRenderer(true);
    }
  }

  switchView(view) {
    if (view === this.view) {
      return;
    }
    this.view = view;
    this.root.dataset.view = view;
    if (view === "3d" && ["place", "box", "pan"].includes(this.tool)) {
      this.tool = "select";
    }
    if (this.document) {
      this.mountRenderer(true);
      this.showToast(`已切换到 ${view.toUpperCase()}，当前${this.mode === "play" ? "试玩" : "编辑"}状态保持不变。`);
    }
    this.updateUI();
  }

  mountRenderer(fit = false) {
    this.renderer?.destroy();
    this.renderer = null;
    if (!this.document) {
      return;
    }
    const callbacks = {
      blockImageUrl: (type) => this.api.blockImageUrl(type),
      onSelectionChange: (selection) => this.setSelection(selection),
      onMove: (uids, delta) => this.moveTiles(uids, delta),
      onPlace: (tile) => this.placeTile(tile),
      onDelete: (uids) => this.deleteTiles(uids),
      onPlayInteract: (uid) => this.interactPlay(uid),
      onStash: (uid) => this.stashTile(uid),
      onCoordinate: ({ x, y }) => {
        this.elements.statusCoordinates.textContent = `${x}, ${y}`;
      },
    };
    this.renderer =
      this.view === "2d" ? new Canvas2DView(callbacks) : new Three3DView(callbacks);
    this.renderer.mount(this.elements.canvasHost);
    this.renderer.setMode(this.mode);
    this.renderer.setSelection(this.selection);
    this.renderer.setSnapStep?.(this.snapStep);
    this.renderer.setPlaceTemplate?.(this.placement);
    this.renderer.setTool?.(this.tool);
    if (this.mode === "play") {
      this.renderer.setPlaySnapshot(this.playSnapshot);
    } else {
      this.renderer.setDocument(this.document);
    }
    if (fit) {
      requestAnimationFrame(() => this.renderer?.fitCamera());
    }
  }

  refreshRenderer() {
    if (!this.renderer) {
      return;
    }
    if (this.mode === "play") {
      this.renderer.setPlaySnapshot(this.playSnapshot);
    } else {
      this.renderer.setDocument(this.document);
      this.renderer.setSelection(this.selection);
    }
  }

  interactPlay(uid) {
    if (!this.playSession) {
      return;
    }
    const events = this.playSession.interact(uid);
    this.playSnapshot = this.playSession.getSnapshot();
    this.refreshRenderer();
    this.presentPlayEvents(events);
    this.updateUI();
  }

  stashTile(uid) {
    if (!this.playSession || !this.playSnapshot) {
      return;
    }
    const slot = this.playSnapshot.tray.findIndex(
      (value, index) => !value && (index === 0 || this.playSnapshot.secondSlotUnlocked),
    );
    if (slot < 0) {
      this.showToast("暂存槽已满。", "error");
      return;
    }
    const events = this.playSession.stash(uid, slot);
    this.playSnapshot = this.playSession.getSnapshot();
    this.refreshRenderer();
    this.presentPlayEvents(events);
    this.updateUI();
  }

  presentPlayEvents(events) {
    if (events.some((event) => event.type === "won")) {
      this.showToast("关卡完成！所有砖块已清除。");
    } else if (events.some((event) => event.type === "deadlocked")) {
      this.showToast("当前局面已无可用配对或暂存空间。", "error");
    } else if (events.some((event) => event.type === "special-auto-removed")) {
      const count = events.filter((event) => event.type === "special-auto-removed").length;
      this.showToast(`特效牌触发：额外清除了 ${count} 对。`);
    } else if (events.some((event) => event.type === "tiles-mismatched")) {
      this.showToast("图案不同，选择已取消。", "error");
    } else if (events.some((event) => event.type === "tile-rejected")) {
      this.showToast("这张牌仍被遮挡、夹压或当前不可操作。", "error");
    }
  }

  restartPlay() {
    if (!this.playSession) {
      return;
    }
    this.playSnapshot = this.playSession.restart({ seed: this.seed });
    this.refreshRenderer();
    this.updateUI();
    this.showToast(`已按种子 ${this.seed} 重新开始。`);
  }

  rerandomize() {
    if (!this.playSession) {
      return;
    }
    this.seed = nextSeed();
    this.playSnapshot = this.playSession.restart({ seed: this.seed });
    this.refreshRenderer();
    this.updateUI();
    this.showToast(`已使用新种子 ${this.seed}。`);
  }

  async save() {
    if (!this.document || this.readonly) {
      return;
    }
    if (!this.document.fileName) {
      return this.promptSaveAs();
    }
    const errors = this.validate(false).filter((issue) => issue.severity === "error");
    if (errors.length) {
      this.showToast("当前关卡存在规则错误，覆盖保存已阻止；可修复后保存或另存为草稿。", "error");
      return;
    }
    await this.performSave({
      fileName: this.document.fileName,
      saveAs: false,
      expectedVersion: this.document.version,
    });
  }

  async promptSaveAs() {
    if (!this.document || this.readonly) {
      return;
    }
    this.elements.saveAsName.value = this.document.fileName
      ? `${this.document.fileName.replace(/\.json$/i, "")}_copy.json`
      : `level_${String(this.document.id).padStart(4, "0")}_copy.json`;
    this.elements.saveAsError.textContent = "";
    const fileName = await new Promise((resolve) => {
      this.saveAsResolver = resolve;
      this.elements.saveAsDialog.showModal();
      this.elements.saveAsName.select();
    });
    if (fileName) {
      await this.performSave({ fileName, saveAs: true, expectedVersion: "" });
    }
  }

  submitSaveAs(event) {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      this.elements.saveAsDialog.close("cancel");
      return;
    }
    const fileName = this.elements.saveAsName.value.trim();
    if (!isValidLevelFileName(fileName)) {
      this.elements.saveAsError.textContent = "请输入不含路径字符的 .json 文件名。";
      return;
    }
    this.elements.saveAsDialog.close("success");
  }

  async performSave({ fileName, saveAs, expectedVersion }) {
    const value = serializeLevelDocument(this.document);
    try {
      const saved = await this.api.saveLevel({ fileName, value, expectedVersion, saveAs });
      this.document.fileName = fileName;
      this.document.version = saved.version;
      this.document.bundled = saved.bundled === true;
      this.document.original = structuredClone(saved.value);
      try {
        this.document.designerNote = JSON.parse(saved.value.designerNote);
      } catch {
        this.document.designerNote = {};
      }
      this.history.markSaved();
      this.currentDifficulty = scoreLevelDifficulty(this.document, {
        maxNodes: 5000,
      });
      await this.refreshLevels();
      this.updateUI();
      this.showToast(saveAs ? `已另存为 ${fileName}` : `已保存到当前浏览器：${fileName}`);
      return true;
    } catch (error) {
      if (error.status === 409 && error.code === "version-conflict") {
        this.elements.conflictDialog.showModal();
        return false;
      }
      this.showToast(error.message, "error");
      return false;
    }
  }

  onKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || this.root.querySelector("dialog[open]")) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }
    if (event.key === "Delete" && this.mode === "edit") {
      event.preventDefault();
      this.deleteTiles([]);
      return;
    }
    if (event.key === "Escape") {
      this.setSelection(new Set());
      return;
    }
    const shortcuts = { v: "select", p: "place", d: "delete", b: "box", h: "pan" };
    const tool = shortcuts[event.key.toLowerCase()];
    if (tool) {
      this.setTool(tool);
    } else if (event.key.toLowerCase() === "f") {
      this.renderer?.fitCamera();
    }
  }

  updateUI() {
    this.root.dataset.mode = this.mode;
    this.root.dataset.view = this.view;
    setPressed(this.elements.modeEdit, this.mode === "edit");
    setPressed(this.elements.modePlay, this.mode === "play");
    setPressed(this.elements.view2d, this.view === "2d");
    setPressed(this.elements.view3d, this.view === "3d");
    this.root.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === this.tool);
      button.disabled =
        this.readonly ||
        (this.view === "3d" && ["place", "box", "pan"].includes(button.dataset.tool));
    });
    this.elements.undo.disabled = !this.history?.canUndo;
    this.elements.redo.disabled = !this.history?.canRedo;
    this.elements.resetLevel.disabled = !this.document?.bundled;
    this.elements.generateAi.disabled = this.readonly || this.aiGenerationPending;
    this.elements.confirmAiLevel.disabled = this.aiGenerationPending;
    this.elements.confirmAiLevel.textContent = this.aiGenerationPending
      ? "正在生成…"
      : "生成并打开";
    this.elements.aiCurrentReference.disabled = !this.document;
    this.elements.dirty.textContent = this.isDirty() ? "未保存" : "已保存";
    this.elements.dirty.classList.toggle("is-dirty", this.isDirty());
    this.elements.statusLevel.textContent = this.document?.name || this.document?.fileName || "未打开";
    this.elements.gameplayLevelTitle.textContent =
      this.document?.name || this.document?.fileName || "等待关卡";
    const tiles = this.mode === "play" ? this.playSnapshot?.tiles ?? [] : this.document?.tiles ?? [];
    const activeTiles = tiles.filter((tile) => !tile.removed);
    this.elements.statusTiles.textContent = this.document ? `${activeTiles.length} / ${tiles.length}` : "—";
    this.elements.statusLayers.textContent = this.document
      ? String(Math.max(0, ...activeTiles.map((tile) => tile.layer)))
      : "—";
    this.elements.statusDifficulty.textContent = !this.document
      ? "—"
      : !this.currentDifficulty
        ? "待重算"
        : this.currentDifficulty.releaseGate === "blocked"
          ? `${this.currentDifficulty.score} · 无效`
          : `${this.currentDifficulty.score} · ${this.currentDifficulty.rating.label}`;
    this.elements.statusSeed.textContent = this.mode === "play" ? String(this.playSnapshot?.seed ?? this.seed) : "—";
    this.elements.lockSeed.checked = this.seedLocked;
    const errors = this.issues.filter((issue) => issue.severity === "error");
    this.elements.validationSummary.className = `validation-summary ${!this.document ? "is-neutral" : errors.length ? "is-error" : "is-valid"}`;
    this.elements.validationSummary.innerHTML = `<span></span>${!this.document ? "未校验" : errors.length ? `${errors.length} 项错误` : "校验通过"}`;
    this.inspector?.update({
      document: this.document,
      selection: this.selection,
      issues: this.issues,
      readonly: this.readonly,
      mode: this.mode,
      snapshot: this.playSnapshot,
      placement: this.placement,
      snapStep: this.snapStep,
    });
  }

  showToast(message, type = "normal") {
    clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.className = `stage-toast is-visible${type === "error" ? " is-error" : ""}`;
    this.toastTimer = setTimeout(() => {
      this.elements.toast.classList.remove("is-visible");
    }, type === "error" ? 5200 : 2800);
  }
}
