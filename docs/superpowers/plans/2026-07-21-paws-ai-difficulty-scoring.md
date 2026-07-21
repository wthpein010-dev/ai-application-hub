# Paws AI 难度评分与深层关卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. All production changes follow red-green-refactor.

**Goal:** 把飞书五维难度口径、精确砖块数/有效层数/目标分和塔群压力曲线接入已有 Paws 浏览器 AI 生成器。

**Architecture:** `level-difficulty.mjs` 负责从结构统计和求解轨迹生成通用评分；`ai-level-generator.mjs` 负责按精确参数构建多个可解候选并选择最接近目标分的结果；对话框只收集参数和展示建议；控制器保存评分元数据并复用现有打开、3D和试玩流程。

**Tech Stack:** Node.js ESM、浏览器原生 DOM/localStorage、`node:test`、Playwright、GitHub Pages。

### Task 1: 五维难度评分器

**Files:**
- Create: `projects/paws-level-editor/core/level-difficulty.mjs`
- Modify: `projects/paws-level-editor/core/level-statistics.mjs`
- Modify: `projects/paws-level-editor/core/level-solver.mjs`
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`

- [ ] 写已有/可解/不可解关卡的评分失败测试，覆盖五维权重、评级和发布门禁。
- [ ] 扩展统计与求解轨迹，提供开放率、平均遮挡、阶段对子、伙伴距离、有效分支和容错代理。
- [ ] 实现分段锚点评分、维度重加权、总分、可信度和主要原因。
- [ ] 运行核心测试并保持既有求解测试通过。

### Task 2: 精确参数与目标分候选选择

**Files:**
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`

- [ ] 写 180/12/40、200/15/60、240/32/80 与奇数规范化的失败测试。
- [ ] 将难度档改为默认值/建议范围，支持 `tileCount`、`layerCount`、`targetScore` 和最多 64 个候选。
- [ ] 让生成结果保存实际评分、目标偏差和候选数，并拒绝不可解候选。
- [ ] 验证固定种子可复现、不同目标分产生可解释差异。

### Task 3: 塔群—掩体—危机—释放生成

**Files:**
- Modify: `projects/paws-level-editor/core/ai-level-generator.mjs`
- Modify: `projects/paws-level-editor/core/level-statistics.mjs`
- Modify: `tests/paws-level-editor-ai-generator.test.mjs`

- [ ] 写阶段砖量、有效层、平台拆分、反重叠、开局安全对子和释放段的失败测试。
- [ ] 实现五阶段偶数配额、多局部塔、小平台缺口与阶段压力元数据。
- [ ] 保证每个请求层都真实参与依赖，且平均遮挡和同格堆叠不过线。
- [ ] 对 200/15 和 240/32 做性能与可解性回归。

### Task 4: 对话框和控制器接入

**Files:**
- Modify: `projects/paws-level-editor/index.html`
- Modify: `projects/paws-level-editor/styles.css`
- Modify: `projects/paws-level-editor/ui/ai-level-dialog.mjs`
- Modify: `projects/paws-level-editor/ui/workbench-controller.mjs`
- Modify: `tests/paws-level-editor-ai-controller.test.mjs`

- [ ] 写三个精确输入、切档自动填充、建议文案和生成摘要的失败测试。
- [ ] 增加砖块数、有效层数、目标难度，保持主选择数量不变。
- [ ] 规范化偶数和边界，控制器透传参数并展示五维结果。
- [ ] 验证已有保存、重名、导入和只读模式不回归。

### Task 5: 浏览器与发布回归

**Files:**
- Modify: `tests/paws-level-editor-ai-browser-smoke.mjs`
- Modify: `tests/artifacts/paws-ai-level-proof.json`
- Modify: `tests/artifacts/paws-ai-level-dialog.png`
- Modify: `tests/artifacts/paws-ai-level-desktop.png`

- [ ] 浏览器生成标准 200/15/60，验证实际数量、评分、保存、2D/3D、试玩和刷新恢复。
- [ ] 执行全部 Paws 单元、契约、静态服务器和浏览器测试，检查语法与 `git diff --check`。
- [ ] 原始分辨率检查对话框和 3D 截图，无裁切、遮挡或重叠文本。
- [ ] 提交并推送 `origin/main`，等待 Pages 成功后做线上 HTTP 与真实浏览器验收。
