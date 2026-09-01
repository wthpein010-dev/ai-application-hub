import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestPath = normalize(decodeURIComponent((request.url || "/").split("?", 1)[0]).replace(/^\/+/, ""));
    let filePath = resolve(root, requestPath || "index.html");
    if (relative(root, filePath).startsWith("..")) throw new Error("Invalid path");
    if (!extname(filePath)) filePath = join(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": mime.get(extname(filePath)) || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const origin = `http://127.0.0.1:${server.address().port}`;

function rgbChannels(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `expected an RGB color, received ${value}`);
  return channels;
}

function relativeLuminance(value) {
  const [red, green, blue] = rgbChannels(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

try {
  const layouts = [
    { width: 1440, height: 1000, columns: 9 },
    { width: 1024, height: 1000, columns: 8 },
    { width: 736, height: 1000, columns: 6 },
    { width: 390, height: 844, columns: 3 },
    { width: 360, height: 1000, columns: 3 },
  ];

  for (const layout of layouts) {
    const page = await browser.newPage({ viewport: layout });
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
    await page.locator("body[data-ready='true']").waitFor();

    assert.equal(await page.title(), "随身小物交易市场");
    assert.equal(await page.locator(".item-card").count(), 11);
    assert.equal(await page.locator("body").getAttribute("data-theme"), "a");
    assert.equal(await page.locator("#value-toggle").isChecked(), false);
    assert.equal(await page.locator(".item-price:not([hidden])").count(), 0);
    assert.equal(await page.locator(".item-art img[data-centered='true']").count(), 11);

    const firstRowCount = await page.locator(".item-card").evaluateAll((cards) => {
      const top = cards[0].getBoundingClientRect().top;
      return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - top) < 2).length;
    });
    assert.equal(firstRowCount, layout.columns);

    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      imageWidth: Number.parseFloat(getComputedStyle(document.querySelector(".item-art img")).width),
      nameSize: Number.parseFloat(getComputedStyle(document.querySelector(".item-name")).fontSize),
    }));
    assert.deepEqual(geometry, { overflow: false, imageWidth: 163, nameSize: 12 });

    await page.locator(".value-toggle").click();
    assert.equal(await page.locator("#value-toggle").isChecked(), true);
    assert.equal(await page.locator(".item-price:not([hidden])").count(), 11);
    assert.equal(await page.locator("#third-stat-label").textContent(), "参考总估值");
    assert.deepEqual(errors, []);
    await page.close();
  }

  const themePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const themeErrors = [];
  themePage.on("console", (message) => { if (message.type() === "error") themeErrors.push(`console: ${message.text()}`); });
  themePage.on("pageerror", (error) => themeErrors.push(`page: ${error.message}`));
  themePage.on("requestfailed", (request) => themeErrors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
  await themePage.addInitScript(() => {
    if (sessionStorage.getItem("trinket-market-theme-test-ready")) return;
    localStorage.clear();
    sessionStorage.setItem("trinket-market-theme-test-ready", "true");
  });
  await themePage.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await themePage.locator("body[data-ready='true']").waitFor();

  const headerLayout = await themePage.evaluate(() => {
    const header = document.querySelector(".market-header").getBoundingClientRect();
    const brand = document.querySelector(".market-brand").getBoundingClientRect();
    const theme = document.querySelector(".header-theme").getBoundingClientRect();
    const navigation = document.querySelector(".market-nav").getBoundingClientRect();
    return {
      themeIsHeaderChild: document.querySelector(".header-theme")?.parentElement?.classList.contains("market-header"),
      sameTopRow: Math.abs((brand.top + brand.height / 2) - (theme.top + theme.height / 2)) < 4,
      rightInset: header.right - theme.right,
      navigationBelow: navigation.top >= Math.max(brand.bottom, theme.bottom),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert.equal(headerLayout.themeIsHeaderChild, true);
  assert.equal(headerLayout.sameTopRow, true, JSON.stringify(headerLayout));
  assert.ok(headerLayout.rightInset >= 0 && headerLayout.rightInset <= 18, `theme control right inset was ${headerLayout.rightInset}px`);
  assert.equal(headerLayout.navigationBelow, true);
  assert.equal(headerLayout.overflow, false);

  await themePage.locator("#theme-select").selectOption("d");
  await themePage.locator("body[data-theme='d']").waitFor();
  const daylight = await themePage.evaluate(() => {
    const colorProbe = document.createElement("span");
    colorProbe.style.color = "var(--accent)";
    colorProbe.style.backgroundColor = "var(--accent)";
    document.body.append(colorProbe);
    const accent = getComputedStyle(colorProbe).color;
    colorProbe.style.color = "var(--accent-ink)";
    const accentInk = getComputedStyle(colorProbe).color;
    colorProbe.remove();
    return {
      colorScheme: getComputedStyle(document.body).colorScheme,
      surface: getComputedStyle(document.querySelector(".market-stats")).backgroundColor,
      text: getComputedStyle(document.querySelector(".market-stats dd")).color,
      accent,
      accentInk,
      savedTheme: JSON.parse(localStorage.getItem("trinket-market-v1-preferences") || "null")?.theme,
    };
  });
  assert.equal(daylight.colorScheme, "light");
  assert.ok(relativeLuminance(daylight.surface) >= 0.8, `daylight surface was too dark: ${daylight.surface}`);
  assert.ok(relativeLuminance(daylight.text) <= 0.2, `daylight text was too light: ${daylight.text}`);
  assert.ok(contrastRatio(daylight.text, daylight.surface) >= 7, "daylight text contrast must remain AAA for normal text");
  assert.ok(contrastRatio(daylight.accent, daylight.surface) >= 4.5, "daylight accent text must remain readable on light surfaces");
  assert.ok(contrastRatio(daylight.accentInk, daylight.accent) >= 4.5, "daylight accent buttons must retain readable labels");
  assert.equal(daylight.savedTheme, "d");

  await themePage.reload({ waitUntil: "networkidle" });
  await themePage.locator("body[data-ready='true'][data-theme='d']").waitFor();
  assert.equal(await themePage.locator("#theme-select").inputValue(), "d");
  assert.deepEqual(themeErrors, []);
  await themePage.close();

  const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await page.locator("body[data-ready='true']").waitFor();

  assert.deepEqual(await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id))), [7, 1, 3, 8, 2, 9, 5, 4, 11, 6, 10]);
  await page.locator("#sort-mode").selectOption("id");
  assert.deepEqual(await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id))), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await page.locator("#sort-direction").click();
  assert.deepEqual(await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id))), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  await page.locator("#sort-mode").selectOption("name");
  assert.deepEqual((await page.locator(".item-card").evaluateAll((cards) => cards.map((card) => Number(card.dataset.id)))).slice(0, 4), [1, 2, 4, 11]);

  await page.evaluate(() => window.TrinketMarketAPI.setAcquisitionCounts({ 1: 30000, 2: -1, 99: 2 }));
  await page.locator("#sort-mode").selectOption("acquired");
  assert.equal(await page.locator(".item-card").first().getAttribute("data-id"), "1");
  assert.match(await page.locator('.item-card[data-id="1"] .item-count').textContent(), /30,000/);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("trinket-market:counts", { detail: { 2: 31000 } })));
  assert.equal(await page.locator(".item-card").first().getAttribute("data-id"), "2");

  await page.locator("#sort-mode").selectOption("manual");
  await page.evaluate(() => {
    window.__gridMutations = 0;
    const grid = document.querySelector("#item-grid");
    window.__gridObserver = new MutationObserver((records) => {
      window.__gridMutations += records.filter((record) => record.type === "childList")
        .reduce((sum, record) => sum + record.addedNodes.length + record.removedNodes.length, 0);
    });
    window.__gridObserver.observe(grid, { childList: true });
  });
  const cards = page.locator(".item-card");
  const draggedId = await cards.nth(0).getAttribute("data-id");
  const first = await cards.nth(0).boundingBox();
  const ninth = await cards.nth(8).boundingBox();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  const pickup = await page.evaluate(() => ({
    ghostCount: document.querySelectorAll(".drag-ghost").length,
    sourceOpacity: Number(getComputedStyle(document.querySelector(".item-card.is-dragging .item-card-content")).opacity),
  }));
  assert.equal(pickup.ghostCount, 1);
  assert.equal(pickup.sourceOpacity, 0);
  await page.mouse.move(ninth.x + ninth.width * 0.25, ninth.y + ninth.height / 2, { steps: 1 });
  await page.waitForTimeout(140);
  const during = await page.evaluate(async () => {
    const ghost = document.querySelector(".drag-ghost");
    const wiggle = ghost?.querySelector(".drag-ghost-wiggle");
    const firstTransform = wiggle ? getComputedStyle(wiggle).transform : "missing";
    await new Promise((resolve) => setTimeout(resolve, 70));
    const secondTransform = wiggle ? getComputedStyle(wiggle).transform : "missing";
    return {
      active: document.querySelector("#item-grid").classList.contains("is-drag-active"),
      ghostCount: document.querySelectorAll(".drag-ghost").length,
      sourceHidden: Number(getComputedStyle(document.querySelector(".item-card.is-dragging .item-card-content")).opacity) === 0,
      compositorTracked: getComputedStyle(ghost).willChange.split(",").map((value) => value.trim()).includes("transform"),
      wobbleMoves: firstTransform !== "missing" && firstTransform !== secondTransform,
      mutations: window.__gridMutations,
    };
  });
  const ghostBox = await page.locator(".drag-ghost").boundingBox();
  const expectedGhostLeft = ninth.x + ninth.width * 0.25 - first.width / 2;
  const expectedGhostTop = ninth.y + ninth.height / 2 - first.height / 2;
  assert.equal(during.active, true);
  assert.equal(during.ghostCount, 1);
  assert.equal(during.sourceHidden, true);
  assert.equal(during.compositorTracked, true);
  assert.equal(during.wobbleMoves, true);
  assert.ok(Math.abs(ghostBox.x - expectedGhostLeft) <= 2, `drag ghost lagged horizontally by ${ghostBox.x - expectedGhostLeft}px`);
  assert.ok(Math.abs(ghostBox.y - expectedGhostTop) <= 2, `drag ghost lagged vertically by ${ghostBox.y - expectedGhostTop}px`);
  assert.ok(during.mutations <= 2, `cross-row drag used ${during.mutations} child mutations`);
  await page.mouse.up();
  await page.waitForTimeout(20);
  const settling = await page.evaluate((id) => ({
    ghostCount: document.querySelectorAll(".drag-ghost").length,
    settling: document.querySelector(".drag-ghost")?.classList.contains("is-settling"),
    sourceHidden: Number(getComputedStyle(document.querySelector(`.item-card[data-id="${id}"] .item-card-content`)).opacity) === 0,
  }), draggedId);
  assert.equal(settling.ghostCount, 1);
  assert.equal(settling.settling, true);
  assert.equal(settling.sourceHidden, true);
  await page.waitForTimeout(175);
  const landed = await page.evaluate((id) => {
    const ghostRect = document.querySelector(".drag-ghost").getBoundingClientRect();
    const targetRect = document.querySelector(`.item-card[data-id="${id}"]`).getBoundingClientRect();
    return Math.max(Math.abs(ghostRect.left - targetRect.left), Math.abs(ghostRect.top - targetRect.top));
  }, draggedId);
  assert.ok(landed <= 2, `drag ghost stopped ${landed}px away from its destination`);
  await page.waitForTimeout(80);
  assert.equal(await page.locator(".drag-ghost").count(), 0);
  assert.equal(await page.locator(".item-card.is-dragging").count(), 0);
  assert.match(await page.locator("#drag-status").textContent(), /已移动到第/);
  assert.deepEqual(errors, []);
  await page.close();

  const pointerPage = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  await pointerPage.addInitScript(() => localStorage.clear());
  await pointerPage.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await pointerPage.locator("body[data-ready='true']").waitFor();
  await pointerPage.locator("#sort-mode").selectOption("manual");
  const competingPointer = await pointerPage.evaluate(() => {
    const cards = [...document.querySelectorAll(".item-card")];
    const firstRect = cards[0].getBoundingClientRect();
    const secondRect = cards[1].getBoundingClientRect();
    cards[0].setPointerCapture = undefined;
    cards[1].setPointerCapture = undefined;
    const dispatch = (target, type, pointerId, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: x,
      clientY: y,
      pointerId,
      pointerType: "touch",
    }));
    dispatch(cards[0], "pointerdown", 101, firstRect.left + firstRect.width / 2, firstRect.top + firstRect.height / 2);
    const before = getComputedStyle(document.querySelector(".drag-ghost")).transform;
    dispatch(cards[1], "pointerdown", 202, secondRect.left + secondRect.width / 2, secondRect.top + secondRect.height / 2);
    dispatch(window, "pointermove", 202, secondRect.right, secondRect.bottom);
    const afterCompetingMove = getComputedStyle(document.querySelector(".drag-ghost")).transform;
    dispatch(window, "pointerup", 202, secondRect.right, secondRect.bottom);
    return {
      ghostCount: document.querySelectorAll(".drag-ghost").length,
      hiddenSourceCount: document.querySelectorAll(".item-card.is-dragging").length,
      initiatingGhostStayedPut: before === afterCompetingMove,
      initiatingDragStillActive: !document.querySelector(".drag-ghost")?.classList.contains("is-settling"),
    };
  });
  assert.equal(competingPointer.ghostCount, 1);
  assert.equal(competingPointer.hiddenSourceCount, 1);
  assert.equal(competingPointer.initiatingGhostStayedPut, true);
  assert.equal(competingPointer.initiatingDragStillActive, true);
  const initiatingPointer = await pointerPage.evaluate(() => {
    const ghost = document.querySelector(".drag-ghost");
    const targetRect = document.querySelectorAll(".item-card")[8].getBoundingClientRect();
    const before = getComputedStyle(ghost).transform;
    const move = new PointerEvent("pointermove", { bubbles: true, buttons: 1, clientX: targetRect.left, clientY: targetRect.top, pointerId: 101, pointerType: "touch" });
    window.dispatchEvent(move);
    const after = getComputedStyle(ghost).transform;
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, clientX: targetRect.left, clientY: targetRect.top, pointerId: 101, pointerType: "touch" }));
    return { moved: before !== after, settling: ghost.classList.contains("is-settling") };
  });
  assert.equal(initiatingPointer.moved, true);
  assert.equal(initiatingPointer.settling, true);
  await pointerPage.waitForTimeout(260);
  assert.equal(await pointerPage.locator(".drag-ghost").count(), 0);
  assert.equal(await pointerPage.locator(".item-card.is-dragging").count(), 0);
  await pointerPage.close();

  const reducedPage = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  await reducedPage.emulateMedia({ reducedMotion: "reduce" });
  await reducedPage.addInitScript(() => localStorage.clear());
  await reducedPage.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await reducedPage.locator("body[data-ready='true']").waitFor();
  await reducedPage.locator("#sort-mode").selectOption("manual");
  const reducedCards = reducedPage.locator(".item-card");
  const reducedFirst = await reducedCards.nth(0).boundingBox();
  const reducedNinth = await reducedCards.nth(8).boundingBox();
  await reducedPage.mouse.move(reducedFirst.x + reducedFirst.width / 2, reducedFirst.y + reducedFirst.height / 2);
  await reducedPage.mouse.down();
  await reducedPage.mouse.move(reducedNinth.x + reducedNinth.width / 2, reducedNinth.y + reducedNinth.height / 2);
  await reducedPage.waitForTimeout(20);
  assert.equal(await reducedPage.locator(".drag-ghost-wiggle").evaluate((element) => getComputedStyle(element).animationName), "none");
  await reducedPage.mouse.up();
  await reducedPage.waitForTimeout(40);
  assert.equal(await reducedPage.locator(".drag-ghost").count(), 0);
  assert.equal(await reducedPage.locator(".item-card.is-dragging").count(), 0);
  await reducedPage.close();

  const editPage = await browser.newPage({ viewport: { width: 1024, height: 1000 }, acceptDownloads: true });
  const editErrors = [];
  editPage.on("console", (message) => { if (message.type() === "error") editErrors.push(`console: ${message.text()}`); });
  editPage.on("pageerror", (error) => editErrors.push(`page: ${error.message}`));
  editPage.on("requestfailed", (request) => editErrors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
  await editPage.addInitScript(() => {
    if (sessionStorage.getItem("trinket-market-test-ready")) return;
    localStorage.clear();
    sessionStorage.setItem("trinket-market-test-ready", "true");
  });
  await editPage.goto(`${origin}/projects/trinket-market/index.html`, { waitUntil: "networkidle" });
  await editPage.locator("body[data-ready='true']").waitFor();
  assert.match(await editPage.locator("#github-source").getAttribute("href"), /^https:\/\/github\.com\/wthpein010-dev\/ai-application-hub/);

  await editPage.locator("#edit-mode").click();
  assert.equal(await editPage.locator(".item-edit").count(), 11);
  await editPage.locator('.item-card[data-id="1"] .item-edit').click();
  await editPage.locator("#edit-name").fill("测试冰水壶");
  await editPage.locator("#edit-rarity").fill("限定");
  await editPage.locator("#edit-acquired").fill("20001");
  await editPage.locator("#item-form button[type='submit']").click();
  await editPage.locator("#item-dialog").waitFor({ state: "hidden" });
  assert.equal(await editPage.locator('.item-card[data-id="1"] .item-name').textContent(), "测试冰水壶");
  assert.match(await editPage.locator('.item-card[data-id="1"] .item-count').textContent(), /20,001/);

  await editPage.reload({ waitUntil: "networkidle" });
  await editPage.locator("body[data-ready='true']").waitFor();
  assert.equal(await editPage.locator('.item-card[data-id="1"] .item-name').textContent(), "测试冰水壶");

  await editPage.locator("#edit-mode").click();
  await editPage.locator('.item-card[data-id="1"] .item-edit').click();
  await editPage.locator("#edit-image").setInputFiles(join(root, "projects", "trinket-market", "assets", "items", "hand_2.png"));
  await editPage.locator("#item-form button[type='submit']").click();
  await editPage.waitForFunction(() => document.querySelector('.item-card[data-id="1"] .item-art img')?.src.startsWith("blob:"));
  await editPage.reload({ waitUntil: "networkidle" });
  await editPage.locator("body[data-ready='true']").waitFor();
  await editPage.waitForFunction(() => document.querySelector('.item-card[data-id="1"] .item-art img')?.src.startsWith("blob:"));

  const downloadPromise = editPage.waitForEvent("download");
  await editPage.locator("#export-json").click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.version, 1);
  assert.equal(exported.items.find((item) => item.id === 1).name, "测试冰水壶");
  assert.match(exported.items.find((item) => item.id === 1).imageData, /^data:image\/png;base64,/);

  const malformedImageImport = structuredClone(exported);
  malformedImageImport.items[0].name = "不应写入";
  malformedImageImport.items[0].imageData = "data:image/png;base64,YmFk";
  await editPage.locator("#import-json").setInputFiles({
    name: "malformed-image.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malformedImageImport)),
  });
  await editPage.waitForFunction(() => document.querySelector("#edit-status")?.textContent.includes("图片数据"));
  assert.equal(await editPage.locator('.item-card[data-id="1"] .item-name').textContent(), "测试冰水壶");
  assert.equal(await editPage.locator('.item-card[data-id="1"] .item-art img').evaluate((image) => image.src.startsWith("blob:")), true);

  await editPage.locator("#import-json").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, items: [exported.items[0], exported.items[0]], order: [] })),
  });
  await editPage.waitForFunction(() => document.querySelector("#edit-status")?.textContent.includes("重复"));
  assert.match(await editPage.locator("#edit-status").textContent(), /重复/);

  const importedItems = exported.items.map((item) => ({ ...item, imageData: undefined }));
  importedItems[0] = { ...importedItems[0], name: "导入冰水壶", acquired: 22222 };
  await editPage.locator("#import-json").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, items: importedItems, order: exported.order })),
  });
  await editPage.waitForFunction(() => document.querySelector('.item-card[data-id="1"] .item-name')?.textContent === "导入冰水壶");
  assert.match(await editPage.locator("#edit-status").textContent(), /已导入/);

  editPage.once("dialog", (dialog) => dialog.accept());
  await editPage.locator("#reset-data").click();
  await editPage.waitForFunction(() => document.querySelector('.item-card[data-id="1"] .item-name')?.textContent === "便携冰水壶");
  assert.match(await editPage.locator("#edit-status").textContent(), /已恢复官方数据/);

  await editPage.locator("#edit-mode").click();
  await editPage.locator('.item-card[data-id="1"] .item-edit').click();
  await editPage.locator("#edit-image").setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
  await editPage.locator("#item-form button[type='submit']").click();
  assert.match(await editPage.locator("#dialog-error").textContent(), /仅支持 PNG、JPG 和 WebP/);
  assert.equal(await editPage.locator("#item-dialog").isVisible(), true);
  await editPage.locator("#edit-image").setInputFiles({
    name: "oversize.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  });
  await editPage.locator("#item-form button[type='submit']").click();
  assert.match(await editPage.locator("#dialog-error").textContent(), /不能超过 8 MB/);
  await editPage.locator("#dialog-cancel").click();

  assert.deepEqual(editErrors, []);
  await editPage.close();
} finally {
  await browser.close();
  server.close();
}

console.log("Verified trinket market layout, sorting, count bridge, and cross-row drag.");
