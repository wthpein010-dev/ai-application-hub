function valueAt(points, progress, field = "p50") {
  if (!Array.isArray(points) || points.length === 0) return null;
  const sorted = [...points].sort((left, right) => left.progress - right.progress);
  if (progress < sorted[0].progress || progress > sorted.at(-1).progress) return null;
  if (progress === sorted[0].progress) return sorted[0][field] ?? null;
  if (progress === sorted.at(-1).progress) return sorted.at(-1)[field] ?? null;
  for (let index = 1; index < sorted.length; index += 1) {
    const right = sorted[index];
    if (right.progress < progress) continue;
    const left = sorted[index - 1];
    const leftValue = left[field];
    const rightValue = right[field];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
    const span = right.progress - left.progress;
    const weight = span === 0 ? 0 : (progress - left.progress) / span;
    return leftValue + (rightValue - leftValue) * weight;
  }
  return null;
}

function shown(value) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function diagnoseReport(report) {
  const points = report?.curves?.mc ?? [];
  if (points.length === 0) return [];
  const diagnostics = [];
  const opening = valueAt(points, 0);
  const v20 = valueAt(points, 0.2);
  const v40 = valueAt(points, 0.4);
  const v60 = valueAt(points, 0.6);

  const narrowThreshold = Math.max(4, (report?.level?.tiles ?? 0) * 0.03);
  if (Number.isFinite(opening) && opening < narrowThreshold) {
    diagnostics.push({
      code: "narrow-opening",
      severity: "warning",
      title: "开局前沿偏窄",
      message: `开局 MC P50 只有 ${shown(opening)}，低于本关 ${shown(narrowThreshold)} 的窄口参考值。`,
      evidence: { progress: 0, v: opening, threshold: narrowThreshold },
      action: "增加开局互不覆盖的浅层砖，避免第一步就依赖单一路线。",
    });
  }

  if (Number.isFinite(opening) && Number.isFinite(v20)
    && opening - v20 >= 4 && v20 <= opening * 0.6) {
    diagnostics.push({
      code: "early-dive",
      severity: "warning",
      title: "前 20% 快速跳水",
      message: `MC P50 从开局 ${shown(opening)} 降到 20% 进度的 ${shown(v20)}。`,
      evidence: { fromProgress: 0, toProgress: 0.2, fromV: opening, toV: v20 },
      action: "拆散前段集中覆盖，补充可并行推进的浅层释放区。",
    });
  }

  if (Number.isFinite(v40) && Number.isFinite(v60)
    && v40 - v60 >= 4 && v60 <= v40 * 0.65) {
    diagnostics.push({
      code: "mid-cliff",
      severity: "danger",
      title: "40%–60% 中盘断崖",
      message: `MC P50 从 40% 的 ${shown(v40)} 降到 60% 的 ${shown(v60)}。`,
      evidence: { fromProgress: 0.4, toProgress: 0.6, fromV: v40, toV: v60 },
      action: "在中盘深塔之间加入独立释放点，降低同一批上层砖同时压住前沿的程度。",
    });
  }

  const middle = points.filter((point) => point.progress >= 0.25 && point.progress <= 0.55);
  if (middle.length >= 3 && Number.isFinite(opening)) {
    const values = middle.map((point) => point.p50).filter(Number.isFinite);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const start = middle[0].progress;
    const end = middle.at(-1).progress;
    if (values.length >= 3 && maximum <= opening * 0.55
      && maximum - minimum <= Math.max(2, opening * 0.1)) {
      diagnostics.push({
        code: "mid-low-plateau",
        severity: "warning",
        title: "中盘低位横盘",
        message: `${Math.round(start * 100)}%–${Math.round(end * 100)}% 进度的 MC P50 仅在 ${shown(minimum)}–${shown(maximum)} 之间。`,
        evidence: { fromProgress: start, toProgress: end, minimum, maximum },
        action: "把部分深层释放提前，并让两条以上路线在中盘交替展开。",
      });
    }
  }

  const late = points.filter((point) => point.progress >= 0.8 && point.progress < 1);
  if (late.length > 0) {
    const neck = late.reduce((best, point) => (
      point.p50 < best.p50 ? point : best
    ));
    if (neck.p50 <= 1) {
      diagnostics.push({
        code: "late-neck",
        severity: "danger",
        title: "后段窄脖子",
        message: `${Math.round(neck.progress * 100)}% 进度的 MC P50 降到 ${shown(neck.p50)}。`,
        evidence: { progress: neck.progress, v: neck.p50 },
        action: "保证最后 15% 至少保留两个互不嵌套的可操作前沿，并用完整规则复验。",
      });
    }
  }

  const lowerDeadlocks = report?.river?.lowerDeadlocks ?? 0;
  const lowerProgress = report?.river?.lowerDeadlockAverageProgress;
  if (lowerDeadlocks > 0 && Number.isFinite(lowerProgress)) {
    diagnostics.push({
      code: "no-slot-neck",
      severity: "info",
      title: "河道下界(min)出现无槽窄口",
      message: `${lowerDeadlocks} 次河道下界(min)重启在平均 ${Math.round(lowerProgress * 100)}% 进度遇到 V<2。`,
      evidence: { deadlocks: lowerDeadlocks, averageProgress: lowerProgress },
      action: "这不是 1 槽真实玩法的必死证明；把该位置作为结构脆弱点复查。",
    });
  }

  return diagnostics;
}
