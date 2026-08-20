import { analyzeSources } from "./core/analyzer.js";
import { diffDeliveryPacks } from "./core/diff.js";
import { toCodexContext, toJson, toMarkdown, toTaskCsv } from "./core/exporters.js";
import { evaluateDeliveryPack } from "./core/quality.js";
import { runCompatibleModel } from "./core/model-adapter.js";
import { BOSS_PHASE_CHANGE_SAMPLE, BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "./data/boss-phase-sample.js";
import { createRelayStore } from "./store.js";

const store = createRelayStore(localStorage);
const state = { sources: [], pack: null, savedV1: null, hasChange: false };
const $ = (selector) => document.querySelector(selector);

function sourceText(sources) {
  return sources.map((source) => `【${source.title}】\n${source.content}`).join("\n\n");
}

function setStep(name) {
  document.body.dataset.step = name;
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stepTarget === name);
  });
  document.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.pane === name);
  });
}

function renderSources() {
  $("#sourceCount").textContent = String(state.sources.length);
  $("#characterCount").textContent = String($("#sourceInput").value.length);
  $("#sourceHint").textContent = state.sources.length ? "保留来源与行号证据" : "尚未载入来源";
  $("#analyzeButton").disabled = !$("#sourceInput").value.trim();
  const list = $("#sourceList");
  list.replaceChildren();
  if (!state.sources.length) {
    list.innerHTML = '<div class="empty-card"><span aria-hidden="true">⌁</span><strong>把讨论放进来</strong><p>Agent 会保留原文证据，不会把未确认意见写成事实。</p></div>';
    return;
  }
  for (const source of state.sources) {
    const card = document.createElement("article");
    card.className = "source-card";
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = source.title;
    const kind = document.createElement("small");
    kind.textContent = source.kind.toUpperCase();
    heading.append(title, kind);
    const preview = document.createElement("p");
    preview.textContent = source.content;
    card.append(heading, preview);
    list.append(card);
  }
}

function evidenceNode(evidence) {
  const node = document.createElement("div");
  node.className = "evidence";
  node.textContent = evidence ? `依据 · ${evidence.quote}（${evidence.sourceId}）` : "暂无来源证据";
  return node;
}

function renderDecisions(pack) {
  $("#decisionCount").textContent = String(pack.decisions.length);
  const list = $("#decisionList");
  list.replaceChildren();
  for (const decision of pack.decisions) {
    const card = document.createElement("article");
    card.className = "decision-card";
    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = decision.title;
    const confidence = document.createElement("span");
    confidence.className = "confidence";
    confidence.textContent = `${Math.round(decision.confidence * 100)}% CONF`;
    header.append(title, confidence);
    const detail = document.createElement("p");
    detail.textContent = decision.detail;
    card.append(header, detail, evidenceNode(decision.evidence[0]));
    list.append(card);
  }
}

function renderQuestions(pack) {
  $("#questionCount").textContent = String(pack.questions.length);
  const list = $("#questionList");
  list.replaceChildren();
  for (const question of pack.questions) {
    const card = document.createElement("article");
    card.className = "question-card";
    card.dataset.questionId = question.id;
    const header = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = question.title;
    const badge = document.createElement("span");
    badge.className = `blocker-badge${question.status === "confirmed" ? " confirmed" : ""}`;
    badge.dataset.questionStatus = question.status;
    badge.textContent = question.status === "confirmed" ? "已确认" : "必须确认";
    header.append(title, badge);
    const detail = document.createElement("p");
    detail.textContent = question.detail;
    const controls = document.createElement("div");
    controls.className = "question-controls";
    const input = document.createElement("input");
    input.dataset.questionAnswer = "";
    input.value = question.answer;
    input.placeholder = "填写确认结论";
    input.setAttribute("aria-label", `${question.title}的确认结论`);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.dataset.confirmQuestion = question.id;
    confirm.textContent = question.status === "confirmed" ? "更新" : "确认";
    controls.append(input, confirm);
    card.append(header, detail, evidenceNode(question.evidence[0]), controls);
    list.append(card);
  }
}

