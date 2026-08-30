import { analyzePcm } from "./core/audio-analysis.mjs";
import { createDailyPlan } from "./core/prompt-engine.mjs";
import {
  exportProjectJson,
  exportProjectMarkdown,
  importProjectJson,
  transitionBatch,
  validateProject
} from "./core/project-state.mjs";
import {
  classifySimilarity,
  compareCandidate,
  recommendNextVariant,
  validateLicenseEntry
} from "./core/candidate-score.mjs";
import {
  aggregateReferenceStyle,
  assertDecodedAudioBudget,
  assertPredecodeAudioBudget,
  nextMonotonicId
} from "./core/browser-policy.mjs";

const STORAGE_KEY = "loop-bgm-lab-v1";
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_REFERENCE_FILES = 8;
const SUNO_CREATE_URL = "https://suno.com/create";
const ACCEPTED_EXTENSIONS = /\.(?:mp3|wav|m4a|ogg)$/i;
const ACCEPTED_AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg"]);
const AXIS_LABELS = {
  baseline: "基线",
  melodyTimbre: "旋律音色",
  rhythm: "律动",
  percussion: "打击乐",
  loopStructure: "循环结构"
};
const STATUS_LABELS = {
  planned: "计划中",
  submitted: "已提交",
  downloaded: "已下载",
  reviewed: "已复核",
  rejected: "已拒绝"
};
const COMPONENT_LABELS = {
  tempo: "速度",
  key: "调性关系",
  brightness: "明亮度",
  dynamics: "动态",
  loop: "循环兼容",
  duration: "时长 / 结构"
};
const CLASS_LABELS = {
  insufficient: "证据不足",
  "too-close": "过近风险，建议换动机或编配",
  review: "人工复核",
  distinct: "差异充分"
};

const element = selector => document.querySelector(selector);
const referenceInput = element("#reference-files");
const referenceProgress = element("#reference-progress");
const referenceList = element("#reference-list");
const aggregateSummary = element("#aggregate-summary");
const styleForm = element("#style-form");
const styleKey = element("#style-key");
const styleTempo = element("#style-tempo");
const styleBars = element("#style-bars");
const batchList = element("#batch-list");
const candidateInput = element("#candidate-file");
const comparisonResult = element("#comparison-result");
const comparisonBody = element("#comparison-components tbody");
const comparisonCoverage = element("#comparison-coverage");
const comparisonSimilarity = element("#comparison-similarity");
const similarityClass = element("#similarity-class");
const nextAdvice = element("#next-advice");
const referencePlayer = element("#reference-player");
const candidatePlayer = element("#candidate-player");
const removeCandidateButton = element("#remove-candidate");
const licenseForm = element("#license-form");
const licenseFormError = element("#license-form-error");
const licenseList = element("#license-list");
const importInput = element("#import-project");
const importStatus = element("#import-status");
const storageWarning = element("#storage-warning");
const appLive = element("#app-live");
const appError = element("#app-error");

let project;
let referenceFailures = [];
const referenceSessions = new Map();
let candidateSession = null;
const objectUrls = new Set();
const downloadUrls = new Set();
const allocatedIds = {
  reference: new Set(),
  candidate: new Set(),
  license: new Set()
};
let referenceGeneration = 0;
let candidateGeneration = 0;

function allocateId(prefix, entries = []) {
  const id = nextMonotonicId([...entries, ...allocatedIds[prefix]], prefix);
  allocatedIds[prefix].add(id);
  return id;
}

function rememberProjectIds(value) {
  for (const prefix of Object.keys(allocatedIds)) {
    for (const entry of value?.[`${prefix}s`] || []) allocatedIds[prefix].add(entry.id);
  }
}

function createElement(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (typeof options.text === "string") node.textContent = options.text;
  return node;
}

function defaultProject() {
  return validateProject({
    ...createDailyPlan(),
    sourceUrl: SUNO_CREATE_URL,
    references: [],
    candidates: [],
    experiments: [],
    licenses: [],
    currentBestCandidate: null,
    outstandingIssues: [],
    nextRoundSuggestion: null
  });
}

function showLive(message) {
  appLive.textContent = message;
}

function showError(message) {
  appError.textContent = message;
  appError.hidden = false;
}

function clearError() {
  appError.textContent = "";
  appError.hidden = true;
}

