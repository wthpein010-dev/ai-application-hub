import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const regexEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("hub registers the Workbench demo, video, Windows, and Mac actions", async () => {
  const source = await read("../app-20260706-restore-games.js");
  const downloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";
  const videoPage = "./projects/codex-thread-workbench/video/index.html";

  assert.match(source, /id:\s*"codex-thread-workbench"/);
  assert.match(source, /entry:\s*"\.\/projects\/codex-thread-workbench\/index\.html"/);
  assert.match(source, new RegExp(`video:\\s*"${regexEscape(videoPage)}"`));
  assert.match(source, new RegExp(`package:\\s*"${regexEscape(downloadPage)}"`));
  assert.match(source, new RegExp(`windows:\\s*\\{ href: "${regexEscape(downloadPage)}"`));
  assert.match(source, new RegExp(`mac:\\s*\\{ href: "${regexEscape(macDownloadPage)}"`));
  assert.equal(
    (source.match(new RegExp(`${regexEscape(downloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal(
    (source.match(new RegExp(`${regexEscape(macDownloadPage)}"`, "g")) || []).length,
    1,
  );
  assert.match(source, /tags:\s*\[[^\]]*"macOS"/);
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
  const windowsDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/";
  const macDownloadPage =
    "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/";

  assert.match(html, /Codex 多会话工作台/);
  assert.match(html, /Windows · macOS/);
  assert.match(html, /data-action="open-picker"/);
  assert.match(html, /data-action="fullscreen"/);
  assert.equal((html.match(/class="thread-card/g) || []).length, 4);
  assert.equal((html.match(/data-role="composer"/g) || []).length, 4);
  assert.match(html, /进行中/);
  assert.match(html, /已完成/);
  assert.match(html, /需要确认/);
  assert.match(html, /已停止/);
  assert.equal(
    (html.match(new RegExp(`${regexEscape(windowsDownloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal(
    (html.match(new RegExp(`${regexEscape(macDownloadPage)}"`, "g")) || []).length,
    2,
  );
  assert.equal((html.match(/href="\.\/video\/index\.html"/g) || []).length, 1);
  assert.match(html, />观看视频</);
  assert.match(html, />\s*Windows 下载\s*</);
  assert.match(html, />\s*Mac 下载\s*</);
  assert.doesNotMatch(html, /releases\/download\/codex-thread-workbench-v1\.0\.0/);
});

test("project preview uses green user bubbles and non-interactive message text", async () => {
  const css = await read("../projects/codex-thread-workbench/styles.css");

  assert.match(
    css,
    /\.message-list\s*\{[^}]*user-select:\s*none/s,
  );
  assert.match(
    css,
    /\.message-user\s*>\s*p\s*\{[^}]*background:\s*#e7f4eb/s,
  );
  assert.doesNotMatch(css, /\.message(?:-[\w-]+)?(?::hover|\s*:hover)/);
});

test("project and download pages identify the Windows 1.2.0 update", async () => {
  const [projectHtml, downloadHtml] = await Promise.all([
    read("../projects/codex-thread-workbench/index.html"),
    read("../projects/codex-thread-workbench/download/index.html"),
  ]);

  assert.match(projectHtml, /Windows v1\.2\.0/);
  assert.match(downloadHtml, /5 个分片/);
  assert.match(downloadHtml, /40\.2 MB/);
  assert.match(
    downloadHtml,
    /64ECD8D394FBF472950D80F9595EF6D91D8BD3F04FC81F025A2B9C82020A54E9/,
  );
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
