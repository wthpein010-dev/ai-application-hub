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
const navigationState = requestedBaseUrl ? "domcontentloaded" : "networkidle";
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

async function assertMapFitsStage(page, layoutLabel) {
  const geometry = await page.locator("#mapStage").evaluate((stage) => ({
    width: stage.clientWidth,
    height: stage.clientHeight,
    nodes: [...stage.querySelectorAll(".map-node")].map((node) => ({
      id: node.dataset.id,
      left: node.offsetLeft,
      top: node.offsetTop,
      right: node.offsetLeft + node.offsetWidth,
      bottom: node.offsetTop + node.offsetHeight,
    })),
  }));
  for (const node of geometry.nodes) {
    assert.ok(node.left >= 0 && node.top >= 0 && node.right <= geometry.width && node.bottom <= geometry.height, `${layoutLabel}:${node.id} must stay inside ${geometry.width}x${geometry.height}: ${JSON.stringify(node)}`);
  }
  for (let first = 0; first < geometry.nodes.length; first += 1) for (let second = first + 1; second < geometry.nodes.length; second += 1) {
    const a = geometry.nodes[first]; const b = geometry.nodes[second];
    const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    assert.equal(overlaps, false, `${layoutLabel}:${a.id}/${b.id} must not overlap`);
  }
}

async function assertEdgeRoutesClear(page, layoutLabel) {
  const geometry = await page.locator("#mapStage").evaluate((stage) => ({
    paths: [...stage.querySelectorAll("#connections path")].map((path) => ({
      d: path.getAttribute("d"),
      parent: path.dataset.parent,
      child: path.dataset.child,
      start: (() => { const point = path.getPointAtLength(0); return { x: point.x, y: point.y }; })(),
      length: path.getTotalLength(),
      samples: (() => { const length = path.getTotalLength(); const count = Math.max(2, Math.ceil(length / 2) + 1); return Array.from({ length: count }, (_, index) => { const point = path.getPointAtLength(length * index / (count - 1)); return { x: point.x, y: point.y }; }); })(),
    })),
    nodes: [...stage.querySelectorAll(".map-node")].map((node) => ({
      id: node.dataset.id,
      left: node.offsetLeft,
      top: node.offsetTop,
      right: node.offsetLeft + node.offsetWidth,
      bottom: node.offsetTop + node.offsetHeight,
    })),
  }));

  const siblingStarts = new Map();
  for (const path of geometry.paths) {
    assert.ok(path.parent && path.child, `${layoutLabel} paths should identify both endpoints`);
    assert.match(path.d, /\sC\s/, `${layoutLabel}:${path.parent}/${path.child} should use a curved route`);
    assert.doesNotMatch(path.d, /\sL\s/, `${layoutLabel}:${path.parent}/${path.child} must not contain a shareable straight segment`);
    const starts = siblingStarts.get(path.parent) ?? [];
    starts.push(`${path.start.x.toFixed(2)}:${path.start.y.toFixed(2)}`);
    siblingStarts.set(path.parent, starts);
    for (const node of geometry.nodes) {
      if (node.id === path.parent || node.id === path.child) continue;
      const rect = { left: node.left + 2, top: node.top + 2, right: node.right - 2, bottom: node.bottom - 2 };
      const crosses = path.samples.slice(0, -1).some((point, index) => segmentIntersectsRect(point, path.samples[index + 1], rect));
      assert.equal(crosses, false, `${layoutLabel}:${path.parent}/${path.child} must not pass through ${node.id}: ${path.d} :: ${JSON.stringify(node)}`);
    }
  }
  for (const [parent, starts] of siblingStarts) assert.equal(new Set(starts).size, starts.length, `${layoutLabel}:${parent} sibling routes should have unique ports`);
  for (let first = 0; first < geometry.paths.length; first += 1) for (let second = first + 1; second < geometry.paths.length; second += 1) {
    const a = geometry.paths[first]; const b = geometry.paths[second];
    assert.equal(pathsShareVisibleRun(a.samples, b.samples), false, `${layoutLabel}:${a.parent}/${a.child} must not overlap ${b.parent}/${b.child}: ${a.d} :: ${b.d}`);
  }
  if (layoutLabel.startsWith("时间轴")) {
    const root = geometry.nodes.find((node) => node.id === "root");
    for (const path of geometry.paths.filter((edge) => edge.parent === "root")) assert.ok(Math.abs(path.start.y - root.top) < 1 || Math.abs(path.start.y - root.bottom) < 1, `timeline root route should use a dedicated vertical port: ${JSON.stringify(path.start)}`);
  }
}