function renderScope(pack) {
  const panels = $("#scopePanel").children;
  panels[0].querySelector("p").textContent = pack.scope.inScope.join("；") || "无";
  panels[1].querySelector("p").textContent = pack.scope.outOfScope.join("；") || "无";
}

function renderTasks(pack) {
  const lanes = $("#taskLanes");
  lanes.replaceChildren();
  for (const task of pack.tasks) {
    const lane = document.createElement("section");
    lane.className = "role-lane";
    lane.dataset.roleLane = task.role;
    const role = document.createElement("div");
    role.className = "role-label";
    const roleName = document.createElement("strong");
    roleName.textContent = task.role;
    const status = document.createElement("span");
    status.textContent = task.status.toUpperCase();
    role.append(roleName, status);
    const card = document.createElement("article");
    card.className = "task-card";
    card.dataset.taskId = task.id;
    const header = document.createElement("header");
    const title = document.createElement("input");
    title.dataset.taskTitle = task.id;
    title.value = task.title;
    title.setAttribute("aria-label", `${task.role}任务标题`);
    const priority = document.createElement("span");
    priority.className = "priority";
    priority.textContent = task.priority;
    header.append(title, priority);
    const objective = document.createElement("p");
    objective.className = "task-objective";
    objective.textContent = task.objective;
    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.textContent = `产物 ${task.outputs.length} · 依赖 ${task.dependencies.length} · 风险 ${task.risk}`;
    const criteria = document.createElement("ul");
    criteria.className = "criteria-list";
    for (const criterion of task.acceptanceCriteria) {
      const item = document.createElement("li");
      item.dataset.acceptanceItem = "";
      item.textContent = criterion;
      criteria.append(item);
    }
    card.append(header, objective, meta, criteria);
    lane.append(role, card);
    lanes.append(lane);
  }
}

function renderHealth(pack) {
  const health = evaluateDeliveryPack(pack);
  pack.health = health;
  $("#blockerCount").textContent = String(health.blockerCount);
  const panel = $("#healthPanel");
  panel.innerHTML = `<div class="health-ring"><strong>${health.completeness}%</strong><span>完整度</span></div><div><strong>${health.ready ? "可以交付" : `${health.blockerCount} 项阻塞待处理`}</strong><p>可测试度 ${health.testability}% · 依赖风险 ${health.dependencyRisk}%</p></div>`;
}

function renderTests(pack) {
  $("#testRiskCount").textContent = String(pack.tests.length + pack.risks.length);
  const panel = $("#testRiskPanel");
  panel.replaceChildren();
  for (const testCase of pack.tests) {
    const item = document.createElement("article");
    item.className = "test-item";
    const title = document.createElement("strong");
    title.textContent = `${testCase.type.toUpperCase()} · ${testCase.title}`;
    item.append(title, document.createTextNode(` — ${testCase.expected.join("；")}`));
    panel.append(item);
  }
}

function renderPack() {
  const pack = state.pack;
  if (!pack) return;
  $("#versionPill").textContent = pack.project.version;
  $("#roleCount").textContent = String(new Set(pack.tasks.map((task) => task.role)).size);
  renderDecisions(pack);
  renderQuestions(pack);
  renderScope(pack);
  renderTasks(pack);
  renderHealth(pack);
  renderTests(pack);
  for (const id of ["saveVersion", "exportMarkdown", "exportJson", "exportCsv", "copyCodex"]) $(id.startsWith("#") ? id : `#${id}`).disabled = false;
}

function persistCurrentPack() {
  if (!state.pack) return;
  store.saveProject(state.pack);
}

