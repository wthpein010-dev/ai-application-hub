import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  assert.match(source, /from "\.\/core\/browser-policy\.mjs"/);
  assert.match(source, /\baggregateReferenceStyle\b/);
  assert.match(source, /\bassertDecodedAudioBudget\b/);
  assert.match(source, /\bnextMonotonicId\b/);
  assert.match(source, /const STORAGE_KEY = "loop-bgm-lab-v1"/);
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\((?!STORAGE_KEY)/);
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
  assert.match(app, /来源核验日期/);
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
