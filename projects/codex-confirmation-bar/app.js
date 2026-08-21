(() => {
  "use strict";

  const confirmationMessage = "确认，继续开始做，完成前不要停。";
  const sampleCandidates = [
    { id: "publish", title: "发布 Codex 待确认悬浮助手", detail: "回合已结束 · 等待确认后继续发布" },
    { id: "mac", title: "更新 macOS 双架构下载包", detail: "回合已中断 · 等待用户下一条消息" },
    { id: "news", title: "整理 AI 与 Codex 新闻网页", detail: "回合已结束 · 用户尚未回复" },
  ];

  const bar = document.querySelector('[data-role="confirmation-bar"]');
  const handle = document.querySelector('[data-role="drag-handle"]');
  const list = document.querySelector('[data-role="candidate-list"]');
  const count = document.querySelector('[data-role="count"]');
  const status = document.querySelector('[data-role="status"]');
  const failButton = document.querySelector('[data-action="fail-next"]');
  const confirmAllButton = document.querySelector('[data-action="confirm-all"]');

  let state = {
    candidates: [],
    failNext: false,
    status: "悬浮栏正在常驻扫描，当前没有模拟候选。点击“开始模拟扫描”。",
  };
  let drag = null;

  function reduce(current, action) {
    switch (action.type) {
      case "scan":
        return {
          candidates: sampleCandidates.map((candidate) => ({ ...candidate, state: "ready" })),
          failNext: false,
          status: "模拟扫描完成：发现 3 个待确认任务。",
        };
      case "fail-next":
        return {
          ...current,
          failNext: !current.failNext,
          status: !current.failNext ? "已启用：下一次模拟发送将失败。" : "已取消失败模拟。",
        };
      case "confirm": {
        if (current.failNext) {
          return {
            ...current,
            failNext: false,
            candidates: current.candidates.map((candidate) => (
              candidate.id === action.id ? { ...candidate, state: "error" } : candidate
            )),
            status: "模拟发送失败：候选已保留，可直接重试。",
          };
        }
        return {
          ...current,
          candidates: current.candidates.filter((candidate) => candidate.id !== action.id),
          status: `已模拟发送：${confirmationMessage}`,
        };
      }
      case "retry":
        return {
          ...current,
          candidates: current.candidates.filter((candidate) => candidate.id !== action.id),
          status: `重试成功，已模拟发送：${confirmationMessage}`,
        };
      case "confirm-all":
        return {
          ...current,
          candidates: [],
          failNext: false,
          status: `全部候选已模拟确认。发送内容：${confirmationMessage}`,
        };
      case "reset":
        return {
          candidates: [],
          failNext: false,
          status: "模拟已重置，悬浮栏继续常驻扫描。点击“开始模拟扫描”可重新体验。",
        };
      default:
        return current;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function renderCandidate(candidate) {
    const failed = candidate.state === "error";
    return `
      <article class="candidate" data-role="candidate" data-candidate-id="${escapeHtml(candidate.id)}" data-state="${failed ? "error" : "ready"}">
        <div>
          <h3>${escapeHtml(candidate.title)}</h3>
          <p>${escapeHtml(candidate.detail)}</p>
          ${failed ? '<p class="candidate-error">发送未验证，候选不会消失。</p>' : ""}
        </div>
        <div class="candidate-actions">
          ${failed
            ? '<button class="retry-button" type="button" data-action="retry">重试</button>'
            : '<button class="confirm-button" type="button" data-action="confirm">确认继续</button>'}
        </div>
      </article>`;
  }

  function render() {
    list.innerHTML = state.candidates.map(renderCandidate).join("");
    count.textContent = state.candidates.length > 0
      ? `待确认 · ${state.candidates.length}`
      : "暂无待确认 · 常驻扫描";
    status.textContent = state.status;
    confirmAllButton.disabled = state.candidates.length === 0;
    failButton.setAttribute("aria-pressed", String(state.failNext));
  }

  function dispatch(action) {
    state = reduce(state, action);
    render();
  }

  function clampBar(left, top) {
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - bar.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - bar.offsetHeight - margin);
    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop),
    };
  }

  function placeBar(left, top) {
    const point = clampBar(left, top);
    bar.style.left = `${point.left}px`;
    bar.style.top = `${point.top}px`;
    bar.style.transform = "none";
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const candidate = button.closest('[data-role="candidate"]');
    if (action === "scan") dispatch({ type: "scan" });
    if (action === "fail-next") dispatch({ type: "fail-next" });
    if (action === "reset") dispatch({ type: "reset" });
    if (action === "confirm-all") dispatch({ type: "confirm-all" });
    if (action === "confirm" && candidate) dispatch({ type: "confirm", id: candidate.dataset.candidateId });
    if (action === "retry" && candidate) dispatch({ type: "retry", id: candidate.dataset.candidateId });
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const bounds = bar.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
    placeBar(bounds.left, bounds.top);
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    placeBar(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    drag = null;
  }

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("lostpointercapture", () => { drag = null; });
  window.addEventListener("resize", () => {
    if (!bar.style.left) return;
    placeBar(Number.parseFloat(bar.style.left), Number.parseFloat(bar.style.top));
  });

  render();
})();
