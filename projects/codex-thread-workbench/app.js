const grid = document.querySelector('[data-role="conversation-grid"]');
const picker = document.querySelector('[data-role="picker"]');
const pickerSearch = document.querySelector('[data-role="picker-search"]');
const threadCount = document.querySelector('[data-role="thread-count"]');
const toast = document.querySelector('[data-role="toast"]');
const orderStorageKey = "codex-thread-workbench-demo-thread-order-v1";
const dragThreshold = 6;
const defaultThreadOrder = [...grid.querySelectorAll(".thread-card")]
  .map(card => card.dataset.threadId);

const extraThreads = {
  memory: {
    title: "跨项目长期记忆维护",
    path: "C:\\Notes\\Codex-Memory",
    status: "已完成",
    statusClass: "status-completed",
    user: "整理今天确认的项目决策，并更新长期记忆入口。",
    assistant: "已完成增量更新，没有保存原始对话或敏感凭据。"
  },
  gamepulse: {
    title: "GamePulse 小游雷达",
    path: "C:\\Projects\\GamePulse",
    status: "进行中",
    statusClass: "status-running",
    user: "继续检查今日新增小游戏来源，标记值得跟进的产品。",
    assistant: "已完成第一轮去重，正在核验剩余来源。"
  }
};

let toastTimer;
let dragGesture = null;

restoreCardOrder();

document.addEventListener("click", event => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    handleAction(actionButton.dataset.action, actionButton);
    return;
  }

  const openButton = event.target.closest("[data-open-thread]");
  if (openButton && !openButton.disabled) {
    openThread(openButton.dataset.openThread, openButton);
  }
});

document.addEventListener("submit", event => {
  const composer = event.target.closest('[data-role="composer"]');
  if (!composer) return;
  event.preventDefault();
  sendMessage(composer);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && dragGesture) {
    event.preventDefault();
    cancelCardDrag();
    return;
  }

  if (event.key === "Escape" && !picker.hidden) {
    closePicker();
    return;
  }

  const textarea = event.target.closest('[data-role="composer"] textarea');
  if (textarea && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    textarea.closest("form").requestSubmit();
  }
});

document.addEventListener("pointerdown", event => {
  const surface = event.target.closest('[data-role="drag-surface"]');
  if (!surface || !grid.contains(surface) || event.button !== 0) return;
  if (event.target.closest("button, a, input, textarea, select")) return;

  const source = surface.closest(".thread-card");
  if (!source || source.hidden) return;
  dragGesture = {
    pointerId: event.pointerId,
    source,
    target: null,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false
  };
  event.preventDefault();
});

document.addEventListener("pointermove", event => {
  if (!dragGesture || event.pointerId !== dragGesture.pointerId) return;
  if (!dragGesture.dragging) {
    const distance = Math.hypot(
      event.clientX - dragGesture.startX,
      event.clientY - dragGesture.startY
    );
    if (distance < dragThreshold) return;
    dragGesture.dragging = true;
    dragGesture.source.classList.add("is-dragging");
    document.body.classList.add("is-dragging-thread-card");
  }

  event.preventDefault();
  const gridBounds = grid.getBoundingClientRect();
  const outsideGrid = event.clientX < gridBounds.left
    || event.clientX > gridBounds.right
    || event.clientY < gridBounds.top
    || event.clientY > gridBounds.bottom;
  if (outsideGrid) {
    cancelCardDrag();
    return;
  }

  setDropTarget(getDropTargetAtPoint(event.clientX, event.clientY, dragGesture.source));
});

document.addEventListener("pointerup", event => {
  if (!dragGesture || event.pointerId !== dragGesture.pointerId) return;
  const { dragging, source } = dragGesture;
  const releaseTarget = dragging
    ? getDropTargetAtPoint(event.clientX, event.clientY, source)
    : null;
  if (releaseTarget) {
    swapCardPositions(source, releaseTarget);
    persistCardOrder();
  }
  cancelCardDrag();
});

document.addEventListener("pointercancel", event => {
  if (dragGesture && event.pointerId === dragGesture.pointerId) {
    cancelCardDrag();
  }
});

window.addEventListener("blur", cancelCardDrag);

pickerSearch.addEventListener("input", () => {
  const query = pickerSearch.value.trim().toLowerCase();
  picker.querySelectorAll("[data-open-thread]").forEach(button => {
    button.hidden = Boolean(query) && !button.textContent.toLowerCase().includes(query);
  });
});

document.addEventListener("fullscreenchange", updateFullscreenLabel);
updateThreadCount();

