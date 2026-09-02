import { analyzePcm } from "./core/audio-analysis.mjs";
import { createDailyPlan } from "./core/prompt-engine.mjs";
import {
  exportProjectJson,
  importProjectJson,
  rebuildPromptQueue,
  recordCreateRun,
  transitionBatch,
  updateExperimentReview,
  updateRunOutputs,
  validateProject
} from "./core/project-state.mjs";
import {
  MAX_PROJECT_DOCUMENT_BYTES,
  exportProjectHandoffMarkdown,
  importProjectDocument
} from "./core/portable-handoff.mjs";
import {
  classifySimilarity,
  compareCandidate,
  recommendNextVariant,
  validateLicenseEntry
} from "./core/candidate-score.mjs";
import { deriveCandidatePublicationState } from "./core/candidate-publication.mjs";
import {
  LICENSE_PACKAGE_FORMAT,
  LICENSE_PACKAGE_VERSION,
  MAX_LICENSE_PACKAGE_BYTES,
  adaptExternalManifestV3,
  applyLicensePackageImport,
  exportLicensePackageJson,
  parseLicensePackageJson,
  planLicensePackageImport
} from "./core/license-package.mjs";
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
const MAX_CANDIDATE_FILES = 8;
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
const SOURCE_LABELS = {
  suno: "Suno 结果",
  external: "外部音乐",
  "local-original": "本地原创",
  "legacy-unknown": "旧候选（来源待确认）"
};
const PUBLICATION_LABELS = {
  ready: "记录门禁通过（非法律清白）",
  review: "记录待复核",
  blocked: "记录门禁受阻"
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
const candidateSourceKind = element("#candidate-source-kind");
const candidateBatch = element("#candidate-batch");
const candidateRun = element("#candidate-run");
const candidateOutput = element("#candidate-output");
const candidateSourceHelp = element("#candidate-source-help");
const candidateProgress = element("#candidate-progress");
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
const licensePackageInput = element("#license-package-file");
const licensePackageApplyButton = element("#license-package-apply");
const licensePackageExportButton = element("#license-package-export");
const licensePackageStatus = element("#license-package-status");
const licensePackagePreview = element("#license-package-preview");
const licensePackageAdditions = element("#license-package-additions");
const licensePackageSkips = element("#license-package-skips");
const licensePackageConflicts = element("#license-package-conflicts");
const licensePackageBlockers = element("#license-package-blockers");
const licensePackageDetails = element("#license-package-details");
const importInput = element("#import-project");
const markdownExportButton = element("#export-markdown");
const importStatus = element("#import-status");
const storageWarning = element("#storage-warning");
const appLive = element("#app-live");
const appError = element("#app-error");
const officialApiReadiness = evaluateOfficialApiReadiness(CURRENT_OFFICIAL_API_EVIDENCE);

let project;
let storageWriteBlocked = false;
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
let licensePackageGeneration = 0;
let pendingLicensePackageImport = null;

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

function clearLicensePackagePreview({ message = "", onlyIfActive = false } = {}) {
  const hadPendingPlan = pendingLicensePackageImport !== null;
  if (onlyIfActive && !hadPendingPlan) return;
  pendingLicensePackageImport = null;
  licensePackageGeneration += 1;
  licensePackageApplyButton.disabled = true;
  licensePackagePreview.hidden = true;
  licensePackagePreview.dataset.state = "empty";
  licensePackageAdditions.textContent = "0";
  licensePackageSkips.textContent = "0";
  licensePackageConflicts.textContent = "0";
  licensePackageBlockers.textContent = "0";
  licensePackageDetails.replaceChildren();
  if (message) licensePackageStatus.textContent = message;
}

function showStorageFailure() {
  storageWarning.hidden = false;
  storageWarning.textContent = "本地存储不可用；当前会话仍可继续，请及时导出 JSON 以便恢复。";
}

function showStorageQuarantine() {
  storageWarning.hidden = false;
  storageWarning.textContent = "本地存储中的项目状态无效，已隔离保留；请导入有效的 JSON 或 Markdown 项目以恢复。";
}

function clearStorageWarning() {
  storageWarning.textContent = "";
  storageWarning.hidden = true;
}

function loadProject() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    showStorageFailure();
    return defaultProject();
  }
  if (stored === null) return defaultProject();
  try {
    return importProjectJson(stored);
  } catch (error) {
    storageWriteBlocked = true;
    showStorageQuarantine(error);
    return defaultProject();
  }
}

