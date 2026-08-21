import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSources } from "../projects/gamespec-relay/app/core/analyzer.js";
import { BOSS_PHASE_SAMPLE, GAME_GLOSSARY } from "../projects/gamespec-relay/app/data/boss-phase-sample.js";
import { createRelayStore } from "../projects/gamespec-relay/app/store.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    raw() { return Object.fromEntries(values); },
  };
}

function editedProject() {
  const pack = analyzeSources({
    projectName: BOSS_PHASE_SAMPLE.projectName,
    sources: BOSS_PHASE_SAMPLE.sources,
    glossary: GAME_GLOSSARY,
  });
  pack.id = "boss-phase-demo";
  pack.tasks[0].title = "锁定二阶段验收口径";
  pack.questions[0].status = "confirmed";
  pack.questions[0].answer = "采用新版本乙";
  return pack;
}

test("edited task and confirmed question survive an independent store reload", () => {
  const storage = memoryStorage();
  const original = editedProject();
  const expected = structuredClone(original);
  createRelayStore(storage).saveProject(original);

  original.tasks[0].title = "保存后外部突变";
  const restored = createRelayStore(storage).loadProject("boss-phase-demo");

  assert.deepEqual(restored, expected);
  assert.notStrictEqual(restored, original);
});

test("browser persistence strips API credentials from settings", () => {
  const storage = memoryStorage();
  const store = createRelayStore(storage);

  store.saveSettings({
    endpoint: "https://model.example/v1",
    model: "relay-model",
    apiKey: "sk-do-not-persist",
    nested: { authorization: "Bearer sk-do-not-persist" },
  });

  assert.deepEqual(store.loadSettings(), {
    endpoint: "https://model.example/v1",
    model: "relay-model",
    nested: {},
  });
  assert.doesNotMatch(JSON.stringify(storage.raw()), /sk-do-not-persist|apiKey|authorization/i);
});

test("corrupt local data recovers as an empty store", () => {
  const storage = memoryStorage({ "gamespec-relay:v1": "{not-json" });
  const store = createRelayStore(storage);

  assert.deepEqual(store.listProjects(), []);
  assert.equal(store.loadProject("missing"), null);
});
