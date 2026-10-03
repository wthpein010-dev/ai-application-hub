import assert from "node:assert/strict";
import test from "node:test";

import {
  addChild,
  addSibling,
  applyOperations,
  createStarterDocument,
  findNode,
  moveNode,
  removeNode,
  updateNode,
} from "../app/lib/mindmap.ts";
import { layoutDocument } from "../app/lib/layout.ts";
import { edgePath } from "../app/lib/edge-routing.ts";

test("tree edits keep immutable structure and preserve unique ids", () => {
  const original = createStarterDocument();
  const firstBranchId = original.root.children[0].id;
  const withChild = addChild(original, firstBranchId, "新增子项");

  assert.equal(original.root.children[0].children.length, 2);
  assert.equal(withChild.root.children[0].children.length, 3);
  assert.equal(withChild.root.children[0].children[2].title, "新增子项");

  const addedId = withChild.root.children[0].children[2].id;
  const renamed = updateNode(withChild, addedId, { title: "明确后的子项" });
  assert.equal(findNode(renamed.root, addedId)?.title, "明确后的子项");

  const sibling = addSibling(renamed, addedId, "同级事项");
  const titles = sibling.root.children[0].children.map((node) => node.title);
  assert.deepEqual(titles.slice(-2), ["明确后的子项", "同级事项"]);
  assert.equal(new Set(sibling.root.children[0].children.map((node) => node.id)).size, 4);
});

test("starter documents can use a deterministic seed for server hydration", () => {
  const options = { seed: "default-workspace", updatedAt: "2026-08-20T00:00:00.000Z" };
  const first = createStarterDocument("新品发布会策划", options);
  const second = createStarterDocument("新品发布会策划", options);

  assert.deepEqual(first, second);
  assert.equal(first.id, "map-default-workspace-1");
  assert.equal(first.root.id, "node-default-workspace-14");
});

test("removing a branch removes its full subtree but never the root", () => {
  const original = createStarterDocument();
  const branchId = original.root.children[1].id;
  const descendantId = original.root.children[1].children[0].id;
  const removed = removeNode(original, branchId);

  assert.equal(findNode(removed.root, branchId), undefined);
  assert.equal(findNode(removed.root, descendantId), undefined);
  assert.equal(removeNode(original, original.root.id), original);
});

test("moving a node rejects cycles and moves valid branches", () => {
  const original = createStarterDocument();
  const sourceId = original.root.children[0].id;
  const descendantId = original.root.children[0].children[0].id;
  const targetId = original.root.children[2].id;

  assert.equal(moveNode(original, sourceId, descendantId), original);

  const moved = moveNode(original, descendantId, targetId);
  assert.equal(findNode(moved.root, targetId)?.children.at(-1)?.id, descendantId);
  assert.equal(findNode(moved.root, sourceId)?.children.some((node) => node.id === descendantId), false);
});

test("automatic mind-map layout is deterministic and splits root branches", () => {
  const document = createStarterDocument();
  const layout = layoutDocument(document, { width: 1200, height: 720 });
  const root = layout.nodes.find((node) => node.id === document.root.id);
  const first = layout.nodes.find((node) => node.id === document.root.children[0].id);
  const second = layout.nodes.find((node) => node.id === document.root.children[1].id);
  const third = layout.nodes.find((node) => node.id === document.root.children[2].id);

  assert.deepEqual(root && { x: root.x, y: root.y }, { x: 600, y: 360 });
  assert.ok(first && first.x > 600);
  assert.ok(second && second.x < 600);
  assert.ok(third && third.x > 600);
  assert.equal(layout.edges.length, 12);
  assert.deepEqual(layoutDocument(document, { width: 1200, height: 720 }), layout);
});

test("all six XMind-style structures position every node without manual placement", () => {
  const base = createStarterDocument();
  for (const mode of ["mindmap", "right", "tree", "fishbone", "logic", "timeline"]) {
    const document = { ...base, layout: mode };
    const layout = layoutDocument(document, { width: 1500, height: 900 });
    assert.equal(layout.nodes.length, 13, `${mode} should keep every node`);
    assert.equal(layout.edges.length, 12, `${mode} should connect every non-root node`);
    assert.equal(new Set(layout.nodes.map((node) => `${node.x}:${node.y}`)).size, 13, `${mode} should assign distinct positions`);
  }
});

