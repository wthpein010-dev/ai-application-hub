(() => {
  const WIDGET_ID = "__feishu_batch_downloader_widget__";
  const FEISHU_HOST_RE = /(^|\.)feishu\.cn$|(^|\.)larksuite\.com$/;
  const EXPORT_POLL_LIMIT = 18;
  const EXPORT_POLL_INTERVAL = 1200;
  const TYPE_META = {
    2: { apiType: "doc", extension: "docx" },
    3: { apiType: "sheet", extension: "xlsx" },
    8: { apiType: "bitable", extension: "xlsx" },
    11: { apiType: "mindnote", extension: "mm" },
    22: { apiType: "docx", extension: "docx" },
    30: { apiType: "slides", extension: "pptx" }
  };

  if (!FEISHU_HOST_RE.test(location.hostname) || document.getElementById(WIDGET_ID)) {
    return;
  }

  const state = {
    isOpen: false,
    isLoaded: false,
    isLoading: false,
    tree: [],
    files: [],
    filesById: new Map(),
    selected: new Set(),
    expanded: new Set(["root:my", "root:shared", "root:wiki"]),
    visibleFileIds: new Set(),
    type: "all",
    query: "",
    activeJob: null,
    jobRows: new Map()
  };

  const host = document.createElement("div");
  host.id = WIDGET_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.append(host);

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        --bg: #f4f6f8;
        --panel: #ffffff;
        --ink: #172033;
        --muted: #657287;
        --line: #dbe2ea;
        --line-strong: #c8d2dd;
        --teal: #167782;
        --teal-soft: #e5f4f4;
        --amber: #d9802f;
        --green: #1f8a5b;
        --red: #b3404a;
        --shadow: 0 18px 42px rgba(23, 32, 51, 0.22);
        color: var(--ink);
        font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      }

      * { box-sizing: border-box; }

      button,
      input {
        font: inherit;
      }

      button {
        border: 1px solid var(--line);
        border-radius: 7px;
        background: var(--panel);
        color: var(--ink);
        cursor: pointer;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.58;
      }

      .launcher {
        position: fixed;
        top: 168px;
        right: 18px;
        z-index: 2147483646;
        display: grid;
        grid-template-columns: 22px auto;
        align-items: center;
        gap: 7px;
        min-height: 42px;
        border: 1px solid rgba(22, 119, 130, 0.36);
        border-radius: 999px;
        padding: 0 14px 0 12px;
        background: #ffffff;
        box-shadow: 0 10px 28px rgba(23, 32, 51, 0.16);
        color: #0d6570;
        font-size: 13px;
        font-weight: 750;
      }

      .launcher-mark {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: var(--teal);
        color: #fff;
        font-size: 12px;
      }

      .panel {
        position: fixed;
        top: 76px;
        right: 18px;
        z-index: 2147483647;
        display: none;
        width: min(540px, calc(100vw - 36px));
        height: min(760px, calc(100vh - 98px));
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--bg);
        box-shadow: var(--shadow);
      }

      .panel.is-open {
        display: flex;
        flex-direction: column;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 56px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        padding: 10px 12px;
        gap: 12px;
      }

      .brand {
        min-width: 0;
      }

      h2 {
        margin: 0;
        color: var(--ink);
        font-size: 17px;
        line-height: 1.2;
        letter-spacing: 0;
      }

      .sub {
        max-width: 390px;
        margin-top: 2px;
        overflow: hidden;
        color: var(--muted);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .top-actions {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .icon-button {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        color: var(--teal);
        font-size: 18px;
      }

      .body {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
      }

      .status-card,
      .controls,
      .summary,
      .actions,
      .tree,
      .job-panel {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .status-card {
        display: grid;
        gap: 8px;
        padding: 10px;
      }

      .status-line {
        display: flex;
        align-items: center;
        min-height: 18px;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: var(--amber);
      }

      .status-card.is-ready .status-dot { background: var(--green); }
      .status-card.is-error .status-dot { background: var(--red); }

      .meter {
        height: 6px;
        overflow: hidden;
        border-radius: 999px;
        background: #e7edf2;
      }

      .meter span {
        display: block;
        width: 0;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--teal), var(--amber));
        transition: width 180ms ease;
      }

      .controls {
        display: grid;
        gap: 9px;
        padding: 10px;
      }

      .segmented {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
      }

      .segment {
        min-height: 32px;
        padding: 0 6px;
        font-size: 12px;
      }

      .segment.is-active {
        border-color: var(--teal);
        background: var(--teal-soft);
        color: #0d5d65;
        font-weight: 700;
      }

      .search {
        width: 100%;
        min-height: 36px;
        border: 1px solid var(--line);
        border-radius: 7px;
        padding: 0 10px;
        outline: none;
        color: var(--ink);
      }

      .search:focus {
        border-color: var(--teal);
        box-shadow: 0 0 0 3px rgba(22, 119, 130, 0.16);
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        padding: 9px 10px;
        text-align: center;
      }

      .summary div {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .summary strong {
        font-size: 18px;
        line-height: 1.2;
      }

      .summary span {
        color: var(--muted);
        font-size: 12px;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr 0.8fr 1.15fr;
        gap: 8px;
        padding: 10px;
      }

      .actions button {
        min-height: 36px;
      }

      .actions .primary {
        border-color: #0d6570;
        background: var(--teal);
        color: #fff;
        font-weight: 750;
      }

      .tree {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 8px;
      }

      .tree-row {
        display: grid;
        grid-template-columns: 24px 22px 1fr auto;
        align-items: center;
        gap: 6px;
        min-height: 32px;
        border-radius: 7px;
        padding: 2px 6px;
      }

      .tree-row:hover {
        background: #f1f6f7;
      }

      .twisty {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: 13px;
      }

      .twisty.is-empty {
        visibility: hidden;
      }

      .tree-check {
        width: 16px;
        height: 16px;
        margin: 0;
      }

      .node-main {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 8px;
      }

      .badge {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 20px;
        flex: 0 0 auto;
        border-radius: 5px;
        background: #ecf0f4;
        color: #4d5c70;
        font-size: 10px;
        font-weight: 800;
      }

      .badge.folder { background: #fff1df; color: #9d5a1c; }
      .badge.docx { background: #e5f4f4; color: #0d6570; }
      .badge.xlsx { background: #e6f4eb; color: #1f6f4b; }
      .badge.pptx { background: #fff0e6; color: #a95416; }
      .badge.mm { background: #eef0fb; color: #5360a8; }

      .node-text {
        min-width: 0;
      }

      .node-name {
        overflow: hidden;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.25;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-path {
        overflow: hidden;
        margin-top: 1px;
        color: var(--muted);
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-meta {
        color: var(--muted);
        font-size: 11px;
      }

      .children {
        margin-left: 22px;
      }

      .empty {
        display: grid;
        place-items: center;
        min-height: 170px;
        border: 1px dashed var(--line-strong);
        border-radius: 8px;
        color: var(--muted);
        font-size: 13px;
        text-align: center;
        padding: 20px;
      }

      .job-panel {
        max-height: 176px;
        overflow: hidden;
      }

      .job-panel[hidden] {
        display: none;
      }

      .job-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--line);
        padding: 9px 10px;
        font-size: 13px;
      }

      .job-head span {
        color: var(--muted);
        font-size: 12px;
      }

      .job-list {
        max-height: 128px;
        overflow: auto;
        padding: 6px;
      }

      .job-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        border-radius: 7px;
        padding: 6px;
      }

      .job-row:hover {
        background: #f6f8fa;
      }

      .job-name {
        overflow: hidden;
        font-size: 12px;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .job-message {
        margin-top: 2px;
        color: var(--muted);
        font-size: 11px;
      }

      .job-state {
        align-self: center;
        border-radius: 999px;
        padding: 4px 7px;
        background: #ecf0f4;
        color: #4d5c70;
        font-size: 11px;
        font-weight: 700;
      }

      .job-row.is-running .job-state { background: var(--teal-soft); color: #0d6570; }
      .job-row.is-done .job-state { background: #e6f4eb; color: #1f6f4b; }
      .job-row.is-failed .job-state { background: #fdebed; color: var(--red); }

      @media (max-width: 640px) {
        .launcher {
          right: 10px;
          top: auto;
          bottom: 24px;
        }

        .panel {
          inset: 10px;
          width: auto;
          height: auto;
        }
      }
    </style>
    <button class="launcher" type="button" title="打开飞书批量下载">
      <span class="launcher-mark">↓</span>
      <span>批量下载</span>
    </button>
    <aside class="panel" aria-label="飞书批量下载面板">
      <header class="topbar">
        <div class="brand">
          <h2>飞书文件批量下载</h2>
          <div class="sub" data-page-title></div>
        </div>
        <div class="top-actions">
          <button class="icon-button" data-refresh type="button" title="刷新文件列表" aria-label="刷新文件列表">↻</button>
          <button class="icon-button" data-close type="button" title="关闭" aria-label="关闭">×</button>
        </div>
      </header>
      <section class="body">
        <section class="status-card">
          <div class="status-line">
            <span class="status-dot"></span>
            <span data-status>点刷新或等待文件列表加载</span>
          </div>
          <div class="meter" aria-hidden="true"><span data-progress></span></div>
        </section>
        <section class="controls" aria-label="筛选工具">
          <div class="segmented" role="tablist" aria-label="文件类型">
            <button class="segment is-active" data-type="all" type="button">全部</button>
            <button class="segment" data-type="docx" type="button">文档</button>
            <button class="segment" data-type="xlsx" type="button">表格</button>
            <button class="segment" data-type="pptx" type="button">幻灯片</button>
            <button class="segment" data-type="mm" type="button">思维</button>
          </div>
          <input class="search" data-search type="search" placeholder="搜索文件名或路径" autocomplete="off">
        </section>
        <section class="summary" aria-live="polite">
          <div><strong data-total>0</strong><span>可导出</span></div>
          <div><strong data-visible>0</strong><span>当前可见</span></div>
          <div><strong data-selected>0</strong><span>已选择</span></div>
        </section>
        <section class="actions">
          <button data-select-visible type="button">选择可见</button>
          <button data-clear type="button">清空</button>
          <button class="primary" data-export type="button" disabled>开始下载</button>
        </section>
        <section class="tree" data-tree aria-label="飞书文件树">
          <div class="empty">打开面板后会自动加载飞书文件列表</div>
        </section>
        <section class="job-panel" data-job-panel aria-label="下载任务" hidden>
          <div class="job-head">
            <strong>下载队列</strong>
            <span data-job-summary>0 / 0</span>
          </div>
          <div class="job-list" data-job-list></div>
        </section>
      </section>
    </aside>
  `;

  const $ = (selector) => shadow.querySelector(selector);
  const panel = $(".panel");
  const launcher = $(".launcher");

  $("[data-page-title]").textContent = `${detectSection(location.pathname)} · ${document.title || location.hostname}`;

  launcher.addEventListener("click", () => {
    state.isOpen = !state.isOpen;
    panel.classList.toggle("is-open", state.isOpen);
    if (state.isOpen && !state.isLoaded && !state.isLoading) {
      loadLibrary(false);
    }
  });

  $("[data-close]").addEventListener("click", () => {
    state.isOpen = false;
    panel.classList.remove("is-open");
  });

  $("[data-refresh]").addEventListener("click", () => loadLibrary(true));
  $("[data-search]").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
  $("[data-select-visible]").addEventListener("click", () => {
    state.visibleFileIds.forEach((id) => state.selected.add(id));
    render();
  });
  $("[data-clear]").addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  $("[data-export]").addEventListener("click", startExport);

  shadow.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.type;
      shadow.querySelectorAll(".segment").forEach((segment) => segment.classList.toggle("is-active", segment === button));
      render();
    });
  });

  function detectSection(pathname) {
    if (pathname.startsWith("/drive")) return "云文档";
    if (pathname.startsWith("/wiki")) return "知识库";
    if (pathname.startsWith("/doc") || pathname.startsWith("/sheets") || pathname.startsWith("/base") || pathname.startsWith("/mindnotes")) return "文档";
    return "飞书";
  }

  async function loadLibrary(force) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      showError("扩展通信不可用，请重新加载扩展");
      return;
    }

    state.isLoading = true;
    state.selected.clear();
    setStatus(force ? "正在刷新飞书文件列表" : "正在读取飞书文件列表", "loading", force ? 15 : 8);

    try {
      const response = await sendMessage({
        type: "LOAD_FEISHU_LIBRARY",
        origin: location.origin,
        force
      });

      if (!response.ok) {
        throw new Error(response.error || "读取文件列表失败");
      }

      state.tree = response.tree || [];
      state.files = response.files || [];
      state.filesById = new Map(state.files.map((file) => [file.id, file]));
      state.isLoaded = true;
      setStatus(response.cached ? "已使用缓存文件列表" : "文件列表已更新", "ready", 100);
      render();
    } catch (error) {
      showError(error.message);
    } finally {
      state.isLoading = false;
    }
  }

  function render() {
    const tree = $("[data-tree]");
    const filtered = filterNodes(state.tree);
    state.visibleFileIds = collectFileIds(filtered);

    $("[data-total]").textContent = String(state.files.length);
    $("[data-visible]").textContent = String(state.visibleFileIds.size);
    $("[data-selected]").textContent = String(state.selected.size);
    $("[data-export]").disabled = state.selected.size === 0 || Boolean(state.activeJob);

    if (!filtered.length) {
      tree.innerHTML = '<div class="empty">没有匹配当前筛选的文件</div>';
      return;
    }

    tree.replaceChildren(...filtered.map((node) => renderNode(node, 0)));
  }

  function filterNodes(nodes) {
    return nodes
      .map((node) => {
        if (node.kind === "file") {
          const children = filterNodes(node.children || []);
          return matchesFile(node) || children.length ? { ...node, children } : null;
        }

        const children = filterNodes(node.children || []);
        return children.length ? { ...node, children } : null;
      })
      .filter(Boolean);
  }

  function matchesFile(file) {
    const inType = state.type === "all" || file.extension === state.type;
    const haystack = `${file.name} ${file.path} ${file.typeLabel}`.toLowerCase();
    const inQuery = !state.query || haystack.includes(state.query);
    return inType && inQuery;
  }

  function renderNode(node, level) {
    const wrapper = document.createElement("div");
    wrapper.className = "node";

    const row = document.createElement("div");
    row.className = "tree-row";
    row.style.paddingLeft = `${Math.min(level * 12 + 6, 54)}px`;

    const children = node.children || [];
    const hasChildren = children.length > 0;
    const isExpanded = state.expanded.has(node.id);

    const twisty = document.createElement("button");
    twisty.className = `twisty${hasChildren ? "" : " is-empty"}`;
    twisty.type = "button";
    twisty.title = isExpanded ? "收起" : "展开";
    twisty.textContent = isExpanded ? "⌄" : "›";
    twisty.addEventListener("click", () => {
      if (isExpanded) {
        state.expanded.delete(node.id);
      } else {
        state.expanded.add(node.id);
      }
      render();
    });

    const checkbox = document.createElement("input");
    checkbox.className = "tree-check";
    checkbox.type = "checkbox";
    checkbox.checked = isNodeFullySelected(node);
    checkbox.indeterminate = !checkbox.checked && isNodePartlySelected(node);
    checkbox.addEventListener("change", () => toggleNode(node, checkbox.checked));

    const main = document.createElement("div");
    main.className = "node-main";

    const badge = document.createElement("span");
    badge.className = `badge ${node.kind === "folder" ? "folder" : node.extension || ""}`;
    badge.textContent = node.kind === "folder" ? "DIR" : badgeText(node.extension);

    const text = document.createElement("div");
    text.className = "node-text";

    const name = document.createElement("div");
    name.className = "node-name";
    name.textContent = node.name;

    const path = document.createElement("div");
    path.className = "node-path";
    path.textContent = node.kind === "folder" ? node.path : node.path || "未分类";

    text.append(name, path);
    main.append(badge, text);

    const meta = document.createElement("div");
    meta.className = "node-meta";
    meta.textContent = node.kind === "folder" ? `${collectFileIds([node]).size} 项` : node.typeLabel;

    row.append(twisty, checkbox, main, meta);
    wrapper.append(row);

    if (hasChildren && isExpanded) {
      const childWrap = document.createElement("div");
      childWrap.className = "children";
      children.forEach((child) => childWrap.append(renderNode(child, level + 1)));
      wrapper.append(childWrap);
    }

    return wrapper;
  }

  function toggleNode(node, checked) {
    const ids = collectFileIds([node]);
    ids.forEach((id) => {
      if (checked) {
        state.selected.add(id);
      } else {
        state.selected.delete(id);
      }
    });
    render();
  }

  function isNodeFullySelected(node) {
    const ids = collectFileIds([node]);
    return ids.size > 0 && Array.from(ids).every((id) => state.selected.has(id));
  }

  function isNodePartlySelected(node) {
    const ids = collectFileIds([node]);
    return Array.from(ids).some((id) => state.selected.has(id));
  }

  function collectFileIds(nodes) {
    const ids = new Set();
    const walk = (node) => {
      if (node.kind === "file") {
        ids.add(node.id);
      }
      (node.children || []).forEach(walk);
    };
    nodes.forEach(walk);
    return ids;
  }

  function badgeText(extension) {
    return {
      docx: "DOC",
      xlsx: "XLS",
      pptx: "PPT",
      mm: "MM"
    }[extension] || "FILE";
  }

  async function startExport() {
    const files = Array.from(state.selected)
      .map((id) => state.filesById.get(id))
      .filter(Boolean);

    if (!files.length || state.activeJob) {
      return;
    }

    state.activeJob = { total: files.length, completed: 0, failed: 0 };
    state.jobRows.clear();
    $("[data-job-panel]").hidden = false;
    $("[data-job-list]").replaceChildren(...files.map(createJobRow));
    setStatus(`正在下载 0 / ${files.length}`, "loading", 0);
    render();

    const folderName = `Feishu-Export-${timestamp()}`;
    let completed = 0;
    let failed = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      updateJobRow(file.id, "running", "创建飞书导出任务");

      try {
        const ticket = await createExportTask(file);
        updateJobRow(file.id, "running", "等待飞书生成文件");

        const result = await waitForExportResult(ticket, file);
        const extension = result.extension || getTypeMeta(file.obj_type).extension;
        const filename = buildDownloadPath(folderName, file, extension, index + 1);
        const response = await sendMessage({
          type: "DOWNLOAD_FEISHU_URL",
          url: result.url,
          filename
        });

        if (!response.ok) {
          throw new Error(response.error || "浏览器下载任务创建失败");
        }

        completed += 1;
        updateJobRow(file.id, "done", "已交给浏览器下载");
      } catch (error) {
        failed += 1;
        updateJobRow(file.id, "failed", error.message || "下载失败");
      }

      const handled = completed + failed;
      $("[data-job-summary]").textContent = `${handled} / ${files.length}`;
      setStatus(`正在下载 ${handled} / ${files.length}`, failed ? "error" : "loading", Math.round((handled / files.length) * 100));
    }

    state.activeJob = null;
    setStatus(failed ? `完成 ${completed} 个，失败 ${failed} 个` : `已创建 ${completed} 个下载任务`, failed ? "error" : "ready", 100);
    render();
  }

  function createJobRow(file) {
    const row = document.createElement("div");
    row.className = "job-row";
    row.dataset.fileId = file.id;

    const copy = document.createElement("div");
    const name = document.createElement("div");
    name.className = "job-name";
    name.textContent = file.name;
    const message = document.createElement("div");
    message.className = "job-message";
    message.textContent = file.path || "等待开始";
    copy.append(name, message);

    const stateBadge = document.createElement("span");
    stateBadge.className = "job-state";
    stateBadge.textContent = "等待";

    row.append(copy, stateBadge);
    state.jobRows.set(file.id, row);
    return row;
  }

  function updateJobRow(fileId, status, message) {
    const row = state.jobRows.get(fileId);
    if (!row) {
      return;
    }

    row.classList.remove("is-running", "is-done", "is-failed");
    row.classList.add(`is-${status}`);
    row.querySelector(".job-message").textContent = message || "";
    row.querySelector(".job-state").textContent = statusLabel(status);
  }

  async function createExportTask(file) {
    const meta = getTypeMeta(file.obj_type);
    const requestId = createRequestId();
    const response = await fetch(`/space/api/export/create/?synced_block_host_token=${encodeURIComponent(file.obj_token)}&synced_block_host_type=${encodeURIComponent(meta.apiType)}`, {
      method: "POST",
      credentials: "include",
      mode: "cors",
      referrer: location.href,
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: await requestHeaders(requestId, true),
      body: JSON.stringify({
        token: file.obj_token,
        type: meta.apiType,
        file_extension: meta.extension,
        event_source: 1,
        need_comment: false
      })
    });

    const json = await readJsonResponse(response);
    const ticket = json?.data?.ticket;
    if (!response.ok || !ticket) {
      throw new Error(json?.msg || `导出任务创建失败 ${response.status}`);
    }

    return ticket;
  }

  async function waitForExportResult(ticket, file) {
    const meta = getTypeMeta(file.obj_type);

    for (let attempt = 0; attempt < EXPORT_POLL_LIMIT; attempt += 1) {
      await sleep(EXPORT_POLL_INTERVAL);
      const json = await getExportJson(`/space/api/export/result/${encodeURIComponent(ticket)}?token=${encodeURIComponent(file.obj_token)}&type=${encodeURIComponent(meta.apiType)}&synced_block_host_token=${encodeURIComponent(file.obj_token)}&synced_block_host_type=${encodeURIComponent(meta.apiType)}`);
      const result = json?.data?.result;
      const fileToken = result?.file_token;

      if (fileToken) {
        return {
          url: `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/all/${encodeURIComponent(fileToken)}/?synced_block_host_token=${encodeURIComponent(file.obj_token)}&synced_block_host_type=${encodeURIComponent(meta.apiType)}`,
          extension: result?.file_extension || meta.extension
        };
      }
    }

    throw new Error("导出超时");
  }

  async function getExportJson(path) {
    const response = await fetch(path, {
      method: "GET",
      credentials: "include",
      mode: "cors",
      referrer: location.href,
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: await requestHeaders(createRequestId(), false)
    });
    const json = await readJsonResponse(response);

    if (!response.ok || json?.code !== 0) {
      throw new Error(json?.msg || `请求失败 ${response.status}`);
    }

    return json;
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      const cleanText = text.replace(/\s+/g, " ").trim().slice(0, 120);
      throw new Error(cleanText || `飞书返回了非 JSON 内容 ${response.status}`);
    }
  }

  async function requestHeaders(requestId, hasBody) {
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      "doc-biz": "Lark",
      pragma: "no-cache",
      "request-id": requestId,
      "x-request-id": requestId,
      "x-tt-trace-id": requestId,
      context: `${requestId};os=web;app_version=1.0.0;platform=web`
    };

    if (hasBody) {
      headers["content-type"] = "application/json";
    }

    const csrf = await getCsrfToken();
    if (csrf) {
      headers["x-csrftoken"] = csrf;
    }

    return headers;
  }

  async function getCsrfToken() {
    const visibleCookie = getCookieValue("_csrf_token") || getCookieValue("swp_csrf_token");
    if (visibleCookie) {
      return visibleCookie;
    }

    try {
      const response = await sendMessage({
        type: "GET_FEISHU_CSRF",
        origin: location.origin
      });
      return response.ok ? response.csrf || "" : "";
    } catch {
      return "";
    }
  }

  function getCookieValue(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getTypeMeta(objType) {
    const meta = TYPE_META[Number(objType)];
    if (!meta) {
      throw new Error(`不支持的飞书文件类型：${objType}`);
    }
    return meta;
  }

  function buildDownloadPath(folderName, file, extension, index) {
    const basePath = file.path ? file.path.split("/").map(sanitizePathSegment).join("/") : "未分类";
    const fileName = sanitizePathSegment(file.name);
    const ext = String(extension || file.extension || "docx").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const numberedName = `${String(index).padStart(3, "0")}-${fileName}${fileName.toLowerCase().endsWith(`.${ext}`) ? "" : `.${ext}`}`;
    return `${folderName}/${basePath}/${numberedName}`;
  }

  function sanitizePathSegment(value) {
    return String(value || "未命名")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "未命名";
  }

  function createRequestId() {
    return `fb-${crypto.randomUUID().replace(/-/g, "")}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function handleJobMessage(message, port) {
    if (message.type === "file-update") {
      const row = state.jobRows.get(message.fileId);
      if (row) {
        row.classList.remove("is-running", "is-done", "is-failed");
        row.classList.add(`is-${message.status}`);
        row.querySelector(".job-message").textContent = message.message || "";
        row.querySelector(".job-state").textContent = statusLabel(message.status);
      }
    }

    if (message.type === "job-progress") {
      state.activeJob.completed = message.completed;
      state.activeJob.failed = message.failed;
      $("[data-job-summary]").textContent = `${message.completed + message.failed} / ${message.total}`;
      setStatus(`正在下载 ${message.completed + message.failed} / ${message.total}`, "loading", message.percent);
    }

    if (message.type === "job-complete") {
      state.activeJob = null;
      $("[data-job-summary]").textContent = `${message.completed + message.failed} / ${message.total}`;
      setStatus(message.failed ? `完成 ${message.completed} 个，失败 ${message.failed} 个` : `已创建 ${message.completed} 个下载任务`, message.failed ? "error" : "ready", 100);
      port.disconnect();
      render();
    }

    if (message.type === "job-error") {
      state.activeJob = null;
      setStatus(message.error || "下载任务失败", "error", 100);
      port.disconnect();
      render();
    }
  }

  function statusLabel(status) {
    return {
      running: "进行中",
      done: "完成",
      failed: "失败"
    }[status] || "等待";
  }

  function setStatus(message, mode = "loading", percent = 0) {
    $("[data-status]").textContent = message;
    $("[data-progress]").style.width = `${Math.max(0, Math.min(100, percent))}%`;
    const card = $(".status-card");
    card.classList.toggle("is-ready", mode === "ready");
    card.classList.toggle("is-error", mode === "error");
  }

  function showError(message) {
    setStatus(message, "error", 100);
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = message;
    $("[data-tree]").replaceChildren(empty);
    $("[data-export]").disabled = true;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve(response || {});
        }
      });
    });
  }

  function timestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }
})();
