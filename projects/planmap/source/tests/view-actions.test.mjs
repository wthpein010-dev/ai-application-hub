import assert from "node:assert/strict";
import test from "node:test";

const viewActions = await import("../app/lib/view-actions.ts").catch(() => ({}));

test("fit view centers a large map inside the available viewport", () => {
  assert.equal(typeof viewActions.calculateFitView, "function");
  assert.deepEqual(viewActions.calculateFitView({ width: 1500, height: 900 }, { width: 900, height: 600 }, 40), {
    scale: 0.5466666666666666,
    pan: { x: 40, y: 54 },
  });
});

test("fit view respects zoom bounds and ignores a hidden viewport", () => {
  assert.equal(typeof viewActions.calculateFitView, "function");
  assert.deepEqual(viewActions.calculateFitView({ width: 400, height: 300 }, { width: 1200, height: 800 }, 40), {
    scale: 1.45,
    pan: { x: 310, y: 182.5 },
  });
  assert.deepEqual(viewActions.calculateFitView({ width: 6000, height: 4000 }, { width: 500, height: 300 }, 40), {
    scale: 0.2,
    pan: { x: -350, y: -250 },
  });
  assert.equal(viewActions.calculateFitView({ width: 1500, height: 900 }, { width: 0, height: 0 }, 40), null);
});

test("fullscreen action enters and exits through the browser boundary", async () => {
  assert.equal(typeof viewActions.toggleFullscreen, "function");
  const calls = [];
  const target = { requestFullscreen: async () => calls.push("enter") };
  const browserDocument = { fullscreenElement: null, exitFullscreen: async () => calls.push("exit") };

  assert.equal(await viewActions.toggleFullscreen(target, browserDocument), true);
  browserDocument.fullscreenElement = target;
  assert.equal(await viewActions.toggleFullscreen(target, browserDocument), false);
  assert.deepEqual(calls, ["enter", "exit"]);
});

test("share action prefers native sharing and treats cancellation as non-error", async () => {
  assert.equal(typeof viewActions.shareMindMap, "function");
  let payload;
  const shared = await viewActions.shareMindMap(
    { title: "新品发布会策划", text: "# 新品发布会策划" },
    { share: async (value) => { payload = value; } },
  );
  assert.equal(shared, "shared");
  assert.deepEqual(payload, { title: "新品发布会策划", text: "# 新品发布会策划" });

  const cancelled = await viewActions.shareMindMap(
    { title: "测试", text: "测试" },
    { share: async () => { throw new DOMException("cancelled", "AbortError"); } },
  );
  assert.equal(cancelled, "cancelled");
});

test("share action copies the real outline when native sharing is unavailable or fails", async () => {
  assert.equal(typeof viewActions.shareMindMap, "function");
  const copies = [];
  const copied = await viewActions.shareMindMap(
    { title: "测试", text: "# 测试\n- 节点" },
    { clipboard: { writeText: async (value) => copies.push(value) } },
  );
  assert.equal(copied, "copied");

  const fallback = await viewActions.shareMindMap(
    { title: "测试", text: "# 测试\n- 节点" },
    { share: async () => { throw new Error("not available"); }, clipboard: { writeText: async (value) => copies.push(value) } },
  );
  assert.equal(fallback, "copied");
  assert.deepEqual(copies, ["# 测试\n- 节点", "# 测试\n- 节点"]);
  assert.equal(await viewActions.shareMindMap({ title: "测试", text: "测试" }, {}), "unsupported");
});

test("mind map capture exports the full untransformed layout without fetching fonts", async () => {
  assert.equal(typeof viewActions.captureMindMapImage, "function");
  const element = { id: "mindmap-stage" };
  const calls = [];
  const dataUrl = await viewActions.captureMindMapImage(
    element,
    { width: 2400, height: 1200 },
    "#f7f9fc",
    async (target, options) => {
      calls.push({ target, options });
      return "data:image/png;base64,planmap";
    },
  );

  assert.equal(dataUrl, "data:image/png;base64,planmap");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, element);
  assert.deepEqual(calls[0].options, {
    backgroundColor: "#f7f9fc",
    pixelRatio: 1.5,
    cacheBust: true,
    skipFonts: true,
    width: 2400,
    height: 1200,
    style: { transform: "none" },
  });
});

test("an export request is handled only once for each signal id", () => {
  assert.equal(typeof viewActions.shouldHandleExport, "function");
  const signal = { id: 42, type: "png" };
  assert.equal(viewActions.shouldHandleExport(null, signal), true);
  assert.equal(viewActions.shouldHandleExport(41, signal), true);
  assert.equal(viewActions.shouldHandleExport(42, signal), false);
  assert.equal(viewActions.shouldHandleExport(42, null), false);
});

test("automatic fit reacts to project or layout changes but not content edits", () => {
  assert.equal(typeof viewActions.autoFitKey, "function");
  assert.equal(viewActions.autoFitKey({ id: "project-a", layout: "mindmap" }), "project-a:mindmap");
  assert.equal(
    viewActions.autoFitKey({ id: "project-a", layout: "mindmap", title: "改名后" }),
    viewActions.autoFitKey({ id: "project-a", layout: "mindmap", title: "改名前" }),
  );
  assert.notEqual(
    viewActions.autoFitKey({ id: "project-a", layout: "tree" }),
    viewActions.autoFitKey({ id: "project-a", layout: "mindmap" }),
  );
  assert.notEqual(
    viewActions.autoFitKey({ id: "project-b", layout: "mindmap" }),
    viewActions.autoFitKey({ id: "project-a", layout: "mindmap" }),
  );
});
