import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactRoot = join(root, "tests", "artifacts", "planmap");
mkdirSync(artifactRoot, { recursive: true });
const requestedBaseUrl = process.env.HUB_BASE_URL?.replace(/\/+$/, "");

const types = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".jpg", "image/jpeg"],
  [".mp4", "video/mp4"], [".vtt", "text/vtt; charset=utf-8"], [".zip", "application/zip"],
]);

const server = requestedBaseUrl ? null : createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const target = resolve(root, "." + normalize(pathname));
  if (!target.startsWith(root + sep) && target !== root) { response.writeHead(403).end(); return; }
  const path = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
  if (!existsSync(path) || statSync(path).isDirectory()) { response.writeHead(404).end(); return; }
  const stats = statSync(path);
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  const headers = { "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Content-Type": types.get(extname(path)) || "application/octet-stream" };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stats.size - 1) : stats.size - 1;
    response.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stats.size}` });
    createReadStream(path, { start, end }).pipe(response); return;
  }
  response.writeHead(200, { ...headers, "Content-Length": stats.size }); createReadStream(path).pipe(response);
});
const chromiumRestrictedPorts = new Set([1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,515,526,530,531,532,540,548,554,556,563,587,601,636,989,990,993,995,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
if (server) {
  do {
    await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
    if (chromiumRestrictedPorts.has(server.address().port)) await new Promise((resolveServer) => server.close(resolveServer));
  } while (!server.listening);
}
const origin = requestedBaseUrl || `http://127.0.0.1:${server.address().port}`;
const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", chromium.executablePath()].find((path) => path && existsSync(path));
assert.ok(browserPath, "A Chromium browser is required");
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const failures = [];
const downloadRoot = mkdtempSync(join(tmpdir(), "planmap-exports-"));
function executableOnPath(name) {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], { encoding: "utf8" });
  const found = result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean) : null;
  if (!found || !/\.cmd$/i.test(found)) return found;
  const wrapper = readFileSync(found,"utf8"); const relative = wrapper.match(/(?:call\s+)?"%SCRIPT_DIR%([^"\r\n]+\.cmd)"/i)?.[1];
  if (!relative) return found;
  const inner = resolve(dirname(found),relative); const innerText = readFileSync(inner,"utf8"); const executable = innerText.match(/"%~dp0([^"\r\n]+\.exe)"/i)?.[1];
  return executable ? resolve(dirname(inner),executable) : found;
}

async function downloadExport(page, format, label) {
  await page.getByRole("button", { name: /导出/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByText(label, { exact: true }).click(),
  ]);
  const path = join(downloadRoot, `planmap.${format}`);
  await download.saveAs(path);
  assert.equal((await download.failure()), null, `${label} download should succeed`);
  return path;
}

