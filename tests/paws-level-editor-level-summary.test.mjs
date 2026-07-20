import test from "node:test";
import assert from "node:assert/strict";

test("level summary formatting never exposes undefined ids or invalid dates", async () => {
  const { formatLevelId, formatLevelModifiedAt } = await import(
    "../projects/paws-level-editor/ui/level-summary.mjs"
  );

  assert.equal(formatLevelId({ id: 9001 }), "#9001");
  assert.equal(formatLevelId({}), "未编号");
  assert.equal(formatLevelId({ id: undefined }), "未编号");
  assert.equal(formatLevelId({ id: null, broken: true }), "BROKEN");
  assert.equal(formatLevelModifiedAt("2026-07-20T00:00:00.000Z"), "07/20");
  assert.equal(formatLevelModifiedAt(undefined), "日期未知");
  assert.equal(formatLevelModifiedAt("not-a-date"), "日期未知");
});
