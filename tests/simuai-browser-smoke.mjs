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
    { name: "compact-desktop", width: 1200, height: 800 },
    { name: "small-desktop", width: 1024, height: 768 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "above-mobile-breakpoint", width: 721, height: 900 },
    { name: "mobile", width: 390, height: 844 },
    { name: "narrow-mobile", width: 320, height: 800 },
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

    const brandBox = await page.locator(".brand").boundingBox();
    const homeBox = await page.locator(".hub-home-link").boundingBox();
    assert.ok(brandBox && homeBox, `${viewport.name}: brand and home link should be visible`);
    assert.equal(
      brandBox.x >= homeBox.x + homeBox.width + 8,
      true,
      `${viewport.name}: 万象实验室 brand should not overlap the fixed home link`,
    );
    if (viewport.width === 320) {
      const titleBox = await page.locator("#heroTitle").boundingBox();
      assert.ok(titleBox && titleBox.height <= 100, `${viewport.name}: hero title should stay within two compact lines`);
    }

    assert.equal(await page.locator("[data-category]").count(), 6, `${viewport.name}: six category tabs`);
    const tabRelations = await page.locator("[data-category]").evaluateAll(tabs => tabs.map(tab => ({
      id: tab.id,
      controls: tab.getAttribute("aria-controls"),
    })));
    assert.equal(tabRelations.every(tab => tab.id && tab.controls === "templateLibrary"), true, `${viewport.name}: every category tab should control the library panel`);
    assert.equal(
      await page.locator("#templateLibrary").getAttribute("aria-labelledby"),
      await page.locator("[data-category][aria-selected='true']").getAttribute("id"),
      `${viewport.name}: library panel should be labelled by the active category`,
    );
    const activeCategoryTab = page.locator("[data-category][aria-selected='true']");
    await activeCategoryTab.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.getByRole("tab", { name: /商业决策/ }).getAttribute("aria-selected"),
      "true",
      `${viewport.name}: arrow keys select the next category`,
    );
    assert.equal(
      await page.getByRole("tab", { name: /商业决策/ }).evaluate(element => element === document.activeElement),
      true,
      `${viewport.name}: arrow keys move focus with selection`,
    );
    await page.keyboard.press("Home");
    assert.equal(await page.getByRole("tab", { name: /生活日常/ }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("End");
    assert.equal(await page.getByRole("tab", { name: /趣味脑洞/ }).getAttribute("aria-selected"), "true");
    await page.getByRole("tab", { name: /游戏世界/ }).click();
    assert.equal(await page.locator("#templateLibrary [data-experiment-id]").count(), 3, `${viewport.name}: category starts compact`);
    assert.match(await page.locator("#librarySummary").textContent(), /5 个实验/);
    await page.getByRole("button", { name: /展开.*5 个实验/ }).click();
    assert.equal(await page.locator("#templateLibrary [data-experiment-id]").count(), 5, `${viewport.name}: category expands to five`);
    await page.getByRole("button", { name: /收起/ }).click();
    assert.equal(await page.locator("#templateLibrary [data-experiment-id]").count(), 3, `${viewport.name}: category collapses to three`);

    const recommendedMode = page.locator("#chartModePicker [data-chart-mode].is-recommended");
    assert.equal(await recommendedMode.count(), 1, `${viewport.name}: one recommended chart mode`);
    assert.equal(await recommendedMode.getAttribute("aria-pressed"), "true");
    const switchableMode = page.locator("#chartModePicker [data-chart-mode]:not(.is-recommended)").first();
    const metricSnapshot = await page.locator("#metricGrid").textContent();
    await switchableMode.click();
    assert.equal(await page.locator("#metricGrid").textContent(), metricSnapshot, `${viewport.name}: chart mode must not change metrics`);
    assert.equal(await switchableMode.getAttribute("aria-pressed"), "true");
    if (viewport.width <= 720) {
      const compactTargets = await page.locator("#chartModePicker button, #explanationToggle, #resetParameters, #parameterControls input").evaluateAll(elements => elements.map(element => ({
        label: element.getAttribute("aria-label") || element.textContent.trim(),
        height: Math.round(element.getBoundingClientRect().height),
      })));
      assert.equal(
        compactTargets.every(target => target.height >= 44),
        true,
        `${viewport.name}: experiment touch targets should be at least 44px high\n${JSON.stringify(compactTargets)}`,
      );
      assert.equal(await page.locator("#chartScrollHint").isVisible(), true, `${viewport.name}: horizontally scrollable chart should show a swipe hint`);
    }

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

    await spendInput.press("Control+A");
    await spendInput.press("Backspace");
    assert.equal(await spendInput.inputValue(), "", `${viewport.name}: numeric input should allow a transient empty edit`);
    await spendInput.type("8000");
    await spendInput.press("Enter");
    assert.equal(await spendInput.inputValue(), "8000", `${viewport.name}: numeric input should accept a replacement value after clearing`);

    await page.getByRole("button", { name: "为什么这样算" }).click();
    await page.getByRole("heading", { name: "公式与边界" }).waitFor();
    assert.match(await page.locator("#disclaimerText").textContent(), /不构成专业建议/);

    await page.getByRole("button", { name: "打开咖啡因还剩多少？实验" }).first().click();
    await page.getByRole("heading", { name: "咖啡因还剩多少？", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("tab", { name: /生活日常/ }).getAttribute("aria-selected"),
      "true",
      `${viewport.name}: opening an experiment synchronizes its library category`,
    );
    await page.getByRole("tab", { name: /商业决策/ }).click();
    await page.getByRole("button", { name: "打开定期存钱与复利实验" }).click();
    await page.getByRole("heading", { name: "定期存钱与复利", exact: true }).waitFor();
    assert.equal(
      await page.locator("#chartModePicker [data-chart-mode].is-recommended").getAttribute("aria-pressed"),
      "true",
      `${viewport.name}: switching experiments restores the recommended mode`,
    );

    const compileRequests = [];
    page.on("request", request => {
      if (request.url().endsWith("/api/compile")) compileRequests.push(request.url());
    });

    await page.getByLabel("想模拟什么？").fill("小游戏每天买量 5000 元多久回本");
    await page.getByRole("button", { name: "匹配实验" }).click();
    await page.locator("#searchResults[data-state='matched']").waitFor();
    assert.match(await page.locator("#searchResultSummary").textContent(), /已从 30 个实验中匹配到「小游戏买量回本」/);
    assert.equal(await page.locator("#experimentSource").textContent(), "搜索匹配");
    assert.equal(compileRequests.length, 0, `${viewport.name}: matched search must stay local`);

    await page.getByLabel("想模拟什么？").fill("量子香蕉天气会如何改变库存");
    await page.getByRole("button", { name: "匹配实验" }).click();
    await page.locator("#searchResults[data-state='recommended']").waitFor();
    assert.equal(await page.getByRole("heading", { name: "小游戏买量回本", exact: true }).count(), 1);
    assert.equal(await page.locator("[data-recommendation-id]").count(), 3);
    assert.match(await page.locator("#searchResultSummary").textContent(), /以下 3 个最接近/);
    assert.equal(compileRequests.length, 0, `${viewport.name}: unmatched search must stay local`);

    const recommendedTitle = await page.locator("[data-recommendation-id]").first().locator("strong").textContent();
    await page.locator("[data-recommendation-id]").first().click();
    await page.getByRole("heading", { name: recommendedTitle, exact: true }).waitFor();
    assert.equal(await page.locator("#experimentSource").textContent(), "推荐打开");

    const networkCount = compileRequests.length;
    await page.evaluate(() => {
      window.__simuaiStaticNodes = {
        legend: document.querySelector("#chartLegend span"),
        chartMode: document.querySelector("#chartModePicker button"),
        formula: document.querySelector("#formulaText"),
      };
    });
    await page.locator("#parameterControls input[type='range']").first().evaluate(input => {
      input.value = String(Number(input.min) + Number(input.step));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(50);
    assert.equal(compileRequests.length, networkCount, `${viewport.name}: sliders must stay local`);
    assert.equal(
      await page.evaluate(() => (
        window.__simuaiStaticNodes.legend === document.querySelector("#chartLegend span")
        && window.__simuaiStaticNodes.chartMode === document.querySelector("#chartModePicker button")
        && window.__simuaiStaticNodes.formula === document.querySelector("#formulaText")
      )),
      true,
      `${viewport.name}: slider updates should preserve static experiment DOM`,
    );

    const seriesColors = await page.evaluate(async () => {
      const { renderChart } = await import("/ui/chart.mjs");
      const svg = document.querySelector("#resultChart");
      const chart = type => ({
        type,
        xLabel: "天",
        yLabel: "金额",
        series: ["value", "cost", "revenue"].map((id, index) => ({
          id,
          label: id,
          points: [
            { x: 0, value: 10 + index },
            { x: 1, value: 20 + index },
          ],
        })),
      });
      const stylesFor = (selector, property) => [...svg.querySelectorAll(selector)]
        .map(node => getComputedStyle(node)[property]);

      renderChart(svg, chart("line"));
      const lines = stylesFor(".chart-line", "stroke");
      const dots = stylesFor(".chart-dot", "stroke");
      renderChart(svg, chart("bar"));
      const bars = [0, 1, 2].map(index => getComputedStyle(svg.querySelector(`.chart-bar-${index}`)).fill);

      const legendHost = document.createElement("div");
      legendHost.hidden = true;
      legendHost.innerHTML = [0, 1, 2]
        .map(index => `<i class="legend-dot legend-dot-${index}"></i>`)
        .join("");
      document.body.append(legendHost);
      const legends = [...legendHost.children].map(node => getComputedStyle(node).backgroundColor);
      legendHost.remove();
      return { lines, dots, bars, legends };
    });
    for (const [primitive, colors] of Object.entries(seriesColors)) {
      assert.equal(colors.length, 3, `${viewport.name}: ${primitive} should render three series`);
      assert.equal(new Set(colors).size, 3, `${viewport.name}: ${primitive} should use three distinct colors`);
    }

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

    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.getByRole("link", { name: "万象实验室首页" }).click();
    await page.waitForTimeout(400);
    assert.equal(Math.round(await page.evaluate(() => window.scrollY)), 0, `${viewport.name}: brand link should return to the true page top`);
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
