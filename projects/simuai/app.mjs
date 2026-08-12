import { createCache } from "./core/cache.mjs";
import { rankExperiments } from "./core/matcher.mjs";
import { buildViewModel } from "./core/presenter.mjs";
import { EXPERIMENTS, getExperiment } from "./core/templates.mjs";
import { renderChart } from "./ui/chart.mjs";

const nodes = Object.fromEntries([
  "questionForm", "questionInput", "compileStatus", "featuredTemplates", "templateLibrary",
  "experimentStage", "experimentCategory", "experimentSource", "experimentTitle", "experimentQuestion",
  "experimentConclusion", "metricGrid", "parameterControls", "resultChart", "chartLegend",
  "chartDescription", "warningText", "resetParameters", "explanationToggle", "explanationPanel",
  "formulaText", "assumptionList", "boundaryText", "disclaimerText",
].map(id => [id, document.getElementById(id)]));

const cache = createCache(window.localStorage);
const state = {
  experiment: getExperiment("game-payback"),
  values: {},
  view: null,
};

function text(tag, content, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = content;
  return element;
}

function buttonFor(experiment, featured = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = featured ? "featured-card" : "library-card";
  button.dataset.experimentId = experiment.id;
  button.setAttribute("aria-label", `打开${experiment.title}实验`);
  if (featured) {
    button.append(
      text("span", experiment.category, "card-category"),
      text("strong", experiment.title),
      text("p", experiment.question),
      text("span", "进入实验 ↗", "card-action"),
    );
  } else {
    button.append(
      text("strong", experiment.title),
      text("span", experiment.modelType.toUpperCase(), "model-tag"),
    );
  }
  return button;
}

function renderLibrary() {
  nodes.featuredTemplates.replaceChildren(...EXPERIMENTS.filter(item => item.featured).map(item => buttonFor(item, true)));
  nodes.templateLibrary.replaceChildren();
  for (const category of ["生活科普", "游戏产品", "商业决策"]) {
    const group = document.createElement("section");
    group.className = "library-group";
    group.append(text("h3", category));
    const grid = document.createElement("div");
    grid.className = "library-grid";
    grid.append(...EXPERIMENTS.filter(item => item.category === category).map(item => buttonFor(item)));
    group.append(grid);
    nodes.templateLibrary.append(group);
  }
}

function defaultValues(experiment) {
  return Object.fromEntries(experiment.parameters.map(parameter => [parameter.id, parameter.default]));
}

function renderMetrics(view) {
  nodes.metricGrid.replaceChildren(...view.metrics.map((metric, index) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.dataset.metricId = metric.output;
    card.append(
      text("span", `${String(index + 1).padStart(2, "0")} · ${metric.label}`),
      text("strong", metric.displayValue),
    );
    return card;
  }));
}

function renderControls(view) {
  nodes.parameterControls.replaceChildren(...view.parameters.map(parameter => {
    const group = document.createElement("div");
    group.className = "parameter-group";
    const labelRow = document.createElement("div");
    labelRow.className = "parameter-label";
    const label = text("label", parameter.label);
    label.htmlFor = `param-${parameter.id}`;
    const numberWrap = document.createElement("span");
    numberWrap.className = "number-wrap";
    const number = document.createElement("input");
    number.type = "number";
    number.id = `number-${parameter.id}`;
    number.value = String(parameter.value);
    number.min = String(parameter.min);
    number.max = String(parameter.max);
    number.step = String(parameter.step);
    number.setAttribute("aria-label", `${parameter.label}精确值`);
    number.dataset.parameterId = parameter.id;
    numberWrap.append(number, text("span", parameter.unit));
    labelRow.append(label, numberWrap);

    const range = document.createElement("input");
    range.type = "range";
    range.id = `param-${parameter.id}`;
    range.min = String(parameter.min);
    range.max = String(parameter.max);
    range.step = String(parameter.step);
    range.value = String(parameter.value);
    range.dataset.parameterId = parameter.id;

    const bounds = document.createElement("div");
    bounds.className = "range-bounds";
    bounds.append(text("span", `${parameter.min}${parameter.unit}`), text("span", `${parameter.max}${parameter.unit}`));
    group.append(labelRow, range, bounds);
    return group;
  }));
}

function renderExplanation(view) {
  nodes.formulaText.textContent = view.disclosure.formula;
  nodes.assumptionList.replaceChildren(...view.disclosure.assumptions.map(item => text("li", item)));
  nodes.boundaryText.textContent = view.disclosure.boundary;
  nodes.disclaimerText.textContent = view.disclosure.disclaimer;
}

