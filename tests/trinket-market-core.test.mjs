import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAcquisitionCounts,
  sortItems,
  validateItems,
} from "../projects/trinket-market/core/items.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = resolve(root, "projects", "trinket-market");
const canonical = JSON.parse(readFileSync(resolve(projectRoot, "data", "items.json"), "utf8"));

test("canonical catalog keeps 11 stable IDs with one bundled image each", () => {
  const items = validateItems(canonical);
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(new Set(items.map((item) => item.image)).size, 11);
  assert.equal(items.every((item) => existsSync(resolve(projectRoot, item.image))), true);
  assert.equal(items.every((item) => item.name && item.pinyin && item.rarity), true);
});

test("validation rejects duplicate IDs and invalid market values", () => {
  assert.throws(() => validateItems([{ ...canonical[0] }, { ...canonical[0] }]), /重复/);
  assert.throws(() => validateItems([{ ...canonical[0], acquired: -1 }]), /获得数量/);
  assert.throws(() => validateItems([{ ...canonical[0], value: Number.NaN }]), /估值/);
});

test("acquisition bridge updates known non-negative integer counts only", () => {
  const updated = applyAcquisitionCounts(canonical, { 1: 20000, 2: -1, 3: 3.5, 99: 7 });
  assert.equal(updated.find((item) => item.id === 1).acquired, 20000);
  assert.equal(updated.find((item) => item.id === 2).acquired, 9186);
  assert.equal(updated.find((item) => item.id === 3).acquired, 14270);
  assert.equal(updated.some((item) => item.id === 99), false);
  assert.notEqual(updated, canonical);
});

test("sorting supports IDs, names, counts, and a complete manual order", () => {
  const sample = canonical.slice(0, 4);
  assert.deepEqual(sortItems(sample, "id", "desc").map((item) => item.id), [4, 3, 2, 1]);
  assert.deepEqual(sortItems(sample, "name", "asc").map((item) => item.id), [1, 2, 4, 3]);
  assert.deepEqual(sortItems(sample, "acquired", "desc").map((item) => item.id), [1, 3, 2, 4]);
  assert.deepEqual(sortItems(sample, "manual", "asc", [3, 1, 4, 2]).map((item) => item.id), [3, 1, 4, 2]);
});

test("manual sorting appends IDs absent from a stale saved order", () => {
  const sample = canonical.slice(0, 4);
  assert.deepEqual(sortItems(sample, "manual", "asc", [3, 1]).map((item) => item.id), [3, 1, 2, 4]);
});