test("all six structures give sibling edges independent ports and curve-only routes", () => {
  const base = createStarterDocument();
  for (const mode of ["mindmap", "right", "tree", "fishbone", "logic", "timeline"]) {
    const document = { ...base, layout: mode };
    const layout = layoutDocument(document, { width: 1500, height: 900 });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const siblingStarts = new Map();

    for (const edge of layout.edges) {
      const path = edgePath(mode, nodes.get(edge.from), nodes.get(edge.to), edge);
      assert.match(path, /^M\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+C\s+/u, `${mode}:${edge.id} should use a curve`);
      assert.doesNotMatch(path, /\sL\s/u, `${mode}:${edge.id} must not contain a shareable straight segment`);
      const start = path.match(/^M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/u).slice(1).map(Number);
      const key = `${edge.from}:${edge.side}`;
      const values = siblingStarts.get(key) ?? [];
      values.push(start.map((value) => value.toFixed(2)).join(":"));
      siblingStarts.set(key, values);
    }

    for (const [parent, starts] of siblingStarts) {
      assert.equal(new Set(starts).size, starts.length, `${mode}:${parent} sibling routes must leave through unique ports`);
    }
  }
});

test("all six source layouts keep every curved route out of unrelated nodes", () => {
  const base = createStarterDocument();
  let cursor = base.root.children[0];
  cursor.title = "这是一条用于校准实际换行高度的中长策划分支标题".repeat(3);
  for (let depth = 0; depth < 4; depth += 1) {
    const child = { id: `route-deep-${depth}`, title: `第${depth + 1}层自动排版节点`.repeat(5), children: [] };
    cursor.children.push(child); cursor = child;
  }
  base.root.title = "这是一个需要多行完整显示并保持端口准确的中长策划主题名称";

  for (const mode of ["mindmap", "right", "tree", "fishbone", "logic", "timeline"]) {
    const layout = layoutDocument({ ...base, layout: mode }, { width: 1500, height: 900 });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      const samples = sampleCurvePath(edgePath(mode, nodes.get(edge.from), nodes.get(edge.to), edge));
      for (const node of layout.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;
        const rect = { left: node.x - node.width / 2 + 2, top: node.y - node.height / 2 + 2, right: node.x + node.width / 2 - 2, bottom: node.y + node.height / 2 - 2 };
        const crosses = samples.slice(0, -1).some((point, index) => segmentIntersectsRect(point, samples[index + 1], rect));
        assert.equal(crosses, false, `${mode}:${edge.id} should not pass through ${node.id}: ${edgePath(mode, nodes.get(edge.from), nodes.get(edge.to), edge)} :: ${JSON.stringify(rect)}`);
      }
    }
  }
});

test("all six source layouts keep curved routes from sharing a visible run", () => {
  const base = createStarterDocument();
  for (const mode of ["mindmap", "right", "tree", "fishbone", "logic", "timeline"]) {
    const layout = layoutDocument({ ...base, layout: mode }, { width: 1500, height: 900 });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const routes = layout.edges.map((edge) => ({
      id: edge.id,
      path: edgePath(mode, nodes.get(edge.from), nodes.get(edge.to), edge),
      samples: sampleCurvePath(edgePath(mode, nodes.get(edge.from), nodes.get(edge.to), edge)),
    }));
    for (let first = 0; first < routes.length; first += 1) {
      for (let second = first + 1; second < routes.length; second += 1) {
        assert.equal(pathsShareVisibleRun(routes[first].samples, routes[second].samples), false, `${mode}:${routes[first].id} must not overlap ${routes[second].id}: ${routes[first].path} :: ${routes[second].path}`);
      }
    }
  }
});

test("visible-run detection is independent of sampling phase", () => {
  const first = Array.from({ length: 12 }, (_, index) => ({ x: index * 2, y: 0 }));
  const shifted = Array.from({ length: 12 }, (_, index) => ({ x: index * 2 + .7, y: 0 }));
  const crossing = Array.from({ length: 12 }, (_, index) => ({ x: 10, y: index * 2 - 10 }));

  assert.equal(pathsShareVisibleRun(first, shifted), true, "the same visible segment must overlap even when sample points are phase shifted");
  assert.equal(pathsShareVisibleRun(first, crossing), false, "a single crossing is not a shared run");
});

