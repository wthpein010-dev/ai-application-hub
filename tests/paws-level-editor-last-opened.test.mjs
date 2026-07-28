import assert from "node:assert/strict";
import test from "node:test";

import { createLastOpenedLevelStore } from "../projects/paws-level-editor/ui/last-opened-level.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const isJsonName = (value) =>
  typeof value === "string"
  && value.endsWith(".json")
  && !/[\\/]/u.test(value);

test("last-open storage keeps static and LAN histories independent", () => {
  const store = createLastOpenedLevelStore({
    storage: memoryStorage(),
    validateFileName: isJsonName,
  });

  assert.equal(store.write("static", "level_static.json"), true);
  assert.equal(store.write("lan", "level_lan.json"), true);
  assert.equal(store.read("static"), "level_static.json");
  assert.equal(store.read("lan"), "level_lan.json");
  store.clear("static");
  assert.equal(store.read("static"), "");
  assert.equal(store.read("lan"), "level_lan.json");
});

test("last-open storage rejects invalid names and survives unavailable storage", () => {
  const storage = memoryStorage();
  const store = createLastOpenedLevelStore({
    storage,
    validateFileName: isJsonName,
  });
  assert.equal(store.write("static", "../outside.json"), false);
  assert.equal(store.read("static"), "");

  const unavailable = createLastOpenedLevelStore({
    storage: {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    },
    validateFileName: isJsonName,
  });
  assert.doesNotThrow(() => unavailable.read("static"));
  assert.equal(unavailable.read("static"), "");
  assert.equal(unavailable.write("static", "level_safe.json"), false);
  assert.doesNotThrow(() => unavailable.clear("static"));
});
