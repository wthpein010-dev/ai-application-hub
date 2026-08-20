const threads = [
  {
    id: "codex-official-update",
    role: "official",
    roleLabel: "Codex 官方",
    topic: "update",
    topicLabel: "版本更新",
    pinned: true,
    author: "OpenAI Developers",
    handle: "@OpenAIDevs",
    title: "Codex 官方更新帖：关注功能变化、兼容性与使用边界",
    excerpt: "示例摘要：官方更新会被置顶，并拆成“更新了什么、影响谁、需要调整什么”三部分。",
    original: "Sample Codex update thread for interface preview.",
    why: "Codex 官方变化可能直接影响现有任务、工作流与兼容方式。",
    age: "示例 · 18 分钟前",
    url: "https://x.com/OpenAIDevs",
    replies: [
      { author: "开发者用户 · 示例", handle: "@builder_example", text: "最关心这次更新是否会改变已有任务，以及旧版本是否还能继续使用。" },
      { author: "团队用户 · 示例", handle: "@team_example", text: "希望官方说明迁移步骤、失败回退方式和生效时间。" },
    ],
  },
  {
    id: "musk-xai-update",
    role: "musk",
    roleLabel: "马斯克本人",
    topic: "update",
    topicLabel: "产品更新",
    pinned: true,
    author: "Elon Musk",
    handle: "@elonmusk",
    title: "马斯克动态帖：只保留与 xAI、Grok 和 AI 产品调整有关的发言",
    excerpt: "示例摘要：马斯克本人发言单独标识；涉及产品承诺时仍需等待正式公告或文档确认。",
    original: "Sample xAI and Grok product update for interface preview.",
    why: "本人发言通常是重要方向信号，但不自动等同于已经上线的产品事实。",
    age: "示例 · 42 分钟前",
    url: "https://x.com/elonmusk",
    replies: [
      { author: "X 用户 · 示例", handle: "@x_user_example", text: "这项变化是已经上线，还是仅代表后续路线？希望看到明确时间表。" },
    ],
  },
  {
    id: "openai-policy-update",
    role: "official",
    roleLabel: "OpenAI 官方",
    topic: "policy",
    topicLabel: "规则调整",
    pinned: true,
    author: "OpenAI",
    handle: "@OpenAI",
    title: "OpenAI 官方调整帖：模型、套餐与开发者能力变化集中追踪",
    excerpt: "示例摘要：官方发布优先显示生效范围、时间、受影响产品和对应文档。",
    original: "Sample OpenAI product update and policy change for interface preview.",
    why: "模型和产品规则调整会影响成本、能力边界与团队交付计划。",
    age: "示例 · 1 小时前",
    url: "https://x.com/OpenAI",
    replies: [],
  },
  {
    id: "codex-token-reset",
    role: "community",
    roleLabel: "用户讨论",
    topic: "token",
    topicLabel: "Token / 额度",
    pinned: false,
    author: "Codex 用户讨论 · 示例",
    handle: "@codex_user_example",
    title: "用户集中追问：Codex Token 或额度究竟什么时候重置？",
    excerpt: "示例摘要：当前只有用户提问，没有可核验的官方说明，因此状态保持“暂无官方确认”。",
    original: "Users ask whether Codex token quota resets daily or weekly. No official confirmation is attached.",
    why: "额度重置会直接影响任务安排，但不能用个别用户体验代替官方规则。",
    age: "示例 · 2 小时前",
    url: "https://x.com/",
    replies: [
      { author: "高频用户 · 示例", handle: "@power_user_example", text: "不同账号看到的时间似乎不一样，可能与套餐或滚动窗口有关。" },
      { author: "开发者 · 示例", handle: "@dev_example", text: "在官方文档出现前，建议不要把某个倒计时截图当成统一规则。" },
    ],
  },
  {
    id: "codex-context-token",
    role: "community",
    roleLabel: "用户讨论",
    topic: "token",
    topicLabel: "Token / 额度",
    pinned: false,
    author: "Builder Notes · 示例",
    handle: "@builder_notes_example",
    title: "用户实测：长任务中的上下文、压缩与 Token 消耗值得持续观察",
    excerpt: "示例摘要：整理复现条件和环境差异，不把单次体验直接写成平台规则。",
    original: "Community discussion about Codex context window, token usage, and long-running tasks.",
    why: "上下文与消耗变化会影响长任务稳定性，但必须区分体验反馈和正式限制。",
    age: "示例 · 3 小时前",
    url: "https://x.com/",
    replies: [],
  },
  {
    id: "codex-workflow-replies",
    role: "community",
    roleLabel: "用户讨论",
    topic: "discussion",
    topicLabel: "用户留言",
    pinned: false,
    author: "Developer Thread · 示例",
    handle: "@developer_thread_example",
    title: "开发者跟帖：Codex 更新后哪些工作流真的需要调整？",
    excerpt: "示例摘要：把有复现步骤、版本信息和公开链接的用户反馈优先展示。",
    original: "Community workflow discussion with reproducible Codex steps.",
    why: "带版本与复现信息的用户反馈比泛泛评价更适合辅助判断。",
    age: "示例 · 5 小时前",
    url: "https://x.com/",
    replies: [
      { author: "工程用户 · 示例", handle: "@engineer_example", text: "如果行为变化可以稳定复现，最好附上版本号和最小步骤。" },
    ],
  },
  {
    id: "codex-service-incident",
    role: "community",
    roleLabel: "用户报告",
    topic: "incident",
    topicLabel: "故障状态",
    pinned: false,
    author: "Status Watch · 示例",
    handle: "@status_watch_example",
    title: "服务状态讨论：先核对官方状态页，再汇总用户集中反馈",
    excerpt: "示例摘要：故障类帖子按时间线组织，区分官方确认、用户报告和恢复状态。",
    original: "Sample incident discussion: service unavailable and recovery status.",
    why: "故障时间线能帮助判断问题是否普遍，以及是否需要暂停关键任务。",
    age: "示例 · 7 小时前",
    url: "https://status.openai.com/",
    replies: [],
  },
  {
    id: "community-evidence-rule",
    role: "community",
    roleLabel: "用户讨论",
    topic: "discussion",
    topicLabel: "用户留言",
    pinned: false,
    author: "Community Signals · 示例",
    handle: "@community_example",
    title: "普通用户留言只做补充：优先保留有证据、有版本、有复现的信息",
    excerpt: "示例摘要：情绪和传闻不会置顶；可复现的体验变化才进入重点讨论。",
    original: "Sample community replies with evidence and reproducible details.",
    why: "用户讨论能补充官方说明盲区，但不能替代一手来源。",
    age: "示例 · 9 小时前",
    url: "https://x.com/",
    replies: [],
  },
];