function showStorageFailure() {
  storageWarning.hidden = false;
  storageWarning.textContent = "本地存储不可用；当前会话仍可继续，请及时导出 JSON 以便恢复。";
}

function loadProject() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultProject();
    return importProjectJson(stored);
  } catch {
    showStorageFailure();
    return defaultProject();
  }
}

function persistProject() {
  try {
    localStorage.setItem(STORAGE_KEY, exportProjectJson(project));
  } catch {
    showStorageFailure();
  }
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits).replace(/\.00$/, "") : "—";
}

function weightedMedian(items, valueOf, weightOf = () => 1) {
  const usable = items
    .map(item => ({ value: valueOf(item), weight: Math.max(0, weightOf(item)) }))
    .filter(item => Number.isFinite(item.value) && Number.isFinite(item.weight) && item.weight > 0)
    .sort((left, right) => left.value - right.value);
  if (!usable.length) return null;
  const half = usable.reduce((sum, item) => sum + item.weight, 0) / 2;
  let running = 0;
  for (const item of usable) {
    running += item.weight;
    if (running >= half) return item.value;
  }
  return usable.at(-1).value;
}

function aggregateReferences(records = project.references || []) {
  const analyses = records.map(record => record.analysis).filter(Boolean);
  if (!analyses.length) return null;
  const keyVotes = new Map();
  for (const analysis of analyses) {
    const name = analysis.key?.name;
    const weight = Number.isFinite(analysis.key?.confidence) ? Math.max(0, analysis.key.confidence) : 0;
    if (name && name !== "Unknown" && weight > 0) keyVotes.set(name, (keyVotes.get(name) || 0) + weight);
  }
  const keyName = [...keyVotes.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || "Unknown";
  const keySource = analyses.find(analysis => analysis.key?.name === keyName)?.key;
  const tempoBpm = weightedMedian(analyses, item => item.tempo?.bpm, item => item.tempo?.confidence || 0.01);
  const tempoConfidence = weightedMedian(analyses, item => item.tempo?.confidence);
  return {
    durationSeconds: weightedMedian(analyses, item => item.durationSeconds),
    rms: weightedMedian(analyses, item => item.rms),
    tempo: { bpm: tempoBpm, confidence: tempoConfidence ?? 0 },
    key: {
      name: keyName,
      tonic: keySource?.tonic || "",
      mode: keySource?.mode || "unknown",
      confidence: keySource?.confidence || 0
    },
    spectrum: { brightness: weightedMedian(analyses, item => item.spectrum?.brightness) },
    loop: { score: weightedMedian(analyses, item => item.loop?.score) }
  };
}

function rebuildPlanForReferences(references, baseProject = project) {
  const styleSpec = aggregateReferenceStyle(
    references,
    baseProject.styleSpec,
    baseProject.extensions?.styleOverrides || {}
  );
  const plan = createDailyPlan({ styleSpec });
  return validateProject({
    ...baseProject,
    styleSpec: plan.styleSpec,
    credits: plan.credits,
    batches: plan.batches,
    references,
    candidates: [],
    experiments: [],
    currentBestCandidate: null,
    nextRoundSuggestion: null
  });
}

function metric(label, value) {
  const item = createElement("p");
  item.append(createElement("span", { text: label }), createElement("strong", { text: value }));
  return item;
}

function renderAggregate() {
  aggregateSummary.replaceChildren();
  const aggregate = aggregateReferences();
  if (!aggregate) {
    aggregateSummary.append(createElement("p", { text: "尚未导入参考音频；默认画像保持 D minor / 112 BPM。" }));
    return;
  }
  aggregateSummary.append(
    metric("聚合速度", `${formatNumber(aggregate.tempo.bpm, 1)} BPM`),
    metric("聚合调性", aggregate.key.name),
    metric("明亮度", `${Math.round((aggregate.spectrum.brightness || 0) * 100)}%`),
    metric("循环衔接", `${Math.round((aggregate.loop.score || 0) * 100)}%`)
  );
}

function audioSummary(analysis, hash) {
  return `${formatNumber(analysis.durationSeconds, 1)} 秒 · ${formatNumber(analysis.tempo?.bpm, 1)} BPM · ${analysis.key?.name || "Unknown"} · 循环 ${Math.round((analysis.loop?.score || 0) * 100)}% · SHA-256 ${hash.slice(0, 12)}…`;
}

function clearAudioElement(audio) {
  audio.pause();
  audio.removeAttribute("src");
  delete audio.dataset.objectUrl;
  audio.load();
}

function setAudioElement(audio, url) {
  if (!url) {
    if (audio.hasAttribute("src")) clearAudioElement(audio);
    return;
  }
  if (audio.dataset.objectUrl === url) return;
  audio.pause();
  audio.src = url;
  audio.dataset.objectUrl = url;
}

function revokeObjectUrl(url) {
  if (!url || !objectUrls.has(url)) return;
  if (referencePlayer.dataset.objectUrl === url) clearAudioElement(referencePlayer);
  if (candidatePlayer.dataset.objectUrl === url) clearAudioElement(candidatePlayer);
  URL.revokeObjectURL(url);
  objectUrls.delete(url);
}

function releaseReferenceSessions() {
  for (const session of referenceSessions.values()) revokeObjectUrl(session.url);
  referenceSessions.clear();
  setAudioElement(referencePlayer, null);
}

function releaseCandidateSession() {
  if (candidateSession) revokeObjectUrl(candidateSession.url);
  candidateSession = null;
  setAudioElement(candidatePlayer, null);
}

function releaseAllAudio() {
  releaseReferenceSessions();
  releaseCandidateSession();
  for (const url of [...objectUrls]) revokeObjectUrl(url);
}

function renderReferences() {
  referenceList.replaceChildren();
  for (const [index, record] of (project.references || []).entries()) {
    const session = referenceSessions.get(record.id);
    const item = createElement("li", { className: "analysis-item" });
    item.dataset.analysisState = "ready";
    const copy = createElement("div");
    copy.append(
      createElement("strong", { text: session?.name || `参考 ${index + 1}（仅恢复数值记录）` }),
      createElement("span", { className: "hash-fragment", text: audioSummary(record.analysis, record.hash) })
    );
    if (record.analysis.warnings?.length) {
      copy.append(createElement("span", { text: record.analysis.warnings.map(warning => warning.message).join(" ") }));
    }
    const remove = createElement("button", { className: "text-button", text: "移除" });
    remove.type = "button";
    remove.addEventListener("click", () => removeReference(record.id));
    item.append(copy, remove);
    referenceList.append(item);
  }
  for (const failure of referenceFailures) {
    const item = createElement("li", { className: "analysis-item" });
    item.dataset.analysisState = "error";
    const copy = createElement("div");
    copy.append(createElement("strong", { text: failure.name }), createElement("span", { text: failure.message }));
    item.append(copy);
    referenceList.append(item);
  }
  const playable = (project.references || []).map(record => referenceSessions.get(record.id)).find(Boolean);
  setAudioElement(referencePlayer, playable?.url || null);
  renderAggregate();
}

function removeReference(id) {
  referenceGeneration += 1;
  candidateGeneration += 1;
  const session = referenceSessions.get(id);
  if (session) revokeObjectUrl(session.url);
  referenceSessions.delete(id);
  project = validateProject({
    ...project,
    references: (project.references || []).filter(record => record.id !== id),
    candidates: [],
    experiments: [],
    currentBestCandidate: null,
    nextRoundSuggestion: null
  });
  releaseCandidateSession();
  persistProject();
  renderReferences();
  renderComparison();
  showLive("已移除参考记录，并清空依赖它的候选比较。 ");
}

function renderStyle() {
  styleKey.value = project.styleSpec.key;
  styleTempo.value = String(project.styleSpec.tempo.target);
  styleBars.value = String(project.styleSpec.structure.bars);
}

function optionFor(value, selected) {
  const option = createElement("option", { text: STATUS_LABELS[value] });
  option.value = value;
  option.selected = value === selected;
  return option;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // The local fallback below keeps copying available without a permission prompt.
    }
  }
  const buffer = createElement("textarea", { className: "copy-buffer" });
  buffer.value = text;
  buffer.readOnly = true;
  document.body.append(buffer);
  buffer.select();
  const copied = document.execCommand("copy");
  buffer.remove();
  if (!copied) throw new Error("浏览器未允许复制，请手动选择提示词。");
}