function announce(message) {
  $("#exportStatus").textContent = message;
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(announce.timer);
  announce.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function renderDiff() {
  if (!state.savedV1 || !state.pack || state.pack.project.version !== "V2") return;
  const impact = diffDeliveryPacks(state.savedV1, state.pack);
  const panel = $("#diffPanel");
  panel.dataset.visible = "true";
  panel.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "diff-summary";
  for (const [label, value] of [
    ["新增", impact.summary.added],
    ["修改", impact.summary.modified],
    ["删除", impact.summary.removed],
    ["受影响测试", impact.affectedTests.length],
  ]) {
    const card = document.createElement("article");
    const count = document.createElement("strong");
    count.textContent = String(value);
    const name = document.createElement("span");
    name.textContent = label;
    card.append(count, name);
    summary.append(card);
  }
  const affected = document.createElement("section");
  affected.className = "affected-tests";
  const heading = document.createElement("h3");
  heading.textContent = "需要重新验证";
  affected.append(heading);
  for (const testCase of impact.affectedTests) {
    const card = document.createElement("article");
    card.dataset.affectedTest = testCase.id;
    card.textContent = `${testCase.title} · ${testCase.expected.join("；")}`;
    affected.append(card);
  }
  const changed = document.createElement("span");
  changed.id = "diffChangedCount";
  changed.hidden = true;
  changed.textContent = String(impact.summary.changed);
  panel.append(summary, affected, changed);
  $("[data-pane='versions']").classList.add("has-diff");
  $("#openDiff").disabled = false;
}

function downloadText(name, type, content) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

$("#loadSample").addEventListener("click", () => {
  state.sources = structuredClone(BOSS_PHASE_SAMPLE.sources);
  state.hasChange = false;
  $("#sourceInput").value = sourceText(state.sources);
  renderSources();
  setStep("source");
});

$("#sourceInput").addEventListener("input", () => {
  if (sourceText(state.sources) !== $("#sourceInput").value) {
    state.sources = [{ id: "SRC-PASTE", kind: "text", title: "粘贴内容", content: $("#sourceInput").value }];
  }
  renderSources();
});

$("#analyzeButton").addEventListener("click", () => {
  const sources = state.sources.length ? state.sources : [{ id: "SRC-PASTE", kind: "text", title: "粘贴内容", content: $("#sourceInput").value }];
  state.pack = analyzeSources({
    projectName: BOSS_PHASE_SAMPLE.projectName,
    sources,
    glossary: GAME_GLOSSARY,
    version: state.savedV1 && state.hasChange ? "V2" : "V1",
  });
  state.pack.id = "boss-phase-demo";
  renderPack();
  persistCurrentPack();
  renderDiff();
  setStep("decisions");
});

$("#questionList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-confirm-question]");
  if (!button || !state.pack) return;
  const question = state.pack.questions.find((item) => item.id === button.dataset.confirmQuestion);
  const answer = button.closest(".question-card").querySelector("[data-question-answer]").value.trim();
  if (!answer) {
    announce("请先填写确认结论");
    return;
  }
  question.status = "confirmed";
  question.answer = answer;
  renderQuestions(state.pack);
  renderHealth(state.pack);
  persistCurrentPack();
  announce("确认项已写入当前交付包");
});

$("#taskLanes").addEventListener("change", (event) => {
  const input = event.target.closest("[data-task-title]");
  if (!input || !state.pack) return;
  const task = state.pack.tasks.find((item) => item.id === input.dataset.taskTitle);
  if (!task) return;
  task.title = input.value.trim() || task.title;
  input.value = task.title;
  persistCurrentPack();
  announce("任务编辑已保存在本机");
});

$("#saveVersion").addEventListener("click", () => {
  if (!state.pack) return;
  state.savedV1 = structuredClone(state.pack);
  state.savedV1.id = "boss-phase-demo-v1";
  state.savedV1.project.version = "V1";
  store.saveProject(state.savedV1);
  $("#loadChangeSample").disabled = false;
  announce("V1 已锁定，可以载入评审变更");
});

$("#loadChangeSample").addEventListener("click", () => {
  if (!state.savedV1) return;
  state.sources = [
    ...structuredClone(state.savedV1.sources),
    ...structuredClone(BOSS_PHASE_CHANGE_SAMPLE.sources),
  ];
  state.hasChange = true;
  $("#sourceInput").value = sourceText(state.sources);
  renderSources();
  setStep("source");
  announce("评审变更已加入来源，请生成 V2");
});

$("#openDiff").addEventListener("click", () => setStep("versions"));