const nodes = {
  search: document.querySelector("#searchInput"),
  list: document.querySelector("#threadList"),
  pinned: document.querySelector("#pinnedList"),
  detail: document.querySelector("#threadDetail"),
  count: document.querySelector("#resultCount"),
  empty: document.querySelector("#emptyState"),
  toast: document.querySelector("#toast"),
  filters: [...document.querySelectorAll("[data-filter]")],
};

const state = { filter: "all", selectedId: threads[0].id };

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchesFilter(thread) {
  if (state.filter === "musk") return thread.role === "musk";
  if (state.filter === "official") return thread.role === "official";
  if (state.filter === "token") return thread.topic === "token";
  if (state.filter === "community") return thread.role === "community" || thread.replies.length > 0;
  return true;
}

function visibleThreads() {
  const query = nodes.search.value.trim().toLowerCase();
  return threads.filter((thread) => {
    const haystack = [thread.title, thread.excerpt, thread.original, thread.author, thread.handle, thread.topicLabel].join(" ").toLowerCase();
    return matchesFilter(thread) && (!query || haystack.includes(query));
  });
}

function badges(thread, includePin = false) {
  return `<span class="thread-badges">
    ${includePin && thread.pinned ? '<span class="badge badge-pin">置顶</span>' : ""}
    <span class="badge badge-${escapeHtml(thread.role)}">${escapeHtml(thread.roleLabel)}</span>
    <span class="badge badge-topic badge-topic-${escapeHtml(thread.topic)}">${escapeHtml(thread.topicLabel)}</span>
  </span>`;
}

function renderPinned() {
  nodes.pinned.innerHTML = threads.filter((thread) => thread.pinned).map((thread) => `
    <button class="pinned-thread" type="button" data-open-thread="${escapeHtml(thread.id)}">
      ${badges(thread, true)}
      <strong>${escapeHtml(thread.title)}</strong>
      <span>${escapeHtml(thread.handle)}</span>
    </button>`).join("");
}

