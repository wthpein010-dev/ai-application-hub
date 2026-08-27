const threads = [
  {
    id: "tibo-token-reset",
    role: "tibo",
    roleLabel: "Tibo 重点信号",
    topic: "token",
    topicLabel: "Token / 额度",
    pinned: true,
    verified: true,
    author: "Tibo",
    handle: "@thsottiaux",
    title: "Tibo 暗示：可能再次按下重置按钮",
    excerpt: "Tibo 提到明天可能找出并“掸去灰尘”的重置按钮。这是提前信号，不是正式重置承诺；具体时间、重置原因和覆盖账号待确认。",
    original: "A good thing about having aged is that I feel that it’s been 20 years since I’ve pressed the reset button. Intrigued to see if I can find it tomorrow and dust it up",
    translation: "上了年纪的一个好处是，我感觉自己已经有 20 年没按过重置按钮了。挺好奇明天能不能把它找出来，掸掸灰再用起来。",
    why: "这条 Tibo 个人发言可能预告新一轮 Codex 用量重置，值得提前关注；但它不是 Codex / OpenAI 官方规则，也没有说明重置原因、具体时间或覆盖账号。",
    age: "8 月 27 日 · 已核验 · 时间待确认",
    url: "https://x.com/thsottiaux/status/2092862554632826968",
    replies: [
      {
        author: "Tibo",
        handle: "@thsottiaux",
        text: "上一轮重置完成确认：额度已下发到账号，并同步上线了部分用量修复。",
        original: "Good Sunday. Reset has been propagated to accounts and we landed some fixes to usage for things mentioned yesterday as issues we found. You should feel a positive difference. More to come tomorrow and will keep communicating.",
        translation: "周日好。重置已下发到各账号，我们也已经上线了一些修复，处理昨天提到的用量问题。你应该会感受到明显改善。明天还会有更多进展，我们会继续同步。",
        note: "这是上一轮完成确认，用于理解当前新暗示的历史背景；它不代表这一次重置已经发生。",
        age: "8 月 24 日 08:46",
        url: "https://x.com/thsottiaux/status/2091688655828246890",
        kind: "timeline",
      },
      {
        author: "Tibo",
        handle: "@thsottiaux",
        text: "8 月 23 日预告：修复下发时将为全部付费订阅完整重置使用额度。",
        original: "Update on rate limits in Codex. We’ve found (a) some inefficiencies when using images in long sessions with multiple compactions (b) high p95+ usage for Computer History (c) a feature that was meant to generate conversation titles that was draining a bit more usage than intended. And we have a tiger team combing through everything and shipping fixes tomorrow. We also found a novel approach to drive efficiency up significantly that is completely unrelated and we will be working on next week. As part of some of the fixes tomorrow, we will also do a full reset of the usage for all paid subscriptions. See you then.",
        translation: "关于 Codex 速率限制的更新。我们发现：（a）在包含多次压缩的长会话中使用图片时存在一些效率问题；（b）Computer History 的 p95 以上用量偏高；（c）一个原本用于生成会话标题的功能，消耗的用量比预期更多。我们已经组织专项团队逐项排查，并将在明天上线修复。我们还发现了一种完全独立、可显著提升效率的新方法，计划下周推进。作为明天部分修复的一部分，我们也会为所有付费订阅完整重置使用额度。到时见。",
        note: "这是“会重置”与“为什么重置”的核心一手说明。",
        age: "8 月 23 日 14:11",
        url: "https://x.com/thsottiaux/status/2091407991736332689",
        kind: "timeline",
      },
      {
        author: "Tibo",
        handle: "@thsottiaux",
        text: "Tibo 随后给出预计下发时间，并在下一条回复中将 14pm 更正为 2pm。",
        original: "Reset will land around 14pm PST tomorrow.",
        translation: "重置预计会在明天太平洋时间 14pm 左右下发。",
        note: "Tibo 随后明确更正：这里的“14pm”指 2pm。",
        age: "8 月 23 日 14:29",
        url: "https://x.com/thsottiaux/status/2091412393368945027",
        kind: "timeline",
      },
      {
        author: "Tibo",
        handle: "@thsottiaux",
        text: "时间表述更正为太平洋时间下午 2 点。",
        original: "Meant 2pm obviously",
        translation: "显然，我指的是下午 2 点。",
        note: "用于消除上一条“14pm”的时间歧义。",
        age: "8 月 23 日 14:32",
        url: "https://x.com/thsottiaux/status/2091413240337326588",
        kind: "timeline",
      },
      {
        author: "Tibo",
        handle: "@thsottiaux",
        text: "8 月 22 日原因线索：部分用户缓存命中率下降，可能导致额度消耗比此前更快。",
        original: "Update on rate limits in Codex. We do see that for some users the cache hit rate has been worse this week than the stable state the weeks before. This could explain that usage is draining somewhat faster for those users as hitting the cache consistently is an important component of being efficient. We are investigating and will have an update tomorrow.",
        translation: "关于 Codex 速率限制的更新。我们确实看到，部分用户本周的缓存命中率比此前几周的稳定状态更差。持续命中缓存是提高效率的重要因素，因此这可能解释了为什么这些用户的用量消耗得更快。我们正在调查，并会在明天更新进展。",
        note: "这是“部分账号为何感觉消耗更快”的前置原因说明。",
        age: "8 月 22 日 13:24",
        url: "https://x.com/thsottiaux/status/2091033630147854385",
        kind: "timeline",
      },
      {
        author: "Braden",
        handle: "@vxbe_dev",
        text: "用户反馈实际下发时间晚于预期，并与自己刚使用的留存重置发生冲突。",
        original: "I’m not gonna lie I’m upset. You gave a time it didn’t come and then your reset hit my account 2 minutes after i used my saved reset.",
        translation: "说实话我很不满。你给出的时间没有兑现，而在我刚用掉自己留存的重置次数两分钟后，这次重置才落到我的账号上。",
        note: "提醒关注实际下发时点，以及平台重置是否会覆盖刚使用的留存额度。此评论不是官方规则。",
        age: "8 月 24 日 08:49",
        url: "https://x.com/vxbe_dev/status/2091689270499217416",
        kind: "comment",
        context: "previous-reset",
      },
      {
        author: "hooftly",
        handle: "@hooftly",
        text: "用户质疑“所有付费用户”的表述是否实际包含 Business 账号。",
        original: "Why do you keep saying all paid users but then exclude biz accounts. Super frustrating",
        translation: "为什么你一直说覆盖所有付费用户，却又把 Business 账号排除在外？这非常令人沮丧。",
        note: "适用范围仍有疑问；在正式说明前，不能把“全部付费订阅”自动扩展为每一种企业套餐。",
        age: "8 月 24 日 08:59",
        url: "https://x.com/hooftly/status/2091691767267774755",
        kind: "comment",
        context: "previous-reset",
      },
      {
        author: "Mark Magyar",
        handle: "@notpsychxpath",
        text: "用户根据此前 2pm PST 预告，质疑为何重置比理解中的时间更早出现。",
        original: "wasn't it supposed to come on the 24th at 14 PM PST? that's still ~20 hours away",
        translation: "不是说应该在 24 日太平洋时间下午 2 点到吗？那时距离现在仍有大约 20 小时。",
        note: "反映预告时间与实际下发之间的理解冲突；应以 Tibo 后续确认和账号实际状态共同核验。",
        age: "8 月 24 日 08:48",
        url: "https://x.com/notpsychxpath/status/2091689003221188680",
        kind: "comment",
        context: "previous-reset",
      },
    ],
  },
  {
    id: "tibo-sites-collaboration",
    role: "tibo",
    roleLabel: "重点关注",
    topic: "update",
    topicLabel: "产品更新",
    pinned: false,
    author: "Tibo",
    handle: "@thsottiaux",
    title: "Tibo 重点更新追踪：ChatGPT Sites 协作、分享与 Codex 自动化",
    excerpt: "示例摘要：集中追踪 Tibo 分享的 ChatGPT Sites、多人协作发布，以及 Codex 处理 git 与 CI 的产品变化。",
    original: "Sample monitoring topic for Tibo posts about ChatGPT Sites collaboration, publishing, and Codex automation.",
    why: "Tibo 经常分享 ChatGPT Sites、协作构建和 Codex 工作流，适合作为产品更新信号源；具体事实仍以可核验原帖为准。",
    age: "示例 · 12 分钟前",
    url: "https://x.com/thsottiaux",
    replies: [
      { author: "协作建站用户 · 示例", handle: "@sites_builder_example", text: "最关心协作者权限、发布流程，以及 Codex 在后台处理 git 和 CI 时的边界。" },
    ],
  },
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
    pinned: false,
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
  priority: document.querySelector("#priorityGrid"),
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

function bilingualMessage(original, translation, summary, why, compact = false) {
  const hasTranslation = Boolean(translation);
  const chineseText = translation || summary || "中文内容暂待整理，请先核对左侧原帖。";
  const editorDigest = hasTranslation && summary && summary !== chineseText
    ? `<div class="editor-digest"><strong>编辑整理</strong><p>${escapeHtml(summary)}</p></div>`
    : "";
  return `<div class="bilingual-message ${compact ? "bilingual-message--compact" : ""}">
    <section class="language-pane language-pane--source"><header><span>EN</span><strong>英文原帖</strong></header><blockquote lang="en">${escapeHtml(original)}</blockquote></section>
    <section class="language-pane language-pane--translation"><header><span>中</span><strong>${hasTranslation ? "中文翻译" : "中文整理（非逐字翻译）"}</strong></header><p lang="zh-CN">${escapeHtml(chineseText)}</p>${editorDigest}${why ? `<small>${escapeHtml(why)}</small>` : ""}</section>
  </div>`;
}

function matchesFilter(thread) {
  if (state.filter === "tibo") return thread.role === "tibo";
  if (state.filter === "musk") return thread.role === "musk";
  if (state.filter === "official") return thread.role === "official";
  if (state.filter === "token") return thread.topic === "token";
  if (state.filter === "community") {
    return thread.role === "community" || thread.replies.some((reply) => reply.kind !== "timeline");
  }
  return true;
}

function visibleThreads() {
  const query = nodes.search.value.trim().toLowerCase();
  return threads.filter((thread) => {
    const replyText = thread.replies.flatMap((reply) => [
      reply.author,
      reply.handle,
      reply.text,
      reply.original,
      reply.translation,
      reply.note,
    ]).filter(Boolean);
    const haystack = [
      thread.title,
      thread.excerpt,
      thread.original,
      thread.translation,
      thread.why,
      thread.author,
      thread.handle,
      thread.topicLabel,
      ...replyText,
    ].filter(Boolean).join(" ").toLowerCase();
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

function renderPriorities() {
  nodes.priority.innerHTML = threads.filter((thread) => thread.pinned).map((thread, index) => `
    <button class="priority-card" type="button" data-open-thread="${escapeHtml(thread.id)}">
      <span class="priority-rank" aria-hidden="true">0${index + 1}</span>
      <span class="priority-copy">
        ${badges(thread, true)}
        <strong>${escapeHtml(thread.title)}</strong>
        <span>${escapeHtml(thread.excerpt)}</span>
      </span>
      <span class="priority-meta">${escapeHtml(thread.handle)}<i>查看主题 →</i></span>
    </button>`).join("");
}

function threadCard(thread) {
  const selected = thread.id === state.selectedId;
  const avatar = thread.role === "tibo" ? "T" : thread.role === "musk" ? "M" : thread.role === "official" ? "✓" : "U";
  const timelineCount = thread.replies.filter((reply) => reply.kind === "timeline").length;
  const commentCount = thread.replies.length - timelineCount;
  const replyCount = commentCount || timelineCount;
  const countLabel = commentCount ? "评论" : "来源";
  return `<button class="forum-thread ${selected ? "selected" : ""}" type="button" data-thread-id="${escapeHtml(thread.id)}" aria-pressed="${selected}">
    <span class="reply-count" aria-label="${commentCount} 条精选评论，${timelineCount} 条此前来源"><strong>${replyCount}</strong><small>${countLabel}</small></span>
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
  const avatar = thread.role === "tibo" ? "T" : thread.role === "musk" ? "M" : thread.role === "official" ? "✓" : "U";
  nodes.detail.innerHTML = `
    <div class="detail-title"><div>${badges(thread, thread.pinned)}<h2>${escapeHtml(thread.title)}</h2></div><span>${thread.verified ? "可核验 X 原帖" : "示例帖子 · 不可引用"}</span></div>
    <article class="floor floor-original">
      <div class="floor-author"><span class="author-avatar author-avatar-${escapeHtml(thread.role)}">${avatar}</span><strong>${escapeHtml(thread.author)}</strong><small>${escapeHtml(thread.handle)}</small></div>
      <div class="floor-content"><div class="floor-meta"><span>楼主</span><time>${escapeHtml(thread.age)}</time></div>${bilingualMessage(thread.original, thread.translation, thread.excerpt, thread.why)}<a href="${escapeHtml(thread.url)}" target="_blank" rel="noreferrer">${thread.verified ? "查看 Tibo 原帖" : "查看对应监测入口"} ↗</a></div>
    </article>
    ${thread.replies.map((reply, index) => {
      const isTimeline = reply.kind === "timeline";
      const isPreviousResetComment = reply.context === "previous-reset";
      const isVerifiedReply = Boolean(reply.url);
      const floorLabel = isTimeline
        ? "时间线 · Tibo 此前原帖"
        : isPreviousResetComment
          ? `上一轮重置历史评论 · ${index + 2} 楼`
          : `精选评论 · ${index + 2} 楼`;
      return `<article class="floor ${isTimeline ? "floor--timeline" : "floor--comment"}"><div class="floor-author"><span class="reply-avatar">${escapeHtml(reply.author.slice(0, 1))}</span><strong>${escapeHtml(reply.author)}</strong><small>${escapeHtml(reply.handle)}</small></div><div class="floor-content"><div class="floor-meta"><span>${floorLabel}</span><time>${escapeHtml(reply.age || (isVerifiedReply ? "可核验 X 内容" : "示例留言"))}</time></div>${reply.original ? bilingualMessage(reply.original, reply.translation, reply.text, reply.note, true) : `<p>${escapeHtml(reply.text)}</p>`}${isVerifiedReply ? `<a href="${escapeHtml(reply.url)}" target="_blank" rel="noreferrer">${isTimeline ? "查看 X 原帖" : "查看 X 回复"} ↗</a>` : '<small class="example-label">示例留言 · 不可作为真实 X 引用</small>'}</div></article>`;
    }).join("")}
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
document.querySelector("#officialOnly").addEventListener("click", () => {
  setFilter("official");
  document.querySelector("#threads").scrollIntoView({ behavior: "smooth" });
});
document.querySelector("#refreshDemo").addEventListener("click", () => { resetFilters(); showToast("示例视图已刷新 · 本页仍为非实时数据"); });
nodes.priority.addEventListener("click", (event) => {
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

renderPriorities();
renderThreads();