test("all six structures keep a deep long-title map inside the computed canvas without overlaps", () => {
  const base = createStarterDocument();
  let cursor = base.root.children[0];
  cursor.title = "这是一条需要完整显示并自动排版的超长策划节点标题".repeat(4);
  for (let depth = 0; depth < 4; depth += 1) {
    const child = { id: `deep-${depth}`, title: `第${depth + 1}层深度节点`.repeat(8), children: [] };
    cursor.children.push(child);
    cursor = child;
  }

  for (const mode of ["mindmap", "right", "tree", "fishbone", "logic", "timeline"]) {
    const layout = layoutDocument({ ...base, layout: mode }, { width: 1500, height: 900 });
    for (const node of layout.nodes) {
      assert.ok(node.x - node.width / 2 >= 0, `${mode}:${node.id} exceeds the left edge`);
      assert.ok(node.y - node.height / 2 >= 0, `${mode}:${node.id} exceeds the top edge`);
      assert.ok(node.x + node.width / 2 <= layout.width, `${mode}:${node.id} exceeds the right edge`);
      assert.ok(node.y + node.height / 2 <= layout.height, `${mode}:${node.id} exceeds the bottom edge`);
    }
    for (let first = 0; first < layout.nodes.length; first += 1) {
      for (let second = first + 1; second < layout.nodes.length; second += 1) {
        const a = layout.nodes[first]; const b = layout.nodes[second];
        const overlaps = Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2;
        assert.equal(overlaps, false, `${mode}:${a.id}/${b.id} should not overlap`);
      }
    }
  }
});

test("set-layout operations persist any supported structure", () => {
  const document = createStarterDocument();
  const next = applyOperations(document, [{ type: "set-layout", layout: "fishbone" }]);
  assert.equal(next.layout, "fishbone");
});

function sampleCurvePath(path) {
  const tokens = path.match(/[MC]|-?\d+(?:\.\d+)?/gu); const samples = []; let index = 0; let current;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === "M") { current = { x: Number(tokens[index++]), y: Number(tokens[index++]) }; samples.push(current); continue; }
    assert.equal(command, "C", `unsupported path command in ${path}`);
    const c1 = { x: Number(tokens[index++]), y: Number(tokens[index++]) }; const c2 = { x: Number(tokens[index++]), y: Number(tokens[index++]) }; const end = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
    const controlLength = Math.hypot(c1.x - current.x, c1.y - current.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(end.x - c2.x, end.y - c2.y);
    const count = Math.max(2, Math.ceil(controlLength / 2));
    for (let step = 1; step <= count; step += 1) { const t = step / count; const inverse = 1 - t; samples.push({ x: inverse ** 3 * current.x + 3 * inverse ** 2 * t * c1.x + 3 * inverse * t ** 2 * c2.x + t ** 3 * end.x, y: inverse ** 3 * current.y + 3 * inverse ** 2 * t * c1.y + 3 * inverse * t ** 2 * c2.y + t ** 3 * end.y }); }
    current = end;
  }
  return samples;
}

function segmentIntersectsRect(a, b, rect) {
  let start = 0; let end = 1; const dx = b.x - a.x; const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - rect.left], [dx, rect.right - a.x], [-dy, a.y - rect.top], [dy, rect.bottom - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const ratio = q / p; if (p < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio); if (start > end) return false;
  }
  return true;
}

function pathsShareVisibleRun(first, second) {
  const cellSize = 2; const grid = new Map();
  second.slice(0, -1).forEach((point, index) => { for (const endpoint of [point, second[index + 1]]) { const key = `${Math.round(endpoint.x / cellSize)}:${Math.round(endpoint.y / cellSize)}`; grid.set(key, [...new Set([...(grid.get(key) ?? []), index])]); } });
  let sharedLength = 0;
  for (let index = 0; index < first.length - 1; index += 1) {
    const start = first[index]; const end = first[index + 1]; const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }; const cellX = Math.round(midpoint.x / cellSize); const cellY = Math.round(midpoint.y / cellSize); let parallelMatch = false;
    for (let x = cellX - 1; x <= cellX + 1 && !parallelMatch; x += 1) for (let y = cellY - 1; y <= cellY + 1 && !parallelMatch; y += 1) {
      for (const matchIndex of grid.get(`${x}:${y}`) ?? []) {
        const otherStart = second[matchIndex]; const otherEnd = second[matchIndex + 1];
        if (pointToSegmentDistance(midpoint, otherStart, otherEnd) > .35) continue;
        const firstDx = end.x - start.x; const firstDy = end.y - start.y; const secondDx = otherEnd.x - otherStart.x; const secondDy = otherEnd.y - otherStart.y;
        const cosine = Math.abs((firstDx * secondDx + firstDy * secondDy) / (Math.hypot(firstDx, firstDy) * Math.hypot(secondDx, secondDy) || 1));
        if (cosine > .995) { parallelMatch = true; break; }
      }
    }
    sharedLength = parallelMatch ? sharedLength + Math.hypot(end.x - start.x, end.y - start.y) : 0;
    if (sharedLength >= 12) return true;
  }
  return false;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x; const dy = end.y - start.y; const denominator = dx * dx + dy * dy;
  const ratio = denominator ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator)) : 0;
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}
