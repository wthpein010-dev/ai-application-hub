import { createApiClient, isValidLevelFileName } from "../static-api-client.mjs";
import { EditHistory, createAddTilesCommand, createDeleteTilesCommand, createMoveTilesCommand, createPatchTilesCommand } from "../core/edit-history.mjs";
import { parseLevelDocument, serializeLevelDocument } from "../core/level-adapter.mjs";
import { validateLevel, validateLevelForPublish } from "../core/level-validator.mjs";
import { createPlaySession } from "../core/play-engine.mjs";
import { generateAiLevel } from "../core/ai-level-generator.mjs";
import { validateBlueprintCapacity } from "../core/stage-blueprint.mjs";
import { scoreLevelDifficulty } from "../core/level-difficulty.mjs";
import { solveLevel } from "../core/level-solver.mjs";
import { buildFillCells, planFillPlacement } from "../core/fill-tool.mjs";
import {
  evaluateLevelPassRate,
  readPassRateResult,
  writePassRateResult,
} from "../core/pass-rate-evaluator.mjs";
import {
  isGameplayMetadataIssue,
  normalizeGameplayPatch,
} from "../core/gameplay-metadata.mjs";
import {
  filterTilesByLayerView,
  findPastePlacement,
  planBoardResize,
  planTileMove,
  planTilePlacement,
} from "../core/editor-geometry.mjs";
import { InspectorPanel } from "./inspector.mjs";
import { GrassField } from "./grass-field.mjs";
import { commandFromKeyboardEvent } from "./editor-shortcuts.mjs";
import { createLevelDownload, triggerLevelDownload } from "./level-export.mjs";
import { formatLevelId, formatLevelModifiedAt } from "./level-summary.mjs";
import { createLastOpenedLevelStore } from "./last-opened-level.mjs";
import { upgradeLocalAiLevelOnOpen } from "./legacy-ai-open-upgrade.mjs";
import { runPlayTool } from "./play-tool-command.mjs";
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
import { selectSecondRoundReferences } from "./ai-reference-selection.mjs";

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
  constructor(
    root = document.querySelector("#app"),
    {
      api = createApiClient(),
      lastOpenedLevels = createLastOpenedLevelStore({
        validateFileName: isValidLevelFileName,
      }),
      passRateEvaluator = evaluateLevelPassRate,
    } = {},
  ) {
    this.root = root;
    this.api = api;
    this.lastOpenedLevels = lastOpenedLevels;
    this.passRateEvaluator = passRateEvaluator;
    this.runtimeMode = api.runtimeMode ?? "static";
    this.canDeleteBundled = api.canDeleteBundled === true;
    this.canResetBundled = api.canResetBundled !== false;
    this.levels = [];
    this.trashLevels = [];
    this.defaultFileName = "";
    this.document = null;
    this.history = null;
    this.selection = new Set();
    this.setIssues([]);
    this.mode = "edit";
    this.view = "2d";
    this.tool = "select";
    this.layerView = { mode: "all", layer: 1 };
    this.layerSeparation = 0;
    this.snapStep = 8;
    this.placement = { type: 1, layer: 1, presetColorType: 1, fillStartLayer: 1 };
    this.playSession = null;
    this.playSnapshot = null;
    this.seed = nextSeed();
    this.seedLocked = false;
    this.renderer = null;
    this.toastTimer = null;
    this.uidCounter = 0;
    this.tileClipboard = [];
    this.aiGenerationPending = false;
    this.lastAiGeneration = null;
    this.currentDifficulty = null;
    this.passRateState = {
      result: null,
      stale: false,
      pending: false,
      progress: null,
    };
    this.passRateEvaluationEpoch = 0;
    this.openLevelEpoch = 0;
    this.refreshLevelsEpoch = 0;
    this.pendingIndependentOpenEpochs = new Set();
    this.catalogUnsubscribe = null;
    this.catalogSyncTimer = null;
    this.loginResolver = null;
    this.readonly = matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    if (this.readonly) {
      this.mode = "play";
    }
  }

  setIssues(issues) {
    this.issues = issues;
    this.renderer?.setIssues?.(this.issues);
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    this.grassField = new GrassField().mount(this.elements.canvasHost);
    this.inspector = new InspectorPanel({
      onDocumentPatch: (path, value) => this.patchDocument(path, value),
      onBoardPatch: (patch) => this.patchBoard(patch),
      onGameplayPatch: (patch) => this.patchGameplay(patch),
      onTilePatch: (patch) => this.patchSelectedTiles(patch),
      onPlacementPatch: (patch) => this.patchPlacement(patch),
      onSnapStep: (step) => this.setSnapStep(step),
      onSelectionChange: (selection) => this.setSelection(selection),
      onValidate: () => this.validate(),
      onEvaluatePassRate: () => this.runPassRateEvaluation(),
      onIssueFocus: (issue) => this.focusIssue(issue),
      onExport: () => this.exportLevel(),
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
      demoBanner: byId("demo-banner"),
      levelList: byId("level-list"),
      levelSearch: byId("level-search"),
      levelCount: byId("level-count"),
      refresh: byId("refresh-levels"),
      resetLevel: byId("reset-level"),
      deleteLocalLevel: byId("delete-local-level"),
      openTrash: byId("open-trash"),
      trashCount: byId("trash-count"),
      trashDialog: byId("trash-dialog"),
      trashList: byId("trash-list"),
      trashError: byId("trash-error"),
      closeTrash: byId("close-trash"),
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
      layerViewMode: byId("layer-view-mode"),
      layerViewPrev: byId("layer-view-prev"),
      layerViewCurrent: byId("layer-view-current"),
      layerViewNext: byId("layer-view-next"),
      focus3dSelection: byId("focus-3d-selection"),
      layerSeparation: byId("layer-separation"),
      layerSeparationValue: byId("layer-separation-value"),
      fitPlay: byId("fit-play-view"),
      gameplayFit: byId("gameplay-fit"),
      gameplayLevelTitle: byId("gameplay-level-title"),
      restart: byId("restart-play"),
      rerandomize: byId("rerandomize"),
      lockSeed: byId("lock-seed"),
      playTools: byId("play-tools"),
      playToolButtons: [...this.root.querySelectorAll("[data-play-tool]")],
      statusLevel: byId("status-level"),
      statusTiles: byId("status-tiles"),
      statusLayers: byId("status-layers"),
      statusDifficulty: byId("status-difficulty"),
      statusCoordinates: byId("status-coordinates"),
      statusSeed: byId("status-seed"),
      validationSummary: byId("validation-summary"),
      conflictDialog: byId("conflict-dialog"),
      loginDialog: byId("login-dialog"),
      loginForm: byId("login-form"),
      loginPassword: byId("login-password"),
      loginError: byId("login-error"),
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
    this.elements.deleteLocalLevel.addEventListener("click", () => this.deleteCurrentLevel());
    this.elements.openTrash.addEventListener("click", () => this.openTrash());
    this.elements.closeTrash.addEventListener("click", () => this.elements.trashDialog.close());
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
    this.elements.layerViewMode.addEventListener("change", () => {
      this.setLayerView({ mode: this.elements.layerViewMode.value });
    });
    this.elements.layerViewPrev.addEventListener("click", () => this.stepLayerView(-1));
    this.elements.layerViewNext.addEventListener("click", () => this.stepLayerView(1));
    this.root.querySelectorAll("[data-camera-preset]").forEach((button) => {
      button.addEventListener("click", () =>
        this.renderer?.setCameraPreset(button.dataset.cameraPreset));
    });
    this.elements.focus3dSelection.addEventListener("click", () =>
      this.renderer?.focusSelection());
    this.elements.layerSeparation.addEventListener("input", () => {
      this.layerSeparation = Math.max(
        0,
        Math.min(1, Number(this.elements.layerSeparation.value) / 100),
      );
      this.renderer?.setLayerSeparation?.(this.layerSeparation);
      this.updateUI();
    });
    this.elements.fitPlay.addEventListener("click", () => this.renderer?.fitCamera());
    this.elements.gameplayFit.addEventListener("click", () => this.renderer?.fitCamera());
    this.elements.restart.addEventListener("click", () => this.restartPlay());
    this.elements.rerandomize.addEventListener("click", () => this.rerandomize());
    this.elements.playToolButtons.forEach((button) => {
      button.addEventListener("click", () => this.usePlayTool(button.dataset.playTool));
    });
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
    this.elements.loginForm.addEventListener("submit", (event) => this.submitLogin(event));
    this.elements.loginDialog.addEventListener("close", () => {
      if (!this.loginResolver) return;
      this.loginResolver(
        this.elements.loginDialog.returnValue === "login"
          ? this.elements.loginPassword.value
          : null,
      );
      this.loginResolver = null;
      this.elements.loginPassword.value = "";
    });
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
      this.catalogUnsubscribe?.();
      if (this.isDirty()) {
        event.preventDefault();
      }
    });
    window.addEventListener("pagehide", () => {
      this.catalogUnsubscribe?.();
      this.grassField?.destroy();
    }, { once: true });
  }

  async connect() {
    this.setConnection("connecting", "正在连接关卡服务");
    try {
      const health = await this.api.health();
      if (!health.online) {
        this.setConnection("error", health.directoryError || "关卡目录不可读");
        return;
      }
      this.runtimeMode = health.mode === "lan" ? "lan" : this.runtimeMode;
      this.canDeleteBundled = health.canDeleteBundled === true || this.canDeleteBundled;
      this.canResetBundled = this.runtimeMode !== "lan" && this.canResetBundled;
      this.applyRuntimeMode();
      this.setConnection("online", this.connectionText());
      await this.refreshLevels();
      if (this.runtimeMode === "lan") {
        await this.refreshTrash();
        this.catalogUnsubscribe?.();
        this.catalogUnsubscribe = this.api.subscribeCatalog(
          (event) => this.scheduleCatalogSync(event),
          () => this.setConnection("connecting", "内网同步连接正在重试"),
        );
      }
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
    const refreshEpoch = ++this.refreshLevelsEpoch;
    this.elements.levelList.innerHTML = `<div class="loading-card"><span class="loader"></span><p>正在读取工程关卡…</p></div>`;
    try {
      const catalog = await this.api.listLevelCatalog();
      if (refreshEpoch !== this.refreshLevelsEpoch) return;
      this.levels = catalog.levels;
      this.defaultFileName = catalog.defaultFileName;
      this.renderLevelList();
      this.setConnection("online", this.connectionText());
      if (
        this.levels.length
        && !this.document
        && this.pendingIndependentOpenEpochs.size === 0
      ) {
        const rememberedFileName = this.lastOpenedLevels.read(this.runtimeMode);
        const rememberedLevel = this.levels.find(
          ({ fileName }) => fileName === rememberedFileName,
        );
        if (rememberedFileName && !rememberedLevel) {
          this.lastOpenedLevels.clear(this.runtimeMode);
        }
        const level = rememberedLevel
          ?? this.levels.find(
            ({ fileName }) => fileName === this.defaultFileName,
          )
          ?? this.levels[0];
        await this.openLevel(level.fileName, {
          recoverable: level.recoverable,
          sourceRefreshEpoch: refreshEpoch,
        });
      }
    } catch (error) {
      if (refreshEpoch !== this.refreshLevelsEpoch) return;
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
      empty.innerHTML = this.levels.length === 0 && !query
        ? "<p>内置关卡库已清空，可新建或导入 JSON。</p>"
        : "<p>没有匹配的关卡。</p>";
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
    {
      discardDirty = false,
      recoverable = false,
      recoveryAttempted = false,
      sourceRefreshEpoch = null,
    } = {},
  ) {
    if (!discardDirty && this.isDirty() && !confirm("当前关卡有未保存修改，确定打开其他关卡吗？")) {
      return;
    }
    if (recoverable && !confirm("浏览器保存已损坏，是否清除并恢复内置示例？")) {
      return;
    }
    const openEpoch = ++this.openLevelEpoch;
    const independentOpen = sourceRefreshEpoch === null;
    if (independentOpen) {
      this.pendingIndependentOpenEpochs.add(openEpoch);
    }
    try {
      return await this.performOpenLevel(fileName, {
        recoverable,
        recoveryAttempted,
        sourceRefreshEpoch,
        openEpoch,
      });
    } finally {
      if (independentOpen) {
        this.pendingIndependentOpenEpochs.delete(openEpoch);
      }
    }
  }

  connectionText() {
    return this.runtimeMode === "lan"
      ? "内网工程模式 · 改动同步到所有用户"
      : "关卡库在线 · 编辑只保存到当前浏览器";
  }

  applyRuntimeMode() {
    this.root.dataset.runtimeMode = this.runtimeMode;
    if (this.runtimeMode === "lan") {
      this.elements.demoBanner.textContent =
        "内网工程模式 · 直接读写 Unity EditorLevels · 删除进入工程 _Trash 并同步所有用户";
      this.elements.deleteLocalLevel.textContent = "移到回收站";
      return;
    }
    this.elements.deleteLocalLevel.textContent = "删除本地";
  }

  submitLogin(event) {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      this.elements.loginDialog.close("cancel");
      return;
    }
    if (!this.elements.loginPassword.value) {
      this.elements.loginError.textContent = "请输入本次服务启动时设置的口令。";
      return;
    }
    this.elements.loginDialog.close("login");
  }

  requestLogin() {
    this.elements.loginError.textContent = "";
    this.elements.loginPassword.value = "";
    return new Promise((resolve) => {
      this.loginResolver = resolve;
      this.elements.loginDialog.showModal();
      this.elements.loginPassword.focus();
    });
  }

  async withWriteAuthentication(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error.code !== "authentication-required") throw error;
      const password = await this.requestLogin();
      if (password === null) {
        const cancelled = new Error("已取消写回工程。");
        cancelled.code = "authentication-cancelled";
        throw cancelled;
      }
      await this.api.login(password);
      return operation();
    }
  }

  scheduleCatalogSync(event) {
    clearTimeout(this.catalogSyncTimer);
    this.catalogSyncTimer = setTimeout(() => this.synchronizeCatalog(event), 60);
  }

  async synchronizeCatalog(event) {
    const openFileName = this.document?.fileName;
    const dirty = this.isDirty();
    await Promise.all([this.refreshLevels(), this.refreshTrash()]);
    if (!openFileName || this.levels.some(({ fileName }) => fileName === openFileName)) return;
    if (dirty) {
      this.showToast(
        "服务器已删除当前关卡；未保存内容仍保留，请另存为新关卡或先从回收站恢复。",
        "error",
      );
      this.updateUI();
      return;
    }
    this.clearCurrentDocument();
    const fallback = this.levels.find(({ fileName }) => fileName === this.defaultFileName)
      ?? this.levels[0];
    if (fallback) await this.openLevel(fallback.fileName, { discardDirty: true });
    this.showToast(
      event?.reason === "level-restored"
        ? "工程回收站已变化，关卡库已同步。"
        : "当前关卡已被其他用户移到回收站，已打开默认关。",
    );
  }

  async performOpenLevel(
    fileName,
    { recoverable, recoveryAttempted, sourceRefreshEpoch, openEpoch },
  ) {
    const isCurrentOpen = () =>
      openEpoch === this.openLevelEpoch
      && (sourceRefreshEpoch === null || sourceRefreshEpoch === this.refreshLevelsEpoch);
    if (recoverable) {
      try {
        await this.api.resetLevel(fileName);
        if (!isCurrentOpen()) return;
      } catch (error) {
        if (!isCurrentOpen()) return;
        this.showToast(error.message, "error");
        return;
      }
    }
    this.showToast(`正在打开 ${fileName}…`);
    try {
      const response = await this.api.loadLevel(fileName);
      if (!isCurrentOpen()) return;
      const parsedDocument = parseLevelDocument(response.value, {
        fileName,
        version: response.version,
      });
      const geometryUpgrade = await upgradeLocalAiLevelOnOpen({
        api: this.api,
        fileName,
        response,
        document: parsedDocument,
      });
      if (!isCurrentOpen()) return;
      this.document = geometryUpgrade.document;
      this.document.bundled = response.bundled === true;
      this.document.local = response.local === true;
      this.document.source = response.source;
      this.resetPassRateState();
      if (geometryUpgrade.status === "upgraded") {
        this.markPassRateStale();
      }
      this.currentDifficulty = scoreLevelDifficulty(this.document, {
        maxNodes: 5000,
      });
      this.history = new EditHistory(this.document);
      this.history.markSaved();
      this.selection = new Set();
      this.layerView = {
        mode: "all",
        layer: Math.max(1, ...this.document.tiles.map(({ layer }) => Number(layer) || 1)),
      };
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
      this.lastOpenedLevels.write(this.runtimeMode, fileName);
      if (geometryUpgrade.status === "failed") {
        this.showToast(
          `旧 AI 关卡自动修复失败（${geometryUpgrade.reason}），已保留原始布局。`,
          "error",
        );
      } else if (geometryUpgrade.status === "upgraded" && !geometryUpgrade.persisted) {
        this.showToast(
          `旧 AI 关卡已修复 ${geometryUpgrade.movedTileUids.length} 张砖块，但修复结果尚未写回浏览器：${geometryUpgrade.reason}`,
          "error",
        );
      } else if (geometryUpgrade.status === "upgraded") {
        this.showToast(`旧 AI 关卡已修复 ${geometryUpgrade.movedTileUids.length} 张砖块并保存。`);
      } else if (this.document.warnings.length) {
        this.showToast(this.document.warnings.map((warning) => warning.message).join(" "), "error");
      } else {
        this.showToast(`已打开 ${this.document.name || fileName}`);
      }
      this.elements.libraryPanel.classList.remove("is-open");
    } catch (error) {
      if (!isCurrentOpen()) return;
      if (error.code === "invalid-local-record" && !recoveryAttempted) {
        if (confirm("浏览器保存已损坏，是否清除并恢复内置示例？")) {
          try {
            await this.api.resetLevel(fileName);
            if (!isCurrentOpen()) return;
            return this.openLevel(fileName, {
              discardDirty: true,
              recoveryAttempted: true,
              sourceRefreshEpoch,
            });
          } catch (resetError) {
            if (!isCurrentOpen()) return;
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
    if (!this.canResetBundled || !document?.bundled) {
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

  async deleteCurrentLevel() {
    const { document } = this;
    const canDeleteCurrent = this.canDeleteBundled
      ? Boolean(document?.fileName && document?.version)
      : Boolean(document?.local && !document?.bundled);
    if (this.readonly || !canDeleteCurrent) {
      return;
    }
    const fileName = document.fileName;
    const confirmation = this.runtimeMode === "lan"
      ? `确定删除工程关卡 ${fileName} 吗？\n\nJSON 与 .meta 将移动到工程 _Trash，可在回收站恢复；AI 会立即忘记这关的结构。`
      : `确定删除本地关卡 ${fileName} 吗？\n\n删除后无法撤销，AI 下次生成将不再学习这关。`;
    if (!confirm(confirmation)) {
      return;
    }
    try {
      await this.withWriteAuthentication(() => this.api.deleteLevel(fileName, {
        expectedVersion: document.version,
      }));
      this.clearCurrentDocument();
      this.levels = [];
      await this.refreshLevels();
      if (this.runtimeMode === "lan") await this.refreshTrash();
      if (!this.document) {
        const fallback = this.levels.find(
          ({ fileName: candidate }) => candidate === this.defaultFileName,
        ) ?? this.levels[0];
        if (fallback) {
          await this.openLevel(fallback.fileName, { discardDirty: true });
        }
      }
      const referenceCount = this.levels.filter(
        ({ aiReferenceEligible }) => aiReferenceEligible,
      ).length;
      this.showToast(
        this.runtimeMode === "lan"
          ? `已移到工程 _Trash：${fileName}；剩余 AI 学习参考 ${referenceCount} 关。`
          : `已删除 ${fileName}；剩余 AI 学习参考 ${referenceCount} 关。`,
      );
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  clearCurrentDocument() {
    this.document = null;
    this.history = null;
    this.selection = new Set();
    this.setIssues([]);
    this.currentDifficulty = null;
    this.playSession = null;
    this.playSnapshot = null;
    this.lastAiGeneration = null;
    this.resetPassRateState();
    this.mountRenderer();
    this.elements.emptyStage.hidden = false;
    this.updateUI();
  }

  async refreshTrash() {
    if (this.runtimeMode !== "lan") {
      this.trashLevels = [];
      this.elements.trashCount.textContent = "0";
      return;
    }
    try {
      this.trashLevels = await this.api.listTrash();
      this.elements.trashCount.textContent = String(this.trashLevels.length);
      if (this.elements.trashDialog.open) this.renderTrash();
    } catch (error) {
      this.elements.trashError.textContent = error.message;
    }
  }

  async openTrash() {
    if (this.runtimeMode !== "lan" || this.readonly) return;
    this.elements.trashError.textContent = "";
    this.elements.trashList.innerHTML =
      '<div class="trash-empty"><span class="loader"></span><p>正在读取工程 _Trash…</p></div>';
    this.elements.trashDialog.showModal();
    await this.refreshTrash();
    this.renderTrash();
  }

  renderTrash() {
    this.elements.trashList.replaceChildren();
    if (!this.trashLevels.length) {
      const empty = document.createElement("div");
      empty.className = "trash-empty";
      empty.textContent = "回收站为空。";
      this.elements.trashList.append(empty);
      return;
    }
    for (const entry of this.trashLevels) {
      const card = document.createElement("div");
      card.className = "trash-card";
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = entry.name || entry.fileName;
      const meta = document.createElement("span");
      const deletedAt = new Date(entry.deletedAt);
      const time = Number.isNaN(deletedAt.getTime())
        ? "未知时间"
        : deletedAt.toLocaleString("zh-CN", { hour12: false });
      meta.textContent = `${entry.fileName} · ${entry.tileCount ?? "—"} 张 · ${time}`;
      copy.append(name, meta);
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "primary-button";
      restore.textContent = "恢复";
      restore.disabled = entry.broken === true;
      restore.addEventListener("click", () => this.restoreTrashLevel(entry.trashId));
      card.append(copy, restore);
      this.elements.trashList.append(card);
    }
  }

  async restoreTrashLevel(trashId) {
    this.elements.trashError.textContent = "";
    try {
      const restored = await this.withWriteAuthentication(() => this.api.restoreLevel(trashId));
      await Promise.all([this.refreshLevels(), this.refreshTrash()]);
      this.elements.trashDialog.close();
      await this.openLevel(restored.fileName, { discardDirty: true });
      this.showToast(`已从工程 _Trash 恢复 ${restored.fileName}`);
    } catch (error) {
      if (error.code === "authentication-cancelled") return;
      this.elements.trashError.textContent = error.message;
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
      await this.withWriteAuthentication(() => this.api.saveLevel({
        fileName,
        value,
        expectedVersion: "",
        saveAs: true,
        source: "import",
      }));
      await activateImportedLevel(fileName, {
        refreshLevels: () => this.refreshLevels(),
        getLevels: () => this.levels,
        openLevel: () => this.openLevel(fileName, { discardDirty: true }),
        getDocument: () => this.document,
      });
      this.showToast(
        this.runtimeMode === "lan"
          ? `已导入并写入工程：${fileName}`
          : `已导入 ${fileName}，仅保存在当前浏览器。`,
      );
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
    const catalog = await this.api.listLevelCatalog();
    this.levels = catalog.levels;
    this.defaultFileName = catalog.defaultFileName;
    this.renderLevelList();
    const levels = this.levels.filter(({ aiReferenceEligible }) => aiReferenceEligible);
    const settled = await Promise.allSettled(levels.map(async ({ fileName }) => {
      const response = await this.api.loadLevel(fileName);
      return parseLevelDocument(response.value, {
        fileName,
        version: response.version,
      });
    }));
    const loadedReferences = settled
      .filter(({ status }) => status === "fulfilled")
      .map(({ value }) => value);
    const references = selectSecondRoundReferences(loadedReferences);
    if (!references.length) {
      throw new Error("没有可用于学习的参考关卡。");
    }
    return references;
  }

  async generateAiLevelFromDialog(options) {
    if (this.readonly || this.aiGenerationPending) {
      return false;
    }
    try {
      const capacity = validateBlueprintCapacity({
        difficulty: options.difficulty,
        tileCount: options.tileCount,
        layerCount: options.layerCount,
      });
      if (!capacity.supported) throw new RangeError(capacity.message);
    } catch (error) {
      this.elements.aiLevelError.textContent = error.message;
      this.showToast(error.message, "error");
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
      await this.withWriteAuthentication(() => this.api.saveLevel({
        fileName,
        value: serializeLevelDocument(generated.document),
        expectedVersion: "",
        saveAs: true,
        source: "ai",
      }));
      await activateImportedLevel(fileName, {
        refreshLevels: () => this.refreshLevels(),
        getLevels: () => this.levels,
        openLevel: () => this.openLevel(fileName, { discardDirty: true }),
        getDocument: () => this.document,
      });
      this.seed = unsignedSeed;
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
        + `难度 ${difficulty.score}（${difficulty.rating.label}），可解；`
        + `本次实时学习 ${references.length} 关。`,
      );
      return true;
    } catch (error) {
      const message = error instanceof RangeError
        ? error.message
        : /结构.*门禁|局部平台|盲盒轨道|verified moves/i.test(error.message)
          ? `结构门禁异常：${error.message}`
          : error.message;
      this.elements.aiLevelError.textContent = message;
      this.showToast(message, "error");
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
      widthNum: 7,
      heightNum: 8,
      levelKey: 0,
      gameLevelOrder: 1,
      cdNum: 0,
      showLayerNum: true,
      boardScale: 1,
      blockTypeCount: 32,
      fullRandomTypeMin: 1,
      fullRandomTypeMax: 32,
      blockTypeData: {},
      levelData: {},
      goldBlockData: [],
      cakeNum: 0,
    };
    this.document = parseLevelDocument({
      id: 0,
      name: "新关卡",
      difficulty: "Normal",
      gridUnit: "sheep_7x8_mini8",
      designerNote: JSON.stringify(note),
      features: {},
      tiles: [],
    });
    this.document.bundled = false;
    this.document.local = false;
    this.document.source = "manual";
    this.resetPassRateState();
    this.currentDifficulty = scoreLevelDifficulty(this.document, {
      maxNodes: 5000,
    });
    this.history = new EditHistory(this.document);
    this.history.markSaved();
    this.selection = new Set();
    this.layerView = { mode: "all", layer: 1 };
    this.setIssues(validateLevel(this.document));
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
    this.setIssues(this.document ? validateLevel(this.document) : []);
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

  resetPassRateState() {
    this.passRateEvaluationEpoch += 1;
    this.passRateState = {
      result: readPassRateResult(this.document?.designerNote),
      stale: false,
      pending: false,
      progress: null,
    };
  }

  markPassRateStale() {
    this.passRateEvaluationEpoch += 1;
    this.passRateState = {
      ...this.passRateState,
      stale: true,
      progress: null,
    };
  }

  async runPassRateEvaluation({
    persistToDocument = false,
    announce = true,
  } = {}) {
    if (!this.document || this.passRateState.pending) {
      return null;
    }
    const previousState = structuredClone(this.passRateState);
    const evaluationEpoch = ++this.passRateEvaluationEpoch;
    const evaluatedDocument = this.document;
    const snapshot = structuredClone(this.document);
    this.passRateState = {
      ...this.passRateState,
      pending: true,
      progress: { completed: 0, total: 0 },
    };
    this.updateUI();
    try {
      const result = await this.passRateEvaluator(snapshot, {
        onProgress: (progress) => {
          if (evaluationEpoch !== this.passRateEvaluationEpoch) return;
          this.passRateState = {
            ...this.passRateState,
            progress: structuredClone(progress),
          };
          this.updateUI();
        },
      });
      if (this.document !== evaluatedDocument) {
        return null;
      }
      if (evaluationEpoch !== this.passRateEvaluationEpoch) {
        throw new Error("关卡在评估期间已修改，请重新评估。");
      }
      if (persistToDocument) {
        this.document.designerNote = writePassRateResult(
          this.document.designerNote,
          result,
        );
      }
      this.passRateState = {
        result: structuredClone(result),
        stale: false,
        pending: false,
        progress: null,
      };
      this.updateUI();
      if (announce) {
        this.showToast(`Unity 同口径通关率：${result.passPercent}%（${result.passCount}/${result.trialCount}）。`);
      }
      return result;
    } catch (error) {
      if (evaluationEpoch === this.passRateEvaluationEpoch) {
        this.passRateState = {
          ...previousState,
          pending: false,
          progress: null,
        };
      } else {
        this.passRateState = {
          ...this.passRateState,
          stale: true,
          pending: false,
          progress: null,
        };
      }
      this.updateUI();
      this.showToast(`通关率评估失败：${error.message}`, "error");
      return null;
    }
  }

  execute(command) {
    if (this.readonly || this.mode !== "edit" || !this.history) {
      return;
    }
    this.history.execute(command);
    this.currentDifficulty = null;
    this.markPassRateStale();
    this.validate(false);
    this.refreshRenderer();
    this.updateUI();
  }

  executePlannedEdit(plan, applyPlan) {
    if (!plan?.ok) {
      this.showToast(plan?.reason ?? "无法完成这次编辑。", "error");
      return false;
    }
    applyPlan(plan);
    return true;
  }

  patchDocument(path, value) {
    if (!this.document || this.readonly) {
      return;
    }
    const before = structuredClone(getNested(this.document, path));
    const previousLevelKey = this.document.gameplay?.levelKey;
    this.execute({
      label: `修改 ${path}`,
      apply: (target) => {
        setNested(target, path, structuredClone(value));
        if (path === "id") {
          target.gameplay ??= {};
          target.gameplay.levelKey = Number(value);
        }
      },
      revert: (target) => {
        setNested(target, path, structuredClone(before));
        if (path === "id") {
          target.gameplay ??= {};
          target.gameplay.levelKey = previousLevelKey;
        }
      },
    });
  }

  patchGameplay(patch) {
    if (!this.document || this.readonly || this.mode !== "edit") return;
    let normalized;
    try {
      normalized = normalizeGameplayPatch(patch);
    } catch (error) {
      this.showToast(error.message, "error");
      this.updateUI();
      return;
    }
    if (!Object.keys(normalized).length) return;
    const before = structuredClone(this.document.gameplay);
    this.execute({
      label: "修改游戏运行参数",
      apply: (target) => Object.assign(target.gameplay, structuredClone(normalized)),
      revert: (target) => { target.gameplay = structuredClone(before); },
    });
  }

  patchBoard(patch) {
    if (!this.document || this.readonly || this.mode !== "edit") return;
    const plan = planBoardResize(this.document, {
      width: patch.width ?? this.document.board.width,
      height: patch.height ?? this.document.board.height,
    });
    this.executePlannedEdit(plan, ({ board, gridUnit }) => {
      const previousBoard = structuredClone(this.document.board);
      const previousGridUnit = this.document.gridUnit;
      this.execute({
        label: "修改棋盘尺寸",
        apply: (target) => {
          target.board = structuredClone(board);
          target.gridUnit = gridUnit;
        },
        revert: (target) => {
          target.board = structuredClone(previousBoard);
          target.gridUnit = previousGridUnit;
        },
      });
    });
  }

  patchSelectedTiles(patch) {
    if (!this.selection.size) {
      return;
    }
    const remaining = { ...patch };
    const positionKeys = ["x", "y", "layer"].filter((key) => Object.hasOwn(remaining, key));
    if (positionKeys.length) {
      if (this.selection.size !== 1) {
        this.showToast("多选砖块请使用方向键微移或 PageUp / PageDown 调层。", "error");
        return;
      }
      const uid = [...this.selection][0];
      const tile = this.document.tiles.find((candidate) => candidate.uid === uid);
      if (!tile) return;
      const plan = planTileMove(this.document, [uid], {
        dx: Object.hasOwn(remaining, "x") ? Number(remaining.x) - tile.x : 0,
        dy: Object.hasOwn(remaining, "y") ? Number(remaining.y) - tile.y : 0,
        layerDelta: Object.hasOwn(remaining, "layer") ? Number(remaining.layer) - tile.layer : 0,
      });
      if (!this.executePlannedEdit(plan, () => {
        this.execute(createMoveTilesCommand([uid], plan.dx, plan.dy, plan.layerDelta));
      })) return;
      positionKeys.forEach((key) => delete remaining[key]);
    }
    if (Object.keys(remaining).length) {
      this.execute(createPatchTilesCommand([...this.selection], remaining));
    }
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

  nextTileUid() {
    return `tile-web-${Date.now()}-${++this.uidCounter}`;
  }

  placeTile(tile) {
    if (!this.document || this.mode !== "edit") return;
    const candidate = {
      uid: this.nextTileUid(),
      x: tile.x,
      y: tile.y,
      layer: tile.layer,
      type: tile.type,
      moldType: 1,
      metaType: 0,
      metaData: 0,
      presetColorType: tile.presetColorType,
    };
    const plan = planTilePlacement(this.document, candidate);
    this.executePlannedEdit(plan, ({ tile: plannedTile, adjustedLayer }) => {
      this.execute(createAddTilesCommand([plannedTile]));
      this.setSelection(new Set([plannedTile.uid]));
      if (adjustedLayer) {
        this.showToast(`当前位置已有同层砖块，已自动放到第 ${plannedTile.layer} 层。`);
      }
    });
  }

  fillTiles({ start, end }) {
    if (!this.document || this.mode !== "edit") return;
    try {
      const cells = buildFillCells(start, end, this.document.board);
      const { additions, skipped } = planFillPlacement(this.document, cells, {
        startLayer: this.placement.fillStartLayer,
        uidFactory: () => this.nextTileUid(),
      });
      if (!additions.length) {
        this.showToast(`没有可平铺的位置${skipped.length ? `，已跳过 ${skipped.length} 格` : ""}。`, "error");
        return;
      }
      this.execute(createAddTilesCommand(additions));
      this.setSelection(new Set(additions.map(({ uid }) => uid)));
      this.showToast(
        `已平铺 ${additions.length} 张全随机砖块${skipped.length ? `，跳过 ${skipped.length} 格` : ""}。`,
      );
    } catch (error) {
      this.showToast(error.message, "error");
    }
  }

  moveTiles(tileUids, { dx, dy }) {
    if (!this.document || this.mode !== "edit" || !tileUids.length || (!dx && !dy)) return;
    const plan = planTileMove(this.document, tileUids, { dx, dy });
    this.executePlannedEdit(plan, () => {
      this.execute(createMoveTilesCommand(tileUids, plan.dx, plan.dy, plan.layerDelta));
    });
  }

  copySelection() {
    if (!this.document || this.mode !== "edit" || !this.selection.size) return false;
    const selected = this.document.tiles.filter(({ uid }) => this.selection.has(uid));
    if (!selected.length) return false;
    this.tileClipboard = structuredClone(selected);
    this.showToast(`已复制 ${selected.length} 张砖块。`);
    return true;
  }

  cutSelection() {
    if (!this.copySelection()) return;
    const count = this.selection.size;
    this.deleteTiles([...this.selection]);
    this.showToast(`已剪切 ${count} 张砖块。`);
  }

  addPastedTiles(sourceTiles, label) {
    if (!this.document || this.mode !== "edit" || !sourceTiles.length) return false;
    const plan = findPastePlacement(this.document, sourceTiles, { step: this.snapStep });
    return this.executePlannedEdit(plan, ({ tiles }) => {
      const additions = tiles.map((tile) => ({ ...tile, uid: this.nextTileUid() }));
      this.execute(createAddTilesCommand(additions));
      this.setSelection(new Set(additions.map(({ uid }) => uid)));
      this.showToast(`${label} ${additions.length} 张砖块。`);
    });
  }

  pasteSelection() {
    if (!this.tileClipboard.length) {
      this.showToast("剪贴板里没有砖块。", "error");
      return false;
    }
    return this.addPastedTiles(structuredClone(this.tileClipboard), "已粘贴");
  }

  duplicateSelection() {
    if (!this.document || !this.selection.size) return false;
    const selected = this.document.tiles.filter(({ uid }) => this.selection.has(uid));
    return this.addPastedTiles(selected, "已复制副本");
  }

  nudgeSelection(dx, dy) {
    if (!this.document || this.mode !== "edit" || !this.selection.size) return;
    const tileUids = [...this.selection];
    const plan = planTileMove(this.document, tileUids, { dx, dy });
    this.executePlannedEdit(plan, () => {
      this.execute(createMoveTilesCommand(tileUids, plan.dx, plan.dy, plan.layerDelta));
    });
  }

  nudgeSelectionLayer(delta) {
    if (!this.document || this.mode !== "edit" || !this.selection.size) return;
    const tileUids = [...this.selection];
    const plan = planTileMove(this.document, tileUids, { layerDelta: delta });
    this.executePlannedEdit(plan, () => {
      this.execute(createMoveTilesCommand(tileUids, plan.dx, plan.dy, plan.layerDelta));
    });
  }

  selectAllVisible() {
    if (!this.document || this.mode !== "edit") return;
    const visible = filterTilesByLayerView(this.document.tiles, this.layerView)
      .filter((tile) => !tile.removed && !Number.isInteger(tile.stashedSlot));
    this.setSelection(new Set(visible.map(({ uid }) => uid)));
  }

  setLayerView(layerView) {
    const maxLayer = Math.max(1, ...((this.document?.tiles ?? []).map(({ layer }) => Number(layer) || 1)));
    const mode = ["all", "through", "single"].includes(layerView?.mode)
      ? layerView.mode
      : this.layerView.mode;
    const layer = Math.max(1, Math.min(maxLayer, Math.trunc(Number(layerView?.layer ?? this.layerView.layer)) || 1));
    this.layerView = { mode, layer };
    this.renderer?.setLayerView?.(this.layerView);
    this.updateUI();
  }

  cycleLayerView() {
    if (this.mode !== "edit") return;
    const modes = ["all", "through", "single"];
    const index = modes.indexOf(this.layerView.mode);
    this.setLayerView({ mode: modes[(index + 1) % modes.length] });
  }

  stepLayerView(delta) {
    if (this.mode !== "edit") return;
    const mode = this.layerView.mode === "all" ? "through" : this.layerView.mode;
    this.setLayerView({ mode, layer: this.layerView.layer + delta });
  }

  focusIssue(issue) {
    if (!this.document || !issue) return;
    const wanted = new Set(issue.tileUids ?? []);
    const targets = this.document.tiles.filter(({ uid }) => wanted.has(uid));
    if (!targets.length) {
      this.showToast(issue.message);
      return;
    }
    const layer = Math.max(...targets.map((tile) => tile.layer));
    this.setLayerView({ mode: "through", layer });
    this.setSelection(new Set(targets.map(({ uid }) => uid)));
    requestAnimationFrame(() => this.renderer?.fitCamera());
    this.showToast(`已定位 ${targets.length} 张相关砖块。`);
  }

  exportLevel() {
    if (!this.document) return;
    const aiGenerated = Boolean(this.document.designerNote?.aiGeneration);
    this.setIssues(aiGenerated
      ? validateLevelForPublish(this.document)
      : validateLevel(this.document));
    this.updateUI();
    const blocked = this.issues.some(({ severity, code }) =>
      severity === "error" && (aiGenerated || isGameplayMetadataIssue(code)));
    if (blocked) {
      this.showToast(
        aiGenerated
          ? "AI 关卡未通过全局随机池配对和完整可解性校验，已阻止导出。"
          : "Unity 游戏运行参数不合法，已阻止导出。",
        "error",
      );
      return;
    }
    try {
      const download = createLevelDownload(this.document, {
        fileName: this.document.fileName,
      });
      triggerLevelDownload(download);
      this.showToast(`已导出 ${download.fileName}，可复制回 Unity 关卡目录。`);
    } catch (error) {
      this.showToast(error.message, "error");
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
    this.markPassRateStale();
    this.validate(false);
    this.refreshRenderer();
    this.updateUI();
  }

  redo() {
    if (this.mode !== "edit" || !this.history?.redo()) {
      return;
    }
    this.markPassRateStale();
    this.validate(false);
    this.refreshRenderer();
    this.updateUI();
  }

  setTool(tool) {
    if (this.readonly || this.mode !== "edit") {
      return;
    }
    if (this.view === "3d" && ["place", "fill", "box", "pan"].includes(tool)) {
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
    if (view === "3d" && ["place", "fill", "box", "pan"].includes(this.tool)) {
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
      onFill: (gesture) => this.fillTiles(gesture),
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
    this.renderer.setLayerView?.(this.layerView);
    this.renderer.setLayerSeparation?.(this.layerSeparation);
    this.renderer.setIssues?.(this.issues);
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
      this.renderer.setIssues?.(this.issues);
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

  usePlayTool(toolName) {
    if (!this.playSession || this.mode !== "play") {
      return;
    }
    const events = runPlayTool(this.playSession, toolName);
    if (events.length === 0) {
      return;
    }
    this.playSnapshot = this.playSession.getSnapshot();
    this.refreshRenderer();
    this.presentPlayToolEvents(events);
    this.updateUI();
  }

  presentPlayToolEvents(events) {
    const rejectedMessages = {
      "insufficient-tiles": "剩余砖块不足，无法随机",
      "no-shuffle-pair": "当前局面无法生成可用配对",
      "no-pair": "没有可配对的砖块",
      "empty-history": "暂无可撤回的砖块",
      "spent": "该道具本局已使用",
    };
    const rejected = events.find(({ type }) => type === "tool-rejected");
    if (rejected) {
      this.showToast(rejectedMessages[rejected.reason] ?? "当前无法使用该道具", "error");
      return;
    }
    if (events.some(({ type }) => type === "won" || type === "deadlocked")) {
      this.presentPlayEvents(events);
      return;
    }
    this.pulsePlayTools();
    if (events.some(({ type }) => type === "tool-shuffled")) {
      this.showToast("砖块已重新随机。");
    } else if (events.some(({ type }) => type === "tool-match-removed")) {
      this.showToast("配对道具已清除一对砖块。");
    } else if (events.some(({ type }) => type === "tool-undone")) {
      this.showToast("已撤回最近暂存的砖块。");
    }
  }

  pulsePlayTools() {
    const dock = this.elements.playTools;
    dock.classList.remove("play-tool-used");
    void dock.offsetWidth;
    dock.classList.add("play-tool-used");
    clearTimeout(this.playToolPulseTimer);
    this.playToolPulseTimer = setTimeout(() => {
      dock.classList.remove("play-tool-used");
    }, 260);
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
    const tentativeSeed = nextSeed();
    try {
      const snapshot = this.playSession.restart({ seed: tentativeSeed });
      this.seed = tentativeSeed;
      this.playSnapshot = snapshot;
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
      this.showToast(`无法使用新种子 ${tentativeSeed}：${error.message}`, "error");
      return;
    }
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
    const aiGenerated = Boolean(this.document.designerNote?.aiGeneration);
    this.setIssues(aiGenerated
      ? validateLevelForPublish(this.document)
      : validateLevel(this.document));
    this.updateUI();
    const blocked = this.issues.some(({ severity, code }) =>
      severity === "error" && (aiGenerated || isGameplayMetadataIssue(code)));
    if (blocked) {
      this.showToast(
        aiGenerated
          ? "AI 关卡未通过全局随机池配对和完整可解性校验，已阻止保存。"
          : "Unity 游戏运行参数不合法，已阻止保存。",
        "error",
      );
      return false;
    }
    const passRate = await this.runPassRateEvaluation({
      persistToDocument: true,
      announce: false,
    });
    if (!passRate) {
      return false;
    }
    try {
      const savedDocument = this.document;
      const savedHistory = this.history;
      const savedStateId = savedHistory?.stateId;
      const value = serializeLevelDocument(this.document);
      const source = saveAs
        ? "manual"
        : ["import", "manual", "ai"].includes(this.document.source)
          ? this.document.source
          : "manual";
      const saved = await this.withWriteAuthentication(() =>
        this.api.saveLevel({ fileName, value, expectedVersion, saveAs, source }));
      const savedDocumentIsCurrent =
        this.document === savedDocument
        && this.history === savedHistory
        && savedHistory?.stateId === savedStateId;
      if (savedDocumentIsCurrent) {
        this.document.fileName = fileName;
        this.document.version = saved.version;
        this.document.bundled = saved.bundled === true;
        this.document.local = saved.local === true;
        this.document.source = saved.source;
        this.document.original = structuredClone(saved.value);
        const canonical = parseLevelDocument(saved.value);
        this.document.designerNote = structuredClone(canonical.designerNote);
        this.document.gameplay = structuredClone(canonical.gameplay);
        this.setIssues(validateLevel(this.document));
        this.history.markSaved();
        this.currentDifficulty = scoreLevelDifficulty(this.document, {
          maxNodes: 5000,
        });
      }
      await this.refreshLevels();
      this.updateUI();
      this.showToast(
        savedDocumentIsCurrent
          ? saveAs
            ? `已另存为 ${fileName}`
            : this.runtimeMode === "lan"
              ? `已保存到 Unity 工程：${fileName}`
              : `已保存到当前浏览器：${fileName}`
          : `已保存提交时的 ${fileName}；当前关卡及后续编辑未受影响。`,
      );
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
    const command = commandFromKeyboardEvent(event);
    if (!command) return;
    event.preventDefault();
    switch (command.command) {
      case "undo": this.undo(); break;
      case "redo": this.redo(); break;
      case "copy": this.copySelection(); break;
      case "cut": this.cutSelection(); break;
      case "paste": this.pasteSelection(); break;
      case "duplicate": this.duplicateSelection(); break;
      case "save": this.save(); break;
      case "save-as": this.promptSaveAs(); break;
      case "select-all": this.selectAllVisible(); break;
      case "delete": this.deleteTiles([]); break;
      case "clear-selection": this.setSelection(new Set()); break;
      case "nudge": this.nudgeSelection(command.args.dx, command.args.dy); break;
      case "nudge-layer": this.nudgeSelectionLayer(command.args.delta); break;
      case "step-layer-view": this.stepLayerView(command.args.delta); break;
      case "cycle-layer-view": this.cycleLayerView(); break;
      case "toggle-play": this.switchMode(this.mode === "edit" ? "play" : "edit"); break;
      case "fit": this.renderer?.fitCamera(); break;
      case "tool": this.setTool(command.args.tool); break;
      default: break;
    }
  }

  updateUI() {
    this.root.dataset.mode = this.mode;
    this.root.dataset.view = this.view;
    this.root.dataset.runtimeMode = this.runtimeMode;
    setPressed(this.elements.modeEdit, this.mode === "edit");
    setPressed(this.elements.modePlay, this.mode === "play");
    setPressed(this.elements.view2d, this.view === "2d");
    setPressed(this.elements.view3d, this.view === "3d");
    this.root.querySelectorAll("[data-tool]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tool === this.tool);
      button.disabled =
        this.readonly ||
        (this.view === "3d" && ["place", "fill", "box", "pan"].includes(button.dataset.tool));
    });
    this.elements.undo.disabled = !this.history?.canUndo;
    this.elements.redo.disabled = !this.history?.canRedo;
    const maxLayer = Math.max(1, ...((this.document?.tiles ?? []).map(({ layer }) => Number(layer) || 1)));
    this.elements.layerViewMode.value = this.layerView.mode;
    this.elements.layerViewMode.disabled = !this.document || this.readonly;
    this.elements.layerViewPrev.disabled = !this.document || this.readonly || this.layerView.layer <= 1;
    this.elements.layerViewNext.disabled = !this.document || this.readonly || this.layerView.layer >= maxLayer;
    this.elements.layerViewCurrent.textContent = `L${this.layerView.layer}/${maxLayer}`;
    this.elements.layerSeparation.value = String(Math.round(this.layerSeparation * 100));
    this.elements.layerSeparationValue.textContent = `${Math.round(this.layerSeparation * 100)}%`;
    this.elements.layerSeparation.disabled = !this.document || this.view !== "3d";
    this.elements.focus3dSelection.disabled = !this.document || this.view !== "3d";
    this.elements.resetLevel.disabled = !this.canResetBundled || !this.document?.bundled;
    const canDeleteCurrent = this.canDeleteBundled
      ? Boolean(this.document?.fileName && this.document?.version)
      : Boolean(this.document?.local && !this.document?.bundled);
    this.elements.deleteLocalLevel.disabled = this.readonly || !canDeleteCurrent;
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
    this.elements.playToolButtons.forEach((button) => {
      const remaining = this.playSnapshot?.tools?.[button.dataset.playTool]?.remaining ?? 0;
      button.disabled = this.mode !== "play" || !this.playSession || remaining <= 0;
      button.querySelector(".play-tool-count").textContent = String(remaining);
      button.setAttribute(
        "aria-label",
        `${button.title}，剩余 ${remaining} 次`,
      );
    });
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
      passRate: this.passRateState,
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
