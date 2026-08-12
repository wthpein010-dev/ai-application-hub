# SimuAI 30 个实验与图表视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SimuAI 扩充为 30 个本地确定性实验，并加入实验推荐默认视图与用户手动图表视图切换，完成 GitHub Pages 发布。

**Architecture:** 在现有 schema → engine → presenter → SVG renderer → app 单向数据流上增加 `logistic`、`queue`、`probability` 三个模型。实验规格通过 `chart.type` 声明推荐视图、通过 `chart.modes` 声明可选视图；应用仅保存当前视图状态，不改变模型结果。实验库使用独立的分类元数据和渐进展开状态渲染 6×5 个实验。

**Tech Stack:** 原生 ES modules、HTML、CSS、SVG、Node.js `node:test`、Playwright、GitHub Pages。

## Global Constraints

- 公开版保持纯静态、本地计算，不请求远程 AI 或外部数据。
- 实验总数为 30，分类分布为 6 类 × 5 个。
- 相同参数必须产生相同结果；不加入随机抽样或蒙特卡洛。
- 图表切换只能改变显示，不得改变指标或模型结果。
- 现有 12 个实验 ID 保持不变。
- 支持 `line`、`area`、`bar`、`step`、`funnel` 五种图表视图。
- 1440×900 和 390×844 不得产生页面横向溢出。
- 所有新增交互必须支持键盘焦点、可访问名称和 `aria-pressed`/`aria-selected` 状态。

---

## File Structure

- `projects/simuai/core/schema.mjs`：9 种模型契约、图表模式和规格验证。
- `projects/simuai/core/engines.mjs`：3 个新增确定性引擎。
- `projects/simuai/core/templates.mjs`：30 个实验规格。
- `projects/simuai/core/catalog.mjs`：六类的固定顺序、标签和数量查询。
- `projects/simuai/core/presenter.mjs`：新模型结论和可覆盖图表视图的 view model。
- `projects/simuai/ui/chart.mjs`：五种 SVG 图表渲染。
- `projects/simuai/app.mjs`：当前图表视图、分类筛选、展开状态和动态数量文案。
- `projects/simuai/index.html`：视图切换器和分类筛选挂载点。
- `projects/simuai/styles.css`：紧凑图表控件、分类标签、渐进卡片布局与响应式样式。
- `tests/simuai-*.test.mjs`、`tests/simuai-browser-smoke.mjs`：单元、契约和浏览器行为。
- `app-20260706-restore-games.js`：Hub 卡片新版数量与能力文案。
- `projects/simuai/video/*`：与新版页面一致的教程视频、字幕、海报和脚本。

---

### Task 1: 新模型与 schema 契约

**Files:**
- Modify: `tests/simuai-engine.test.mjs`
- Modify: `projects/simuai/core/schema.mjs`
- Modify: `projects/simuai/core/engines.mjs`

**Interfaces:**
- Produces: `MODEL_TYPES` 包含 `logistic | queue | probability`。
- Produces: `runModel(spec, values)` 对三个新模型返回 `{series, outputs, warnings}`。
- Produces: `validateExperiment(spec)` 接受 `chart.modes`，且要求 `chart.type` 位于其中。

- [ ] **Step 1: Write the failing model and schema tests**

```js
test("logistic growth approaches but does not exceed capacity", () => {
  const result = runModel({ modelType: "logistic" }, { initial: 10, capacity: 100, growthRate: 30, duration: 20 });
  assert.ok(result.outputs.finalValue > 10 && result.outputs.finalValue < 100);
  assert.equal(result.outputs.capacityPercent, result.outputs.finalValue);
});

test("queue never becomes negative and reports a clearing time", () => {
  const result = runModel({ modelType: "queue" }, { initialQueue: 20, arrivalRate: 3, serviceRate: 7, duration: 10 });
  assert.equal(result.outputs.finalValue, 0);
  assert.equal(result.outputs.clearTime, 5);
});

test("probability supports ordinary trials, pairwise trials and a hard guarantee", () => {
  const ordinary = runModel({ modelType: "probability" }, { chance: 2, attempts: 50, guaranteeAt: 90 });
  const pairwise = runModel({ modelType: "probability", attemptTransform: "pairwise" }, { chance: 1 / 365 * 100, attempts: 23, guaranteeAt: 0 });
  assert.ok(ordinary.outputs.finalValue > 63 && ordinary.outputs.finalValue < 64);
  assert.ok(pairwise.outputs.finalValue > 50);
});
```

- [ ] **Step 2: Run `node --test tests/simuai-engine.test.mjs` and verify the new assertions fail because the model types are unsupported**

- [ ] **Step 3: Add exact model contracts and implement deterministic formulas**

