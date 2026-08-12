import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { chromium } from "playwright";

import { createSimuAiServer } from "../projects/simuai/server.mjs";

const server = createSimuAiServer({ apiKey: "" });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = browserCandidates.find(candidate => existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });

const failures = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", message => {
      if (message.type() === "error") errors.push(`console: ${message.text()} @ ${message.location().url || "unknown"}`);
    });
    page.on("pageerror", error => errors.push(`page: ${error.message}`));
    page.on("requestfailed", request => errors.push(`request: ${request.url()} ${request.failure()?.errorText}`));

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "小游戏买量回本", exact: true }).waitFor();

    const paybackMetric = page.locator("[data-metric-id='paybackDay'] strong");
    const before = await paybackMetric.textContent();
    await page.getByLabel("每日买量成本精确值").fill("8000");
    await page.getByLabel("每日买量成本精确值").press("Enter");
    await page.waitForTimeout(60);
    const after = await paybackMetric.textContent();
    assert.notEqual(after, before, `${viewport.name}: payback metric should change`);
    const spendInput = page.getByLabel("每日买量成本精确值");
    await spendInput.fill("999999");
    await spendInput.press("Enter");
    assert.equal(await spendInput.inputValue(), "50000", `${viewport.name}: numeric input should display its clamped value`);

    await page.getByRole("button", { name: "为什么这样算" }).click();
    await page.getByRole("heading", { name: "公式与边界" }).waitFor();
    assert.match(await page.locator("#disclaimerText").textContent(), /不构成专业建议/);

    for (const title of ["咖啡因还剩多少？", "定期存钱与复利"]) {
      await page.getByRole("button", { name: `打开${title}实验` }).first().click();
      await page.getByRole("heading", { name: title, exact: true }).waitFor();
    }

    const compileRequests = [];
    page.on("request", request => {
      if (request.url().endsWith("/api/compile")) compileRequests.push(request.url());
    });
    await page.getByLabel("想模拟什么？").fill("量子香蕉天气会如何改变库存");
    await page.getByRole("button", { name: "生成实验" }).click();
    await page.waitForTimeout(650);
    assert.equal(compileRequests.length, 1, `${viewport.name}: unmatched question should compile once`);
    assert.match(await page.locator("#compileStatus").textContent(), /当前使用离线实验库/);

    const networkCount = compileRequests.length;
    await page.locator("#parameterControls input[type='range']").first().evaluate(input => {
      input.value = String(Number(input.min) + Number(input.step));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(50);
    assert.equal(compileRequests.length, networkCount, `${viewport.name}: sliders must stay local`);

    const overflow = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      offenders: [...document.querySelectorAll("body *")]
        .map(element => ({
          tag: element.tagName,
          id: element.id,
          className: typeof element.className === "string" ? element.className : "",
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          width: Math.round(element.getBoundingClientRect().width),
        }))
        .filter(box => box.right > window.innerWidth + 1 || box.left < -1)
        .slice(0, 12),
    }));
    assert.equal(
      overflow.pageWidth <= overflow.viewportWidth,
      true,
      `${viewport.name}: page should not overflow horizontally\n${JSON.stringify(overflow)}`,
    );
    assert.deepEqual(errors, [], `${viewport.name}: browser errors\n${errors.join("\n")}`);
    await page.close();
    process.stdout.write(`PASS ${viewport.name} ${viewport.width}x${viewport.height}\n`);
  }
} catch (error) {
  failures.push(error);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

if (failures.length) throw failures[0];
