const signals = [
  {
    id: "codex-workflow",
    topic: "Codex",
    confidence: "high",
    confidenceLabel: "高可信",
    score: 96,
    source: "OpenAI · 示例",
    handle: "@OpenAI",
    age: "示例 · 18 分钟前",
    title: "Codex 工作流能力更新：从单次编码走向持续任务协作",
    summary: "示例摘要：重点关注任务拆解、环境操作和验证闭环，而不仅是代码生成速度。",
    why: "如果正式来源确认，这类变化会直接影响团队如何拆分需求、组织验收和沉淀项目上下文。",
    evidence: ["官方账号原始发布（示例）", "产品文档对应章节（示例）", "版本说明交叉验证（示例）"],
    sourceType: "官方原始来源",
    url: "https://openai.com/codex/",
  },
  {
    id: "agent-evals",
    topic: "Agent",
    confidence: "high",
    confidenceLabel: "高可信",
    score: 92,
    source: "OpenAI Developers · 示例",
    handle: "@OpenAIDevs",
    age: "示例 · 42 分钟前",
    title: "Agent 评测从单点正确率转向完整任务成功率",
    summary: "示例摘要：长链任务更需要观察工具调用、恢复能力和最终交付质量。",
    why: "它提示产品团队把评测从“回答得像不像”升级为“任务是否真正完成”。",
    evidence: ["开发者渠道原文（示例）", "评测说明页（示例）"],
    sourceType: "官方开发者来源",
    url: "https://platform.openai.com/docs/",
  },
  {
    id: "model-reasoning",
    topic: "模型",
    confidence: "medium",
    confidenceLabel: "待交叉验证",
    score: 84,
    source: "AI Lab Notes · 示例",
    handle: "@AILabNotes",
    age: "示例 · 1 小时前",
    title: "新推理基准开始加入真实代码库与多轮修复任务",
    summary: "示例摘要：单题得分正在让位于跨文件修改、测试反馈与回归验证。",
    why: "真实仓库评测更接近日常工程，但样本构成和泄漏控制仍需核验。",
    evidence: ["研究团队贴文（示例）", "公开基准仓库（待核验）"],
    sourceType: "研究团队转述",
    url: "https://github.com/openai",
  },
  {
    id: "codex-review",
    topic: "Codex",
    confidence: "high",
    confidenceLabel: "高可信",
    score: 89,
    source: "Codex Changelog · 示例",
    handle: "产品更新",
    age: "示例 · 2 小时前",
    title: "代码审查更强调可定位证据与风险优先级",
    summary: "示例摘要：审查结果应指向具体文件与行号，并区分阻塞问题和改进建议。",
    why: "更少的泛化评论、更明确的风险排序，能降低工程团队处理审查反馈的成本。",
    evidence: ["产品更新记录（示例）", "文档行为说明（示例）"],
    sourceType: "官方产品记录",
    url: "https://developers.openai.com/codex/",
  },
  {
    id: "agent-memory",
    topic: "Agent",
    confidence: "watch",
    confidenceLabel: "观察中",
    score: 71,
    source: "Builder Thread · 示例",
    handle: "@BuilderThread",
    age: "示例 · 3 小时前",
    title: "社区讨论：长期记忆应该记录决定，还是记录全部对话？",
    summary: "示例摘要：高信号观点倾向保存已确认决策与状态，而不是无差别堆叠原始聊天。",
    why: "观点有实践价值，但目前只是社区讨论，尚不能视为平台正式最佳实践。",
    evidence: ["社区讨论串（示例）"],
    sourceType: "社区观点",
    url: "https://x.com/",
  },
  {
    id: "research-tools",
    topic: "研究",
    confidence: "medium",
    confidenceLabel: "待交叉验证",
    score: 78,
    source: "Research Digest · 示例",
    handle: "@ResearchDigest",
    age: "示例 · 5 小时前",
    title: "工具使用研究开始关注失败恢复，而不只看首轮成功",
    summary: "示例摘要：模型能否识别错误、切换策略并再次验证，成为新的观察维度。",
    why: "恢复能力决定 Agent 是否能在不稳定外部环境里完成长任务。",
    evidence: ["论文摘要转述（示例）", "作者页面（待交叉验证）"],
    sourceType: "研究摘要来源",
    url: "https://arxiv.org/",
  },
  {
    id: "ai-security",
    topic: "研究",
    confidence: "high",
    confidenceLabel: "高可信",
    score: 87,
    source: "Security Research · 示例",
    handle: "安全研究",
    age: "示例 · 7 小时前",
    title: "Agent 安全边界重新聚焦：权限、目标范围与可恢复操作",
    summary: "示例摘要：高风险动作需要精确目标、最小权限和可审计的验证步骤。",
    why: "工具能力越强，产品越需要把授权范围与安全检查做成工作流的一部分。",
    evidence: ["安全研究原文（示例）", "工程实践文档（示例）"],
    sourceType: "一手研究来源",
    url: "https://openai.com/safety/",
  },
  {
    id: "model-rumor",
    topic: "模型",
    confidence: "watch",
    confidenceLabel: "观察中",
    score: 62,
    source: "Unverified Feed · 示例",
    handle: "转述账号",
    age: "示例 · 9 小时前",
    title: "未证实传闻：某模型可能调整上下文与工具调用策略",
    summary: "示例摘要：目前缺少官方原文和独立证据，仅作为待观察线索保留。",
    why: "这是雷达应该降权的典型内容：信息可能受关注，但不能写成已发生事实。",
    evidence: ["单一转述来源（示例）"],
    sourceType: "未核验转述",
    url: "https://x.com/",
  },
];