function openExternal(url) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}

function renderBatches() {
  batchList.replaceChildren();
  project.batches.forEach((batch, index) => {
    const card = createElement("article", { className: "batch-card" });
    card.dataset.axis = batch.changedAxis;
    const head = createElement("div", { className: "batch-head" });
    const status = createElement("select", { className: "batch-status" });
    status.setAttribute("aria-label", `批次 ${index + 1} 状态`);
    Object.keys(STATUS_LABELS).forEach(value => status.append(optionFor(value, batch.status)));
    status.addEventListener("change", () => changeBatchStatus(batch.id, status.value));
    head.append(
      createElement("span", { className: "batch-number", text: String(index + 1).padStart(2, "0") }),
      createElement("span", { className: "axis-label", text: AXIS_LABELS[batch.changedAxis] || batch.changedAxis }),
      status
    );
    const expected = createElement("p", { className: "expected-difference", text: batch.expectedDifference });
    const prompt = createElement("p", { className: "prompt-text", text: batch.prompt });
    const exclusion = createElement("p", { className: "exclude-text", text: `排除：${batch.excludePrompt}` });
    const actions = createElement("div", { className: "batch-actions" });
    const copyButton = createElement("button", { className: "batch-action copy-prompt", text: "复制提示词" });
    copyButton.type = "button";
    copyButton.addEventListener("click", async () => {
      clearError();
      try {
        await copyText(`${batch.prompt}\n\nExclude: ${batch.excludePrompt}`);
        showLive(`批次 ${index + 1} 提示词已复制。`);
      } catch (error) {
        showError(error instanceof Error ? error.message : "复制失败。");
      }
    });
    const openButton = createElement("button", { className: "batch-action open-suno", text: "打开 Suno Create" });
    openButton.type = "button";
    openButton.addEventListener("click", () => {
      openExternal(SUNO_CREATE_URL);
      showLive(`已打开批次 ${index + 1} 的创作入口；状态仍由你手动更新。`);
    });
    actions.append(copyButton, openButton);
    card.append(head, expected, prompt, exclusion, actions);
    batchList.append(card);
  });
}

