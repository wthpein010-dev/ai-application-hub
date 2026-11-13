import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const project = new URL('../projects/planner-daily-quiz/', import.meta.url);
const read = path => readFileSync(new URL(path, project), 'utf8');
const runtime = read('app.js');
const bank = JSON.parse(read('data/questions.json'));

test('the active bank covers general game-design foundations with valid unique answers', () => {
  assert.ok(bank.length >= 50);
  assert.equal(new Set(bank.map(q => q.id)).size, bank.length);
  assert.ok(new Set(bank.map(q => q.category)).size >= 10);
  assert.doesNotMatch(JSON.stringify(bank), /羊了个羊|对对碰|砖块角色|TGA|当前项目|文章中|根据《/u);
  for (const q of bank) {
    assert.match(q.id, /^foundation-/);
    assert.ok(['single', 'multiple', 'true_false'].includes(q.type), q.id);
    assert.ok(q.difficulty >= 1 && q.difficulty <= 2, q.id);
    assert.ok(q.question && q.explanation && q.tags.length && q.options.length >= 2, q.id);
    assert.equal(new Set(q.options).size, q.options.length, q.id);
    assert.equal(new Set(q.answer).size, q.answer.length, q.id);
    assert.ok(q.answer.every(i => Number.isInteger(i) && i >= 0 && i < q.options.length), q.id);
    assert.ok(q.type === 'multiple' ? q.answer.length > 1 : q.answer.length === 1, q.id);
  }
});

test('the name field uses a neutral prompt without an example nickname', () => {
  assert.doesNotMatch(read('index.html'), /跳鼠|羊了个羊|对对碰/u);
  assert.match(read('index.html'), /id="userName"[^>]*placeholder="请输入姓名或昵称"/u);
});

test('the numerical foundation answers agree with the stated calculation rules', () => {
  for (const [id, answer] of [
    ['foundation-math-001', '2枚'], ['foundation-math-002', '25%'],
    ['foundation-math-003', '150'], ['foundation-math-004', '140'],
    ['foundation-data-002', '30%'], ['foundation-data-003', '5%'], ['foundation-data-004', '5元'],
  ]) {
    const question = bank.find(q => q.id === id);
    assert.equal(question.options[question.answer[0]], answer, id);
  }
});

test('all new question types are scored correctly and retain full review snapshots', () => {
  const context = {
    state: { dailyQuestions: bank, answers: new Map(bank.map(q => [q.id, q.answer])),
      config: { version: 'foundations-v2', timeLimitSeconds: 900 }, remainingSeconds: 900,
      startedAt: new Date('2026-11-13T01:00:00Z') },
  };
  const grading = runtime.slice(runtime.indexOf('function gradeQuiz('), runtime.indexOf('function renderResult('));
  const helpers = runtime.slice(runtime.indexOf('function collectWeakTags('), runtime.indexOf('function formatTime('));
  vm.runInNewContext(grading + '\n' + helpers, context);
  const result = context.gradeQuiz('manual', { userName: '测试策划' });
  assert.equal(result.score, 100);
  assert.equal(result.correctCount, 60);
  assert.ok(result.reviews.every(q => q.question && q.explanation && q.correct));
  context.state.answers.clear();
  assert.equal(context.gradeQuiz('timeout', { userName: '测试策划' }).score, 0);
});

function recordHarness(records) {
  const context = {
    state: { config: { version: 'foundations-v2' } },
    STORAGE_KEY: 'records',
    getProfile: () => ({ userName: '测试策划' }),
    todayKey: () => '2026-11-13',
    getRecords: () => records,
    localStorage: { setItem: (_key, value) => { records = JSON.parse(value); } },
  };
  const source = runtime.slice(runtime.indexOf('function persistResult('), runtime.indexOf('function getRecords('));
  vm.runInNewContext(source, context);
  return { context, records: () => records };
}

const old = { date: '2026-11-13', profile: { userName: '测试策划' }, appVersion: 'old-project-bank', score: 70 };
const current = { ...old, appVersion: 'foundations-v2', score: 90 };

test('an old-bank completion does not lock today\'s new foundation exam', () => {
  const { context } = recordHarness([old]);
  assert.equal(context.getTodayRecord(), undefined);
});

test('the same bank still enforces the daily completion lock', () => {
  const { context } = recordHarness([old, current]);
  assert.equal(context.getTodayRecord(), current);
});

test('saving the new-bank answer preserves the previous bank\'s historical result', () => {
  const harness = recordHarness([old]);
  harness.context.persistResult(current);
  assert.deepEqual(harness.records(), [old, current]);
  harness.context.persistResult({ ...current, score: 100 });
  assert.equal(harness.records().length, 2);
  assert.equal(harness.records()[0].score, 70);
  assert.equal(harness.records()[1].score, 100);
});