const nodes = {
  search: document.querySelector("#searchInput"),
  topic: document.querySelector("#topicFilter"),
  confidence: document.querySelector("#confidenceFilter"),
  list: document.querySelector("#signalList"),
  detail: document.querySelector("#detailPanel"),
  count: document.querySelector("#resultCount"),
  empty: document.querySelector("#emptyState"),
  toast: document.querySelector("#toast"),
};

const state = { selectedId: signals[0].id };
nodes.list.setAttribute("aria-live", "polite");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function filteredSignals() {
  const query = nodes.search.value.trim().toLowerCase();
  return signals.filter((signal) => {
    const haystack = [signal.title, signal.summary, signal.source, signal.handle, signal.topic].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (nodes.topic.value === "all" || signal.topic === nodes.topic.value)
      && (nodes.confidence.value === "all" || signal.confidence === nodes.confidence.value);
  });
}

function signalCard(signal) {
  const selected = signal.id === state.selectedId;
  return `
    <button class="signal-card ${selected ? "selected" : ""}" type="button" data-signal-id="${escapeHtml(signal.id)}" aria-pressed="${selected}">
      <span class="signal-score" aria-label="信号评分 ${signal.score}"><b>${signal.score}</b><small>SCORE</small></span>
      <span class="signal-copy">
        <span class="signal-meta"><i class="confidence-dot ${signal.confidence}" aria-hidden="true"></i>${escapeHtml(signal.confidenceLabel)}<em>${escapeHtml(signal.topic)}</em><time>${escapeHtml(signal.age)}</time></span>
        <strong>${escapeHtml(signal.title)}</strong>
        <span class="signal-summary">${escapeHtml(signal.summary)}</span>
        <span class="signal-source">${escapeHtml(signal.source)} <i>·</i> ${escapeHtml(signal.handle)}</span>
      </span>
      <span class="signal-arrow" aria-hidden="true">↗</span>
    </button>`;
}

function renderSignals() {
  const visible = filteredSignals();
  if (!visible.some((signal) => signal.id === state.selectedId)) state.selectedId = visible[0]?.id || "";
  nodes.list.innerHTML = visible.map(signalCard).join("");
  nodes.count.textContent = String(visible.length);
  nodes.empty.hidden = visible.length > 0;
  nodes.list.hidden = visible.length === 0;
  renderDetail(visible.find((signal) => signal.id === state.selectedId));
}

function renderDetail(signal) {
  if (!signal) {
    nodes.detail.innerHTML = `<div class="detail-empty"><span>⌁</span><strong>等待匹配信号</strong><p>调整左侧筛选条件后，这里会显示证据链。</p></div>`;
    return;
  }
  nodes.detail.innerHTML = `
    <div class="detail-head">
      <span>信号详情 · 示例</span>
      <b class="confidence-badge ${signal.confidence}">${escapeHtml(signal.confidenceLabel)}</b>
    </div>
    <p class="detail-topic">${escapeHtml(signal.topic)} / ${signal.score} SCORE</p>
    <h3>${escapeHtml(signal.title)}</h3>
    <div class="detail-section">
      <span>为什么值得看</span>
      <p>${escapeHtml(signal.why)}</p>
    </div>
    <div class="detail-section">
      <span>证据链</span>
      <ol>${signal.evidence.map((item, index) => `<li><i>${String(index + 1).padStart(2, "0")}</i><p>${escapeHtml(item)}</p></li>`).join("")}</ol>
    </div>
    <div class="source-box"><span>来源类型</span><strong>${escapeHtml(signal.sourceType)}</strong><small>演示条目 · 请勿作为实时新闻引用</small></div>
    <a class="source-button" href="${escapeHtml(signal.url)}" target="_blank" rel="noreferrer">查看对应公开入口 <span aria-hidden="true">↗</span></a>`;
}

function resetFilters() {
  nodes.search.value = "";
  nodes.topic.value = "all";
  nodes.confidence.value = "all";
  state.selectedId = signals[0].id;
  renderSignals();
}

function showToast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => nodes.toast.classList.remove("visible"), 2400);
}

nodes.search.addEventListener("input", renderSignals);
nodes.topic.addEventListener("change", renderSignals);
nodes.confidence.addEventListener("change", renderSignals);
document.querySelector("#resetFilters").addEventListener("click", resetFilters);
document.querySelector("[data-reset-filters]").addEventListener("click", resetFilters);
document.querySelector("#browseSignals").addEventListener("click", () => document.querySelector("#signals").scrollIntoView({ behavior: "smooth" }));
document.querySelector("#refreshDemo").addEventListener("click", () => {
  resetFilters();
  showToast("示例视图已刷新 · 本页仍为非实时数据");
});
nodes.list.addEventListener("click", (event) => {
  const card = event.target.closest("[data-signal-id]");
  if (!card) return;
  state.selectedId = card.dataset.signalId;
  renderSignals();
  if (window.matchMedia("(max-width: 900px)").matches) nodes.detail.scrollIntoView({ behavior: "smooth", block: "start" });
});

renderSignals();
