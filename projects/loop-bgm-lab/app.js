import { analyzePcm } from "./core/audio-analysis.mjs";
import { createDailyPlan } from "./core/prompt-engine.mjs";
import {
  exportProjectJson,
  exportProjectMarkdown,
  importProjectJson,
  rebuildPromptQueue,
  recordGenerationRun,
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
import {
  CURRENT_OFFICIAL_API_EVIDENCE,
  evaluateOfficialApiReadiness
} from "./core/suno-official-adapter.mjs";

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
const approvedBaseline = element("#approved-baseline");
const approvedExclusions = element("#approved-exclusions");
const sunoApiStatus = element("#suno-api-status");
const sunoApiChecklist = element("#suno-api-checklist");
const batchList = element("#batch-list");
const candidateInput = element("#candidate-file");
const candidateBatch = element("#candidate-batch");
const candidateHistory = element("#candidate-history");
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
const officialApiReadiness = evaluateOfficialApiReadiness(CURRENT_OFFICIAL_API_EVIDENCE);

let project;
let referenceFailures = [];
const referenceSessions = new Map();
let candidateSession = null;
let selectedCandidateId = null;
const objectUrls = new Set();
const downloadUrls = new Set();
const allocatedIds = {
  reference: new Set(),
  candidate: new Set(),
  experiment: new Set(),
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
  return validateProject(createDailyPlan());
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
  return rebuildPromptQueue({ ...baseProject, references }, styleSpec);
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

function updateDisplayName(kind, id, nextValue) {
  clearError();
  try {
    const collectionName = kind === "reference" ? "references" : "candidates";
    const displayName = nextValue.trim();
    const records = project[collectionName].map(record => {
      if (record.id !== id) return record;
      if (displayName) return { ...record, displayName };
      const { displayName: _removed, ...withoutDisplayName } = record;
      return withoutDisplayName;
    });
    let currentBestCandidate = project.currentBestCandidate;
    if (kind === "candidate" && currentBestCandidate?.candidateId === id) {
      const { displayName: _removed, ...identity } = currentBestCandidate;
      currentBestCandidate = displayName ? { ...identity, displayName } : identity;
    }
    project = validateProject({ ...project, [collectionName]: records, currentBestCandidate });
    persistProject();
    if (kind === "reference") renderReferences();
    else renderCandidateHistory();
    showLive(`${kind === "reference" ? "参考" : "候选"}导出显示名已保存；本机文件名仍不会写入持久状态。`);
  } catch (error) {
    renderAll();
    showError(error instanceof Error ? error.message : "显示名保存失败。 ");
  }
}

function renderReferences() {
  referenceList.replaceChildren();
  for (const [index, record] of (project.references || []).entries()) {
    const session = referenceSessions.get(record.id);
    const item = createElement("li", { className: "analysis-item" });
    item.dataset.analysisState = "ready";
    const copy = createElement("div");
    copy.append(
      createElement("strong", { text: record.displayName || session?.name || `参考 ${index + 1}（仅恢复数值记录）` }),
      createElement("span", { className: "hash-fragment", text: audioSummary(record.analysis, record.hash) })
    );
    if (record.analysis.warnings?.length) {
      copy.append(createElement("span", { text: record.analysis.warnings.map(warning => warning.message).join(" ") }));
    }
    const remove = createElement("button", { className: "text-button", text: "移除" });
    remove.type = "button";
    remove.addEventListener("click", () => removeReference(record.id));
    const displayName = createElement("input", { className: "reference-display-name" });
    displayName.type = "text";
    displayName.autocomplete = "off";
    displayName.maxLength = 120;
    displayName.placeholder = `参考 ${index + 1}`;
    displayName.value = record.displayName || "";
    displayName.addEventListener("change", () => updateDisplayName("reference", record.id, displayName.value));
    item.append(copy, labelledField("导出显示名（可选）", displayName), remove);
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
  project = rebuildPlanForReferences((project.references || []).filter(record => record.id !== id));
  releaseCandidateSession();
  persistProject();
  renderAll();
  showLive("已移除参考记录并重建提示词；既有候选与实验历史仍保留。 ");
}

function renderStyle() {
  styleKey.value = project.styleSpec.key;
  styleTempo.value = String(project.styleSpec.tempo.target);
  styleBars.value = String(project.styleSpec.structure.bars);
  approvedBaseline.textContent = project.batches[0].prompt;
  approvedExclusions.textContent = project.batches[0].excludePrompt;
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
  const selectedBatchId = candidateBatch.value;
  candidateBatch.replaceChildren();
  batchList.replaceChildren();
  project.batches.forEach((batch, index) => {
    const candidateOption = createElement("option", {
      text: `${index + 1}. ${AXIS_LABELS[batch.changedAxis] || batch.changedAxis}`
    });
    candidateOption.value = batch.id;
    candidateOption.selected = batch.id === selectedBatchId || (!selectedBatchId && index === 0);
    candidateBatch.append(candidateOption);
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
  const candidate = project.candidates.find(item => item.id === selectedCandidateId) || project.candidates.at(-1);
  comparisonBody.replaceChildren();
  if (!candidate?.comparison) {
    comparisonResult.dataset.analysisState = "empty";
    comparisonCoverage.textContent = "—";
    comparisonSimilarity.textContent = "—";
    similarityClass.textContent = "等待候选";
    nextAdvice.textContent = "导入参考和候选后，这里只给出一个变量轴的下一轮建议。";
    removeCandidateButton.hidden = !candidateSession;
    setAudioElement(candidatePlayer, null);
    return;
  }
  comparisonResult.dataset.analysisState = "ready";
  comparisonCoverage.textContent = `${Math.round(candidate.comparison.coverage * 100)}%`;
  comparisonSimilarity.textContent = `${Math.round(candidate.comparison.similarity * 100)}%`;
  similarityClass.textContent = CLASS_LABELS[candidate.similarityClass] || candidate.similarityClass;
  if (candidate.similarityClass === "insufficient") {
    comparisonCoverage.textContent = "—";
    comparisonSimilarity.textContent = "—";
    nextAdvice.textContent = candidate.advice.message;
    removeCandidateButton.hidden = !candidateSession;
    setAudioElement(candidatePlayer, candidateSession?.candidateId === candidate.id ? candidateSession.url : null);
    return;
  }
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
  nextAdvice.textContent = advice.kind === "evidence-insufficient"
    ? advice.message
    : `${advice.reason} ${advice.adjustment}`;
  removeCandidateButton.hidden = !candidateSession;
  setAudioElement(candidatePlayer, candidateSession?.candidateId === candidate.id ? candidateSession.url : null);
}

function updateCandidateReview(candidateId, batchPatch) {
  clearError();
  try {
    const candidate = project.candidates.find(item => item.id === candidateId);
    if (!candidate) throw new TypeError(`未知候选：${candidateId}`);
    const batch = project.batches.find(item => item.id === candidate.batchId);
    if (!batch) throw new TypeError(`候选关联的批次不存在：${candidate.batchId}`);
    const experiment = project.experiments.find(item => item.candidateId === candidate.id);
    if (!experiment) throw new TypeError(`候选关联的实验不存在：${candidate.id}`);
    const normalizedPatch = { ...batchPatch };
    const isBatchCurrent = batch.currentCandidateId === candidate.id;
    const batches = project.batches.map(item => item.id === batch.id && isBatchCurrent
      ? { ...item, ...normalizedPatch, currentCandidateId: candidate.id, candidateHash: candidate.hash }
      : item);
    const experiments = project.experiments.map(experiment => experiment.candidateId === candidate.id
      ? {
        ...experiment,
        candidateHash: candidate.hash,
        generatedUrl: Object.hasOwn(normalizedPatch, "generatedUrl") ? normalizedPatch.generatedUrl : experiment.generatedUrl,
        subjectiveScore: Object.hasOwn(normalizedPatch, "subjectiveScore") ? normalizedPatch.subjectiveScore : experiment.subjectiveScore,
        reviewNote: Object.hasOwn(normalizedPatch, "reviewNote") ? normalizedPatch.reviewNote : experiment.reviewNote,
        disposition: Object.hasOwn(normalizedPatch, "disposition") ? normalizedPatch.disposition : experiment.disposition
      }
      : experiment);
    project = validateProject({ ...project, batches, experiments });
    selectedCandidateId = candidate.id;
    persistProject();
    renderBatches();
    renderCandidateHistory();
    renderComparison();
    showLive(isBatchCurrent ? "候选复盘已保存到当前批次和实验历史。 " : "候选复盘已保存到其独立实验历史。 ");
  } catch (error) {
    renderAll();
    showError(error instanceof Error ? error.message : "候选复盘保存失败。 ");
  }
}

function setBestCandidate(candidateId, checked) {
  clearError();
  try {
    const candidate = project.candidates.find(item => item.id === candidateId);
    if (!candidate) throw new TypeError(`未知候选：${candidateId}`);
    const isCurrent = project.currentBestCandidate?.candidateId === candidate.id;
    const currentBestCandidate = checked
      ? {
        candidateId: candidate.id,
        ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
        hash: candidate.hash
      }
      : isCurrent ? null : project.currentBestCandidate;
    project = validateProject({ ...project, currentBestCandidate });
    persistProject();
    renderCandidateHistory();
    showLive(checked ? "已明确设为当前最佳候选。 " : "已取消当前最佳候选。 ");
  } catch (error) {
    renderCandidateHistory();
    showError(error instanceof Error ? error.message : "最佳候选更新失败。 ");
  }
}

function labelledField(labelText, control) {
  const label = createElement("label");
  label.append(createElement("span", { text: labelText }), control);
  return label;
}

function renderCandidateHistory() {
  candidateHistory.replaceChildren();
  if (!project.candidates.length) {
    candidateHistory.append(createElement("p", { text: "尚无候选记录。分析候选后，历史会保留在这里。" }));
    return;
  }
  for (const [index, candidate] of [...project.candidates].reverse().entries()) {
    const batch = project.batches.find(item => item.id === candidate.batchId);
    const experiment = project.experiments.find(item => item.candidateId === candidate.id);
    const isBatchCurrent = batch?.currentCandidateId === candidate.id;
    const card = createElement("article", { className: "candidate-history-item" });
    card.dataset.candidateId = candidate.id;
    card.dataset.batchId = candidate.batchId;
    if (candidate.id === selectedCandidateId) card.dataset.selected = "true";
    const heading = createElement("div", { className: "candidate-history-heading" });
    heading.append(
      createElement("strong", { text: candidate.displayName || `候选 ${project.candidates.length - index}` }),
      createElement("span", { text: `${candidate.batchId} · SHA-256 ${candidate.hash}` })
    );
    const view = createElement("button", { className: "text-button candidate-view", text: "查看比较" });
    view.type = "button";
    view.addEventListener("click", () => {
      selectedCandidateId = candidate.id;
      renderComparison();
      renderCandidateHistory();
    });
    heading.append(view);

    const candidateDisplayName = createElement("input", { className: "candidate-display-name" });
    candidateDisplayName.type = "text";
    candidateDisplayName.autocomplete = "off";
    candidateDisplayName.maxLength = 120;
    candidateDisplayName.placeholder = `候选 ${project.candidates.length - index}`;
    candidateDisplayName.value = candidate.displayName || "";
    candidateDisplayName.addEventListener("change", () => updateDisplayName("candidate", candidate.id, candidateDisplayName.value));

    const candidateHash = createElement("input", { className: "candidate-hash" });
    candidateHash.type = "text";
    candidateHash.autocomplete = "off";
    candidateHash.spellcheck = false;
    candidateHash.maxLength = 64;
    candidateHash.readOnly = true;
    candidateHash.value = candidate.hash;

    const generatedUrl = createElement("input", { className: "candidate-generated-url" });
    generatedUrl.type = "url";
    generatedUrl.inputMode = "url";
    generatedUrl.placeholder = "https://suno.com/song/…";
    generatedUrl.value = isBatchCurrent ? batch.generatedUrl || "" : experiment?.generatedUrl || "";
    generatedUrl.addEventListener("change", () => updateCandidateReview(candidate.id, { generatedUrl: generatedUrl.value.trim() || null }));

    const score = createElement("select", { className: "candidate-subjective-score" });
    score.append(optionFor("", String(isBatchCurrent ? batch.subjectiveScore ?? "" : experiment?.subjectiveScore ?? "")));
    score.firstElementChild.textContent = "未评分";
    for (let value = 1; value <= 5; value += 1) {
      const option = createElement("option", { text: `${value} / 5` });
      option.value = String(value);
      option.selected = String(isBatchCurrent ? batch.subjectiveScore ?? "" : experiment?.subjectiveScore ?? "") === String(value);
      score.append(option);
    }
    score.addEventListener("change", () => updateCandidateReview(candidate.id, { subjectiveScore: score.value ? Number(score.value) : null }));

    const reviewNote = createElement("textarea", { className: "candidate-review-note" });
    reviewNote.rows = 2;
    reviewNote.placeholder = "写明接受、复核或拒绝理由";
    reviewNote.value = isBatchCurrent ? batch.reviewNote : experiment?.reviewNote || "";
    reviewNote.addEventListener("change", () => updateCandidateReview(candidate.id, { reviewNote: reviewNote.value.trim() }));

    const disposition = createElement("select", { className: "candidate-disposition" });
    const dispositionValue = isBatchCurrent ? batch.disposition : experiment?.disposition || "unrated";
    for (const [value, text] of [["unrated", "未处置"], ["accepted", "接受"], ["rejected", "拒绝"]]) {
      const option = createElement("option", { text });
      option.value = value;
      option.selected = value === dispositionValue;
      disposition.append(option);
    }
    disposition.addEventListener("change", () => updateCandidateReview(candidate.id, { disposition: disposition.value }));

    const best = createElement("input", { className: "candidate-best" });
    best.type = "checkbox";
    best.checked = project.currentBestCandidate?.candidateId === candidate.id;
    best.addEventListener("change", () => setBestCandidate(candidate.id, best.checked));
    const bestLabel = labelledField("当前最佳", best);
    bestLabel.className = "candidate-best-field";

    const fields = createElement("div", { className: "candidate-review-grid" });
    fields.append(
      labelledField("导出显示名（可选）", candidateDisplayName),
      labelledField("候选 SHA-256（只读）", candidateHash),
      labelledField("生成链接", generatedUrl),
      labelledField("主观评分", score),
      labelledField("复核 / 拒绝理由", reviewNote),
      labelledField("处置", disposition),
      bestLabel
    );
    card.append(heading, fields);
    candidateHistory.append(card);
  }
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
    copy.append(
      link,
      createElement("span", { text: `SHA-256：${entry.fileSha256}` }),
      createElement("span", { text: entry.useWarning }),
      createElement("span", { text: entry.attributionWarning }),
      createElement("span", { text: `作者：${entry.author}` }),
      createElement("span", { text: `来源核验日期：${entry.downloadedAt}` })
    );
    if (entry.attributionText) copy.append(createElement("span", { text: `署名文本：${entry.attributionText}` }));
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

function renderOfficialApiReadiness() {
  sunoApiStatus.textContent = `${officialApiReadiness.confirmedCount}/${officialApiReadiness.totalCount} 项已证实，官方 API 自动生成未启用`;
  sunoApiChecklist.replaceChildren();
  for (const blocker of officialApiReadiness.blockers) {
    sunoApiChecklist.append(createElement("li", { text: `未证实：${blocker}` }));
  }
}

function renderAll() {
  renderStyle();
  renderReferences();
  renderBatches();
  renderComparison();
  renderCandidateHistory();
  renderLicenses();
}

function stageProjectRender(stagedProject, stagedSelectedCandidateId) {
  const activeProject = project;
  const activeSelectedCandidateId = selectedCandidateId;
  project = stagedProject;
  selectedCandidateId = stagedSelectedCandidateId;
  try {
    renderAll();
  } finally {
    project = activeProject;
    selectedCandidateId = activeSelectedCandidateId;
    renderAll();
  }
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
  const batchId = candidateBatch.value;
  const selectedBatch = project.batches.find(batch => batch.id === batchId);
  if (!selectedBatch) {
    showError("请先选择候选对应的提示词批次。 ");
    return;
  }
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
    const projectWithRun = recordGenerationRun(project, batchId);
    const currentBatch = projectWithRun.batches.find(batch => batch.id === batchId);
    const run = projectWithRun.runs.find(item => item.id === currentBatch?.currentRunId);
    if (!currentBatch || !run) throw new TypeError("无法为候选建立独立生成运行。 ");
    const generationConditions = run.generationConditions;
    const candidateId = allocateId("candidate", projectWithRun.candidates || []);
    const record = {
      id: candidateId,
      batchId,
      hash: result.hash,
      analysis: result.analysis,
      referenceBasis: structuredClone(reference),
      comparison,
      similarityClass: similarityClassValue,
      advice
    };
    const experiment = {
      id: allocateId("experiment", projectWithRun.experiments || []),
      runId: run.id,
      batchId,
      candidateId,
      candidateHash: result.hash,
      generatedUrl: currentBatch.generatedUrl,
      subjectiveScore: null,
      reviewNote: "",
      disposition: "unrated",
      referenceBasis: structuredClone(reference),
      comparison,
      advice,
      generationConditions: structuredClone(generationConditions)
    };
    const batches = projectWithRun.batches.map(batch => batch.id === batchId
      ? {
        ...batch,
        currentCandidateId: candidateId,
        candidateHash: result.hash,
        subjectiveScore: null,
        reviewNote: "",
        disposition: "unrated"
      }
      : batch);
    const nextProject = validateProject({
      ...projectWithRun,
      batches,
      candidates: [...projectWithRun.candidates, record],
      experiments: [...projectWithRun.experiments, experiment],
      nextRoundSuggestion: advice
    });
    const nextUrl = createAudioUrl(file);
    releaseCandidateSession();
    candidateSession = { candidateId, name: file.name, url: nextUrl, hash: result.hash };
    selectedCandidateId = candidateId;
    project = nextProject;
    persistProject();
    renderAll();
    showLive(`候选“${file.name}”分析完成并追加到历史；名称不会写入持久状态或导出。`);
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
  const nextKey = styleKey.value.trim();
  const nextStyle = {
    ...project.styleSpec,
    key: nextKey,
    tempo: { target: tempo, min: Math.max(70, tempo - 3), max: Math.min(160, tempo + 4) },
    structure: { ...project.styleSpec.structure, bars: Number(styleBars.value) }
  };
  const previousOverrides = project.extensions?.styleOverrides || {};
  project = rebuildPromptQueue({
    ...project,
    extensions: {
      ...(project.extensions || {}),
      styleOverrides: {
        key: Boolean(previousOverrides.key) || nextKey !== project.styleSpec.key,
        tempo: Boolean(previousOverrides.tempo) || tempo !== project.styleSpec.tempo.target,
        bars: Boolean(previousOverrides.bars) || Number(styleBars.value) !== project.styleSpec.structure.bars
      }
    }
  }, nextStyle);
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
  renderComparison();
  renderCandidateHistory();
  showLive("已清除临时播放地址；候选与实验历史仍保留。 ");
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
    const importedSelectedCandidateId = imported.candidates.at(-1)?.id || null;
    stageProjectRender(imported, importedSelectedCandidateId);
    referenceGeneration += 1;
    candidateGeneration += 1;
    project = imported;
    selectedCandidateId = importedSelectedCandidateId;
    releaseAllAudio();
    referenceFailures = [];
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
renderOfficialApiReadiness();
renderAll();
persistProject();
document.body.dataset.ready = "true";
