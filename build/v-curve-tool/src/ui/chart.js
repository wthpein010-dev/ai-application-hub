function seriesMaximum(series) {
  let maximum = 0;
  for (const entry of series ?? []) {
    for (const point of entry.points ?? []) {
      for (const key of ["y", "p10", "p50", "p90"]) {
        if (Number.isFinite(point[key])) maximum = Math.max(maximum, point[key]);
      }
    }
  }
  return maximum;
}

function niceMaximum(value) {
  const safe = Math.max(4, value);
  const magnitude = 10 ** Math.floor(Math.log10(safe));
  const normalized = safe / magnitude;
  const step = normalized <= 2 ? 0.5 : normalized <= 5 ? 1 : 2;
  return Math.ceil(normalized / step) * step * magnitude;
}

function createScale(width, height, yMax) {
  const plot = {
    left: 52,
    right: Math.max(53, width - 18),
    top: 38,
    bottom: Math.max(39, height - 42),
  };
  return {
    width,
    height,
    yMax,
    plot,
    x(progress) {
      const value = Math.min(1, Math.max(0, progress));
      return plot.left + value * (plot.right - plot.left);
    },
    y(value) {
      const normalized = Math.min(1, Math.max(0, value / yMax));
      return plot.bottom - normalized * (plot.bottom - plot.top);
    },
  };
}

export function createComparisonScales(sheepSeries, pawsSeries, width, height) {
  const yMax = niceMaximum(Math.max(
    seriesMaximum(sheepSeries),
    seriesMaximum(pawsSeries),
  ));
  return {
    sheep: createScale(width, height, yMax),
    paws: createScale(width, height, yMax),
  };
}

export const CHART_SERIES = Object.freeze([
  { key: "riverUpper", label: "河道上界(max)", color: "#c878ff", valueKey: "y", width: 2.1 },
  { key: "riverLower", label: "河道下界(min)", color: "#ff6571", valueKey: "y", width: 2.1 },
  { key: "expected", label: "E[V]近似", color: "#24cfb2", valueKey: "y", width: 2.2 },
  { key: "mcP90", label: "MC P90", color: "#668f72", valueKey: "p90", width: 1.7 },
  { key: "mcP50", label: "MC P50", color: "#68e68a", valueKey: "p50", width: 2.4 },
  { key: "mcP10", label: "MC P10", color: "#ff8a5b", valueKey: "p10", width: 1.8 },
]);

function terminalPercent(progress) {
  const percent = progress * 100;
  for (let digits = 0; digits <= 6; digits += 1) {
    const shown = percent.toFixed(digits);
    if (Number(shown) < 100) return shown;
  }
  return "<100";
}

export function reportToSeries(report) {
  const curves = report?.curves ?? {};
  const mcPoints = curves.mc ?? [];
  const terminalProgress = [...mcPoints].reverse().find((point) => (
    Number.isFinite(point.progress)
  ))?.progress;
  const hasEarlyMcTerminal = Number.isFinite(terminalProgress) && terminalProgress < 1;
  return CHART_SERIES.map((definition) => ({
    ...definition,
    points: definition.key.startsWith("mc") ? mcPoints : (curves[definition.key] ?? []),
    terminalProgress: definition.key.startsWith("mc") && hasEarlyMcTerminal
      ? terminalProgress
      : undefined,
    terminalLabel: definition.key === "mcP50" && hasEarlyMcTerminal
      ? `MC 有效样本止于 ${terminalPercent(terminalProgress)}%`
      : undefined,
  }));
}

export function sampleSeriesValue(series, progress) {
  const points = series.points ?? [];
  if (points.length === 0) return null;
  const first = points[0];
  const last = points.at(-1);
  if (progress < first.progress || progress > last.progress) return null;
  let nearest = points[0];
  for (const point of points) {
    if (Math.abs(point.progress - progress) < Math.abs(nearest.progress - progress)) nearest = point;
  }
  return nearest[series.valueKey];
}