function persistProject({ allowBlockedWrite = false, preserveLicensePackagePreview = false } = {}) {
  if (!preserveLicensePackagePreview) {
    clearLicensePackagePreview({
      message: "许可证包预检已失效：项目已变更，请重新预检。",
      onlyIfActive: true
    });
  }
  if (storageWriteBlocked && !allowBlockedWrite) {
    showStorageQuarantine();
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, exportProjectJson(project));
    return true;
  } catch {
    showStorageFailure();
    return false;
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

function renderReferences({ staging = false } = {}) {
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
  if (!staging) setAudioElement(referencePlayer, playable?.url || null);
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

function runsForBatch(batchId) {
  return project.runs.filter(run => run.generationConditions.batchId === batchId);
}

function renderCandidateSourceControls({
  preferredRunId = candidateRun.value,
  preferredOutputIndex = candidateOutput.value
} = {}) {
  const sourceKind = candidateSourceKind.value;
  const batch = project.batches.find(item => item.id === candidateBatch.value);
  const runs = batch ? [...runsForBatch(batch.id)].reverse() : [];
  const selectableRunId = sourceKind === "suno" && runs.some(run => run.id === preferredRunId)
    ? preferredRunId
    : "";
  candidateRun.replaceChildren();
  const placeholder = createElement("option", { text: runs.length ? "请选择一次已登记的 Create" : "请先登记本次 Create" });
  placeholder.value = "";
  placeholder.selected = selectableRunId === "";
  candidateRun.append(placeholder);
  for (const run of runs) {
    const option = createElement("option", {
      text: `${run.id} · ${STATUS_LABELS[run.status]} · ${run.outputs.length} 个结果`
    });
    option.value = run.id;
    option.selected = run.id === selectableRunId;
    candidateRun.append(option);
  }
  candidateOutput.replaceChildren();
  const selectedRun = runs.find(run => run.id === selectableRunId);
  const outputIndex = preferredOutputIndex === "" ? null : Number(preferredOutputIndex);
  const selectableOutputIndex = Number.isInteger(outputIndex) && selectedRun?.outputs[outputIndex]
    ? outputIndex
    : null;
  const outputPlaceholder = createElement("option", {
    text: selectedRun?.outputs.length ? "请选择该运行的一个已有结果" : "请先保存该运行的结果链接"
  });
  outputPlaceholder.value = "";
  outputPlaceholder.selected = selectableOutputIndex === null;
  candidateOutput.append(outputPlaceholder);
  for (const [index, output] of (selectedRun?.outputs || []).entries()) {
    const option = createElement("option", { text: `结果 ${index + 1} · ${output.generatedUrl}` });
    option.value = String(index);
    option.selected = index === selectableOutputIndex;
    candidateOutput.append(option);
  }

  const isSuno = sourceKind === "suno";
  candidateRun.disabled = !isSuno || runs.length === 0;
  candidateOutput.disabled = !isSuno || !selectedRun?.outputs.length;
  const canImport = Boolean(batch) && (!isSuno || (selectableRunId && selectableOutputIndex !== null));
  candidateInput.disabled = !canImport;
  const picker = candidateInput.closest(".file-picker");
  if (picker) picker.dataset.disabled = String(!canImport);

  if (sourceKind === "external") {
    candidateSourceHelp.textContent = "外部音乐无需关联 Suno 运行；必须恰好一条授权记录匹配分析得到的 SHA-256，且权利链不能是“本人声明原创”。零条或多条都会逐文件拒绝且不保存。";
  } else if (sourceKind === "local-original") {
    candidateSourceHelp.textContent = "本地原创不依赖 Suno 运行；分析 SHA-256 后，必须恰好匹配一条同哈希且权利链为“本人声明原创（user-declared-original）”的授权记录。";
  } else if (!selectableRunId) {
    candidateSourceHelp.textContent = "Suno 候选必须先选择一次已登记的 Create 运行，再选择该运行中已保存的具体结果。";
  } else if (selectableOutputIndex === null) {
    candidateSourceHelp.textContent = "请先在对应 Create 运行中保存结果链接，再选择确切结果；文件尚不会开始解码。";
  } else {
    candidateSourceHelp.textContent = `将绑定 ${selectableRunId} 的结果 ${selectableOutputIndex + 1}；链接、生成条件和复盘字段会与该结果严格同步。`;
  }
}

function outputDispositionSelect(output, outputLabel) {
  const disposition = createElement("select", { className: "create-output-disposition" });
  disposition.setAttribute("aria-label", `${outputLabel} 处置`);
  for (const [value, text] of [["unrated", "未处置"], ["accepted", "接受"], ["rejected", "拒绝"]]) {
    const option = createElement("option", { text });
    option.value = value;
    option.selected = value === (output?.disposition || "unrated");
    disposition.append(option);
  }
  return disposition;
}

function collectRunOutputs(container) {
  const outputs = [];
  for (const [index, card] of [...container.querySelectorAll(".create-output-card")].entries()) {
    const generatedUrl = card.querySelector(".create-output-url").value.trim();
    const subjectiveScoreValue = card.querySelector(".create-output-score").value;
    const reviewNote = card.querySelector(".create-output-review").value.trim();
    const disposition = card.querySelector(".create-output-disposition").value;
    const hasReview = subjectiveScoreValue !== "" || reviewNote !== "" || disposition !== "unrated";
    if (!generatedUrl) {
      if (hasReview) throw new TypeError(`结果 ${index + 1} 必须先填写 HTTPS 生成链接。`);
      if (container.querySelectorAll(".create-output-card")[index + 1]?.querySelector(".create-output-url").value.trim()) {
        throw new TypeError(`请先填写结果 ${index + 1}，结果不能跳号。`);
      }
      continue;
    }
    outputs.push({
      generatedUrl,
      subjectiveScore: subjectiveScoreValue ? Number(subjectiveScoreValue) : null,
      reviewNote,
      disposition
    });
  }
  return outputs;
}

function saveRunOutputs(runId, container) {
  clearError();
  try {
    project = updateRunOutputs(project, runId, collectRunOutputs(container));
    persistProject();
    const run = project.runs.find(item => item.id === runId);
    const panelStatus = container.closest(".create-run-panel")?.querySelector(".create-run-heading span");
    if (run && panelStatus) panelStatus.textContent = `${STATUS_LABELS[run.status]} · 条件已冻结 · ${run.outputs.length}/2 个结果`;
    const runOption = [...candidateRun.options].find(option => option.value === runId);
    if (run && runOption) runOption.textContent = `${run.id} · ${STATUS_LABELS[run.status]} · ${run.outputs.length} 个结果`;
    renderCandidateSourceControls({ preferredRunId: candidateRun.value, preferredOutputIndex: candidateOutput.value });
    renderCandidateHistory();
    showLive(`运行 ${runId} 的结果链接与复盘已保存。`);
  } catch (error) {
    renderAll();
    showError(error instanceof Error ? error.message : "生成结果保存失败。");
  }
}

function createRunOutputEditor(run, index, container) {
  const output = run.outputs[index];
  const outputLabel = index === 0 ? "结果 1" : "结果 2";
  const card = createElement("div", { className: "create-output-card" });
  const title = createElement("strong", { text: outputLabel });

  const url = createElement("input", { className: "create-output-url" });
  url.type = "url";
  url.inputMode = "url";
  url.placeholder = "https://suno.com/song/…";
  url.value = output?.generatedUrl || "";
  url.setAttribute("aria-label", index === 0 ? "结果 1 生成链接" : "结果 2 生成链接");

  const score = createElement("select", { className: "create-output-score" });
  score.setAttribute("aria-label", `${outputLabel} 主观评分`);
  const unrated = createElement("option", { text: "未评分" });
  unrated.value = "";
  unrated.selected = output?.subjectiveScore == null;
  score.append(unrated);
  for (let value = 1; value <= 5; value += 1) {
    const option = createElement("option", { text: `${value} / 5` });
    option.value = String(value);
    option.selected = output?.subjectiveScore === value;
    score.append(option);
  }

  const review = createElement("textarea", { className: "create-output-review" });
  review.rows = 2;
  review.placeholder = "循环、旋律、律动或拒绝理由";
  review.value = output?.reviewNote || "";
  review.setAttribute("aria-label", `${outputLabel} 复盘备注`);
  const disposition = outputDispositionSelect(output, outputLabel);

  for (const control of [url, score, review, disposition]) {
    control.addEventListener("change", () => saveRunOutputs(run.id, container));
  }
  card.append(
    title,
    labelledField("Suno 结果链接", url),
    labelledField("评分", score),
    labelledField("复盘 / 拒绝理由", review),
    labelledField("处置", disposition)
  );
  return card;
}

function createRunPanel(run) {
  const panel = createElement("section", { className: "create-run-panel" });
  panel.dataset.runId = run.id;
  const heading = createElement("div", { className: "create-run-heading" });
  heading.append(
    createElement("strong", { text: run.id }),
    createElement("span", { text: `${STATUS_LABELS[run.status]} · 条件已冻结 · ${run.outputs.length}/2 个结果` })
  );
  const editors = createElement("div", { className: "create-output-grid" });
  editors.append(createRunOutputEditor(run, 0, editors), createRunOutputEditor(run, 1, editors));
  panel.append(heading, editors);
  return panel;
}

function registerCreateRun(batchId, batchNumber) {
  clearError();
  try {
    project = recordCreateRun(project, batchId);
    persistProject();
    candidateRun.value = "";
    renderAll();
    showLive(`已登记批次 ${batchNumber} 的本次 Create，并冻结提示词与 StyleSpec；导入前请在候选区明确选择该 run。`);
  } catch (error) {
    renderAll();
    showError(error instanceof Error ? error.message : "Create 运行登记失败。");
  }
}

function renderBatches() {
  const selectedBatchId = candidateBatch.value;
  const selectedRunId = candidateRun.value;
  const selectedOutputIndex = candidateOutput.value;
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
    const recordButton = createElement("button", { className: "batch-action record-create-run", text: "登记本次 Create" });
    recordButton.type = "button";
    recordButton.addEventListener("click", () => registerCreateRun(batch.id, index + 1));
    actions.append(copyButton, openButton, recordButton);
    card.append(head, expected, prompt, exclusion, actions);
    const runList = createElement("div", { className: "create-run-list" });
    for (const run of [...runsForBatch(batch.id)].reverse()) runList.append(createRunPanel(run));
    if (runList.childElementCount) card.append(runList);
    batchList.append(card);
  });
  renderCandidateSourceControls({
    preferredRunId: selectedRunId,
    preferredOutputIndex: selectedOutputIndex
  });
}

