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

  assert.match(html, /id="questionForm"/);
  assert.match(html, /id="templateLibrary"/);
  assert.match(html, /id="experimentStage"/);
  assert.match(html, /id="parameterControls"/);
  assert.match(html, /id="metricGrid"/);
  assert.match(html, /id="explanationPanel"/);
  assert.match(html, /type="module" src="\.\/app\.mjs"/);
});

test("page starts with an honest estimation disclosure", async () => {
  const html = await readFile(`${projectRoot}/index.html`, "utf8");
  assert.match(html, /互动估算/);
  assert.match(html, /不构成专业建议/);
  assert.match(html, /生成实验/);
  assert.match(html, /rel="icon" href="data:,"/);
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
