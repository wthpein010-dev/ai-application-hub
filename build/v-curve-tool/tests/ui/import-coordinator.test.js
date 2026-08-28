import { describe, expect, it } from "vitest";
import { createImportCoordinator } from "../../src/ui/import-coordinator.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("import coordination", () => {
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
    slow.resolve("older-folder");
    await first;

    expect(commits).toEqual(["newer-folder"]);
  });
});