function segmentIntersectsRect(a, b, rect) {
  let start = 0; let end = 1; const dx = b.x - a.x; const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - rect.left], [dx, rect.right - a.x], [-dy, a.y - rect.top], [dy, rect.bottom - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio);
    if (start > end) return false;
  }
  return true;
}

function pathsShareVisibleRun(first, second) {
  const cellSize = 2; const grid = new Map();
  second.forEach((point, index) => { const key = `${Math.round(point.x / cellSize)}:${Math.round(point.y / cellSize)}`; grid.set(key, [...(grid.get(key) ?? []), index]); });
  let run = 0;
  for (let index = 1; index < first.length - 1; index += 1) {
    const point = first[index]; const cellX = Math.round(point.x / cellSize); const cellY = Math.round(point.y / cellSize); let parallelMatch = false;
    for (let x = cellX - 1; x <= cellX + 1 && !parallelMatch; x += 1) for (let y = cellY - 1; y <= cellY + 1 && !parallelMatch; y += 1) {
      for (const matchIndex of grid.get(`${x}:${y}`) ?? []) {
        if (matchIndex < 1 || matchIndex >= second.length - 1) continue;
        const match = second[matchIndex]; if (Math.hypot(point.x - match.x, point.y - match.y) > .2) continue;
        const firstDx = first[index + 1].x - first[index - 1].x; const firstDy = first[index + 1].y - first[index - 1].y;
        const secondDx = second[matchIndex + 1].x - second[matchIndex - 1].x; const secondDy = second[matchIndex + 1].y - second[matchIndex - 1].y;
        const cosine = Math.abs((firstDx * secondDx + firstDy * secondDy) / (Math.hypot(firstDx, firstDy) * Math.hypot(secondDx, secondDy) || 1));
        if (cosine > 0.995) { parallelMatch = true; break; }
      }
    }
    run = parallelMatch ? run + 1 : 0;
    if (run >= 8) return true;
  }
  return false;
}