```js
const logistic = (_spec, values) => {
  const initial = Math.max(0, values.initial);
  const capacity = Math.max(initial, values.capacity);
  const rate = values.growthRate / 100;
  const series = durationPoints(values.duration, time => (
    initial === 0 ? 0 : capacity / (1 + ((capacity - initial) / initial) * Math.exp(-rate * time))
  ));
  return { series, outputs: { finalValue: series.at(-1).value, capacityPercent: series.at(-1).value / capacity * 100 }, warnings: [] };
};
```

Implement queue as `max(0, initialQueue + (arrivalRate - serviceRate) * time)`. Implement cumulative probability as `100 * (1 - (1 - chance / 100) ** effectiveTrials)`, capped at 100 when `guaranteeAt > 0` and attempts reach the guarantee; `pairwise` uses `n * (n - 1) / 2` trials.

- [ ] **Step 4: Run `node --test tests/simuai-engine.test.mjs` and verify all engine/schema tests pass**

- [ ] **Step 5: Commit `test: define SimuAI expanded model contracts` and `feat: add deterministic SimuAI models` as one verified TDD unit**

---

### Task 2: 图表视图数据契约与 SVG 渲染

**Files:**
- Modify: `tests/simuai-presenter.test.mjs`
- Create: `tests/simuai-chart.test.mjs`
- Modify: `projects/simuai/core/presenter.mjs`
- Modify: `projects/simuai/ui/chart.mjs`
- Modify: `projects/simuai/styles.css`

**Interfaces:**
- Consumes: experiment `chart: { type, modes, xLabel, yLabel, series }`。
- Produces: `buildViewModel(spec, values, { chartMode })`，返回 `chart.type` 为合法覆盖或推荐默认值，并返回 `chart.modes`。
- Produces: `renderChart(svg, chart)` 支持五种视图。

- [ ] **Step 1: Write failing presenter tests for recommended view, legal override and illegal fallback**

```js
const experiment = getExperiment("caffeine-decay");
assert.equal(buildViewModel(experiment, values).chart.type, experiment.chart.type);
assert.equal(buildViewModel(experiment, values, { chartMode: "line" }).chart.type, "line");
assert.equal(buildViewModel(experiment, values, { chartMode: "bar" }).chart.type, experiment.chart.type);
```

- [ ] **Step 2: Run the focused presenter test and verify it fails on missing `chart.modes`/override behavior**

- [ ] **Step 3: Implement presenter override without changing engine outputs, then verify presenter tests pass**

- [ ] **Step 4: Write failing chart DOM tests using a minimal document/SVG fixture for `bar`, `step`, `line`, `area`, and `funnel` class output**

- [ ] **Step 5: Run `node --test tests/simuai-chart.test.mjs` and verify `bar` and `step` fail because their renderers are absent**

- [ ] **Step 6: Implement `renderBarChart`, stepped path generation, per-render unique gradient IDs, zero baseline and accessible SVG title updates**

- [ ] **Step 7: Run presenter/chart tests and syntax-check both production modules**

- [ ] **Step 8: Commit `feat: add switchable SimuAI chart views`**

---

### Task 3: 30 个有效实验和六类目录

**Files:**
- Modify: `tests/simuai-template.test.mjs`
- Create: `projects/simuai/core/catalog.mjs`
- Modify: `projects/simuai/core/templates.mjs`

**Interfaces:**
- Produces: `EXPERIMENT_CATEGORIES` 固定六类顺序。
- Produces: `experimentsForCategory(category)` 返回 defensive array。
- Produces: `EXPERIMENTS.length === 30` 且每类 5 个。

- [ ] **Step 1: Replace the twelve-item assertion with failing 30-item, 6×5 distribution, required IDs and chart-mode assertions**

```js
assert.equal(EXPERIMENTS.length, 30);
assert.deepEqual(EXPERIMENT_CATEGORIES.map(category => experimentsForCategory(category).length), [5, 5, 5, 5, 5, 5]);
for (const experiment of EXPERIMENTS) {
  assert.ok(experiment.chart.modes.includes(experiment.chart.type));
  assert.ok(experiment.chart.modes.length >= 2);
}
```

- [ ] **Step 2: Run `node --test tests/simuai-template.test.mjs` and verify count/category/new match cases fail**

- [ ] **Step 3: Add the 18 new specs, reclassify existing specs into six exact categories, add chart modes to all 30, and retain all 12 legacy IDs**

- [ ] **Step 4: Add matcher examples for all 18 new experiments and verify every first-ranked result**

- [ ] **Step 5: Run template, engine, presenter and compiler tests; fix only specification/contract defects shown by the tests**

- [ ] **Step 6: Commit `feat: expand SimuAI to thirty experiments`**

---

### Task 4: 分类渐进展开与视图切换交互

**Files:**
- Modify: `tests/simuai-page.test.mjs`
- Modify: `tests/simuai-browser-smoke.mjs`
- Modify: `projects/simuai/index.html`
- Modify: `projects/simuai/app.mjs`
- Modify: `projects/simuai/styles.css`

