import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = "projects/simuai";

async function readSources(directory = projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(await readSources(path));
    else if (/\.(?:mjs|html)$/.test(entry.name)) chunks.push(await readFile(path, "utf8"));
  }
  return chunks.join("\n");
}

test("page contains the complete experiment workflow", async () => {
  const html = await readFile(`${projectRoot}/index.html`, "utf8");
  const app = await readFile(`${projectRoot}/app.mjs`, "utf8");

  assert.match(html, /id="questionForm"/);
  assert.match(html, /id="searchResults"[^>]+aria-live="polite"/);
  assert.match(html, /id="searchResultSummary"/);
  assert.match(html, /id="searchRecommendationList"/);
  assert.match(html, /id="searchCapability"/);
  assert.match(html, /id="templateLibrary"/);
  assert.match(html, /id="categoryTabs"/);
  assert.match(html, /id="librarySummary"/);
  assert.match(html, /id="toggleCategoryExpansion"/);
  assert.match(html, /id="chartModePicker"/);
  assert.match(html, /id="experimentStage"/);
  assert.match(html, /id="parameterControls"/);
  assert.match(html, /id="metricGrid"/);
  assert.match(html, /id="explanationPanel"/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
  assert.match(app, /resolveQuestion\(question,\s*\{\s*mode:\s*"static"\s*\}\)/);
  assert.match(app, /data-recommendation-id/);
  assert.doesNotMatch(app, /12 个实验/);
});

test("page starts with an honest estimation disclosure", async () => {
  const html = await readFile(`${projectRoot}/index.html`, "utf8");
  assert.match(html, /互动估算/);
  assert.match(html, /不构成专业建议/);
  assert.match(html, /匹配实验/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.match(html, /公开版使用本地受控实验库，不会把输入发送给远程 AI/);
  assert.match(html, /class="hub-home-link"/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#apps"/);
});

test("application source does not execute generated code or inject HTML", async () => {
  const source = await readSources();
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\b/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /SIMUAI_API_KEY\s*=/);
});

test("styles contain explicit desktop, mobile and reduced-motion behavior", async () => {
  const css = await readFile(`${projectRoot}/styles.css`, "utf8");
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /focus-visible/);
});