function roundedTick(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export class VChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.series = options.series ?? [];
    this.yMax = options.yMax ?? null;
    this.hoverProgress = null;
    this.onPointerMove = (event) => this.handlePointerMove(event);
    this.onPointerLeave = () => {
      this.hoverProgress = null;
      this.draw();
    };
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.draw())
      : null;
    this.observer?.observe(canvas);
    this.draw();
  }

  setData(series, yMax) {
    this.series = series ?? [];
    this.yMax = yMax ?? this.yMax;
    this.draw();
  }

  handlePointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(240, rect.height);
    const fallback = createComparisonScales(this.series, [], width, height).sheep;
    const scale = this.yMax ? createScale(width, height, this.yMax) : fallback;
    const localX = event.clientX - rect.left;
    this.hoverProgress = Math.min(1, Math.max(0,
      (localX - scale.plot.left) / (scale.plot.right - scale.plot.left),
    ));
    this.draw();
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || this.canvas.parentElement?.clientWidth || 640));
    const height = Math.max(240, Math.round(rect.height || 330));
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    const context = this.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const fallback = createComparisonScales(this.series, [], width, height).sheep;
    const scale = this.yMax ? createScale(width, height, this.yMax) : fallback;
    this.drawGrid(context, scale);
    for (const series of this.series) this.drawSeries(context, scale, series);
    this.drawTerminalState(context, scale);
    if (this.hoverProgress !== null) this.drawHover(context, scale);
  }

  drawGrid(context, scale) {
    context.save();
    context.font = '10px "Segoe UI", sans-serif';
    context.textBaseline = "middle";
    for (let step = 0; step <= 4; step += 1) {
      const value = scale.yMax * (step / 4);
      const y = scale.y(value);
      context.strokeStyle = step === 0 ? "rgba(150,170,205,.25)" : "rgba(150,170,205,.11)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(scale.plot.left, y + .5);
      context.lineTo(scale.plot.right, y + .5);
      context.stroke();
      context.fillStyle = "#667287";
      context.textAlign = "right";
      context.fillText(roundedTick(value), scale.plot.left - 9, y);
    }
    for (let step = 0; step <= 5; step += 1) {
      const progress = step / 5;
      const x = scale.x(progress);
      context.strokeStyle = "rgba(150,170,205,.055)";
      context.beginPath();
      context.moveTo(x + .5, scale.plot.top);
      context.lineTo(x + .5, scale.plot.bottom);
      context.stroke();
      context.fillStyle = "#667287";
      context.textAlign = step === 0 ? "left" : step === 5 ? "right" : "center";
      context.fillText(`${step * 20}%`, x, scale.plot.bottom + 18);
    }
    context.fillStyle = "#7d899d";
    context.textAlign = "left";
    context.fillText("可操作砖数 V", scale.plot.left, 16);
    context.textAlign = "right";
    context.fillText("消除进度", scale.plot.right, scale.height - 8);
    context.restore();
  }

  drawSeries(context, scale, series) {
    const points = (series.points ?? []).filter((point) => (
      Number.isFinite(point.progress) && Number.isFinite(point[series.valueKey])
    ));
    if (points.length === 0) return;
    context.save();
    context.beginPath();
    points.forEach((point, index) => {
      const x = scale.x(point.progress);
      const y = scale.y(point[series.valueKey]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = series.color;
    context.lineWidth = series.width ?? 1.5;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.globalAlpha = series.key === "mcP90" ? .72 : .96;
    context.stroke();
    context.restore();
  }

  drawTerminalState(context, scale) {
    const terminalSeries = this.series.filter((series) => Number.isFinite(series.terminalProgress));
    if (terminalSeries.length === 0) return;
    context.save();
    for (const series of terminalSeries) {
      const point = [...(series.points ?? [])].reverse().find((entry) => (
        Number.isFinite(entry.progress) && Number.isFinite(entry[series.valueKey])
      ));
      if (!point) continue;
      context.beginPath();
      context.arc(scale.x(point.progress), scale.y(point[series.valueKey]),
        series.key === "mcP50" ? 3.2 : 2.6, 0, Math.PI * 2);
      context.fillStyle = series.color;
      context.globalAlpha = 1;
      context.fill();
    }

    const labeled = terminalSeries.find((series) => series.terminalLabel);
    if (labeled) {
      const terminalX = scale.x(labeled.terminalProgress);
      const boxWidth = 128;
      const boxX = terminalX > scale.plot.right - boxWidth - 8
        ? terminalX - boxWidth - 8
        : terminalX + 8;
      const boxY = scale.plot.top + 7;
      context.fillStyle = "rgba(8,12,19,.88)";
      context.fillRect(boxX, boxY, boxWidth, 22);
      context.strokeStyle = "rgba(104,230,138,.28)";
      context.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, 21);
      context.font = '10px "Segoe UI", sans-serif';
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillStyle = "#9adbaa";
      context.fillText(labeled.terminalLabel, boxX + 8, boxY + 11);
    }
    context.restore();
  }

  drawHover(context, scale) {
    const progress = this.hoverProgress;
    const x = scale.x(progress);
    context.save();
    context.strokeStyle = "rgba(222,231,246,.45)";
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(x, scale.plot.top);
    context.lineTo(x, scale.plot.bottom);
    context.stroke();
    context.setLineDash([]);

    const values = this.series
      .map((series) => ({ series, value: sampleSeriesValue(series, progress) }))
      .filter(({ value }) => Number.isFinite(value));
    const boxWidth = 128;
    const boxHeight = 26 + values.length * 18;
    const boxX = x > scale.plot.right - boxWidth - 14 ? x - boxWidth - 10 : x + 10;
    const boxY = scale.plot.top + 8;
    context.fillStyle = "rgba(8,12,19,.94)";
    context.strokeStyle = "rgba(148,169,204,.25)";
    context.fillRect(boxX, boxY, boxWidth, boxHeight);
    context.strokeRect(boxX + .5, boxY + .5, boxWidth - 1, boxHeight - 1);
    context.font = '10px "Segoe UI", sans-serif';
    context.textBaseline = "middle";
    context.fillStyle = "#dce4f1";
    context.textAlign = "left";
    context.fillText(`${Math.round(progress * 100)}%`, boxX + 10, boxY + 14);
    values.forEach(({ series, value }, index) => {
      const y = boxY + 32 + index * 18;
      context.fillStyle = series.color;
      context.fillRect(boxX + 10, y - 1, 10, 2);
      context.fillStyle = "#8f9bae";
      context.fillText(series.label, boxX + 25, y);
      context.fillStyle = "#e3eaf5";
      context.textAlign = "right";
      context.fillText(roundedTick(value), boxX + boxWidth - 10, y);
      context.textAlign = "left";
      const pointValue = sampleSeriesValue(series, progress);
      if (Number.isFinite(pointValue)) {
        context.beginPath();
        context.arc(x, scale.y(pointValue), 2.6, 0, Math.PI * 2);
        context.fillStyle = series.color;
        context.fill();
      }
    });
    context.restore();
  }

  destroy() {
    this.observer?.disconnect();
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
  }
}