function changeBatchStatus(batchId, nextStatus) {
  clearError();
  try {
    project = transitionBatch(project, batchId, nextStatus);
    persistProject();
    renderBatches();
    showLive(`批次状态已更新为“${STATUS_LABELS[nextStatus]}”。`);
  } catch (error) {
    renderBatches();
    showError(error instanceof Error ? error.message : "批次状态更新失败。");
  }
}

function componentDetail(name, component) {
  if (!component.available) return "不可用";
  if (name === "tempo") return `${formatNumber(component.deltaBpm, 1)} BPM`;
  if (name === "key") return component.relationship;
  if (name === "duration") return `${formatNumber(component.deltaSeconds, 1)} 秒`;
  return formatNumber(component.delta, 3);
}

function renderComparison() {
  const candidate = project.candidates?.[0];
  comparisonBody.replaceChildren();
  if (!candidate?.comparison) {
    comparisonResult.dataset.analysisState = "empty";
    comparisonCoverage.textContent = "—";
    comparisonSimilarity.textContent = "—";
    similarityClass.textContent = "等待候选";
    nextAdvice.textContent = "导入参考和候选后，这里只给出一个变量轴的下一轮建议。";
    removeCandidateButton.hidden = true;
    setAudioElement(candidatePlayer, null);
    return;
  }
  comparisonResult.dataset.analysisState = "ready";
  comparisonCoverage.textContent = `${Math.round(candidate.comparison.coverage * 100)}%`;
  comparisonSimilarity.textContent = `${Math.round(candidate.comparison.similarity * 100)}%`;
  similarityClass.textContent = CLASS_LABELS[candidate.similarityClass] || candidate.similarityClass;
  for (const [name, component] of Object.entries(candidate.comparison.components)) {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: COMPONENT_LABELS[name] || name }),
      createElement("td", { text: componentDetail(name, component) }),
      createElement("td", { text: component.available ? `${Math.round(component.score * 100)}%` : "—" }),
      createElement("td", { text: `${Math.round(component.weight * 100)}%` })
    );
    comparisonBody.append(row);
  }
  const advice = candidate.advice;
  nextAdvice.textContent = `${advice.reason} ${advice.adjustment}`;
  removeCandidateButton.hidden = false;
  setAudioElement(candidatePlayer, candidateSession?.url || null);
}