function handleAction(action, button) {
  if (action === "open-picker") {
    openPicker();
  } else if (action === "close-picker") {
    closePicker();
  } else if (action === "fullscreen") {
    toggleFullscreen();
  } else if (action === "reset-layout") {
    resetLayout();
  } else if (action === "minimize-card") {
    toggleCard(button.closest(".thread-card"), button);
  } else if (action === "close-card") {
    closeCard(button.closest(".thread-card"));
  } else if (action === "approve" || action === "decline") {
    resolveApproval(button.closest(".thread-card"), action === "approve");
  }
}

function openPicker() {
  picker.hidden = false;
  pickerSearch.value = "";
  picker.querySelectorAll("[data-open-thread]").forEach(button => {
    button.hidden = false;
  });
  window.setTimeout(() => pickerSearch.focus(), 0);
}

function closePicker() {
  picker.hidden = true;
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  if (document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
      return;
    } catch {
      // The browser may block fullscreen outside a trusted click context.
    }
  }

  document.body.classList.toggle("theater");
  updateFullscreenLabel();
}

function updateFullscreenLabel() {
  const button = document.querySelector('[data-action="fullscreen"]');
  const active = Boolean(document.fullscreenElement) || document.body.classList.contains("theater");
  button.textContent = active ? "退出全屏" : "全屏";
}

function resetLayout() {
  cancelCardDrag();
  restoreDefaultCardOrder();
  try {
    localStorage.removeItem(orderStorageKey);
  } catch {
    // Storage may be unavailable in a privacy-restricted browser.
  }
  grid.querySelectorAll(".thread-card").forEach(card => {
    card.hidden = false;
    card.classList.remove("is-minimized", "is-closing");
  });
  picker.querySelectorAll("[data-open-thread]").forEach(button => {
    const open = Boolean(grid.querySelector(`[data-thread-id="${button.dataset.openThread}"]`));
    button.disabled = open;
    button.querySelector("em").textContent = open ? "已打开" : "打开";
  });
  updateThreadCount();
  showToast("已恢复默认会话布局");
}

function toggleCard(card, button) {
  const minimized = card.classList.toggle("is-minimized");
  button.textContent = minimized ? "□" : "−";
  button.setAttribute("aria-label", minimized ? "展开会话" : "最小化会话");
  button.title = minimized ? "展开会话" : "最小化会话";
}

function closeCard(card) {
  if (!card) return;
  card.classList.add("is-closing");
  window.setTimeout(() => {
    card.hidden = true;
    card.classList.remove("is-closing");
    const pickerButton = picker.querySelector(`[data-open-thread="${card.dataset.threadId}"]`);
    if (pickerButton) {
      pickerButton.disabled = false;
      pickerButton.querySelector("em").textContent = "打开";
    }
    updateThreadCount();
  }, 180);
}

function sendMessage(composer) {
  const textarea = composer.querySelector("textarea");
  const submit = composer.querySelector('button[type="submit"]');
  const text = textarea.value.trim();
  if (!text) {
    textarea.focus();
    return;
  }

  const card = composer.closest(".thread-card");
  const messages = card.querySelector('[data-role="messages"]');
  const status = card.querySelector('[data-role="status"]');
  appendMessage(messages, "你", text, true);
  textarea.value = "";
  submit.disabled = true;
  submit.textContent = "发送中";
  setStatus(status, "进行中", "status-running");
  messages.scrollTop = messages.scrollHeight;

  window.setTimeout(() => {
    appendMessage(messages, "Codex", "收到。网页演示已模拟发送；Windows 版会把这条消息交给当前真实 Codex 线程。");
    setStatus(status, "已完成", "status-completed");
    submit.disabled = false;
    submit.textContent = "发送";
    messages.scrollTop = messages.scrollHeight;
  }, 720);
}

function appendMessage(container, author, text, isUser = false) {
  const message = document.createElement("div");
  message.className = `message ${isUser ? "message-user" : "message-assistant"}`;
  const label = document.createElement("span");
  label.textContent = author;
  const copy = document.createElement("p");
  copy.textContent = text;
  message.append(label, copy);
  container.append(message);
}

function resolveApproval(card, approved) {
  const request = card.querySelector('[data-role="approval"]');
  const status = card.querySelector('[data-role="status"]');
  if (!request) return;
  request.innerHTML = approved
    ? "<strong>已允许文件变更，线程继续执行。</strong>"
    : "<strong>已拒绝文件变更，线程保持停止。</strong>";
  setStatus(
    status,
    approved ? "进行中" : "已停止",
    approved ? "status-running" : "status-stopped"
  );
  showToast(approved ? "已允许，本线程继续执行" : "已拒绝，本线程已停止");
}