async function assertReadableTypography(page, viewportName) {
  const sizes = await page.evaluate(() => Object.fromEntries(Object.entries({
    message: ".message-row p",
    input: ".composer textarea",
    quickPrompt: ".quick-prompts button",
    mapNode: ".map-node:not(.root)",
    rootNode: ".map-node.root",
  }).map(([name, selector]) => [name, Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));
  assert.ok(sizes.message >= 14, `${viewportName} message text should be at least 14px: ${sizes.message}`);
  assert.ok(sizes.input >= 14, `${viewportName} composer text should be at least 14px: ${sizes.input}`);
  assert.ok(sizes.quickPrompt >= 13, `${viewportName} quick prompts should be at least 13px: ${sizes.quickPrompt}`);
  assert.ok(sizes.mapNode >= 13, `${viewportName} map nodes should be at least 13px: ${sizes.mapNode}`);
  assert.ok(sizes.rootNode >= 16, `${viewportName} root node should be at least 16px: ${sizes.rootNode}`);
}

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const hub = await context.newPage(); observe(hub, `${viewport.name}/hub`);
    await hub.goto(`${origin}/index.html#apps`, { waitUntil: navigationState });
    await hub.evaluate(() => localStorage.setItem("ai-competition-hub-v2-apps", JSON.stringify([{
      id: "planmap", name: "PlanMap", category: "AI 策划脑图", status: "assistant", badge: "AI 策划工具",
      brief: "不用手动摆节点：描述策划目标，再通过对话持续扩写、改名、删除与重组，脑图会自动排版到可交付状态。",
      problem: "传统脑图要求用户一边思考内容、一边处理节点层级和版面，策划调整频繁时容易把精力耗在拖拽与排版上。",
      aiUse: "AI 将自然语言意图转换为结构化节点操作；用户可点选分支后继续对话，自动完成局部扩写、重命名、删减、重组与版式更新。",
      tags: ["策划脑图", "对话编辑", "自动排版", "XMind 导出"], platforms: { web: { href: "./projects/planmap/index.html", label: "演示" }, windows: "", mac: "" },
    }])));
    await hub.reload({ waitUntil: navigationState });
    const card = hub.locator('#appGrid article[data-app-id="planmap"]');
    await card.waitFor();
    assert.equal(await card.locator("h3").textContent(), "思维导图快捷工具", "legacy default card text should migrate to the new public name");
    assert.equal(await hub.locator('#engineeringGrid article[data-app-id="planmap"]').count(), 0);
    assert.equal(await hub.locator('#gameGrid article[data-app-id="planmap"]').count(), 0);
    assert.deepEqual(await card.locator(".card-actions a").allTextContents(), ["演示", "视频"]);
    assert.equal(await card.evaluate((element) => element.nextElementSibling?.dataset.appId), "simuai");
    assert.equal(await hub.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await hub.close();

    const shell = await context.newPage(); observe(shell, `${viewport.name}/shell`);
    await shell.goto(`${origin}/projects/planmap/index.html`, { waitUntil: navigationState });
    assert.equal(await shell.locator(".hub-home-link").getAttribute("href"), "../../index.html#apps");
    assert.equal(await shell.locator('a[href="../../downloads/planmap-source.zip"]').count(), 1);
    assert.equal(await shell.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await shell.locator("iframe").contentFrame().locator('[aria-label="AI 对话区"]').waitFor();
    await shell.close();

    const app = await context.newPage(); observe(app, `${viewport.name}/app`);
    await app.goto(`${origin}/projects/planmap/app/index.html`, { waitUntil: navigationState });
    await app.evaluate(() => localStorage.clear()); await app.reload({ waitUntil: navigationState });
    await assertReadableTypography(app, viewport.name);
    if (viewport.name === "desktop") {
      for (const root of [
        { id: "broken", title: "损坏数据", children: "not-an-array" },
        { id: "legacy-root", title: "不兼容根节点", children: [] },
      ]) {
        await app.evaluate((storedRoot) => localStorage.setItem("planmap.hub-demo.v2", JSON.stringify({ root: storedRoot, theme: "azure", layout: "mindmap" })), root);
        await app.reload({ waitUntil: navigationState });
        assert.equal(await app.getByLabel("脑图名称").inputValue(), "新品发布会策划", "malformed or incompatible storage should fall back to the starter map");
        assert.equal(await app.locator("#nodesLayer .map-node").count(), 13);
      }
      await app.evaluate(() => localStorage.clear()); await app.reload({ waitUntil: navigationState });
      await app.getByPlaceholder(/描述你的策划/).fill("把主题概念改成鱼骨分析");
      await app.getByLabel("发送消息").click();
      await app.locator("#nodesLayer .map-node", { hasText: "鱼骨分析" }).waitFor();
      assert.equal(await app.locator("#nodesLayer .map-node", { hasText: "鱼骨分析" }).count(), 1);
      assert.equal(await app.locator("#mapStage").getAttribute("data-layout"), "mindmap", "replacement target containing 鱼骨 must not switch layout");
      await app.getByPlaceholder(/描述你的策划/).fill("把鱼骨分析改成主题概念");
      await app.getByLabel("发送消息").click();
      await app.locator("#nodesLayer .map-node", { hasText: "主题概念" }).waitFor();
    }
    await app.evaluate(() => { window.__planmapXss = false; });
    await app.getByPlaceholder(/描述你的策划/).fill('<img src=x onerror="window.__planmapXss=true">');
    await app.getByLabel("发送消息").click();
    await app.locator("#messages .message-row.assistant").last().waitFor();
    assert.equal(await app.evaluate(() => window.__planmapXss), false, "chat text must never execute as HTML");
    await app.getByPlaceholder(/描述你的策划/).fill('把核心目标改成 <img src=x onerror="window.__planmapXss=true">');
    await app.getByLabel("发送消息").click();
    await app.locator("#messages .message-row.assistant", { hasText: /核心目标.*→|找到原文并替换|精准更新/ }).last().waitFor();
    assert.equal(await app.evaluate(() => window.__planmapXss), false, "node titles must never execute as HTML");
    assert.equal(await app.locator("#nodesLayer img").count(), 0, "node titles should stay plain text");
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /作品/ }).click();
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/描述你的策划/).fill("重新做一个校园音乐节完整策划");
    await app.getByLabel("发送消息").click();
    await app.waitForFunction(() => document.querySelector('[aria-label="脑图名称"]')?.value === "校园音乐节策划");
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /作品/ }).click();
    await app.locator("#nodesLayer .map-node", { hasText: "执行保障" }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分，补充风险预案");
    await app.getByLabel("发送消息").click();
    await app.waitForFunction(() => document.querySelectorAll("#nodesLayer .map-node").length === 22);
    await app.getByRole("button", { name: /演示模式/ }).click();
    await app.getByRole("button", { name: "清新青绿" }).click();
    await app.getByRole("button", { name: "完成" }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /作品/ }).click();
    await app.locator("#nodesLayer .map-node", { hasText: "风险预案" }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分");
    await app.getByLabel("发送消息").click();
    await app.waitForFunction(() => document.querySelectorAll("#nodesLayer .map-node").length === 25);
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /作品/ }).click();
    await app.locator("#nodesLayer .map-node", { hasText: "下一步动作" }).click();
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /对话/ }).click();
    await app.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分");
    await app.getByLabel("发送消息").click();
    await app.waitForFunction(() => document.querySelectorAll("#nodesLayer .map-node").length === 28);
    if (viewport.name === "mobile") await app.getByRole("tab", { name: /作品/ }).click();
    for (const layout of ["横向脑图", "树状图", "鱼骨图", "逻辑结构", "时间轴", "左右脑图"]) {
      await app.locator(`.structure-picker [data-layout]`, { hasText: layout }).click();
      assert.equal(await app.locator("#nodesLayer .map-node").count(), 28, `${layout} should render all five levels`);
      assert.equal(await app.locator("#connections path").count(), 27, `${layout} should connect all rendered nodes`);
      await assertEdgeRoutesClear(app, layout);
    }
    await app.getByRole("tab", { name: "大纲模式" }).click();
    assert.equal(await app.locator("#outlineList .outline-item").count(), 28);
    await app.getByRole("tab", { name: "演示模式" }).click();
    await app.locator("#presentTitle").waitFor();
    await app.getByRole("tab", { name: "脑图视图" }).click();
    await app.getByRole("button", { name: /导出/ }).click();
    for (const label of ["PNG 图片", "PDF 文档", "Markdown 大纲", "XMind 文件"]) await app.getByText(label, { exact: true }).waitFor();
    await app.getByLabel("导出脑图").getByRole("button", { name: "×" }).click();
    if (viewport.name === "desktop") {
      const fullLongTitle = "这是一条必须完整保留且不能在图片和PDF中被省略的超长策划节点标题".repeat(5);
      await app.locator("#nodesLayer .map-node", { hasText: "主题与目标" }).click();
      await app.evaluate(() => { window.__planmapCanvasText = []; const original = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function(text, ...args) { window.__planmapCanvasText.push(String(text)); return original.call(this, text, ...args); }; });
      await app.getByPlaceholder(/告诉我怎么调整/).fill(`改成 ${fullLongTitle}`); await app.getByLabel("发送消息").click();
      const renamed = app.locator("#nodesLayer .map-node", { hasText: fullLongTitle });
      await renamed.waitFor();
      await renamed.click();
      await app.getByPlaceholder(/告诉我怎么调整/).fill("把这个改成横向增长"); await app.getByLabel("发送消息").click();
      const selectedKeywordRename = app.locator("#nodesLayer .map-node", { hasText: "横向增长" });
      await selectedKeywordRename.waitFor();
      assert.equal(await app.locator("#mapStage").getAttribute("data-layout"), "mindmap", "selected-node rename must not switch to a keyword layout");
      await selectedKeywordRename.click();
      await app.getByPlaceholder(/告诉我怎么调整/).fill(`把这个改成 ${fullLongTitle}`); await app.getByLabel("发送消息").click();
      await renamed.waitFor();
      const renamedBox = await renamed.boundingBox(); assert.ok(renamedBox.height > 125, "long DOM titles should exceed the old fixed tree level gap");
      for (const layout of ["左右脑图", "横向脑图", "树状图", "鱼骨图", "逻辑结构", "时间轴"]) {
        await app.locator(`.structure-picker [data-layout]`, { hasText: layout }).click();
        await assertMapFitsStage(app, layout);
        await assertEdgeRoutesClear(app, layout);
      }
      const rootTitle = app.getByLabel("脑图名称");
      await rootTitle.fill("这是一个需要多行完整显示并保持所有连线端口准确的中长策划主题名称"); await rootTitle.press("Tab");
      for (const layout of ["左右脑图", "横向脑图", "树状图", "鱼骨图", "逻辑结构", "时间轴"]) {
        await app.locator(`.structure-picker [data-layout]`, { hasText: layout }).click();
        await assertMapFitsStage(app, `${layout}-长根标题`);
        await assertEdgeRoutesClear(app, `${layout}-长根标题`);
      }
      await rootTitle.fill("校园音乐节策划"); await rootTitle.press("Tab");
      await app.getByLabel("打开设置").click();
      await app.locator('[data-provider="openai"]').click();
      await app.locator("#modelEndpoint").fill("https://private.example/v1");
      await app.locator("#modelName").fill("private-model");
      await app.locator("#modelKey").fill("secret-key");
      await app.locator('[data-provider="ollama"]').click();
      assert.equal(await app.locator("#modelEndpoint").inputValue(), "http://localhost:11434/v1");
      assert.equal(await app.locator("#modelName").inputValue(), "qwen2.5:7b");
      assert.equal(await app.locator("#modelKey").inputValue(), "", "provider switches must clear credentials");
      assert.doesNotMatch(await app.evaluate(() => localStorage.getItem("planmap.model-settings.v1") || ""), /secret-key/, "API keys must never be persisted in localStorage");
      await app.locator(".close-settings").last().click();
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
    await video.goto(`${origin}/projects/planmap/video/index.html`, { waitUntil: navigationState });
    assert.equal(await video.locator(".hub-video-home").getAttribute("href"), "../../../index.html#apps");
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
