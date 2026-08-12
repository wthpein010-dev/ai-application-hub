import { createCache } from "./core/cache.mjs";
import { buildViewModel } from "./core/presenter.mjs";
import { resolveQuestion } from "./core/resolver.mjs";
import { EXPERIMENTS, getExperiment } from "./core/templates.mjs";
import { renderChart } from "./ui/chart.mjs";

const nodes = Object.fromEntries([
  "questionForm", "questionInput", "generateButton", "compileStatus", "searchResults",
  "searchResultSummary", "searchRecommendationList", "searchCapability", "featuredTemplates", "templateLibrary",
  "experimentStage", "experimentCategory", "experimentSource", "experimentTitle", "experimentQuestion",
  "experimentConclusion", "metricGrid", "parameterControls", "resultChart", "chartLegend",
  "chartDescription", "warningText", "resetParameters", "explanationToggle", "explanationPanel",
  "formulaText", "assumptionList", "boundaryText", "disclaimerText",
].map(id => [id, document.getElementById(id)]));

const cache = createCache(window.localStorage);
const proxyRequested = new URLSearchParams(window.location.search).get("compiler") === "proxy";
const localHost = new Set(["127.0.0.1", "localhost", "::1"]).has(window.location.hostname);
const resolverMode = proxyRequested && localHost ? "proxy" : "static";
const state = {
  experiment: getExperiment("game-payback"),
  values: {},
  view: null,
  activationSource: "内置实验",
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
  nodes.experimentSource.textContent = state.activationSource;
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

function highlightStage() {
  nodes.experimentStage.classList.remove("is-highlighted");
  void nodes.experimentStage.offsetWidth;
  nodes.experimentStage.classList.add("is-highlighted");
  window.setTimeout(() => nodes.experimentStage.classList.remove("is-highlighted"), 900);
}

function selectExperiment(id, { scroll = true, source = "内置实验", focus = false } = {}) {
  const experiment = getExperiment(id);
  if (!experiment) return;
  state.experiment = experiment;
  state.values = defaultValues(experiment);
  state.activationSource = source;
  renderExperiment();
  highlightStage();
  if (scroll) nodes.experimentStage.scrollIntoView({ behavior: "smooth", block: "start" });
  if (focus) {
    nodes.experimentTitle.tabIndex = -1;
    nodes.experimentTitle.focus({ preventScroll: true });
  }
}

function syncParameter(event) {
  const input = event.target.closest("[data-parameter-id]");
  if (!input) return;
  const parameter = state.experiment.parameters.find(item => item.id === input.dataset.parameterId);
  if (!parameter) return;
  const value = Math.min(parameter.max, Math.max(parameter.min, Number(input.value)));
  if (!Number.isFinite(value)) return;
  input.value = String(value);
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

function setSearchState(nextState, summary) {
  nodes.searchResults.dataset.state = nextState;
  nodes.searchResultSummary.textContent = summary;
}

function recommendationButton(match) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-recommendation";
  button.setAttribute("data-recommendation-id", match.experiment.id);
  const reason = match.matchedTerms.length
    ? `相关词：${match.matchedTerms.join("、")}`
    : match.experiment.question;
  button.append(
    text("span", match.experiment.category, "recommendation-category"),
    text("strong", match.experiment.title),
    text("small", reason),
    text("span", "打开实验 ↗", "recommendation-action"),
  );
  return button;
}

function showRecommendations(recommendations) {
  nodes.searchRecommendationList.replaceChildren(...recommendations.map(recommendationButton));
  setSearchState(
    "recommended",
    `没有完全对应的实验，以下 ${recommendations.length} 个最接近。请选择一个继续。`,
  );
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const question = nodes.questionInput.value.trim();
  if (question.length < 3) {
    setSearchState("error", "请再多描述一点，至少输入 3 个字符。");
    nodes.questionInput.focus();
    return;
  }
  nodes.generateButton.disabled = true;
  nodes.generateButton.querySelector("span").textContent = "正在匹配";
  nodes.searchRecommendationList.replaceChildren();
  setSearchState("matching", "正在分析问题并匹配本地实验库……");
  animateCompile("识别关键词 → 对比 12 个实验 → 返回结果");

  try {
    const result = resolverMode === "proxy"
      ? await resolveQuestion(question, { mode: "proxy", cache })
      : await resolveQuestion(question, { mode: "static" });

    if (result.experiment) {
      state.experiment = result.experiment;
      state.values = defaultValues(result.experiment);
      state.activationSource = result.mode === "local" ? "搜索匹配" : "本地代理生成";
      renderExperiment();
      highlightStage();
      const evidence = result.matchedTerms?.length ? `，命中：${result.matchedTerms.join("、")}` : "";
      setSearchState("matched", `已从 12 个实验中匹配到「${result.experiment.title}」${evidence}。`);
      nodes.compileStatus.textContent = "匹配完成；后续参数变化只在本地计算。";
      nodes.experimentStage.scrollIntoView({ behavior: "smooth", block: "start" });
      nodes.experimentTitle.tabIndex = -1;
      nodes.experimentTitle.focus({ preventScroll: true });
    } else {
      showRecommendations(result.recommendations);
      nodes.compileStatus.textContent = "当前实验保持不变，可从推荐结果中选择。";
    }
  } catch (_error) {
    setSearchState("error", "暂时无法完成匹配，请稍后重试。当前实验仍可继续使用。");
  } finally {
    nodes.generateButton.disabled = false;
    nodes.generateButton.querySelector("span").textContent = "匹配实验";
  }
}

nodes.featuredTemplates.addEventListener("click", event => {
  const card = event.target.closest("[data-experiment-id]");
  if (card) selectExperiment(card.dataset.experimentId);
});
nodes.templateLibrary.addEventListener("click", event => {
  const card = event.target.closest("[data-experiment-id]");
  if (card) selectExperiment(card.dataset.experimentId);
});
nodes.searchRecommendationList.addEventListener("click", event => {
  const card = event.target.closest("[data-recommendation-id]");
  if (!card) return;
  const experiment = getExperiment(card.dataset.recommendationId);
  if (!experiment) return;
  selectExperiment(experiment.id, { source: "推荐打开", focus: true });
  setSearchState("matched", `已打开推荐实验「${experiment.title}」。`);
  nodes.compileStatus.textContent = "推荐实验已打开；参数变化只在本地计算。";
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