function observe(page, label) {
  page.on("console", (message) => { if (message.type() === "error") failures.push(`${label} console: ${message.text()}`); });
  page.on("pageerror", (error) => failures.push(`${label} page: ${error.message}`));
  page.on("requestfailed", (request) => { if (!request.failure()?.errorText.includes("ERR_ABORTED")) failures.push(`${label} request: ${request.failure()?.errorText} ${request.url()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`${label} HTTP ${response.status()}: ${response.url()}`); });
}

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const hub = await context.newPage(); observe(hub, `${viewport.name}/hub`);
    await hub.goto(`${origin}/index.html#engineering`, { waitUntil: "networkidle" });
    const card = hub.locator('#engineeringGrid article[data-app-id="planmap"]');
    await card.waitFor();
    assert.equal(await hub.locator('#appGrid article[data-app-id="planmap"]').count(), 0);
    assert.equal(await hub.locator('#gameGrid article[data-app-id="planmap"]').count(), 0);
    assert.deepEqual(await card.locator(".card-actions a").allTextContents(), ["演示", "视频"]);
    assert.equal(await card.evaluate((element) => element === element.parentElement.lastElementChild), true);
    assert.equal(await hub.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await hub.close();

    const shell = await context.newPage(); observe(shell, `${viewport.name}/shell`);
    await shell.goto(`${origin}/projects/planmap/index.html`, { waitUntil: "networkidle" });
    assert.equal(await shell.locator(".hub-home-link").getAttribute("href"), "../../index.html#engineering");
    assert.equal(await shell.locator('a[href="../../downloads/planmap-source.zip"]').count(), 1);
    assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await shell.locator("iframe").contentFrame().locator('[aria-label="AI 对话区"]').waitFor();
    await shell.close();

    const app = await context.newPage(); observe(app, `${viewport.name}/app`);
    await app.goto(`${origin}/projects/planmap/app/index.html`, { waitUntil: "networkidle" });
    await app.evaluate(() => localStorage.clear()); await app.reload({ waitUntil: "networkidle" });
    if (viewport.name === "desktop") {
      for (const root of [
        { id: "broken", title: "损坏数据", children: "not-an-array" },
        { id: "legacy-root", title: "不兼容根节点", children: [] },
      ]) {
        await app.evaluate((storedRoot) => localStorage.setItem("planmap.hub-demo.v1", JSON.stringify({ root: storedRoot, theme: "azure", layout: "mindmap" })), root);
        await app.reload({ waitUntil: "networkidle" });
        assert.equal(await app.getByLabel("脑图名称").inputValue(), "新品发布会策划", "malformed or incompatible storage should fall back to the starter map");
        assert.equal(await app.locator("#nodesLayer .map-node").count(), 13);
      }
      await app.evaluate(() => localStorage.clear()); await app.reload({ waitUntil: "networkidle" });
    }
    await app.evaluate(() => { window.__planmapXss = false; });
    await app.getByPlaceholder("描述你的策划，或告诉我怎么调整…").fill('<img src=x onerror="window.__planmapXss=true">');
    await app.getByLabel("发送消息").click();
    await app.getByText("我理解了。你可以点选一个节点，再说“展开这部分”“改成…”或“删除这个节点”，也可以让我重新生成完整策划。").waitFor();
    assert.equal(await app.evaluate(() => window.__planmapXss), false, "chat text must never execute as HTML");
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /脑图/ }).click();
    await app.getByText("目标与主题", { exact: true }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill('改成 <img src=x onerror="window.__planmapXss=true">');
    await app.getByLabel("发送消息").click();
    await app.getByText(/已把选中节点改为/).waitFor();
    assert.equal(await app.evaluate(() => window.__planmapXss), false, "node titles must never execute as HTML");
    assert.equal(await app.locator("#nodesLayer img").count(), 0, "node titles should stay plain text");
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /脑图/ }).click();
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder("描述你的策划，或告诉我怎么调整…").fill("重新做一个校园音乐节完整策划");
    await app.getByLabel("发送消息").click();
    await app.waitForFunction(() => document.querySelector('[aria-label="脑图名称"]')?.value === "校园音乐节策划");
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /脑图/ }).click();
    await app.getByText("执行保障", { exact: true }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分，补充风险预案");
    await app.getByLabel("发送消息").click();
    await app.getByText("已在“执行保障”下补充三项风险预案。").waitFor();
    await app.getByRole("button", { name: /演示模式/ }).click();
    await app.getByRole("button", { name: "清新青绿" }).click();
    await app.getByRole("button", { name: "向右展开" }).click();
    await app.getByRole("button", { name: "完成" }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /脑图/ }).click();
    await app.getByText("风险预案", { exact: true }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分");
    await app.getByLabel("发送消息").click();
    await app.getByText("已把“风险预案”展开为三项可执行动作，并保持自动排版。").waitFor();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /脑图/ }).click();
    await app.getByText("下一步动作", { exact: true }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分");
    await app.getByLabel("发送消息").click();
    await app.getByText("已把“下一步动作”展开为三项可执行动作，并保持自动排版。").waitFor();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /脑图/ }).click();
    for (const layout of ["向右展开", "组织结构", "左右脑图"]) {
      await app.getByRole("button", { name: /演示模式/ }).click();
      await app.getByRole("button", { name: layout }).click();
      await app.getByRole("button", { name: "完成" }).click();
      assert.equal(await app.locator("#nodesLayer .map-node").count(), 28, `${layout} should render all five levels`);
      assert.equal(await app.locator("#connections path").count(), 27, `${layout} should connect all rendered nodes`);
    }
    await app.getByRole("button", { name: /导出/ }).click();
    for (const label of ["PNG 图片", "PDF 文档", "Markdown 大纲", "XMind 文件"]) await app.getByText(label, { exact: true }).waitFor();
    await app.getByLabel("导出脑图").getByRole("button", { name: "×" }).click();
    if (viewport.name === "desktop") {
      const fullLongTitle = "这是一条必须完整保留且不能在图片和PDF中被省略的超长策划节点标题".repeat(5);
      await app.getByText("主题与目标", { exact: true }).click();
      await app.evaluate(() => { window.__planmapCanvasText = []; const original = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function(text, ...args) { window.__planmapCanvasText.push(String(text)); return original.call(this, text, ...args); }; });
      await app.getByPlaceholder(/告诉我怎么调整/).fill(`改成 ${fullLongTitle}`); await app.getByLabel("发送消息").click();
      await app.getByText(`已把选中节点改为“${fullLongTitle}”。`).waitFor();
      const renamed = app.getByText(fullLongTitle, { exact: true });
      const renamedBox = await renamed.boundingBox(); assert.ok(renamedBox.height > 125, "long DOM titles should exceed the old fixed tree level gap");
      for (const layout of ["左右脑图", "向右展开", "组织结构"]) {
        await app.getByRole("button", { name: /演示模式/ }).click(); await app.getByRole("button", { name: layout }).click(); await app.getByRole("button", { name: "完成" }).click();
        const boxes = await app.locator("#nodesLayer .map-node").evaluateAll((nodes) => nodes.map((node) => { const box = node.getBoundingClientRect(); return { id: node.dataset.id, left: box.left, right: box.right, top: box.top, bottom: box.bottom }; }));
        for (let first = 0; first < boxes.length; first++) for (let second = first + 1; second < boxes.length; second++) {
          const overlaps = boxes[first].left < boxes[second].right && boxes[first].right > boxes[second].left && boxes[first].top < boxes[second].bottom && boxes[first].bottom > boxes[second].top;
          assert.equal(overlaps, false, `${layout} nodes ${boxes[first].id}/${boxes[second].id} must not overlap: ${JSON.stringify([boxes[first],boxes[second]])}`);
        }
      }
      const pngPath = await downloadExport(app, "png", "PNG 图片");
      assert.deepEqual([...readFileSync(pngPath).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(await app.evaluate((title) => window.__planmapCanvasText.join("").includes(title), fullLongTitle), true, "PNG should render every character of the long title");
      const pdfPath = await downloadExport(app, "pdf", "PDF 文档");
      const pdfBytes = readFileSync(pdfPath); const pdfText = pdfBytes.toString("latin1");
      assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
      assert.match(pdfText, /\/Type \/Page\b/); assert.ok(pdfText.endsWith("%%EOF\n"));
      const xrefOffset = Number(pdfText.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
      assert.equal(pdfText.slice(xrefOffset, xrefOffset + 4), "xref");
      const renderPrefix = join(downloadRoot, "planmap-pdf");
      const pdftoppm = process.env.PDFTOPPM_PATH || executableOnPath("pdftoppm"); assert.ok(pdftoppm, "pdftoppm is required to validate the PDF export");
      const renderedPdf = spawnSync(pdftoppm, ["-f", "1", "-singlefile", "-png", pdfPath, renderPrefix], { encoding: "utf8" });
      assert.equal(renderedPdf.status, 0, renderedPdf.stderr); assert.ok(statSync(`${renderPrefix}.png`).size > 10_000, "Poppler should render a non-empty PDF page");
      assert.equal(await app.evaluate((title) => { const text = window.__planmapCanvasText.join(""); return text.indexOf(title) !== text.lastIndexOf(title); }, fullLongTitle), true, "PDF should render every character of the long title");
      const markdownPath = await downloadExport(app, "md", "Markdown 大纲");
      assert.match(readFileSync(markdownPath, "utf8"), /^# 校园音乐节策划$/m); assert.match(readFileSync(markdownPath, "utf8"), new RegExp(fullLongTitle));
      const xmindPath = await downloadExport(app, "xmind", "XMind 文件");
      assert.deepEqual([...readFileSync(xmindPath).subarray(0, 4)], [80, 75, 3, 4]);
      const listing = spawnSync("tar", ["-tf", xmindPath], { encoding: "utf8" });
      assert.equal(listing.status, 0, listing.stderr);
      for (const name of ["content.json", "metadata.json", "manifest.json"]) assert.match(listing.stdout, new RegExp(`(^|\\r?\\n)${name}(\\r?\\n|$)`));
      const content = spawnSync("tar", ["-xOf", xmindPath, "content.json"], { encoding: "utf8" });
      assert.equal(content.status, 0, content.stderr);
      assert.equal(JSON.parse(content.stdout)[0].rootTopic.title, "校园音乐节策划"); assert.match(content.stdout, new RegExp(fullLongTitle));
    }
    await app.locator("#messages .message-row").evaluateAll((rows) => rows.filter((row) => row.textContent.includes("<img")).forEach((row) => row.remove()));
    await app.screenshot({ path: join(artifactRoot, `${viewport.name}.png`), fullPage: false });
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await app.close();
    await context.close();
  }

  for (const viewport of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const video = await context.newPage(); observe(video, `${viewport.name}/video`);
    await video.goto(`${origin}/projects/planmap/video/index.html`, { waitUntil: "networkidle" });
    assert.equal(await video.locator(".hub-video-home").getAttribute("href"), "../../../index.html#engineering");
    await video.locator("#loadVideo").click();
    await video.waitForFunction(() => document.querySelector("#introVideo").currentTime > 0, null, { timeout: 20_000 });
    assert.equal(await video.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log("Verified PlanMap Hub placement, demo interactions and video playback at desktop and mobile sizes.");
} finally {
  await browser.close();
  if (server) await new Promise((resolveServer) => server.close(resolveServer));
  rmSync(downloadRoot, { recursive: true, force: true });
}
