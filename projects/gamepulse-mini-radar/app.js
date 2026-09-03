(() => {
  const sources = [
    { id: "wechat", rows: "wechatRows" },
    { id: "popular", rows: "popularRows" },
    { id: "grossing", rows: "grossingRows" },
    { id: "overseas", rows: "overseasRows" },
  ];
  const healthLabels = { fresh: "数据新鲜", cached: "缓存可用", error: "来源异常" };
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function cell(value, className = "") {
    const element = document.createElement("td");
    element.textContent = String(value ?? "—");
    if (className) element.className = className;
    return element;
  }

  function renderRanking(id, rows) {
    const body = document.getElementById(`${id}Rows`);
    if (!body) return;
    const fragment = document.createDocumentFragment();
    for (const item of rows) {
      const row = document.createElement("tr");
      row.append(
        cell(`#${item.rank}`),
        cell(item.title),
        cell(item.developer),
        cell(item.subCategory || item.category),
      );
      fragment.append(row);
    }
    if (!rows.length) {
      const row = document.createElement("tr");
      const message = cell("等待首次成功同步");
      message.colSpan = 4;
      row.append(message);
      fragment.append(row);
    }
    body.replaceChildren(fragment);
  }

  function renderHealth(items) {
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const source of sources) {
      const element = document.querySelector(`[data-health="${source.id}"]`);
      const health = byId.get(source.id);
      if (!element || !health) continue;
      element.dataset.state = health.status;
      element.textContent = healthLabels[health.status] || "状态未知";
      if (health.checkedAt) element.title = `检查时间：${dateFormatter.format(new Date(health.checkedAt))}`;
    }
  }

  function renderSnapshot(payload) {
    if (payload.schemaVersion !== 1 || !payload.rankings) {
      throw new Error("快照格式不受支持");
    }
    for (const source of sources) {
      const rows = payload.rankings[source.id];
      if (!Array.isArray(rows)) throw new Error(`快照缺少 ${source.id} 榜单`);
      renderRanking(source.id, rows);
    }
    renderHealth(Array.isArray(payload.sourceHealth) ? payload.sourceHealth : []);

    const badge = document.getElementById("snapshotBadge");
    const time = document.getElementById("snapshotTime");
    const sourceDate = document.getElementById("sourceDate");
    const message = document.getElementById("loadMessage");
    const ready = sources.every((source) => payload.rankings[source.id].length === 10);
    const mirroredAt = payload.mirroredAt ? new Date(payload.mirroredAt) : null;

    if (ready && mirroredAt && !Number.isNaN(mirroredAt.getTime())) {
      time.dateTime = mirroredAt.toISOString();
      time.textContent = `镜像于 ${dateFormatter.format(mirroredAt)}`;
      badge.dataset.state = payload.stale ? "stale" : "ready";
      badge.textContent = payload.stale ? "缓存快照" : "快照可用";
      message.textContent = payload.stale
        ? "源站标记本次数据为缓存状态，名次仍来自最近一次通过校验的完整快照。"
        : "四个来源均已读取；每张表独立保留来源名次。";
    } else {
      badge.dataset.state = "loading";
      badge.textContent = "等待首次同步";
      time.removeAttribute("datetime");
      time.textContent = "自动同步尚未产生完整快照";
      message.textContent = payload.message || "工作流会在首次成功读取并校验源数据后填充这里。";
    }
    sourceDate.textContent = payload.displayDate ? `源榜日期 ${payload.displayDate}` : "";
  }

  async function loadSnapshot() {
    try {
      const response = await fetch("./data/rankings.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      renderSnapshot(await response.json());
    } catch (error) {
      const badge = document.getElementById("snapshotBadge");
      const message = document.getElementById("loadMessage");
      badge.dataset.state = "error";
      badge.textContent = "快照读取失败";
      message.textContent = `暂时无法读取同仓库快照（${error instanceof Error ? error.message : "未知错误"}）。请稍后重试。`;
    }
  }

  loadSnapshot();
})();
