import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("hub registers the Codex multi-thread workbench and Windows package", async () => {
  const source = await read("../app-20260706-restore-games.js");

  assert.match(source, /id:\s*"codex-thread-workbench"/);
  assert.match(source, /entry:\s*"\.\/projects\/codex-thread-workbench\/index\.html"/);
  assert.match(
    source,
    /package:\s*"https:\/\/github\.com\/wthpein010-dev\/ai-application-hub\/releases\/download\/codex-thread-workbench-v1\.0\.0\/CodexThreadWorkbench-Windows-x64\.zip"/
  );
});

test("project page presents direct multi-thread conversation controls", async () => {
  const html = await read("../projects/codex-thread-workbench/index.html");

  assert.match(html, /Codex 多会话工作台/);
  assert.match(html, /data-action="open-picker"/);
  assert.match(html, /data-action="fullscreen"/);
  assert.equal((html.match(/class="thread-card/g) || []).length, 4);
  assert.equal((html.match(/data-role="composer"/g) || []).length, 4);
  assert.match(html, /进行中/);
  assert.match(html, /已完成/);
  assert.match(html, /需要确认/);
  assert.match(html, /已停止/);
  assert.match(
    html,
    /releases\/download\/codex-thread-workbench-v1\.0\.0\/CodexThreadWorkbench-Windows-x64\.zip/
  );
});
