import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";
import { exportProjectJson } from "../projects/loop-bgm-lab/core/project-state.mjs";
import { importProjectDocument } from "../projects/loop-bgm-lab/core/portable-handoff.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = join(root, "projects", "loop-bgm-lab");
const expectedRegions = [
  "reference-analysis",
  "style-portrait",
  "daily-queue",
  "candidate-comparison",
  "license-ledger",
  "portable-handoff"
];
const expectedWavSha256 = "f6168016f3659617d48662cca4d8013eb6eac2b21f3b7e17f7d23108b4985d5f";

function readProjectFile(name) {
  return readFileSync(join(projectRoot, name), "utf8");
}

function sectionIds(html) {
  return [...html.matchAll(/<section\b([^>]*)>/g)]
    .map(([, attributes]) => attributes.match(/\bid="([^"]+)"/)?.[1])
    .filter(Boolean);
}

function contentSecurityPolicy(html) {
  const content = html.match(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1];
  assert.ok(content, "the page must declare a Content-Security-Policy meta tag");
  return content.split(";").map(directive => directive.trim()).filter(Boolean);
}

test("public page presents the approved six-step workflow in order inside the Hub app shell", () => {
  // Break caught: a region is removed/reordered or the page stops returning to the AI Apps collection.
  const html = readProjectFile("index.html");
  assert.match(html, /<title>循环乐工房<\/title>/);
  assert.match(html, /<body class="hub-subpage"/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#apps"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/subpage-shell\.css"/);
  assert.deepEqual(sectionIds(html).filter(id => expectedRegions.includes(id)), expectedRegions);
  assert.match(html, /Hub 卡片仅提供“演示 \/ 视频”入口/);
});

test("page states the local-only, dated plan, and current personal/noncommercial rights boundaries", () => {
  // Break caught: a visitor could mistake a local plan for an account balance or assume commercial rights.
  const html = readProjectFile("index.html");
  assert.match(html, /文件只留在本机/);
  assert.match(html, /2026-08-30/);
  assert.match(html, /不是实际账户余额/);
  assert.match(html, /当前免费档生成物仅限个人、非商业使用/);
  assert.match(html, /商业权利需要另行核验/);
  assert.match(html, /相似度[^<]*不是侵权判断或法律保证/);
  assert.match(html, /单文件最大 80 MB/);
  assert.match(html, /最多 8 个/);
  assert.match(html, /逐个解码/);
});

test("markup is CSP-safe, credential-free, and exposes only the approved file and external-link contracts", () => {
  // Break caught: credential capture, unsafe inline execution, or an unapproved external source is introduced.
  const html = readProjectFile("index.html");
  const source = readProjectFile("app.js");
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(`${html}\n${source}`, /<input[^>]+type=["']password|name=["'][^"']*(?:api.?key|cookie|token|session)|localStorage\.(?!getItem|setItem|removeItem)/i);
  assert.match(html, /accept="[^"]*\.mp3[^"]*\.wav[^"]*\.m4a[^"]*\.ogg[^"]*"/);
  assert.match(html, /https:\/\/suno\.com\/create/);
  assert.match(`${html}\n${source}`, /https:\/\/pixabay\.com\/music\/search/);
  assert.match(`${html}\n${source}`, /https:\/\/opengameart\.org\/art-search-advanced/);
  assert.match(`${html}\n${source}`, /https:\/\/freesound\.org\/search/);
  assert.doesNotMatch(source, /\.innerHTML\b|insertAdjacentHTML|outerHTML\s*=/);
});

test("source-aware candidate import exposes explicit accessible source, run, and output controls", () => {
  const html = readProjectFile("index.html");
  const source = readProjectFile("app.js");

  assert.match(html, /<select id="candidate-source-kind"[^>]*aria-label="候选来源类型"/);
  assert.match(html, /<option value="suno"[^>]*>Suno 结果<\/option>/);
  assert.match(html, /<option value="external"[^>]*>外部音乐<\/option>/);
  assert.match(html, /<option value="local-original"[^>]*>本地原创<\/option>/);
  assert.doesNotMatch(html, /<option value="legacy-unknown"/);
  assert.match(html, /<select id="candidate-run"[^>]*aria-label="候选关联生成运行"/);
  assert.match(html, /<select id="candidate-output"[^>]*aria-label="候选关联生成结果"/);
  assert.match(html, /<input id="candidate-file"[^>]*\bmultiple\b/);
  assert.match(html, /研究最佳[^<]*不代表可发布/);
  assert.match(source, /请选择一次已登记的 Create/);
  assert.match(source, /candidateSourceKind/);
  assert.match(source, /candidateOutput/);
  assert.match(source, /sourceKind === "suno"/);
  assert.match(source, /sourceKind === "external"/);
  assert.match(source, /sourceKind === "local-original"/);
  assert.match(source, /className: "batch-action record-create-run"/);
  assert.match(source, /className: "create-output-url"/);
  assert.match(source, /className: "create-output-score"/);
  assert.match(source, /className: "create-output-review"/);
  assert.match(source, /className: "create-output-disposition"/);
  assert.match(source, /aria-label[^\n]*结果 1/);
  assert.match(source, /aria-label[^\n]*结果 2/);
});

test("legacy candidate provenance is confirmed through one explicit fail-closed dialog", () => {
  const html = readProjectFile("index.html");
  const source = readProjectFile("app.js");
  const css = readProjectFile("styles.css");

  assert.equal((html.match(/<dialog\b[^>]*id="legacy-source-dialog"/g) || []).length, 1);
  assert.match(html, /<select id="legacy-source-kind"[^>]*>/);
  assert.match(html, /<option value=""[^>]*>请选择确认来源<\/option>/);
  assert.match(html, /<option value="suno"[^>]*>Suno 结果<\/option>/);
  assert.match(html, /<option value="external"[^>]*>外部音乐<\/option>/);
  assert.match(html, /<option value="local-original"[^>]*>本地原创<\/option>/);
  assert.doesNotMatch(html, /id="legacy-source-kind"[\s\S]*?<option value="legacy-unknown"/);
  for (const id of [
    "legacy-source-candidate-id",
    "legacy-source-batch-id",
    "legacy-source-hash",
    "legacy-source-context",
    "legacy-source-suno-fields",
    "legacy-source-run",
    "legacy-source-output",
    "legacy-source-license-fields",
    "legacy-source-license",
    "legacy-source-error",
    "legacy-source-cancel",
    "legacy-source-submit"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="legacy-source-suno-fields"[^>]*\bhidden\b[^>]*\bdisabled\b|id="legacy-source-suno-fields"[^>]*\bdisabled\b[^>]*\bhidden\b/);
  assert.match(html, /id="legacy-source-license-fields"[^>]*\bhidden\b[^>]*\bdisabled\b|id="legacy-source-license-fields"[^>]*\bdisabled\b[^>]*\bhidden\b/);
  assert.match(html, /legacyRunId[^\n]*(?:历史上下文|不代表已确认)|(?:历史上下文|不代表已确认)[^\n]*legacyRunId/);

  assert.match(source, /\bconfirmLegacyCandidateSource\b/);
  assert.match(source, /from "\.\/core\/project-state\.mjs"/);
  assert.equal((source.match(/confirmLegacyCandidateSource\s*\(/g) || []).length, 1, "UI must use the existing core confirmation boundary exactly once");
  assert.match(source, /candidate\.candidateSource\.kind === "legacy-unknown"/);
  assert.match(source, /className: "text-button legacy-source-confirm"/);
  assert.match(source, /旧记录·待确认/);
  assert.match(source, /\.generationConditions\.batchId === candidate\.batchId/);
  assert.match(source, /license\.fileSha256\.toLowerCase\(\) === candidate\.hash\.toLowerCase\(\)/);
  assert.match(source, /rightsChainStatus !== "user-declared-original"/);
  assert.match(source, /rightsChainStatus === "user-declared-original"/);
  assert.match(css, /#legacy-source-dialog/);
  assert.match(css, /\.legacy-source-identity/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*#legacy-source-dialog/);
});

test("browser coordinator imports the analysis, plan/state, and candidate-scoring boundaries", () => {
  // Break caught: the UI substitutes ad-hoc scoring or serialization instead of Tasks 1–3.
  const source = readProjectFile("app.js");
  assert.match(source, /from "\.\/core\/audio-analysis\.mjs"/);
  assert.match(source, /\banalyzePcm\b/);
  assert.match(source, /from "\.\/core\/prompt-engine\.mjs"/);
  assert.match(source, /\bcreateDailyPlan\b/);
  assert.match(source, /from "\.\/core\/project-state\.mjs"/);
  assert.match(source, /\b(?:exportProjectJson|importProjectJson|exportProjectMarkdown|transitionBatch)\b/);
  assert.match(source, /from "\.\/core\/candidate-score\.mjs"/);
  assert.match(source, /\bcompareCandidate\b/);
  assert.match(source, /\bclassifySimilarity\b/);
  assert.match(source, /\brecommendNextVariant\b/);
  assert.match(source, /from "\.\/core\/candidate-publication\.mjs"/);
  assert.match(source, /\bderiveCandidatePublicationState\b/);
  assert.match(source, /from "\.\/core\/browser-policy\.mjs"/);
  assert.match(source, /\baggregateReferenceStyle\b/);
  assert.match(source, /\bassertDecodedAudioBudget\b/);
  assert.match(source, /\bnextMonotonicId\b/);
  assert.match(source, /const STORAGE_KEY = "loop-bgm-lab-v1"/);
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\((?!STORAGE_KEY)/);
});

test("portable handoff picker accepts both complete recovery formats", () => {
  // Break caught: the UI claims restorable Markdown but still only accepts JSON or downloads the human-only summary.
  const html = readProjectFile("index.html");
  const source = readProjectFile("app.js");

  assert.match(html, /accept="[^"]*\.json[^"]*\.md[^"]*application\/json[^"]*text\/markdown[^"]*"/);
  assert.match(source, /exportProjectHandoffMarkdown/);
  assert.match(source, /importProjectDocument/);
  assert.match(html, /JSON[^<]*Markdown[^<]*完整恢复/);
});

test("new plans identify the Markdown-handoff tool version without rewriting imported versions", async () => {
  // Break caught: a newly created project advertises the pre-handoff tool version, or import rewrites an older project identity.
  const created = createDailyPlan();
  assert.equal(created.toolVersion, "loop-bgm-lab/1.2.0");

  const imported = await importProjectDocument(exportProjectJson({ ...created, toolVersion: "loop-bgm-lab/1.1.0" }));
  assert.equal(imported.project.toolVersion, "loop-bgm-lab/1.1.0");
});

test("candidate markup exposes an explicit batch association, durable history, and playback-only cleanup", () => {
  // Break caught: selecting another candidate destroys the only persisted candidate/experiment and silently marks it best.
  const html = readProjectFile("index.html");
  const app = readProjectFile("app.js");
  assert.match(html, /id="candidate-batch"/);
  assert.match(html, /id="candidate-history"/);
  assert.match(html, /id="remove-candidate"[^>]*>清除临时播放/);
  assert.match(html, /候选历史会保留/);
  assert.match(app, /candidate-hash/);
  assert.match(app, /candidate-generated-url/);
  assert.match(app, /candidate-subjective-score/);
  assert.match(app, /candidate-review-note/);
  assert.match(app, /candidate-disposition/);
  assert.match(app, /candidate-best/);
  assert.match(app, /candidate-source-badge/);
  assert.match(app, /candidate-publication-badge/);
  assert.match(app, /candidate-blocker-badge/);
  assert.match(app, /记录门禁通过（非法律清白）/);
  assert.doesNotMatch(app, /ready:\s*["']可发布["']/);
  assert.match(app, /来源核验日期/);
  const css = readProjectFile("styles.css");
  assert.match(css, /\.candidate-meta-badges/);
  assert.match(css, /\.candidate-publication-badge\[data-status="blocked"\]/);
});

test("license-package controls keep JSON evidence separate from project handoff and expose atomic preflight", () => {
  const html = readProjectFile("index.html");
  const app = readProjectFile("app.js");
  const css = readProjectFile("styles.css");

  assert.match(html, /<input id="license-package-file"[^>]*accept="\.json,application\/json"/);
  assert.doesNotMatch(html, /id="license-package-file"[^>]*\.zip|id="license-package-file"[^>]*\.md/);
  assert.match(html, /id="license-package-apply"[^>]*\bdisabled\b/);
  assert.match(html, /id="license-package-export"/);
  assert.match(html, /id="license-package-preview"/);
  assert.match(html, /id="license-package-additions"/);
  assert.match(html, /id="license-package-skips"/);
  assert.match(html, /id="license-package-conflicts"/);
  assert.match(html, /id="license-package-blockers"/);
  assert.match(html, /研究证据[^<]*不等于[^<]*发布[^<]*清白/);
  assert.match(app, /from "\.\/core\/license-package\.mjs"/);
  for (const name of [
    "adaptExternalManifestV3",
    "applyLicensePackageImport",
    "exportLicensePackageJson",
    "MAX_LICENSE_PACKAGE_BYTES",
    "parseLicensePackageJson",
    "planLicensePackageImport"
  ]) assert.match(app, new RegExp(`\\b${name}\\b`));
  assert.match(app, /file\.size\s*>\s*MAX_LICENSE_PACKAGE_BYTES/);
  assert.match(app, /\.zip\$/i);
  assert.match(css, /\.license-package-panel/);
  assert.match(css, /\.license-package-summary/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.license-package-actions/);
});

test("browser workflow exposes explicit portable display-name editors and keeps computed hashes read-only", () => {
  // Break caught: local private filenames become durable labels, or a hand-edited hash changes candidate identity.
  const app = readProjectFile("app.js");
  assert.match(app, /reference-display-name/);
  assert.match(app, /candidate-display-name/);
  assert.match(app, /导出显示名/);
  assert.match(app, /候选 SHA-256（只读）/);
  assert.match(app, /candidateHash\.readOnly\s*=\s*true/);
  assert.doesNotMatch(app, /function updateCandidateHash|updateCandidateHash\(/);
  assert.match(app, /显示名已保存/);
});

test("dated Suno free-tier notice includes attribution, official terms, and a provenance-ledger option", () => {
  // Break caught: free-tier copy omits the attribution condition or offers no explicit Suno provenance record path.
  const html = readProjectFile("index.html");
  assert.match(html, /规则核验于\s*<time datetime="2026-08-30">2026-08-30<\/time>/);
  assert.match(html, /免费(?:档|\/Basic)[^<]*(?:注明|署名)[^<]*Suno/);
  assert.match(html, /href="https:\/\/suno\.com\/terms"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /不构成法律清场|不提供法律清场|不代表法律清场/);
  assert.match(html, /<option>Suno<\/option>/);
  assert.match(html, /Suno[^<]*(?:来源|provenance)[^<]*授权台账/);
});

test("official API readiness is rendered from the fail-closed policy without transport or persistence hooks", () => {
  // Break caught: the disabled gate is moved, hard-coded, made interactive, hidden on mobile, or coupled to remote transport/state.
  const html = readProjectFile("index.html");
  const source = readProjectFile("app.js");
  const css = readProjectFile("styles.css");
  const dailyQueueStart = html.indexOf('<section id="daily-queue"');
  const nextSectionStart = html.indexOf('<section id="candidate-comparison"', dailyQueueStart);
  const dailyQueue = html.slice(dailyQueueStart, nextSectionStart);
  const summaryIndex = dailyQueue.indexOf('class="queue-summary"');
  const readinessIndex = dailyQueue.indexOf('id="suno-api-readiness"');
  const batchListIndex = dailyQueue.indexOf('id="batch-list"');

  assert.ok(dailyQueueStart >= 0 && nextSectionStart > dailyQueueStart, "daily queue section must remain present");
  for (const id of ["suno-api-readiness", "suno-api-status", "suno-api-checklist", "suno-api-action", "suno-platform-link"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `expected one #${id}`);
  }
  assert.ok(summaryIndex >= 0 && readinessIndex > summaryIndex, "readiness card must follow the queue summary");
  assert.ok(batchListIndex > readinessIndex, "readiness card must precede the batch list");
  assert.equal(sectionIds(html).length, 6, "the readiness card must not become a seventh workflow section");
  assert.match(html, /id="suno-platform-link"[^>]*href="https:\/\/platform\.suno\.com\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /<time datetime="2026-09-01">2026-09-01<\/time>/);
  assert.match(html, /<time datetime="2026-09-03">2026-09-03<\/time>/);
  assert.match(html, /href="https:\/\/help\.suno\.com\/en\/articles\/13614785"/);
  assert.match(html, /这不是 API 下载契约/);
  assert.match(html, /id="suno-api-action"[^>]*\bdisabled\b[^>]*>官方 API 尚不可用<\/button>/);

  assert.match(source, /from "\.\/core\/suno-official-adapter\.mjs"/);
  assert.match(source, /\bCURRENT_OFFICIAL_API_EVIDENCE\b/);
  assert.match(source, /evaluateOfficialApiReadiness\(CURRENT_OFFICIAL_API_EVIDENCE\)/);
  assert.match(source, /\.blockers\.map\(|for \(const blocker of .*\.blockers\)/);
  assert.doesNotMatch(source, /0\/6 项已证实，官方 API 自动生成未启用/);
  assert.doesNotMatch(source, /suno-api-action|sunoApiAction/);

  const connectionDirectives = contentSecurityPolicy(html).filter(directive => directive.startsWith("connect-src"));
  assert.deepEqual(connectionDirectives, ["connect-src 'self'"]);
  const fetchCalls = [...source.matchAll(/\bfetch\s*\(([^)]*)\)/g)].map(match => match[1].trim());
  assert.deepEqual(fetchCalls, ['"./assets/demo-reference.wav"']);
  assert.doesNotMatch(source, /\b(?:XMLHttpRequest|WebSocket|EventSource)\b/);
  assert.doesNotMatch(`${html}\n${source}`, /<input[^>]*(?:type=["']password["']|(?:id|name)=["'][^"']*(?:api.?key|password|credential)[^"']*["'])/i);
  assert.doesNotMatch(source, /\.type\s*=\s*["']password["']|createElement\(["']input["'][\s\S]{0,160}(?:api.?key|password|credential)/i);

  assert.match(css, /\.api-readiness-card\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /#suno-api-action:disabled\s*\{[^}]*(?:opacity|background|border)[^}]*cursor:\s*not-allowed/);
  assert.match(css, /#suno-platform-link\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /#suno-platform-link:focus-visible/);
  const mobileReadiness = css.match(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(mobileReadiness, /\.api-readiness-card\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(mobileReadiness, /display:\s*none/);
});

test("project import stages a complete render before committing state or releasing audio", () => {
  // Break caught: a render-time failure can replace the active project, persisted JSON, or playback URLs.
  const source = readProjectFile("app.js");
  const importHandler = source.slice(source.indexOf('importInput.addEventListener("change"'));
  const stagedRender = importHandler.indexOf("stageProjectRender(imported, importedSelectedCandidateId)");
  const projectCommit = importHandler.indexOf("project = imported", stagedRender + 1);
  const releaseAudio = importHandler.indexOf("releaseAllAudio()", projectCommit + 1);
  const persistence = importHandler.indexOf("persistProject()", projectCommit + 1);

  assert.ok(stagedRender >= 0, "the validated import must be staged through a render probe");
  assert.ok(projectCommit > stagedRender, "the active project must remain unchanged during the render probe");
  assert.ok(releaseAudio > projectCommit, "old playback URLs may be released only after the staged project commits");
  assert.ok(persistence > projectCommit, "localStorage may be updated only after the staged project commits");
});

test("responsive styles protect keyboard focus, reduced motion, and narrow viewport flow", () => {
  // Break caught: keyboard users lose focus visibility or narrow pages regain horizontal overflow.
  const css = readProjectFile("styles.css");
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.file-picker:focus-within/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("deterministic builder reproduces the checked-in 10-second mono 44.1 kHz PCM demo WAV", () => {
  // Break caught: demo bytes drift, cease to be PCM, or are replaced with non-synthetic/user audio.
  const script = join(root, "scripts", "build-loop-bgm-demo-wav.mjs");
  const checkedIn = readFileSync(join(projectRoot, "assets", "demo-reference.wav"));
  const temporary = mkdtempSync(join(tmpdir(), "loop-bgm-demo-"));
  const generatedPath = join(temporary, "demo-reference.wav");
  try {
    const result = spawnSync(process.execPath, [script, "--output", generatedPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const generated = readFileSync(generatedPath);
    assert.deepEqual(generated, checkedIn);
    assert.equal(generated.toString("ascii", 0, 4), "RIFF");
    assert.equal(generated.toString("ascii", 8, 12), "WAVE");
    assert.equal(generated.readUInt16LE(20), 1);
    assert.equal(generated.readUInt16LE(22), 1);
    assert.equal(generated.readUInt32LE(24), 44_100);
    assert.equal(generated.readUInt16LE(34), 16);
    assert.equal(generated.readUInt32LE(40) / (44_100 * 2), 10);
    assert.equal(createHash("sha256").update(generated).digest("hex"), expectedWavSha256);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