function openThread(id, pickerButton) {
  const existing = grid.querySelector(`[data-thread-id="${id}"]`);
  if (existing) {
    existing.hidden = false;
    existing.classList.remove("is-minimized");
  } else {
    const visibleCount = grid.querySelectorAll(".thread-card:not([hidden])").length;
    if (visibleCount >= 6) {
      showToast("最多同时显示 6 个线程");
      return;
    }
    const thread = extraThreads[id];
    if (!thread) return;
    grid.insertAdjacentHTML("beforeend", renderThread(id, thread));
  }

  pickerButton.disabled = true;
  pickerButton.querySelector("em").textContent = "已打开";
  updateThreadCount();
  closePicker();
  showToast("线程已加入工作台");
}

function renderThread(id, thread) {
  return `
    <article class="thread-card" data-thread-id="${escapeHtml(id)}">
      <header class="thread-header" data-role="drag-surface" title="拖动调整任务位置">
        <span class="drag-grip" data-role="drag-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <div class="thread-identity">
          <div class="thread-title-row">
            <h2>${escapeHtml(thread.title)}</h2>
            <span class="status-badge ${escapeHtml(thread.statusClass)}" data-role="status">${escapeHtml(thread.status)}</span>
          </div>
          <p>${escapeHtml(thread.path)}</p>
        </div>
        <div class="thread-controls">
          <button type="button" data-action="minimize-card" title="最小化会话" aria-label="最小化会话">−</button>
          <button type="button" data-action="close-card" title="关闭会话" aria-label="关闭会话">×</button>
        </div>
      </header>
      <div class="thread-content">
        <div class="message-list" data-role="messages" aria-live="polite">
          <div class="message message-user"><span>你</span><p>${escapeHtml(thread.user)}</p></div>
          <div class="message message-assistant"><span>Codex</span><p>${escapeHtml(thread.assistant)}</p></div>
        </div>
        <form class="composer" data-role="composer">
          <textarea rows="2" placeholder="直接输入下一条指令…" aria-label="向 ${escapeHtml(thread.title)}线程发送消息"></textarea>
          <button type="submit">发送</button>
        </form>
      </div>
    </article>
  `;
}

function setStatus(node, text, className) {
  node.textContent = text;
  node.className = `status-badge ${className}`;
}

function updateThreadCount() {
  const count = [...grid.querySelectorAll(".thread-card")].filter(card => !card.hidden).length;
  threadCount.textContent = `当前显示 ${count} 个会话`;
}

function setDropTarget(target) {
  if (!dragGesture || dragGesture.target === target) return;
  dragGesture.target?.classList.remove("is-drop-target");
  dragGesture.target = target;
  dragGesture.target?.classList.add("is-drop-target");
}

function getDropTargetAtPoint(clientX, clientY, source) {
  const gridBounds = grid.getBoundingClientRect();
  const insideGrid = clientX >= gridBounds.left
    && clientX <= gridBounds.right
    && clientY >= gridBounds.top
    && clientY <= gridBounds.bottom;
  if (!insideGrid) return null;

  const target = document.elementFromPoint(clientX, clientY)?.closest(".thread-card");
  return target && grid.contains(target) && target !== source && !target.hidden
    ? target
    : null;
}

function cancelCardDrag() {
  if (!dragGesture) return;
  dragGesture.source.classList.remove("is-dragging");
  dragGesture.target?.classList.remove("is-drop-target");
  document.body.classList.remove("is-dragging-thread-card");
  dragGesture = null;
}

function swapCardPositions(source, target) {
  const marker = document.createComment("thread-card-swap");
  source.replaceWith(marker);
  target.replaceWith(source);
  marker.replaceWith(target);
}

function currentCardOrder() {
  return [...grid.querySelectorAll(".thread-card")].map(card => card.dataset.threadId);
}

function persistCardOrder() {
  try {
    localStorage.setItem(orderStorageKey, JSON.stringify(currentCardOrder()));
  } catch {
    // The demo still reorders for this session when storage is unavailable.
  }
}

function restoreCardOrder() {
  try {
    const order = JSON.parse(localStorage.getItem(orderStorageKey));
    if (!Array.isArray(order) || order.some(id => typeof id !== "string")) return;
    applyCardOrder(order);
  } catch {
    // Ignore malformed or unavailable local storage and keep the default order.
  }
}

function restoreDefaultCardOrder() {
  applyCardOrder(defaultThreadOrder);
}

function applyCardOrder(order) {
  const cards = new Map(
    [...grid.querySelectorAll(".thread-card")].map(card => [card.dataset.threadId, card])
  );
  const seen = new Set();
  order.forEach(id => {
    const card = cards.get(id);
    if (!card || seen.has(id)) return;
    seen.add(id);
    grid.append(card);
  });
  cards.forEach((card, id) => {
    if (!seen.has(id)) grid.append(card);
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
