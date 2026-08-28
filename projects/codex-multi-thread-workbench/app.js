const board = document.querySelector('[data-role="workbench-board"]');
const shell = document.querySelector('[data-role="workbench-shell"]');
const activity = document.querySelector('[data-role="activity-log"]');
const fullscreenButton = document.querySelector('[data-action="toggle-fullscreen"]');
let draggedCard = null;

document.addEventListener("submit", event => {
  const form = event.target.closest(".composer");
  if (!form) return;
  event.preventDefault();
  const card = form.closest('[data-role="thread-card"]');
  const composer = form.querySelector('[data-role="thread-composer"]');
  const text = composer.value.trim();
  if (!text) return;

  const message = document.createElement("div");
  message.className = "message user";
  const copy = document.createElement("p");
  copy.textContent = text;
  message.append(copy);
  card.querySelector('[data-role="conversation"]').append(message);
  composer.value = "";
  setStatus(card, "running", "进行中");
  activity.textContent = `已向「${card.querySelector(".thread-titlebar strong").textContent}」追加演示消息`;
  message.scrollIntoView({ block: "nearest" });
});

document.addEventListener("click", event => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "toggle-fullscreen") {
    const next = document.body.dataset.demoFullscreen !== "true";
    document.body.dataset.demoFullscreen = String(next);
    shell.classList.toggle("is-fullscreen", next);
    fullscreenButton.setAttribute("aria-pressed", String(next));
    activity.textContent = next ? "已切换为全屏演示" : "已返回桌面窗口演示";
  }
  if (action === "refresh-demo") {
    const card = board.querySelector('[data-thread-id="release"]');
    setStatus(card, "done", "已完成");
    activity.textContent = "状态已刷新：Windows 发布任务完成";
  }
});

board.addEventListener("dragstart", event => {
  const handle = event.target.closest('[data-role="drag-handle"]');
  if (!handle) return;
  draggedCard = handle.closest('[data-role="thread-card"]');
  draggedCard.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedCard.dataset.threadId);
});

board.addEventListener("dragover", event => {
  const target = event.target.closest('[data-role="thread-card"]');
  if (!draggedCard || !target || target === draggedCard) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});

board.addEventListener("drop", event => {
  const target = event.target.closest('[data-role="thread-card"]');
  if (!draggedCard || !target || target === draggedCard) return;
  event.preventDefault();
  const sourceTitle = draggedCard.querySelector(".thread-titlebar strong").textContent;
  const targetTitle = target.querySelector(".thread-titlebar strong").textContent;
  const marker = document.createComment("thread-card-swap");
  draggedCard.replaceWith(marker);
  target.replaceWith(draggedCard);
  marker.replaceWith(target);
  activity.textContent = `已交换「${sourceTitle}」与「${targetTitle}」的位置`;
});

board.addEventListener("dragend", () => {
  draggedCard?.classList.remove("is-dragging");
  draggedCard = null;
});

function setStatus(card, kind, label) {
  const status = card.querySelector('[data-role="thread-status"]');
  status.className = `thread-status status-${kind}`;
  status.replaceChildren(Object.assign(document.createElement("i")), document.createTextNode(label));
}