function renderLicenses() {
  licenseList.replaceChildren();
  for (const entry of project.licenses || []) {
    const item = createElement("li", { className: "license-entry" });
    item.dataset.licenseId = entry.id;
    const copy = createElement("div");
    copy.append(createElement("strong", { text: `${entry.source} · ${entry.license}` }));
    const link = createElement("a", { text: entry.sourceUrl });
    link.href = entry.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    copy.append(link, createElement("span", { text: entry.useWarning }), createElement("span", { text: entry.attributionWarning }));
    if (entry.author) copy.append(createElement("span", { text: `作者：${entry.author}` }));
    const remove = createElement("button", { className: "text-button", text: "移除" });
    remove.type = "button";
    remove.addEventListener("click", () => {
      project = validateProject({ ...project, licenses: project.licenses.filter(candidate => candidate.id !== entry.id) });
      persistProject();
      renderLicenses();
      showLive("已移除授权记录。");
    });
    item.append(copy, remove);
    licenseList.append(item);
  }
}

function renderAll() {
  renderStyle();
  renderReferences();
  renderBatches();
  renderComparison();
  renderLicenses();
}

async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function validateAudioFile(file) {
  if (!(file instanceof File)) throw new TypeError("未收到有效文件。");
  if (file.size > MAX_FILE_BYTES) throw new TypeError("文件超过 80 MB 上限。");
  if (!ACCEPTED_EXTENSIONS.test(file.name) && !ACCEPTED_AUDIO_TYPES.has(file.type)) {
    throw new TypeError("只接受 MP3、WAV、M4A 或 OGG；格式提示不代表一定可解码。");
  }
}

async function checkMediaMetadataBudget(file) {
  const url = createAudioUrl(file);
  const audio = new Audio();
  audio.preload = "metadata";
  try {
    const durationSeconds = await new Promise(resolveDuration => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        audio.removeEventListener("loadedmetadata", onMetadata);
        audio.removeEventListener("error", onUnavailable);
        resolveDuration(value);
      };
      const onMetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
      const onUnavailable = () => finish(null);
      const timeout = window.setTimeout(onUnavailable, 3_000);
      audio.addEventListener("loadedmetadata", onMetadata);
      audio.addEventListener("error", onUnavailable);
      audio.src = url;
    });
    assertPredecodeAudioBudget({ durationSeconds });
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    revokeObjectUrl(url);
  }
}

async function analyzeFile(file) {
  validateAudioFile(file);
  await checkMediaMetadataBudget(file);
  let bytes = await file.arrayBuffer();
  const hash = await hashBytes(bytes);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持 Web Audio 解码。");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(bytes);
    bytes = null;
    assertDecodedAudioBudget({
      durationSeconds: decoded.duration,
      length: decoded.length,
      channelCount: decoded.numberOfChannels,
      sampleRate: decoded.sampleRate
    });
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const analysis = analyzePcm({ sampleRate: decoded.sampleRate, channels }, { maxFrames: 512 });
    return { hash, analysis };
  } catch (error) {
    throw new Error(`浏览器无法解码此文件：${error instanceof Error ? error.message : "未知格式错误"}`);
  } finally {
    bytes = null;
    await context.close().catch(() => undefined);
  }
}

function createAudioUrl(file) {
  const url = URL.createObjectURL(file);
  objectUrls.add(url);
  return url;
}

async function processReferenceFiles(files) {
  clearError();
  if (!files.length) return;
  const generation = ++referenceGeneration;
  candidateGeneration += 1;
  if (files.length > MAX_REFERENCE_FILES) {
    showError(`一次最多选择 ${MAX_REFERENCE_FILES} 个参考文件。`);
    return;
  }
  const failures = [];
  const references = [];
  const stagedSessions = new Map();
  for (const [index, file] of files.entries()) {
    if (generation !== referenceGeneration) break;
    referenceProgress.textContent = `正在逐个解码：${index + 1} / ${files.length}（${file.name}）`;
    try {
      const result = await analyzeFile(file);
      if (generation !== referenceGeneration) break;
      const url = createAudioUrl(file);
      const id = allocateId("reference", [...(project.references || []), ...references]);
      stagedSessions.set(id, { name: file.name, url });
      references.push({ id, hash: result.hash, analysis: result.analysis });
    } catch (error) {
      if (generation !== referenceGeneration) break;
      failures.push({ name: file.name, message: error instanceof Error ? error.message : "分析失败。" });
    }
  }
  if (generation !== referenceGeneration) {
    for (const session of stagedSessions.values()) revokeObjectUrl(session.url);
    return;
  }
  releaseReferenceSessions();
  releaseCandidateSession();
  referenceFailures = failures;
  for (const [id, session] of stagedSessions) referenceSessions.set(id, session);
  project = rebuildPlanForReferences(references);
  persistProject();
  renderAll();
  referenceProgress.textContent = `完成：${references.length} 个成功，${failures.length} 个失败。`;
  showLive("参考分析完成；文件名仅保留在当前会话界面。 ");
}

