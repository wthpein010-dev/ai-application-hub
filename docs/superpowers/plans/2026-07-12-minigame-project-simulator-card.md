# Minigame Project Simulator Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add “小游戏立项模拟器” to the GitHub Pages `#games` section with a verified Windows ZIP download and preview asset.

**Architecture:** Extend only the active `defaultApps` data in `app-20260706-restore-games.js`, preserving the existing renderer and storage model. Package the already verified Windows v1.1 artifact into a site-local ZIP and add repository tests that validate card metadata, download contents, and executable checksum.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, PowerShell ZIP packaging, GitHub Pages.

## Global Constraints

- Display name must be `小游戏立项模拟器`.
- Card must appear under `#games` with category `小游戏开发辅助工具`.
- Windows download must be `downloads/minigame-project-simulator-windows.zip`.
- ZIP must contain only `MinigameBrief_v1.1.exe`, `README.md`, `UNITY_MINIGAME_MEMORY.md`, and `VERIFICATION.md`.
- Do not add a fake web experience or Mac download.
- Do not edit historical JavaScript variants; modify only `app-20260706-restore-games.js`.
- Keep existing playable games ahead of this development helper.

---

### Task 1: Download Package and Metadata Test

**Files:**
- Create: `tests/minigame-project-simulator.test.mjs`
- Create: `downloads/minigame-project-simulator-windows.zip`
- Create: `assets/minigame-project-simulator-preview.png`

**Interfaces:**
- Consumes: verified local v1.1 application files.
- Produces: site-local ZIP and preview path consumed by the app record.

- [ ] **Step 1: Write a failing Node test for the card record and package path**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app-20260706-restore-games.js", import.meta.url), "utf8");

test("minigame project simulator card has required metadata", () => {
  assert.match(source, /id:\s*"minigame-project-simulator"/);
  assert.match(source, /name:\s*"小游戏立项模拟器"/);
  assert.match(source, /category:\s*"小游戏开发辅助工具"/);
  assert.match(source, /package:\s*"\.\/downloads\/minigame-project-simulator-windows\.zip"/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the record is absent**

Run: `node --test tests/minigame-project-simulator.test.mjs`

Expected: FAIL on the missing ID assertion.

- [ ] **Step 3: Build the ZIP from exactly four approved files and copy the preview**

```powershell
Compress-Archive -LiteralPath MinigameBrief_v1.1.exe,README.md,UNITY_MINIGAME_MEMORY.md,VERIFICATION.md -DestinationPath downloads/minigame-project-simulator-windows.zip
Copy-Item preview.png assets/minigame-project-simulator-preview.png
```

- [ ] **Step 4: Extend the test to inspect ZIP entry names and verify the EXE SHA-256**

Use `System.IO.Compression.ZipFile` from PowerShell to list entries and extract the EXE to a temporary directory. Assert the four exact names and SHA-256 `985EC9017A2EF5900DD53F3E1C27CDFB7C66ABFCE404717039F96ED86FD3D86E`.

- [ ] **Step 5: Commit package, preview, and failing metadata test**

```powershell
git add tests/minigame-project-simulator.test.mjs downloads/minigame-project-simulator-windows.zip assets/minigame-project-simulator-preview.png
git commit -m "test: define minigame simulator site artifact"
```

### Task 2: Active App Data Integration

**Files:**
- Modify: `app-20260706-restore-games.js`
- Test: `tests/minigame-project-simulator.test.mjs`

**Interfaces:**
- Consumes: package and metadata contract from Task 1.
- Produces: one `defaultApps` record rendered by existing `renderGameGrid`.

- [ ] **Step 1: Add the minimal app record after the existing game records**

```js
{
  id: "minigame-project-simulator",
  name: "小游戏立项模拟器",
  category: "小游戏开发辅助工具",
  status: "game",
  brief: "用快速选项和可展开问卷整理小游戏立项需求，生成可直接交给 Codex 的项目需求与 Unity 微信小游戏通用开发记忆。",
  problem: "新游戏开始前，玩法、范围、视觉风格、微信能力、性能和验收要求容易缺失，导致开发方向反复漂移。",
  aiUse: "工具把用户选择整理为结构化 Markdown，让 Codex先检查关键缺失和冲突，再按 Unity、uGUI、750×1624 与微信小游戏约束开展开发。",
  folder: "./projects/minigame-project-simulator/",
  entry: "",
  package: "./downloads/minigame-project-simulator-windows.zip",
  platforms: { web: "", windows: { href: "./downloads/minigame-project-simulator-windows.zip", label: "Windows下载" }, mac: "" },
  tags: ["Unity", "微信小游戏", "需求生成", "UGUI"],
  speed: 9, impact: 9, risk: 8, polish: 9
}
```

- [ ] **Step 2: Add a deterministic tail rank**

Update `gameDisplayRank` so `minigame-project-simulator` sorts after all playable games without changing existing special ranks.

- [ ] **Step 3: Run JavaScript syntax and repository tests**

Run: `node --check app-20260706-restore-games.js; node --test tests/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 4: Commit the active data integration**

```powershell
git add app-20260706-restore-games.js tests/minigame-project-simulator.test.mjs
git commit -m "feat: add minigame project simulator"
```

### Task 3: Browser Verification and Publication

**Files:**
- Verify: `index.html`, `app-20260706-restore-games.js`, `styles.css`

**Interfaces:**
- Consumes: completed static site branch.
- Produces: verified GitHub Pages update.

- [ ] **Step 1: Serve the repository locally and open `index.html#games`**

Run: `python -m http.server 8765 --directory .`

Expected: page returns HTTP 200.

- [ ] **Step 2: Verify card text, game count, responsive layout, and ZIP download in the browser**

Check desktop and narrow viewport screenshots. Confirm the card is in `#gameGrid`, existing games remain ahead of it, and the Windows link returns the expected ZIP.

- [ ] **Step 3: Run final repository and artifact verification**

Run: `node --check app-20260706-restore-games.js; node --test tests/*.test.mjs; git diff --check; git status -sb`

Expected: syntax PASS, all tests PASS, no whitespace errors, only intended branch commits.

- [ ] **Step 4: Push the branch and publish through the repository workflow**

Push `agent/add-minigame-project-simulator` to `origin`. Create a draft PR targeting `main` when GitHub CLI or the GitHub connector is authenticated; otherwise report the exact authentication blocker without attempting a destructive workaround.

- [ ] **Step 5: Verify the deployed page after merge**

Open `https://wthpein010-dev.github.io/ai-application-hub/index.html#games`, confirm the new card and download URL return successfully, and report the live links.