function renderLegend(view) {
  nodes.chartLegend.replaceChildren(...view.chart.series.map((series, index) => {
    const item = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = `legend-dot legend-dot-${index}`;
    item.append(dot, document.createTextNode(series.label));
    return item;
  }));
}

function renderExperiment({ rebuildControls = true } = {}) {
  const view = buildViewModel(state.experiment, state.values);
  state.view = view;
  nodes.experimentCategory.textContent = view.category;
  nodes.experimentSource.textContent = view.source === "builtin" ? "离线验证模型" : view.source === "cache" ? "缓存模型" : "AI 编译模型";
  nodes.experimentTitle.textContent = view.title;
  nodes.experimentQuestion.textContent = view.question;
  nodes.experimentConclusion.textContent = view.conclusion;
  nodes.warningText.textContent = view.warnings.join(" ");
  nodes.chartDescription.textContent = `${view.title}的${view.chart.xLabel}与${view.chart.yLabel}关系图。`;
  renderMetrics(view);
  renderLegend(view);
  renderChart(nodes.resultChart, view.chart);
  renderExplanation(view);
  if (rebuildControls) renderControls(view);

  document.querySelectorAll("[data-experiment-id]").forEach(card => {
    const selected = card.dataset.experimentId === view.id;
    card.classList.toggle("is-active", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
}

function selectExperiment(id, { scroll = true } = {}) {
  const experiment = getExperiment(id);
  if (!experiment) return;
  state.experiment = experiment;
  state.values = defaultValues(experiment);
  renderExperiment();
  if (scroll) nodes.experimentStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncParameter(event) {
  const input = event.target.closest("[data-parameter-id]");
  if (!input) return;
  const parameter = state.experiment.parameters.find(item => item.id === input.dataset.parameterId);
  if (!parameter) return;
  const value = Math.min(parameter.max, Math.max(parameter.min, Number(input.value)));
  if (!Number.isFinite(value)) return;
  state.values[parameter.id] = value;
  const pairedSelector = input.type === "range" ? `#number-${parameter.id}` : `#param-${parameter.id}`;
  const paired = document.querySelector(pairedSelector);
  if (paired) paired.value = String(value);
  renderExperiment({ rebuildControls: false });
}

function animateCompile(message) {
  nodes.compileStatus.textContent = message;
  nodes.questionForm.classList.add("is-compiling");
  window.setTimeout(() => nodes.questionForm.classList.remove("is-compiling"), 520);
}

function handleQuestionSubmit(event) {
  event.preventDefault();
  const question = nodes.questionInput.value.trim();
  if (question.length < 3) {
    animateCompile("请再多描述一点，至少输入 3 个字符。");
    return;
  }
  animateCompile("识别问题 → 选择模型 → 生成实验");
  const cached = cache.get(question);
  const match = rankExperiments(question, 1)[0];
  window.setTimeout(() => {
    if (cached) {
      state.experiment = cached;
      state.values = defaultValues(cached);
      renderExperiment();
      nodes.compileStatus.textContent = "已从本地缓存恢复实验。";
    } else {
      selectExperiment(match.experiment.id);
      nodes.compileStatus.textContent = match.score > 0
        ? `已匹配离线实验：${match.experiment.title}`
        : "这个问题暂不适合可靠量化，已推荐最接近的实验。";
    }
  }, 420);
}

nodes.featuredTemplates.addEventListener("click", event => {
  const card = event.target.closest("[data-experiment-id]");
  if (card) selectExperiment(card.dataset.experimentId);
});
nodes.templateLibrary.addEventListener("click", event => {
  const card = event.target.closest("[data-experiment-id]");
  if (card) selectExperiment(card.dataset.experimentId);
});
nodes.parameterControls.addEventListener("input", syncParameter);
nodes.parameterControls.addEventListener("change", syncParameter);
nodes.resetParameters.addEventListener("click", () => {
  state.values = defaultValues(state.experiment);
  renderExperiment();
});
nodes.questionForm.addEventListener("submit", handleQuestionSubmit);
nodes.explanationToggle.addEventListener("click", () => {
  const open = nodes.explanationPanel.hidden;
  nodes.explanationPanel.hidden = !open;
  nodes.explanationToggle.setAttribute("aria-expanded", String(open));
  nodes.explanationToggle.querySelector("span").textContent = open ? "−" : "＋";
});

renderLibrary();
state.values = defaultValues(state.experiment);
renderExperiment();