async function processCandidateFile(file) {
  clearError();
  const generation = ++candidateGeneration;
  const reference = aggregateReferences();
  if (!reference) {
    showError("请先导入至少一个可分析的参考音频。");
    return;
  }
  comparisonResult.dataset.analysisState = "working";
  similarityClass.textContent = "正在本地分析";
  try {
    const result = await analyzeFile(file);
    if (generation !== candidateGeneration) return;
    const comparison = compareCandidate(reference, result.analysis);
    const similarityClassValue = classifySimilarity(comparison);
    const advice = recommendNextVariant(comparison);
    const record = {
      id: allocateId("candidate", project.candidates || []),
      hash: result.hash,
      analysis: result.analysis,
      comparison,
      similarityClass: similarityClassValue,
      advice
    };
    releaseCandidateSession();
    candidateSession = { name: file.name, url: createAudioUrl(file), hash: result.hash };
    project = validateProject({
      ...project,
      candidates: [record],
      experiments: [{ id: `comparison-${result.hash.slice(0, 12)}`, candidateHash: result.hash, comparison, advice }],
      currentBestCandidate: { hash: result.hash },
      nextRoundSuggestion: advice
    });
    persistProject();
    renderComparison();
    showLive(`候选“${file.name}”分析完成；名称不会写入持久状态或导出。`);
  } catch (error) {
    if (generation !== candidateGeneration) return;
    renderComparison();
    showError(error instanceof Error ? error.message : "候选分析失败。");
  }
}

function buildSearchUrl(source, query) {
  const encoded = encodeURIComponent(query.trim() || "casual puzzle game sound effect");
  if (source === "Pixabay Music") return `https://pixabay.com/music/search/${encoded}/`;
  if (source === "OpenGameArt") return `https://opengameart.org/art-search-advanced?keys=${encoded}&field_art_type_tid%5B%5D=13`;
  return `https://freesound.org/search/?q=${encoded}`;
}

function downloadText(text, fileName, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  downloadUrls.add(url);
  const anchor = createElement("a", { className: "visually-hidden" });
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    downloadUrls.delete(url);
  }, 0);
}

referenceInput.addEventListener("change", () => {
  const files = [...referenceInput.files];
  referenceInput.value = "";
  processReferenceFiles(files);
});

element("#load-demo-reference").addEventListener("click", async () => {
  clearError();
  const requestedGeneration = ++referenceGeneration;
  candidateGeneration += 1;
  referenceProgress.textContent = "正在读取原创合成演示 WAV…";
  try {
    const response = await fetch("./assets/demo-reference.wav");
    if (!response.ok) throw new Error(`演示 WAV 请求失败（${response.status}）`);
    const blob = await response.blob();
    if (requestedGeneration !== referenceGeneration) return;
    await processReferenceFiles([new File([blob], "demo-reference.wav", { type: "audio/wav" })]);
  } catch (error) {
    if (requestedGeneration !== referenceGeneration) return;
    showError(error instanceof Error ? error.message : "无法载入演示 WAV。");
  }
});