$("#exportMarkdown").addEventListener("click", () => {
  downloadText("GameSpec-Relay-DeliveryPack.md", "text/markdown;charset=utf-8", toMarkdown(state.pack));
  announce("Markdown 已导出");
});
$("#exportJson").addEventListener("click", () => {
  downloadText("GameSpec-Relay-DeliveryPack.json", "application/json;charset=utf-8", toJson(state.pack));
  announce("JSON 已导出");
});
$("#exportCsv").addEventListener("click", () => {
  downloadText("GameSpec-Relay-Tasks.csv", "text/csv;charset=utf-8", `\uFEFF${toTaskCsv(state.pack)}`);
  announce("任务 CSV 已导出");
});
$("#copyCodex").addEventListener("click", async () => {
  const content = toCodexContext(state.pack);
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    const input = document.createElement("textarea");
    input.value = content;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  announce("Codex 交付包已复制");
});

$("#sourceFiles").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  const nextSources = [];
  for (const [index, file] of files.entries()) {
    if (file.size > 2 * 1024 * 1024) {
      announce(`${file.name} 超过 2 MB，未导入`);
      continue;
    }
    try {
      nextSources.push({ id: `SRC-FILE-${index + 1}`, kind: "document", title: file.name, content: await file.text() });
    } catch {
      announce(`${file.name} 无法读取，原内容已保留`);
    }
  }
  if (nextSources.length) {
    state.sources = nextSources;
    state.hasChange = false;
    $("#sourceInput").value = sourceText(state.sources);
    renderSources();
  }
  event.target.value = "";
});

document.querySelectorAll("[data-step-target]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.stepTarget)));

$("#modelSettings").addEventListener("click", () => $("#modelDialog").showModal());

$("#saveModelSettings").addEventListener("click", () => {
  store.saveSettings({ endpoint: $("#modelEndpoint").value.trim(), model: $("#modelName").value.trim() });
  $("#modelKey").value = "";
  announce("非敏感模型配置已保存；API Key 未写入浏览器");
});

$("#runModelAnalysis").addEventListener("click", async () => {
  const endpoint = $("#modelEndpoint").value.trim();
  const model = $("#modelName").value.trim();
  const apiKey = $("#modelKey").value;
  if (!endpoint || !model || !apiKey) {
    announce("请完整填写 Endpoint、Model 与本次 API Key");
    return;
  }
  const button = $("#runModelAnalysis");
  button.disabled = true;
  button.textContent = "模型分析中…";
  store.saveSettings({ endpoint, model });
  const sources = state.sources.length ? state.sources : [{
    id: "SRC-PASTE",
    kind: "text",
    title: "粘贴内容",
    content: $("#sourceInput").value,
  }];
  try {
    state.pack = await runCompatibleModel({ endpoint, model, apiKey, sources });
    announce("模型结果已通过本地 DeliveryPack 门禁");
  } catch {
    state.pack = analyzeSources({
      projectName: BOSS_PHASE_SAMPLE.projectName,
      sources,
      glossary: GAME_GLOSSARY,
      version: state.savedV1 && state.hasChange ? "V2" : "V1",
    });
    announce("模型不可用，已安全回退到本地分析");
  } finally {
    $("#modelKey").value = "";
    button.disabled = false;
    button.textContent = "用模型生成";
  }
  state.pack.id = "boss-phase-demo";
  renderPack();
  persistCurrentPack();
  renderDiff();
  $("#modelDialog").close();
  setStep("decisions");
});

const settings = store.loadSettings();
$("#modelEndpoint").value = settings.endpoint || "";
$("#modelName").value = settings.model || "";
state.savedV1 = store.loadProject("boss-phase-demo-v1");
state.pack = store.loadProject("boss-phase-demo");
if (state.savedV1) $("#loadChangeSample").disabled = false;
if (state.pack) {
  state.sources = structuredClone(state.pack.sources);
  state.hasChange = state.pack.project.version === "V2";
  $("#sourceInput").value = sourceText(state.sources);
  renderPack();
  renderDiff();
}

renderSources();
setStep("source");
