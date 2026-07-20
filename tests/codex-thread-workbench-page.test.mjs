import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("hub registers the Codex multi-thread workbench and Windows package", async () => {
  const source = await read("../app-20260706-restore-games.js");
  const downloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";

  assert.match(source, /id:\s*"codex-thread-workbench"/);
  assert.match(source, /entry:\s*"\.\/projects\/codex-thread-workbench\/index\.html"/);
  assert.match(source, new RegExp(`package:\\s*"${downloadPage}"`));
  assert.match(source, new RegExp(`windows:\\s*\\{ href: "${downloadPage}"`));
  assert.equal((source.match(new RegExp(downloadPage, "g")) || []).length, 2);
  assert.doesNotMatch(source, /releases\/download\/codex-thread-workbench-v1\.0\.0/);
  assert.match(source, /function isDirectPackageHref\(href\)/);
  assert.match(
    source,
    /group\.key !== "web" && isDirectPackageHref\(href\) \? " download" : ""/
  );
  assert.match(
    source,
    /const windowsDownload = isDirectPackageHref\(windows\) \? " download" : ""/
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
  assert.equal(
    (
      html.match(
        /https:\/\/wthpein010-dev\.github\.io\/ai-application-hub\/projects\/codex-thread-workbench\/download\//g
      ) || []
    ).length,
    2
  );
  assert.doesNotMatch(html, /releases\/download\/codex-thread-workbench-v1\.0\.0/);
});

test("download page exposes progress, verification, failure and retry states", async () => {
  const [html, controller] = await Promise.all([
    read("../projects/codex-thread-workbench/download/index.html"),
    read("../projects/codex-thread-workbench/download/download.js")
  ]);

  assert.match(html, /CodexThreadWorkbench-Windows-x64\.zip/);
  assert.match(html, /data-role="download-button"/);
  assert.match(html, /data-role="retry-button"/);
  assert.match(html, /data-role="progress"/);
  assert.match(html, /data-role="progress-text"/);
  assert.match(html, /data-role="status"/);
  assert.match(html, /data-role="error"/);
  assert.match(html, /SHA-256/);
  assert.match(controller, /fetch\("\.\/manifest\.json"/);
  assert.match(controller, /assembleDownload/);
  assert.match(controller, /application\/zip/);
  assert.match(controller, /URL\.revokeObjectURL/);
  assert.match(controller, /retryButton/);
});
