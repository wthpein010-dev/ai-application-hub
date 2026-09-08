import { describe, expect, it } from "vitest";
import { createImportCoordinator } from "../../src/ui/import-coordinator.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("import coordination", () => {
  it("invalidates pending imports when a reference sample replaces the selection", async () => {
    const slow = deferred();
    const commits = [];
    const coordinator = createImportCoordinator(() => {});
    const pending = coordinator.start(() => slow.promise, result => commits.push(result));
    coordinator.invalidate?.();
    slow.resolve("obsolete");
    await pending;
    expect(commits).toEqual([]);
  });
  it("cancels active analysis immediately and only commits the latest delayed import", async () => {
    const slow = deferred();
    const fast = deferred();
    const commits = [];
    let cancelCalls = 0;
    const coordinator = createImportCoordinator(() => { cancelCalls += 1; });

    const first = coordinator.start(() => slow.promise, (result) => commits.push(result));
    expect(cancelCalls).toBe(1);

    const second = coordinator.start(() => fast.promise, (result) => commits.push(result));
    expect(cancelCalls).toBe(2);
    fast.resolve("newer-folder");
    await second;
    expect(cancelCalls).toBe(3);
    slow.resolve("older-folder");
    await first;

    expect(commits).toEqual(["newer-folder"]);
  });
});