function threadCard(thread) {
  const selected = thread.id === state.selectedId;
  const avatar = thread.role === "musk" ? "M" : thread.role === "official" ? "✓" : "U";
  return `<button class="forum-thread ${selected ? "selected" : ""}" type="button" data-thread-id="${escapeHtml(thread.id)}" aria-pressed="${selected}">
    <span class="reply-count"><strong>${thread.replies.length}</strong><small>回复</small></span>
    <span class="author-avatar author-avatar-${escapeHtml(thread.role)}" aria-hidden="true">${avatar}</span>
    <span class="thread-copy">
      ${badges(thread, thread.pinned)}
      <strong>${escapeHtml(thread.title)}</strong>
      <span>${escapeHtml(thread.excerpt)}</span>
      <small>${escapeHtml(thread.author)} · ${escapeHtml(thread.handle)} · ${escapeHtml(thread.age)}</small>
    </span>
    <span class="thread-open" aria-hidden="true">查看</span>
  </button>`;
}

function renderDetail(thread) {
  if (!thread) {
    nodes.detail.innerHTML = '<div class="detail-empty"><strong>等待匹配帖子</strong><p>调整筛选条件后，这里会显示楼主原帖与精选回复。</p></div>';
    return;
  }
  const avatar = thread.role === "musk" ? "M" : thread.role === "official" ? "✓" : "U";
  nodes.detail.innerHTML = `
    <div class="detail-title"><div>${badges(thread, thread.pinned)}<h2>${escapeHtml(thread.title)}</h2></div><span>示例帖子 · 不可引用</span></div>
    <article class="floor floor-original">
      <div class="floor-author"><span class="author-avatar author-avatar-${escapeHtml(thread.role)}">${avatar}</span><strong>${escapeHtml(thread.author)}</strong><small>${escapeHtml(thread.handle)}</small></div>
      <div class="floor-content"><div class="floor-meta"><span>楼主</span><time>${escapeHtml(thread.age)}</time></div><p>${escapeHtml(thread.original)}</p><div class="editor-note"><strong>中文整理</strong><p>${escapeHtml(thread.excerpt)}</p><span>${escapeHtml(thread.why)}</span></div><a href="${escapeHtml(thread.url)}" target="_blank" rel="noreferrer">查看对应监测入口 ↗</a></div>
    </article>
    ${thread.replies.map((reply, index) => `<article class="floor"><div class="floor-author"><span class="reply-avatar">${escapeHtml(reply.author.slice(0, 1))}</span><strong>${escapeHtml(reply.author)}</strong><small>${escapeHtml(reply.handle)}</small></div><div class="floor-content"><div class="floor-meta"><span>${index + 2} 楼</span><time>示例留言</time></div><p>${escapeHtml(reply.text)}</p><small class="example-label">示例留言 · 不可作为真实 X 引用</small></div></article>`).join("")}
    ${thread.replies.length === 0 ? '<div class="reply-empty"><strong>暂未找到可展示的示例回复</strong><p>真实站点只收录能回到 X 原链接的留言。</p></div>' : ""}`;
}

function renderThreads() {
  const visible = visibleThreads();
  if (!visible.some((thread) => thread.id === state.selectedId)) state.selectedId = visible[0]?.id || "";
  nodes.list.innerHTML = visible.map(threadCard).join("");
  nodes.count.textContent = String(visible.length);
  nodes.empty.hidden = visible.length > 0;
  nodes.list.hidden = visible.length === 0;
  renderDetail(visible.find((thread) => thread.id === state.selectedId));
}

function setFilter(filter) {
  state.filter = filter;
  nodes.filters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
  renderThreads();
}

function resetFilters() {
  nodes.search.value = "";
  state.selectedId = threads[0].id;
  setFilter("all");
}

function showToast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => nodes.toast.classList.remove("visible"), 2400);
}

nodes.search.addEventListener("input", renderThreads);
nodes.filters.forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.filter)));
document.querySelector("#resetFilters").addEventListener("click", resetFilters);
document.querySelector("[data-reset-filters]").addEventListener("click", resetFilters);
document.querySelector("#browseThreads").addEventListener("click", () => document.querySelector("#threads").scrollIntoView({ behavior: "smooth" }));
document.querySelector("#refreshDemo").addEventListener("click", () => { resetFilters(); showToast("示例视图已刷新 · 本页仍为非实时数据"); });
nodes.pinned.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-thread]");
  if (!button) return;
  state.selectedId = button.dataset.openThread;
  setFilter("all");
  document.querySelector("#threads").scrollIntoView({ behavior: "smooth" });
});
nodes.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-thread-id]");
  if (!button) return;
  state.selectedId = button.dataset.threadId;
  renderThreads();
  if (window.matchMedia("(max-width: 900px)").matches) nodes.detail.scrollIntoView({ behavior: "smooth", block: "start" });
});

renderPinned();
renderThreads();
