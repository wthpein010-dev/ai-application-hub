const TYPES = [0, -1, ...Array.from({ length: 32 }, (_, index) => index + 1), 1001, 1002, 1003, 1004, 1005, 1006];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function numberValue(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
}

function fieldValue(selection, key) {
  if (!selection.length) {
    return "";
  }
  const first = selection[0][key];
  return selection.every((tile) => tile[key] === first) ? first : "";
}

export class InspectorPanel {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.state = null;
  }

  mount(host) {
    this.host = host;
    return this;
  }

  update(state) {
    this.state = state;
    this.render();
  }

  render() {
    if (!this.host) {
      return;
    }
    const state = this.state;
    if (!state?.document) {
      this.host.innerHTML = `
        <div class="inspector-empty">
          <div>⌁</div>
          <p>打开关卡后可编辑关卡和砖块属性。</p>
        </div>`;
      return;
    }
    if (state.mode === "play") {
      this.renderPlay(state);
      return;
    }

    const { document, issues = [], readonly = false, placement = {} } = state;
    const selected = document.tiles.filter((tile) => state.selection.has(tile.uid));
    const selectedType = selected.length ? fieldValue(selected, "type") : placement.type;
    this.host.innerHTML = `
      <section class="inspector-section">
        <h3>关卡信息 <span>${document.fileName ? escapeHtml(document.fileName) : "未命名"}</span></h3>
        <div class="field-grid">
          <label>ID<input data-doc-field="id" type="number" value="${escapeHtml(document.id)}" ${readonly ? "disabled" : ""}></label>
          <label>难度
            <select data-doc-field="difficulty" ${readonly ? "disabled" : ""}>
              ${["Easy", "Normal", "Hard"].map((value) => `<option ${document.difficulty === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </label>
          <label class="span-2">名称<input data-doc-field="name" value="${escapeHtml(document.name)}" ${readonly ? "disabled" : ""}></label>
          <label class="span-2">Grid Unit<input data-grid-unit value="${escapeHtml(document.gridUnit)}" readonly></label>
        </div>
      </section>

      <section class="inspector-section">
        <h3>棋盘与随机</h3>
        <div class="field-grid">
          <label>宽度<input data-board-field="width" type="number" min="4" max="16" value="${document.board.width}" ${readonly ? "disabled" : ""}></label>
          <label>高度<input data-board-field="height" type="number" min="4" max="20" value="${document.board.height}" ${readonly ? "disabled" : ""}></label>
          <label>缩放<input data-doc-field="board.scale" type="number" step="0.05" min="0.1" value="${document.board.scale}" ${readonly ? "disabled" : ""}></label>
          <label>普通图案数<input data-doc-field="random.blockTypeCount" type="number" min="1" max="32" value="${document.random.blockTypeCount}" ${readonly ? "disabled" : ""}></label>
          <label>全随机最小<input data-doc-field="random.fullTypeMin" type="number" min="1" max="32" value="${document.random.fullTypeMin}" ${readonly ? "disabled" : ""}></label>
          <label>全随机最大<input data-doc-field="random.fullTypeMax" type="number" min="1" max="32" value="${document.random.fullTypeMax}" ${readonly ? "disabled" : ""}></label>
        </div>
      </section>

      <section class="inspector-section">
        <h3>${selected.length ? `已选 ${selected.length} 张` : "放置参数"}</h3>
        <div class="field-grid">
          ${
            selected.length === 1
              ? `
                <label>X<input data-tile-field="x" type="number" value="${fieldValue(selected, "x")}" ${readonly ? "disabled" : ""}></label>
                <label>Y<input data-tile-field="y" type="number" value="${fieldValue(selected, "y")}" ${readonly ? "disabled" : ""}></label>
                <label>层级<input data-tile-field="layer" type="number" min="1" value="${fieldValue(selected, "layer")}" ${readonly ? "disabled" : ""}></label>
                <label>翻转
                  <select data-tile-field="presetColorType" ${readonly ? "disabled" : ""}>
                    <option value="1" ${fieldValue(selected, "presetColorType") === 1 ? "selected" : ""}>普通正面</option>
                    <option value="2" ${fieldValue(selected, "presetColorType") === 2 ? "selected" : ""}>背面朝上</option>
                  </select>
                </label>`
              : selected.length > 1
                ? `
                  <p class="selection-edit-hint">多选时使用方向键微移，PageUp / PageDown 整体调层，避免绝对坐标把砖块压到同一点。</p>
                  <label>翻转
                    <select data-tile-field="presetColorType" ${readonly ? "disabled" : ""}>
                      <option value="1" ${fieldValue(selected, "presetColorType") === 1 ? "selected" : ""}>普通正面</option>
                      <option value="2" ${fieldValue(selected, "presetColorType") === 2 ? "selected" : ""}>背面朝上</option>
                    </select>
                  </label>`
              : `
                <label>层级<input data-placement-field="layer" type="number" min="1" value="${placement.layer ?? 1}" ${readonly ? "disabled" : ""}></label>
                <label>翻转
                  <select data-placement-field="presetColorType" ${readonly ? "disabled" : ""}>
                    <option value="1" ${placement.presetColorType !== 2 ? "selected" : ""}>普通正面</option>
                    <option value="2" ${placement.presetColorType === 2 ? "selected" : ""}>背面朝上</option>
                  </select>
                </label>`
          }
          <label>吸附
            <select data-snap-step ${readonly ? "disabled" : ""}>
              ${[1, 2, 4, 8].map((step) => `<option value="${step}" ${state.snapStep === step ? "selected" : ""}>${step} 微格</option>`).join("")}
            </select>
          </label>
          ${selected.length ? `<button id="clear-selection" class="secondary-button" type="button">清除选择</button>` : ""}
        </div>
      </section>

      <section class="inspector-section">
        <h3>砖块图案 <span>${selectedType === "" ? "混合" : selectedType}</span></h3>
        <div class="tile-palette">
          ${TYPES.map((type) => `<button type="button" data-tile-type="${type}" class="${selectedType === type ? "is-active" : ""}" title="${type === 0 ? "局部随机" : type === -1 ? "全随机" : type >= 1001 ? `特效 ${type}` : `图案 ${type}`}" ${readonly ? "disabled" : ""}>${type === 0 ? "R" : type === -1 ? "FR" : type}</button>`).join("")}
        </div>
      </section>

      <section class="inspector-section">
        <h3>合法性检查 <span>${issues.length ? `${issues.length} 项` : "通过"}</span></h3>
        ${
          issues.length
            ? `<ul class="validation-list">${issues.slice(0, 12).map((item, index) => `<li class="validation-item ${item.severity === "warning" ? "is-warning" : "is-error"}"><button type="button" data-issue-index="${index}" title="定位相关砖块">${escapeHtml(item.message)}</button></li>`).join("")}</ul>`
            : `<p class="validation-ok">✓ 当前关卡通过网页规则校验</p>`
        }
      </section>

      <section class="inspector-section">
        <div class="inspector-actions">
          <button id="validate-level" type="button" class="secondary-button">重新校验</button>
          <button id="export-level" type="button" class="secondary-button">导出 JSON</button>
          <button id="save-as-level" type="button" class="secondary-button" ${readonly ? "disabled" : ""}>另存为</button>
          <button id="save-level" type="button" class="primary-button" ${readonly ? "disabled" : ""}>保存到浏览器</button>
        </div>
      </section>`;

    this.bindEditorEvents(selected);
  }

  bindEditorEvents(selected) {
    this.host.querySelectorAll("[data-doc-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const numeric = input.type === "number";
        this.callbacks.onDocumentPatch?.(input.dataset.docField, numeric ? numberValue(input) : input.value);
      });
    });
    this.host.querySelectorAll("[data-board-field]").forEach((input) => {
      input.addEventListener("change", () => {
        this.callbacks.onBoardPatch?.({ [input.dataset.boardField]: numberValue(input) });
      });
    });
    this.host.querySelectorAll("[data-tile-field]").forEach((input) => {
      input.addEventListener("change", () => {
        this.callbacks.onTilePatch?.({ [input.dataset.tileField]: numberValue(input) });
      });
    });
    this.host.querySelectorAll("[data-placement-field]").forEach((input) => {
      input.addEventListener("change", () => {
        this.callbacks.onPlacementPatch?.({ [input.dataset.placementField]: numberValue(input) });
      });
    });
    this.host.querySelector("[data-snap-step]")?.addEventListener("change", (event) => {
      this.callbacks.onSnapStep?.(Number(event.currentTarget.value));
    });
    this.host.querySelectorAll("[data-tile-type]").forEach((button) => {
      button.addEventListener("click", () => {
        const type = Number(button.dataset.tileType);
        if (selected.length) {
          this.callbacks.onTilePatch?.({ type });
        } else {
          this.callbacks.onPlacementPatch?.({ type });
        }
      });
    });
    this.host.querySelector("#clear-selection")?.addEventListener("click", () => {
      this.callbacks.onSelectionChange?.(new Set());
    });
    this.host.querySelector("#validate-level")?.addEventListener("click", () => this.callbacks.onValidate?.());
    this.host.querySelectorAll("[data-issue-index]").forEach((button) => {
      button.addEventListener("click", () => {
        this.callbacks.onIssueFocus?.(this.state?.issues?.[Number(button.dataset.issueIndex)]);
      });
    });
    this.host.querySelector("#export-level")?.addEventListener("click", () => this.callbacks.onExport?.());
    this.host.querySelector("#save-level")?.addEventListener("click", () => this.callbacks.onSave?.());
    this.host.querySelector("#save-as-level")?.addEventListener("click", () => this.callbacks.onSaveAs?.());
  }

  renderPlay(state) {
    const snapshot = state.snapshot;
    const active = snapshot?.tiles.filter((tile) => !tile.removed) ?? [];
    const boardCount = active.filter((tile) => !Number.isInteger(tile.stashedSlot)).length;
    const selected = snapshot?.selectedTileUid
      ? snapshot.tiles.find((tile) => tile.uid === snapshot.selectedTileUid)
      : null;
    this.host.innerHTML = `
      <section class="inspector-section">
        <h3>试玩状态 <span>${snapshot?.won ? "通关" : snapshot?.deadlocked ? "死局" : "进行中"}</span></h3>
        <div class="play-summary">
          <div class="play-summary-row"><span>随机种子</span><strong>${snapshot?.seed ?? "—"}</strong></div>
          <div class="play-summary-row"><span>棋盘剩余</span><strong>${boardCount}</strong></div>
          <div class="play-summary-row"><span>暂存槽</span><strong>${snapshot?.tray.filter(Boolean).length ?? 0} / 2</strong></div>
          <div class="play-summary-row"><span>当前选择</span><strong>${selected ? `#${selected.type} / L${selected.layer}` : "无"}</strong></div>
        </div>
      </section>
      <section class="inspector-section">
        <h3>操作提示</h3>
        <ul class="validation-list">
          <li class="validation-item" style="border-color:var(--cyan);background:rgb(111 215 207 / .06)">左键选择第二张同图牌即可配对。</li>
          <li class="validation-item" style="border-color:var(--cyan);background:rgb(111 215 207 / .06)">在 2D/3D 中右键可把可用牌放入暂存槽。</li>
          <li class="validation-item" style="border-color:var(--cyan);background:rgb(111 215 207 / .06)">切换 2D/3D 不会重置当前试玩。</li>
        </ul>
      </section>
      <section class="inspector-section">
        <div class="inspector-actions">
          <button id="inspector-restart" type="button" class="secondary-button">重新开始</button>
          <button id="inspector-rerandomize" type="button" class="primary-button">重新随机</button>
        </div>
      </section>`;
    this.host.querySelector("#inspector-restart")?.addEventListener("click", () => this.callbacks.onRestart?.());
    this.host.querySelector("#inspector-rerandomize")?.addEventListener("click", () => this.callbacks.onRerandomize?.());
  }
}
