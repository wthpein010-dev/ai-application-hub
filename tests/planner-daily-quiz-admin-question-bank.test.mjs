import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = join(root, "projects", "planner-daily-quiz");
const html = readFileSync(join(project, "index.html"), "utf8");
const app = readFileSync(join(project, "app.js"), "utf8");
const questions = JSON.parse(readFileSync(join(project, "data", "questions.json"), "utf8"));

test("administrator page exposes question-bank controls", () => {
  assert.match(html, /id="adminTabs"/);
  assert.match(html, /data-admin-view="question-bank"/);
  assert.match(html, /id="adminQuestionSearch"/);
  assert.match(html, /id="adminCategoryFilter"/);
  assert.match(html, /id="adminQuestionList"/);
});

test("administrator source renders and filters complete question details", () => {
  assert.match(app, /function setAdminView\(view\)/);
  assert.match(app, /function renderAdminQuestionBank\(\)/);
  assert.match(app, /function getFilteredAdminQuestions\(\)/);
  assert.match(app, /function formatQuestionAnswer\(question\)/);
  assert.match(app, /question\.explanation/);
  assert.match(app, /question\.answer/);
});

test("question data contains answerable questions with explanations", () => {
  assert.ok(questions.length > 0);
  assert.ok(questions.every(question => question.question && question.options?.length && question.answer?.length && question.explanation));
});