**Interfaces:**
- Adds DOM: `#chartModePicker`, `#categoryTabs`, `#librarySummary`, `#toggleCategoryExpansion`。
- State: `{ experiment, values, chartMode, activeCategory, expandedCategories }`。
- Behavior: switching experiment sets `chartMode = experiment.chart.type`; parameter edits preserve `chartMode`.

- [ ] **Step 1: Add failing static page assertions for the new DOM hooks and the absence of hard-coded `12 个实验` in the app/page**

- [ ] **Step 2: Run `node --test tests/simuai-page.test.mjs` and verify the hooks fail**

- [ ] **Step 3: Add failing browser assertions**

```js
assert.equal(await page.locator("[data-category]").count(), 6);
assert.equal(await page.locator("#templateLibrary [data-experiment-id]").count(), 3);
await page.getByRole("button", { name: /展开.*5 个实验/ }).click();
assert.equal(await page.locator("#templateLibrary [data-experiment-id]").count(), 5);
const metricBefore = await page.locator("#metricGrid").textContent();
await page.getByRole("button", { name: "柱状" }).click();
assert.equal(await page.locator("#metricGrid").textContent(), metricBefore);
```

- [ ] **Step 4: Run browser smoke and verify it fails on missing controls**

- [ ] **Step 5: Implement stateful view buttons, six category tabs, 3→5 progressive expansion, dynamic experiment count and compact cards using DOM APIs only**

- [ ] **Step 6: Add responsive CSS for desktop 3-column, tablet 2-column, mobile 1-column layouts and locally scrollable tab/mode rows**

- [ ] **Step 7: Run page and browser tests; verify desktop/mobile have no page overflow and no browser errors**

- [ ] **Step 8: Commit `feat: refine SimuAI experiment discovery`**

---

### Task 5: Hub 文案与教程媒体

**Files:**
- Modify: `tests/simuai-publish.test.mjs`
- Modify: `app-20260706-restore-games.js`
- Modify: `index.html` cache query if required by publication contract
- Modify: `scripts/build-simuai-tutorial.mjs`
- Modify: `projects/simuai/video/tutorial-script.md`
- Modify: `projects/simuai/video/simuai-tutorial.vtt`
- Modify: `projects/simuai/video/simuai-tutorial.mp4`
- Modify: `projects/simuai/video/poster.jpg`

**Interfaces:**
- Hub card advertises `30 个受控实验`、`5 种图表视图`、本地匹配和透明模型。
- Tutorial demonstrates category filtering, expansion and chart switching.

- [ ] **Step 1: Change publish assertions first so they require the new exact card claims and a cache token containing `simuai-30-experiments`**

- [ ] **Step 2: Run `node --test tests/simuai-publish.test.mjs` and verify it fails on the old 12-item copy**

- [ ] **Step 3: Update only SimuAI default/migration copy and cache token; preserve user-customized card copy behavior**

- [ ] **Step 4: Update tutorial capture script to operate the new controls, then run `npm run build:simuai-video`**

- [ ] **Step 5: Run media inspection and publish tests, verifying H.264 1280×720, bounded one-line captions and valid poster**

- [ ] **Step 6: Commit `docs: refresh SimuAI tutorial and Hub entry`**

---

### Task 6: 全量验证、代码审查与 GitHub Pages 发布

**Files:**
- Modify if findings require: only files already in scope.
- Modify: `C:\Users\ASUS\Documents\Obsidian\Codex-Memory\05-项目记忆\AI-Application-Hub.md` after verified publication.

**Interfaces:**
- Published demo: `https://wthpein010-dev.github.io/ai-application-hub/projects/simuai/index.html`。

- [ ] **Step 1: Run focused gates**

```powershell
npm run test:simuai
npm run test:simuai-browser
npm run test:simuai-publish
npm run audit:hub
```

- [ ] **Step 2: Run all repository tests with `node --test`, record pass/fail/skip totals, and run `git diff --check` plus syntax checks for changed `.mjs` files**

- [ ] **Step 3: Review the complete diff against the design, resolve every critical/important issue, and rerun affected tests**

- [ ] **Step 4: Verify GitHub identity, write access, remote URL, feature branch and clean intended diff; push the branch and create a pull request**

- [ ] **Step 5: Wait for required checks, merge the PR, and verify `origin/main` contains the exact merge SHA**

- [ ] **Step 6: Wait for the GitHub Pages workflow tied to that SHA to succeed**

- [ ] **Step 7: Verify public HTTP resources and run Playwright acceptance at 1440×900 and 390×844 against the public URL, including 30 experiments, six categories, chart switching, local search, no overflow, and zero console/page/request failures**

- [ ] **Step 8: Update the project memory with the confirmed public state, exact SHA, workflow results, test totals and remaining blockers; do not store credentials**

- [ ] **Step 9: Deliver the live URL, concise change summary, verification evidence and final SHA to the user**
