const NS = "http://www.w3.org/2000/svg";
const WIDTH = 800;
const HEIGHT = 360;
const PAD = { top: 24, right: 24, bottom: 48, left: 66 };
const chartIds = new WeakMap();
let nextChartId = 0;

function chartIdFor(svg) {
  if (!chartIds.has(svg)) chartIds.set(svg, `chart-${nextChartId += 1}`);
  return chartIds.get(svg);
}

const createSvg = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

function extent(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [Math.min(0, min), max === 0 ? 1 : max * 1.1];
  const margin = (max - min) * 0.08;
  return [Math.min(0, min - margin), max + margin];
}

function formatAxis(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (abs >= 10000) return `${(value / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function renderFunnel(svg, chart) {
  const points = chart.series[0]?.points ?? [];
  const max = Math.max(1, ...points.map(point => point.value));
  const rowHeight = 250 / Math.max(1, points.length);
  points.forEach((point, index) => {
    const width = Math.max(70, point.value / max * 560);
    const x = (WIDTH - width) / 2;
    const y = 32 + index * rowHeight;
    const group = createSvg("g", { class: "funnel-stage" });
    const rect = createSvg("rect", { x, y, width, height: Math.max(38, rowHeight - 12), rx: 10 });
    const label = createSvg("text", { x: WIDTH / 2, y: y + Math.max(38, rowHeight - 12) / 2 + 5, "text-anchor": "middle" });
    label.textContent = `${point.label ?? `阶段 ${index + 1}`} · ${formatAxis(point.value)}`;
    group.append(rect, label);
    svg.append(group);
  });
}

function appendAccessibleTitle(svg, chart) {
  const title = createSvg("title");
  title.textContent = `${chart.yLabel}随${chart.xLabel}变化`;
  svg.append(title);
}

function renderLineChart(svg, chart) {
  const allPoints = chart.series.flatMap(series => series.points);
  const xValues = allPoints.map(point => point.x);
  const yValues = allPoints.map(point => point.value);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const [yMin, yMax] = extent(yValues);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const sx = value => PAD.left + (xMax === xMin ? 0 : (value - xMin) / (xMax - xMin) * plotWidth);
  const sy = value => PAD.top + (yMax - value) / (yMax - yMin) * plotHeight;

  const areaGradientId = `${chartIdFor(svg)}-area-gradient`;
  const defs = createSvg("defs");
  const gradient = createSvg("linearGradient", { id: areaGradientId, x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(
    createSvg("stop", { offset: "0%", "stop-color": "#56f2cf", "stop-opacity": 0.32 }),
    createSvg("stop", { offset: "100%", "stop-color": "#56f2cf", "stop-opacity": 0 }),
  );
  defs.append(gradient);
  svg.append(defs);

  const grid = createSvg("g", { class: "chart-grid" });
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = PAD.top + ratio * plotHeight;
    const value = yMax - ratio * (yMax - yMin);
    grid.append(createSvg("line", { x1: PAD.left, x2: WIDTH - PAD.right, y1: y, y2: y }));
    const label = createSvg("text", { x: PAD.left - 12, y: y + 4, "text-anchor": "end" });
    label.textContent = formatAxis(value);
    grid.append(label);
  }
  svg.append(grid);

  chart.series.forEach((series, seriesIndex) => {
    const coordinates = series.points.map(point => [sx(point.x), sy(point.value)]);
    const pathData = coordinates.map(([x, y], index) => {
      if (index === 0) return `M${x.toFixed(2)},${y.toFixed(2)}`;
      if (chart.type === "step") return `H${x.toFixed(2)} V${y.toFixed(2)}`;
      return `L${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    if (chart.type === "area" && chart.series.length === 1) {
      const area = `${pathData} L${coordinates.at(-1)[0].toFixed(2)},${sy(yMin).toFixed(2)} L${coordinates[0][0].toFixed(2)},${sy(yMin).toFixed(2)} Z`;
      svg.append(createSvg("path", { d: area, class: "chart-area", fill: `url(#${areaGradientId})` }));
    }
    const path = createSvg("path", { d: pathData, class: `chart-line chart-line-${seriesIndex}` });
    svg.append(path);
    const last = coordinates.at(-1);
    svg.append(createSvg("circle", { cx: last[0], cy: last[1], r: 5, class: `chart-dot chart-dot-${seriesIndex}` }));
  });

  const xLabel = createSvg("text", { x: WIDTH / 2, y: HEIGHT - 10, class: "axis-title", "text-anchor": "middle" });
  xLabel.textContent = chart.xLabel;
  svg.append(xLabel);
}

function renderBarChart(svg, chart) {
  const allPoints = chart.series.flatMap(series => series.points);
  const yValues = allPoints.map(point => point.value);
  const [yMin, yMax] = extent(yValues);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const groupCount = Math.max(1, chart.series[0]?.points.length ?? 0);
  const groupWidth = plotWidth / groupCount;
  const seriesWidth = Math.min(52, groupWidth * 0.76 / chart.series.length);
  const sy = value => PAD.top + (yMax - value) / (yMax - yMin) * plotHeight;
  const baseline = sy(Math.max(yMin, Math.min(yMax, 0)));

  chart.series.forEach((series, seriesIndex) => {
    series.points.forEach((point, pointIndex) => {
      const valueY = sy(point.value);
      const x = PAD.left + pointIndex * groupWidth + (groupWidth - seriesWidth * chart.series.length) / 2 + seriesIndex * seriesWidth;
      const bar = createSvg("rect", {
        x,
        y: Math.min(valueY, baseline),
        width: Math.max(3, seriesWidth - 4),
        height: Math.max(1, Math.abs(baseline - valueY)),
        rx: 5,
        class: `chart-bar chart-bar-${seriesIndex}`,
      });
      svg.append(bar);
    });
  });

  const xLabel = createSvg("text", { x: WIDTH / 2, y: HEIGHT - 10, class: "axis-title", "text-anchor": "middle" });
  xLabel.textContent = chart.xLabel;
  svg.append(xLabel);
}

export function renderChart(svg, chart) {
  svg.replaceChildren();
  if (!chart?.series?.length || chart.series.some(series => !series.points.length)) return;
  appendAccessibleTitle(svg, chart);
  if (chart.type === "funnel") renderFunnel(svg, chart);
  else if (chart.type === "bar") renderBarChart(svg, chart);
  else renderLineChart(svg, chart);
}