styleForm.addEventListener("submit", event => {
  event.preventDefault();
  clearError();
  const tempo = Number(styleTempo.value);
  if (!Number.isFinite(tempo) || tempo < 70 || tempo > 160 || !styleKey.value.trim()) {
    showError("调性不能为空，目标速度必须在 70–160 BPM。 ");
    return;
  }
  const nextStyle = {
    ...project.styleSpec,
    key: styleKey.value.trim(),
    tempo: { target: tempo, min: Math.max(70, tempo - 3), max: Math.min(160, tempo + 4) },
    structure: { ...project.styleSpec.structure, bars: Number(styleBars.value) }
  };
  const freshPlan = createDailyPlan({ styleSpec: nextStyle });
  project = validateProject({
    ...project,
    styleSpec: freshPlan.styleSpec,
    credits: freshPlan.credits,
    batches: freshPlan.batches,
    extensions: {
      ...(project.extensions || {}),
      styleOverrides: { key: true, tempo: true }
    }
  });
  persistProject();
  renderBatches();
  showLive("已按更新后的画像重新生成 5 个单变量批次。 ");
});

candidateInput.addEventListener("change", () => {
  const [file] = candidateInput.files;
  candidateInput.value = "";
  if (file) processCandidateFile(file);
});

removeCandidateButton.addEventListener("click", () => {
  candidateGeneration += 1;
  releaseCandidateSession();
  project = validateProject({ ...project, candidates: [], experiments: [], currentBestCandidate: null, nextRoundSuggestion: null });
  persistProject();
  renderComparison();
  showLive("已移除候选及其临时播放地址。 ");
});

for (const audio of [referencePlayer, candidatePlayer]) {
  audio.addEventListener("play", () => {
    for (const other of [referencePlayer, candidatePlayer]) {
      if (other !== audio && !other.paused) other.pause();
    }
  });
}

element("#suno-create-link").addEventListener("click", event => {
  event.preventDefault();
  openExternal(SUNO_CREATE_URL);
});

for (const link of document.querySelectorAll(".search-link")) {
  link.addEventListener("click", event => {
    event.preventDefault();
    const url = buildSearchUrl(link.dataset.source, element("#asset-query").value);
    link.href = url;
    openExternal(url);
  });
}

licenseForm.addEventListener("submit", event => {
  event.preventDefault();
  licenseFormError.textContent = "";
  clearError();
  try {
    const raw = {
      id: allocateId("license", project.licenses || []),
      source: element("#license-source").value,
      sourceUrl: element("#license-url").value.trim(),
      license: element("#license-name").value.trim(),
      fileSha256: element("#license-hash").value.trim(),
      author: element("#license-author").value.trim(),
      downloadedAt: element("#license-date").value
    };
    const attributionText = element("#license-attribution").value.trim();
    if (attributionText) raw.attributionText = attributionText;
    const entry = validateLicenseEntry(raw);
    project = validateProject({ ...project, licenses: [...(project.licenses || []), entry] });
    persistProject();
    renderLicenses();
    licenseForm.reset();
    showLive("授权记录已加入台账；请保留来源页面证据。 ");
  } catch (error) {
    licenseFormError.textContent = error instanceof Error ? error.message : "授权记录无效。";
  }
});

element("#export-json").addEventListener("click", () => {
  try {
    downloadText(exportProjectJson(project), "loop-bgm-lab-project.json", "application/json;charset=utf-8");
    showLive("已导出不含音频、路径、个人文件名或秘密的 JSON。 ");
  } catch (error) {
    showError(error instanceof Error ? error.message : "JSON 导出失败。");
  }
});

element("#export-markdown").addEventListener("click", () => {
  try {
    downloadText(exportProjectMarkdown(project), "loop-bgm-lab-handoff.md", "text/markdown;charset=utf-8");
    showLive("已导出不含音频、路径、个人文件名或秘密的 Markdown。 ");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Markdown 导出失败。");
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  importInput.value = "";
  if (!file) return;
  clearError();
  try {
    const imported = importProjectJson(await file.text());
    referenceGeneration += 1;
    candidateGeneration += 1;
    releaseAllAudio();
    referenceFailures = [];
    project = imported;
    rememberProjectIds(project);
    persistProject();
    renderAll();
    importStatus.textContent = "已完整导入并替换当前项目；音频仍需在本机重新选择。";
  } catch (error) {
    importStatus.textContent = `导入失败：${error instanceof Error ? error.message : "项目 JSON 无效"}。当前状态未被替换。`;
  }
});

window.addEventListener("beforeunload", () => {
  referenceGeneration += 1;
  candidateGeneration += 1;
  releaseAllAudio();
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.clear();
});

project = loadProject();
rememberProjectIds(project);
renderAll();
persistProject();
document.body.dataset.ready = "true";
