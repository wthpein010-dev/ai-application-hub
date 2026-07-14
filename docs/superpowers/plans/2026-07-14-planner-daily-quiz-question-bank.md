# Daily Quiz Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, login-gated question-bank browser to the daily quiz administrator panel.

**Architecture:** Reuse the existing browser-side question array. Add management-view state, tab controls, filters, and a safe HTML renderer for full question details. No network endpoint or persistence changes are needed.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in test runner.

## Global Constraints

- Preserve the current `ADMIN_PASSWORD` behaviour and existing answer-record controls.
- Do not add editing controls, a backend, credentials, or external dependencies.
- Ensure the same static files work in current Windows and macOS browsers.

---

### Task 1: Define and test the management question-bank surface

**Files:**
- Create: `tests/planner-daily-quiz-admin-question-bank.test.mjs`
- Modify: `projects/planner-daily-quiz/index.html`
- Modify: `projects/planner-daily-quiz/styles.css`

**Interfaces:**
- Produces `#adminTabs`, `#adminQuestionBank`, `#adminQuestionSearch`, `#adminCategoryFilter`, and `#adminQuestionList`.

- [ ] **Step 1: Write a failing structural test**

```js
test("administrator page exposes question-bank controls", () => {
  assert.match(html, /id="adminTabs"/);
  assert.match(html, /data-admin-view="question-bank"/);
  assert.match(html, /id="adminQuestionSearch"/);
  assert.match(html, /id="adminCategoryFilter"/);
  assert.match(html, /id="adminQuestionList"/);
});
```

- [ ] **Step 2: Verify it fails**

Run: `node --test tests/planner-daily-quiz-admin-question-bank.test.mjs`

Expected: the question-bank control assertions fail before the UI exists.

- [ ] **Step 3: Add the administrator tabs and question-bank section**

Use a `role="tablist"` containing `答题记录` and `题库查阅` buttons. Place a hidden `#adminQuestionBank` section beside the existing record list; it contains search, category select, result count, and list containers.

- [ ] **Step 4: Add responsive styles**

Use flex-wrap for tabs, a two-column search/select filter grid that becomes one column below 640px, and card styles that visibly distinguish correct options, answer text, and explanation.

- [ ] **Step 5: Verify the structural test passes**

Run: `node --test tests/planner-daily-quiz-admin-question-bank.test.mjs`

Expected: the UI control test passes.

### Task 2: Implement the question-bank behaviour with tests first

**Files:**
- Modify: `projects/planner-daily-quiz/app.js`
- Modify: `tests/planner-daily-quiz-admin-question-bank.test.mjs`

**Interfaces:**
- Consumes `state.questions` and the five question-bank controls.
- Produces `setAdminView(view)`, `renderAdminQuestionBank()`, `getFilteredAdminQuestions()`, and `formatQuestionAnswer(question)`.

- [ ] **Step 1: Extend the test with failing behaviour assertions**

```js
test("administrator source renders complete question details", () => {
  assert.match(app, /function setAdminView\(view\)/);
  assert.match(app, /function renderAdminQuestionBank\(\)/);
  assert.match(app, /function getFilteredAdminQuestions\(\)/);
  assert.match(app, /function formatQuestionAnswer\(question\)/);
  assert.match(app, /question\.explanation/);
});
```

- [ ] **Step 2: Verify the new assertions fail**

Run: `node --test tests/planner-daily-quiz-admin-question-bank.test.mjs`

Expected: the function-name assertions fail before implementation.

- [ ] **Step 3: Implement the minimum functions**

`setAdminView(view)` toggles the records and question-bank areas and updates tab selection. `getFilteredAdminQuestions()` filters on category plus a case-insensitive concatenation of stem, category, tags, and option labels. `renderAdminQuestionBank()` escapes text and renders every question's options, answer labels, explanation, and tags. Populate the category select after `loadData()` and bind tab, input, and change events in `bindEvents()`.

- [ ] **Step 4: Verify behaviour tests pass**

Run: `node --test tests/planner-daily-quiz-admin-question-bank.test.mjs`

Expected: all structural and source-behaviour assertions pass.

### Task 3: Validate data, syntax, browser behaviour, and publish

**Files:**
- Modify: `tests/planner-daily-quiz-admin-question-bank.test.mjs`

- [ ] **Step 1: Add a complete-question dataset assertion**

```js
test("question data contains answerable questions with explanations", () => {
  assert.ok(questions.length > 0);
  assert.ok(questions.every(question => question.question && question.options?.length && question.answer?.length && question.explanation));
});
```

- [ ] **Step 2: Run focused automated checks**

Run: `node --test tests/planner-daily-quiz-admin-question-bank.test.mjs; node --check projects/planner-daily-quiz/app.js`

Expected: all tests pass and the syntax check exits with code 0.

- [ ] **Step 3: Verify the browser flow**

Open the page, log in with the existing password, choose `题库查阅`, apply one category and a known question keyword, then verify that a matching card includes the correct answer and explanation. Repeat at a narrow viewport.

- [ ] **Step 4: Commit and publish only related files**

Run:

```bash
git add docs/superpowers/specs/2026-07-14-planner-daily-quiz-question-bank-design.md docs/superpowers/plans/2026-07-14-planner-daily-quiz-question-bank.md tests/planner-daily-quiz-admin-question-bank.test.mjs projects/planner-daily-quiz/index.html projects/planner-daily-quiz/app.js projects/planner-daily-quiz/styles.css
git commit -m "feat: add daily quiz question bank browser"
git push origin main
```