function changeBatchStatus(batchId, nextStatus) {
  clearError();
  if (nextStatus === "submitted") {
    renderBatches();
    showError("请使用“登记本次 Create”按钮建立已提交运行；状态下拉不会偷偷创建 run。");
    return;
  }
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

function renderComparison({ staging = false } = {}) {
  const candidate = project.candidates.find(item => item.id === selectedCandidateId) || project.candidates.at(-1);
  comparisonBody.replaceChildren();
  if (!candidate?.comparison) {
    comparisonResult.dataset.analysisState = "empty";
    comparisonCoverage.textContent = "—";
    comparisonSimilarity.textContent = "—";
    similarityClass.textContent = "等待候选";
    nextAdvice.textContent = "导入参考和候选后，这里只给出一个变量轴的下一轮建议。";
    removeCandidateButton.hidden = !candidateSession;
    if (!staging) setAudioElement(candidatePlayer, null);
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
    if (!staging) setAudioElement(candidatePlayer, candidateSession?.candidateId === candidate.id ? candidateSession.url : null);
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
  if (!staging) setAudioElement(candidatePlayer, candidateSession?.candidateId === candidate.id ? candidateSession.url : null);
}

function updateCandidateReview(candidateId, batchPatch) {
  clearError();
  try {
    const candidate = project.candidates.find(item => item.id === candidateId);
    if (!candidate) throw new TypeError(`未知候选：${candidateId}`);
    const experiment = project.experiments.find(item => item.candidateId === candidate.id);
    if (!experiment) throw new TypeError(`候选关联的实验不存在：${candidate.id}`);
    project = updateExperimentReview(project, experiment.id, batchPatch);
    selectedCandidateId = candidate.id;
    persistProject();
    renderAll();
    showLive(Object.hasOwn(experiment, "outputIndex") && experiment.outputIndex !== null
      ? "候选复盘已同步到绑定的运行结果、实验和当前批次。"
      : "候选复盘已保存到其独立实验历史。");
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

function appendCandidateMetaBadges(container, candidate, publication) {
  const badges = createElement("div", { className: "candidate-meta-badges" });
  badges.append(createElement("span", {
    className: "candidate-source-badge",
    text: `来源：${SOURCE_LABELS[candidate.candidateSource.kind] || candidate.candidateSource.kind}`
  }));
  if (candidate.candidateSource.kind === "suno") {
    badges.append(createElement("span", {
      className: "candidate-license-badge",
      text: `输出：${candidate.candidateSource.runId} / 结果 ${candidate.candidateSource.outputIndex + 1}`
    }));
  } else if (candidate.candidateSource.kind === "external" || candidate.candidateSource.kind === "local-original") {
    const license = project.licenses.find(item => item.id === candidate.candidateSource.licenseId);
    badges.append(createElement("span", {
      className: "candidate-license-badge",
      text: license
        ? `许可证：${license.licenseIdentifier} · ${license.category} · ${license.deliveryStatus} · ${license.evidenceUrl ? "证据已记录" : "证据缺失"} · 核验 ${license.evidenceCheckedAt || "未记录"} · ${license.rightsChainStatus}`
        : `许可证记录缺失：${candidate.candidateSource.licenseId}`
    }));
  }
  const status = createElement("span", {
    className: "candidate-publication-badge",
    text: `发布资料：${PUBLICATION_LABELS[publication.status] || publication.status}`
  });
  status.dataset.status = publication.status;
  badges.append(status);
  for (const blocker of publication.blockers) {
    badges.append(createElement("span", { className: "candidate-blocker-badge", text: blocker }));
  }
  for (const reason of publication.reviewReasons) {
    badges.append(createElement("span", { className: "candidate-review-reason-badge", text: reason }));
  }
  container.append(badges);
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
    const publication = deriveCandidatePublicationState(project, candidate.id);
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
    appendCandidateMetaBadges(heading, candidate, publication);

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

    const run = project.runs.find(item => item.id === experiment?.runId);
    const outputBinding = createElement("select", { className: "candidate-output-binding" });
    outputBinding.setAttribute("aria-label", `${candidate.displayName || candidate.id} 关联生成结果`);
    outputBinding.disabled = true;
    const unbound = createElement("option", {
      text: candidate.candidateSource.kind === "external" || candidate.candidateSource.kind === "local-original"
        ? "不适用：独立来源"
        : "旧候选：结果未确认"
    });
    unbound.value = "";
    unbound.selected = !Number.isInteger(experiment?.outputIndex);
    outputBinding.append(unbound);
    for (const [outputIndex, output] of (run?.outputs || []).entries()) {
      const option = createElement("option", { text: `结果 ${outputIndex + 1} · ${output.generatedUrl}` });
      option.value = String(outputIndex);
      option.selected = experiment?.outputIndex === outputIndex;
      outputBinding.append(option);
    }

    const generatedUrl = createElement("input", { className: "candidate-generated-url" });
    generatedUrl.type = "url";
    generatedUrl.inputMode = "url";
    generatedUrl.placeholder = "先明确绑定上方运行结果";
    generatedUrl.readOnly = true;
    generatedUrl.value = experiment?.generatedUrl || "";

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
    const bestLabel = labelledField("研究最佳（不代表可发布）", best);
    bestLabel.className = "candidate-best-field";

    const fields = createElement("div", { className: "candidate-review-grid" });
    fields.append(
      labelledField("导出显示名（可选）", candidateDisplayName),
      labelledField("候选 SHA-256（只读）", candidateHash),
      labelledField("明确关联结果", outputBinding),
      labelledField("已绑定生成链接（只读）", generatedUrl),
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
      clearError();
      try {
        const referenced = project.candidates.some(candidate => (
          (candidate.candidateSource.kind === "external" || candidate.candidateSource.kind === "local-original")
          && candidate.candidateSource.licenseId === entry.id
        ));
        if (referenced) throw new TypeError("该授权记录仍被候选引用，不能移除；请先保留完整来源证据。");
        project = validateProject({ ...project, licenses: project.licenses.filter(candidate => candidate.id !== entry.id) });
        persistProject();
        renderLicenses();
        showLive("已移除授权记录。");
      } catch (error) {
        renderLicenses();
        showError(error instanceof Error ? error.message : "授权记录不能移除。");
      }
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

function renderAll({ staging = false } = {}) {
  renderStyle();
  renderReferences({ staging });
  renderBatches();
  renderComparison({ staging });
  renderCandidateHistory();
  renderLicenses();
}

function stageProjectRender(stagedProject, stagedSelectedCandidateId) {
  const activeProject = project;
  const activeSelectedCandidateId = selectedCandidateId;
  project = stagedProject;
  selectedCandidateId = stagedSelectedCandidateId;
  try {
    renderAll({ staging: true });
  } finally {
    project = activeProject;
    selectedCandidateId = activeSelectedCandidateId;
    renderAll({ staging: true });
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

async function processCandidateFiles(files) {
  clearError();
  if (!files.length) return;
  const generation = ++candidateGeneration;
  if (files.length > MAX_CANDIDATE_FILES) {
    candidateProgress.textContent = `未处理：一次最多选择 ${MAX_CANDIDATE_FILES} 个候选文件。`;
    showError(`一次最多选择 ${MAX_CANDIDATE_FILES} 个候选文件；本次没有开始解码。`);
    return;
  }
  const sourceKind = candidateSourceKind.value;
  const batchId = candidateBatch.value;
  const runId = sourceKind === "suno" ? candidateRun.value : null;
  const selectedOutputIndex = sourceKind === "suno" && candidateOutput.value !== ""
    ? Number(candidateOutput.value)
    : null;
  const selectedBatch = project.batches.find(batch => batch.id === batchId);
  if (!selectedBatch) {
    showError("请先选择候选对应的提示词批次。 ");
    return;
  }
  if (!Object.hasOwn(SOURCE_LABELS, sourceKind) || sourceKind === "legacy-unknown") {
    showError("请选择 Suno 结果、外部音乐或本地原创作为新候选来源。");
    return;
  }
  const selectedRun = sourceKind === "suno" ? project.runs.find(run => run.id === runId) : null;
  const selectedOutput = selectedRun?.outputs[selectedOutputIndex];
  if (sourceKind === "suno") {
    if (!selectedRun || selectedRun.generationConditions.batchId !== batchId) {
      showError("请先在该批次登记并明确选择一次 Create 运行。");
      return;
    }
    if (!Number.isInteger(selectedOutputIndex) || !selectedOutput) {
      showError("请在解码前明确选择该运行中一个已经保存的生成结果。");
      return;
    }
  }
  const reference = aggregateReferences();
  if (!reference) {
    showError("请先导入至少一个可分析的参考音频。");
    return;
  }
  const sourceProject = project;
  const shouldStopCandidateWork = () => {
    if (generation !== candidateGeneration) return true;
    if (project === sourceProject) return false;
    renderComparison();
    candidateProgress.textContent = "项目状态已在分析期间更新；本次候选结果未覆盖较新的修改。";
    showLive("候选分析已安全取消，请按需要重新选择文件。 ");
    return true;
  };
  comparisonResult.dataset.analysisState = "working";
  similarityClass.textContent = "正在本地分析";
  const failures = [];
  const successes = [];
  let workingProject = project;
  for (const [index, file] of files.entries()) {
    if (shouldStopCandidateWork()) return;
    candidateProgress.textContent = `正在逐个解码：${index + 1} / ${files.length}（${file.name}）`;
    try {
      const result = await analyzeFile(file);
      if (shouldStopCandidateWork()) return;
      const comparison = compareCandidate(reference, result.analysis);
      const similarityClassValue = classifySimilarity(comparison);
      const advice = recommendNextVariant(comparison);
      const run = sourceKind === "suno" ? workingProject.runs.find(item => item.id === runId) : null;
      const output = run?.outputs[selectedOutputIndex];
      if (sourceKind === "suno" && (!run || run.generationConditions.batchId !== batchId || !output)) {
        throw new TypeError("所选 Create 运行或结果已失效，请重新选择。");
      }
      let matchingLicense = null;
      if (sourceKind === "external" || sourceKind === "local-original") {
        const eligibleLicenses = workingProject.licenses.filter(license => (
          license.fileSha256.toLowerCase() === result.hash.toLowerCase()
          && (sourceKind === "external"
            ? license.rightsChainStatus !== "user-declared-original"
            : license.rightsChainStatus === "user-declared-original")
        ));
        if (eligibleLicenses.length === 0) {
          throw new TypeError(sourceKind === "external"
            ? "没有恰好一条同 SHA-256 且权利链不是本人原创声明的许可证记录。"
            : "没有恰好一条同 SHA-256 且 rightsChainStatus 为 user-declared-original 的许可证记录。");
        }
        if (eligibleLicenses.length > 1) {
          throw new TypeError(`同 SHA-256 找到 ${eligibleLicenses.length} 条可匹配许可证；必须恰好一条。`);
        }
        [matchingLicense] = eligibleLicenses;
      }
      const candidateId = allocateId("candidate", workingProject.candidates || []);
      const record = {
        id: candidateId,
        batchId,
        hash: result.hash,
        analysis: result.analysis,
        referenceBasis: structuredClone(reference),
        comparison,
        similarityClass: similarityClassValue,
        advice,
        candidateSource: sourceKind === "suno"
          ? { kind: "suno", runId, outputIndex: selectedOutputIndex }
          : { kind: sourceKind, licenseId: matchingLicense.id, fileSha256: result.hash }
      };
      const experiment = {
        id: allocateId("experiment", workingProject.experiments || []),
        runId: sourceKind === "suno" ? runId : null,
        batchId,
        candidateId,
        candidateHash: result.hash,
        generatedUrl: sourceKind === "suno" ? output.generatedUrl : null,
        subjectiveScore: sourceKind === "suno" ? output.subjectiveScore : null,
        reviewNote: sourceKind === "suno" ? output.reviewNote : "",
        disposition: sourceKind === "suno" ? output.disposition : "unrated",
        referenceBasis: structuredClone(reference),
        comparison,
        advice,
        generationConditions: sourceKind === "suno" ? structuredClone(run.generationConditions) : null,
        outputIndex: sourceKind === "suno" ? selectedOutputIndex : null
      };
      const batches = sourceKind === "suno" ? workingProject.batches.map(batch => batch.id === batchId
        ? {
          ...batch,
          status: "downloaded",
          currentRunId: runId,
          generationConditions: structuredClone(run.generationConditions),
          currentCandidateId: candidateId,
          candidateHash: result.hash,
          generatedUrl: output.generatedUrl,
          subjectiveScore: output.subjectiveScore,
          reviewNote: output.reviewNote,
          disposition: output.disposition
        }
        : batch) : workingProject.batches;
      const runs = sourceKind === "suno"
        ? workingProject.runs.map(item => item.id === runId ? { ...item, status: "downloaded" } : item)
        : workingProject.runs;
      workingProject = validateProject({
        ...workingProject,
        batches,
        runs,
        candidates: [...workingProject.candidates, record],
        experiments: [...workingProject.experiments, experiment],
        nextRoundSuggestion: advice
      });
      successes.push({ candidateId, file, hash: result.hash });
    } catch (error) {
      if (shouldStopCandidateWork()) return;
      failures.push({ name: file.name, message: error instanceof Error ? error.message : "分析失败。" });
    }
  }
  if (shouldStopCandidateWork()) return;
  if (!successes.length) {
    const failureDetail = failures.map(item => ` ${item.name}：${item.message}`).join("");
    candidateProgress.textContent = `完成：0 个成功，${failures.length} 个失败。${failureDetail}`;
    renderComparison();
    showError(sourceKind === "suno"
      ? `所选候选全部分析失败；已登记的 Create 运行仍保留。${failureDetail}`
      : `所选候选全部分析失败；没有候选写入项目。${failureDetail}`);
    return;
  }
  const latest = successes.at(-1);
  let nextUrl;
  try {
    stageProjectRender(workingProject, latest.candidateId);
    nextUrl = createAudioUrl(latest.file);
  } catch (error) {
    renderAll();
    showError(error instanceof Error ? error.message : "候选结果暂存失败；原项目保持不变。");
    return;
  }
  releaseCandidateSession();
  candidateSession = { candidateId: latest.candidateId, name: latest.file.name, url: nextUrl, hash: latest.hash };
  selectedCandidateId = latest.candidateId;
  project = workingProject;
  persistProject();
  renderAll();
  const failureDetail = failures.map(item => ` ${item.name}：${item.message}`).join("");
  candidateProgress.textContent = `完成：${successes.length} 个成功，${failures.length} 个失败。${failureDetail}`;
  showLive(sourceKind === "suno"
    ? `已把 ${successes.length} 个候选绑定到 ${runId} 的结果 ${selectedOutputIndex + 1}；文件名不会写入持久状态或导出。`
    : `已把 ${successes.length} 个${SOURCE_LABELS[sourceKind]}候选与唯一同哈希授权记录绑定；文件名不会写入持久状态或导出。`);
}

function buildSearchUrl(source, query) {
  const encoded = encodeURIComponent(query.trim() || "casual puzzle game sound effect");
  if (source === "Pixabay Music") return `https://pixabay.com/music/search/${encoded}/`;
  if (source === "OpenGameArt") return `https://opengameart.org/art-search-advanced?keys=${encoded}&field_art_type_tid%5B%5D=13`;
  return `https://freesound.org/search/?q=${encoded}`;
}

function parseIncomingLicenseDocument(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`许可证 JSON 无效：${error instanceof Error ? error.message : "解析失败"}`);
  }
  if (parsed?.format === LICENSE_PACKAGE_FORMAT) {
    return { package: parseLicensePackageJson(text), sourceLabel: "loop-bgm-license-package v1" };
  }
  if (parsed?.schemaVersion === 3) {
    return { package: adaptExternalManifestV3(parsed), sourceLabel: "schemaVersion 3 外部清单" };
  }
  throw new TypeError("只接受 loop-bgm-license-package v1 或 schemaVersion 3 外部清单 JSON。");
}

function blockerCount(summary) {
  return Object.values(summary?.reasonCounts || {}).reduce((sum, count) => sum + count, 0);
}

function renderLicensePackagePlan({ plan, sourceLabel, dryRunError = null }) {
  const conflicts = [
    ...plan.conflicts,
    ...(dryRunError ? [{ reason: `完整项目 dry-run 冲突：${dryRunError}` }] : [])
  ];
  const totalBlockers = blockerCount(plan.blockingSummary);
  const canApply = plan.canCommit && conflicts.length === 0;
  licensePackagePreview.hidden = false;
  licensePackagePreview.dataset.state = canApply ? "ready" : "conflict";
  licensePackageAdditions.textContent = String(plan.additions.length);
  licensePackageSkips.textContent = String(plan.skipped.length);
  licensePackageConflicts.textContent = String(conflicts.length);
  licensePackageBlockers.textContent = String(totalBlockers);
  licensePackageDetails.replaceChildren();
  for (const entry of plan.additions) {
    licensePackageDetails.append(createElement("li", {
      text: `新增 ${entry.id} · ${entry.licenseIdentifier} · ${entry.publicationBlockers.length ? entry.publicationBlockers.join(", ") : "无记录阻断项"}`
    }));
  }
  for (const entry of plan.skipped) {
    licensePackageDetails.append(createElement("li", { text: `跳过 ${entry.id} · 同 SHA-256 与规范证据已存在` }));
  }
  for (const conflict of conflicts) {
    const identity = conflict.identity?.id || conflict.identity?.fileSha256 || "完整项目";
    const fields = conflict.differingFields?.length ? ` · 字段 ${conflict.differingFields.join(", ")}` : "";
    licensePackageDetails.append(createElement("li", { text: `冲突 ${identity} · ${conflict.reason}${fields}` }));
  }
  for (const entry of plan.blockingSummary.entries) {
    if (plan.additions.some(addition => addition.id === entry.id)) continue;
    licensePackageDetails.append(createElement("li", { text: `记录阻断 ${entry.id} · ${entry.reasons.join(", ")}` }));
  }
  licensePackageApplyButton.disabled = !canApply;
  licensePackageStatus.textContent = `${sourceLabel} 预检完成：新增 ${plan.additions.length}、跳过 ${plan.skipped.length}、冲突 ${conflicts.length}、阻断项 ${totalBlockers}。blockers 不妨碍作为研究证据导入，但不等于发布权利清白。`;
  return canApply;
}

async function preflightLicensePackage(file) {
  clearError();
  clearLicensePackagePreview();
  const generation = ++licensePackageGeneration;
  licensePackageStatus.textContent = "正在本地预检许可证 JSON；尚未修改项目。";
  if (!(file instanceof File)) {
    licensePackageStatus.textContent = "未收到有效的许可证 JSON 文件。";
    return;
  }
  if (/\.zip$/i.test(file.name) || /(?:^|\/)zip$/i.test(file.type) || file.type === "application/zip") {
    licensePackageStatus.textContent = "明确拒绝 ZIP：请把许可证 JSON 与音频文件分开选择。";
    return;
  }
  if (file.size > MAX_LICENSE_PACKAGE_BYTES) {
    licensePackageStatus.textContent = "许可证 JSON 过大：读取前已拒绝，最大允许 1 MiB（1048576 字节）。";
    return;
  }
  if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
    licensePackageStatus.textContent = "只接受独立的 JSON 许可证据文件。";
    return;
  }
  const sourceProject = project;
  try {
    const text = await file.text();
    if (generation !== licensePackageGeneration) return;
    if (project !== sourceProject) {
      licensePackageStatus.textContent = "读取期间项目已变更，本次预检已失效；请重新预检。";
      return;
    }
    const incoming = parseIncomingLicenseDocument(text);
    const plan = planLicensePackageImport(project.licenses, incoming.package);
    let dryRunError = null;
    if (plan.canCommit) {
      try {
        applyLicensePackageImport(project, plan);
      } catch (error) {
        dryRunError = error instanceof Error ? error.message : "完整项目校验失败";
      }
    }
    const projectBaseline = exportProjectJson(project);
    const canApply = renderLicensePackagePlan({ plan, sourceLabel: incoming.sourceLabel, dryRunError });
    pendingLicensePackageImport = { plan, projectBaseline, sourceLabel: incoming.sourceLabel, canApply };
  } catch (error) {
    if (generation !== licensePackageGeneration) return;
    clearLicensePackagePreview();
    licensePackageStatus.textContent = `预检失败：${error instanceof Error ? error.message : "许可证 JSON 无效"}`;
  }
}

function applyPendingLicensePackage() {
  clearError();
  const pending = pendingLicensePackageImport;
  if (!pending?.canApply || licensePackageApplyButton.disabled) {
    licensePackageStatus.textContent = "没有可应用的无冲突预检；请重新预检。";
    return;
  }
  if (exportProjectJson(project) !== pending.projectBaseline) {
    clearLicensePackagePreview({ message: "许可证包预检已失效：项目已变更，请重新预检。" });
    return;
  }
  let stagedProject;
  try {
    stagedProject = applyLicensePackageImport(project, pending.plan);
  } catch (error) {
    clearLicensePackagePreview({ message: `许可证包预检已失效：${error instanceof Error ? error.message : "项目已变更"}，请重新预检。` });
    return;
  }
  const activeProject = project;
  project = stagedProject;
  if (!persistProject({ preserveLicensePackagePreview: true })) {
    project = activeProject;
    renderLicenses();
    renderCandidateHistory();
    licensePackageStatus.textContent = "许可证包保存失败；项目与本地存储保持原样，可重试当前预检。";
    return;
  }
  candidateGeneration += 1;
  const addedCount = pending.plan.additions.length;
  const skippedCount = pending.plan.skipped.length;
  clearLicensePackagePreview();
  renderLicenses();
  renderCandidateHistory();
  licensePackageStatus.textContent = `已原子应用许可证包：新增 ${addedCount}、跳过 ${skippedCount}。现有播放器和临时音频保持不变。`;
  showLive("许可证据包已保存；在途候选分析已取消，既有播放状态保持不变。");
}

function exportCurrentLicensePackage() {
  clearError();
  try {
    const createdAt = new Date().toISOString().slice(0, 10);
    const text = exportLicensePackageJson({
      format: LICENSE_PACKAGE_FORMAT,
      version: LICENSE_PACKAGE_VERSION,
      createdAt,
      entries: project.licenses
    });
    downloadText(text, "loop-bgm-license-package.json", "application/json;charset=utf-8");
    licensePackageStatus.textContent = `已导出 ${project.licenses.length} 条规范许可证据；文件不含音频、路径、文件名或下载 transport。`;
  } catch (error) {
    licensePackageStatus.textContent = `许可证包导出失败：${error instanceof Error ? error.message : "未知错误"}`;
  }
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

candidateSourceKind.addEventListener("change", () => {
  candidateGeneration += 1;
  renderCandidateSourceControls({ preferredRunId: "", preferredOutputIndex: "" });
  candidateProgress.textContent = candidateSourceKind.value === "suno"
    ? "请选择已登记的 Create 运行及其中一个已有结果。"
    : `已选择${SOURCE_LABELS[candidateSourceKind.value]}；导入后将按 SHA-256 唯一匹配授权记录。`;
});

candidateBatch.addEventListener("change", () => {
  candidateGeneration += 1;
  renderCandidateSourceControls({ preferredRunId: "", preferredOutputIndex: "" });
  candidateProgress.textContent = candidateSourceKind.value === "suno"
    ? "请为该批次选择 Create 运行及其中一个已有结果。"
    : `已选择批次；${SOURCE_LABELS[candidateSourceKind.value]}不需要 Suno 运行。`;
});

candidateRun.addEventListener("change", () => {
  candidateGeneration += 1;
  renderCandidateSourceControls({ preferredRunId: candidateRun.value, preferredOutputIndex: "" });
  candidateProgress.textContent = candidateRun.value
    ? `已选择 ${candidateRun.value}；请再选择一个已有结果。`
    : "请先登记并选择 Create 运行。";
});

candidateOutput.addEventListener("change", () => {
  candidateGeneration += 1;
  renderCandidateSourceControls({
    preferredRunId: candidateRun.value,
    preferredOutputIndex: candidateOutput.value
  });
  candidateProgress.textContent = candidateOutput.value === ""
    ? "请选择该运行中一个已有结果。"
    : `已冻结 ${candidateRun.value} 的结果 ${Number(candidateOutput.value) + 1}；现在可选择对应文件。`;
});

candidateInput.addEventListener("change", () => {
  const files = [...candidateInput.files];
  candidateInput.value = "";
  if (files.length) processCandidateFiles(files);
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

licensePackageInput.addEventListener("change", () => {
  const [file] = licensePackageInput.files;
  licensePackageInput.value = "";
  if (file) preflightLicensePackage(file);
});

licensePackageApplyButton.addEventListener("click", applyPendingLicensePackage);
licensePackageExportButton.addEventListener("click", exportCurrentLicensePackage);

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
      licenseIdentifier: element("#license-identifier").value.trim(),
      licenseUrl: element("#license-license-url").value.trim() || null,
      evidenceUrl: element("#license-evidence-url").value.trim() || null,
      evidenceCheckedAt: element("#license-evidence-date").value || null,
      deliveryStatus: element("#license-delivery-status").value,
      rightsChainStatus: element("#license-rights-chain-status").value,
      scopeNote: element("#license-scope-note").value.trim() || null,
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

markdownExportButton.addEventListener("click", async () => {
  markdownExportButton.disabled = true;
  try {
    downloadText(await exportProjectHandoffMarkdown(project), "loop-bgm-lab-handoff.md", "text/markdown;charset=utf-8");
    showLive("已导出可完整恢复且不含音频、路径、个人文件名或秘密的 Markdown。");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Markdown 导出失败。");
  } finally {
    markdownExportButton.disabled = false;
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  importInput.value = "";
  if (!file) return;
  clearError();
  try {
    if (file.size > MAX_PROJECT_DOCUMENT_BYTES) {
      throw new TypeError("项目交接文件超过 48 MiB 限制。");
    }
    const result = await importProjectDocument(await file.text());
    const imported = result.project;
    const importedSelectedCandidateId = imported.candidates.at(-1)?.id || null;
    const activeProject = project;
    const activeSelectedCandidateId = selectedCandidateId;
    stageProjectRender(imported, importedSelectedCandidateId);
    project = imported;
    selectedCandidateId = importedSelectedCandidateId;
    if (!persistProject({ allowBlockedWrite: true })) {
      project = activeProject;
      selectedCandidateId = activeSelectedCandidateId;
      importStatus.textContent = "导入失败：本地存储不可用，当前状态未被替换。";
      return;
    }
    storageWriteBlocked = false;
    clearStorageWarning();
    referenceGeneration += 1;
    candidateGeneration += 1;
    releaseAllAudio();
    referenceFailures = [];
    rememberProjectIds(project);
    renderAll();
    importStatus.textContent = `已完整导入 ${result.format === "markdown" ? "Markdown" : "JSON"} 并替换当前项目；音频仍需在本机重新选择。`;
  } catch (error) {
    importStatus.textContent = `导入失败：${error instanceof Error ? error.message : "项目交接文件无效"}。当前状态未被替换。`;
  }
});

window.addEventListener("beforeunload", () => {
  referenceGeneration += 1;
  candidateGeneration += 1;
  licensePackageGeneration += 1;
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
