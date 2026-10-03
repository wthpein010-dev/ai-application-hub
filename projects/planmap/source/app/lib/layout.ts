import type { LayoutEdge, LayoutNode, LayoutResult, MindMapDocument, MindMapNode } from "./types.ts";

const NODE_GAP = 28;
const LEVEL_GAP = 66;
const MARGIN = 72;

function nodeWidth(title: string, depth: number): number {
  const base = Math.max(104, Math.min(204, 46 + [...title].length * 16));
  return depth === 0 ? Math.max(base, 166) : base;
}

function nodeHeight(title: string, depth: number): number {
  const width = nodeWidth(title, depth);
  const fontSize = depth === 0 ? 17 : 14;
  const charactersPerLine = Math.max(4, Math.floor((width - 26) / fontSize));
  const lines = Math.max(1, Math.ceil([...title].length / charactersPerLine));
  return Math.max(depth === 0 ? 54 : 42, 20 + lines * (depth === 0 ? 24 : 22));
}

function visibleChildren(node: MindMapNode): MindMapNode[] {
  return node.collapsed ? [] : node.children;
}

function maxDepth(node: MindMapNode, depth = 0): number {
  return visibleChildren(node).reduce((value, child) => Math.max(value, maxDepth(child, depth + 1)), depth);
}

function finish(nodes: LayoutNode[], edges: LayoutEdge[], viewport: { width: number; height: number }): LayoutResult {
  const outgoing = new Map<string, LayoutEdge[]>();
  edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]));
  outgoing.forEach((siblings) => siblings.forEach((edge, index) => { edge.siblingIndex = index; edge.siblingCount = siblings.length; }));
  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const shiftX = minX < MARGIN ? MARGIN - minX : 0;
  const shiftY = minY < MARGIN ? MARGIN - minY : 0;
  if (shiftX || shiftY) nodes.forEach((node) => { node.x += shiftX; node.y += shiftY; });
  const maxX = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));
  return { nodes, edges, width: Math.max(viewport.width, Math.ceil(maxX + MARGIN)), height: Math.max(viewport.height, Math.ceil(maxY + MARGIN)) };
}

export function layoutDocument(document: MindMapDocument, viewport: { width: number; height: number }): LayoutResult {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const root = document.root;
  const add = (current: MindMapNode, depth: number, x: number, y: number, side: -1 | 0 | 1, colorIndex: number, parentId?: string) => {
    nodes.push({ id: current.id, title: current.title, x, y, width: nodeWidth(current.title, depth), height: nodeHeight(current.title, depth), depth, side, colorIndex });
    if (parentId) edges.push({ id: `${parentId}:${current.id}`, from: parentId, to: current.id, side: side || 1, colorIndex, siblingIndex: 0, siblingCount: 1 });
  };

  if (document.layout === "timeline") {
    const branches = visibleChildren(root);
    const levelHeights = new Map<number, number>();
    const scanHeights = (current: MindMapNode, depth: number) => {
      levelHeights.set(depth, Math.max(levelHeights.get(depth) ?? 0, nodeHeight(current.title, depth)));
      visibleChildren(current).forEach((child) => scanHeights(child, depth + 1));
    };
    branches.forEach((branch) => scanHeights(branch, 1));

    const topRowHeight = Math.max(nodeHeight(root.title, 0), levelHeights.get(1) ?? 0);
    const topRow = MARGIN + 32 + Math.max(0, branches.length - 1) * 12;
    const levelTops = new Map<number, number>([[1, topRow]]);
    let levelTop = topRow + topRowHeight + LEVEL_GAP;
    for (let depth = 2; depth <= maxDepth(root); depth += 1) {
      levelTops.set(depth, levelTop);
      levelTop += (levelHeights.get(depth) ?? 42) + LEVEL_GAP;
    }

    const subtreeWidth = (current: MindMapNode, depth: number): number => {
      const own = nodeWidth(current.title, depth) + NODE_GAP;
      const children = visibleChildren(current);
      const childrenWidth = children.reduce((sum, child) => sum + subtreeWidth(child, depth + 1), 0);
      return Math.max(own, childrenWidth);
    };
    const rootWidth = nodeWidth(root.title, 0);
    add(root, 0, MARGIN + rootWidth / 2, topRow + nodeHeight(root.title, 0) / 2, 0, 0);
    let branchLeft = MARGIN + rootWidth + 86;
    const place = (current: MindMapNode, depth: number, left: number, colorIndex: number, parentId: string): number => {
      const span = subtreeWidth(current, depth);
      const children = visibleChildren(current);
      const childrenWidth = children.reduce((sum, child) => sum + subtreeWidth(child, depth + 1), 0);
      let center = left + span / 2;
      if (children.length) {
        let childLeft = left + (span - childrenWidth) / 2;
        const childCenters = children.map((child) => {
          const childCenter = place(child, depth + 1, childLeft, colorIndex, current.id);
          childLeft += subtreeWidth(child, depth + 1);
          return childCenter;
        });
        center = (childCenters[0] + childCenters.at(-1)!) / 2;
      }
      add(current, depth, center, (levelTops.get(depth) ?? levelTop) + nodeHeight(current.title, depth) / 2, 1, colorIndex, parentId);
      return center;
    };
    branches.forEach((branch, index) => {
      place(branch, 1, branchLeft, index, root.id);
      branchLeft += subtreeWidth(branch, 1) + 52;
    });
    return finish(nodes, edges, viewport);
  }

  if (document.layout === "fishbone") {
    const topHeights: number[] = []; const bottomHeights: number[] = [];
    visibleChildren(root).forEach((branch, index) => {
      const target = index % 2 === 0 ? topHeights : bottomHeights;
      const descendants: Array<{ node: MindMapNode; depth: number; parentId?: string }> = [{ node: branch, depth: 1 }];
      const collect = (current: MindMapNode, depth: number) => visibleChildren(current).forEach((child) => { descendants.push({ node: child, depth, parentId: current.id }); collect(child, depth + 1); });
      collect(branch, 2);
      target.push(descendants.reduce((sum, item) => sum + nodeHeight(item.node.title, item.depth) + NODE_GAP, 0));
    });
    const spineY = MARGIN + Math.max(120, ...topHeights, 0);
    add(root, 0, MARGIN + nodeWidth(root.title, 0) / 2, spineY, 0, 0);
    let cursorX = MARGIN + nodeWidth(root.title, 0) + 120;
    const routeCorridor = nodeHeight(root.title, 0) / 2 + 48 + Math.max(0, visibleChildren(root).length - 1) * 12;
    visibleChildren(root).forEach((branch, index) => {
      const side = (index % 2 === 0 ? -1 : 1) as -1 | 1;
      const items: Array<{ node: MindMapNode; depth: number; parentId: string }> = [{ node: branch, depth: 1, parentId: root.id }];
      const collect = (current: MindMapNode, depth: number) => visibleChildren(current).forEach((child) => { items.push({ node: child, depth, parentId: current.id }); collect(child, depth + 1); });
      collect(branch, 2);
      const widthsByDepth = new Map<number, number>();
      items.forEach((item) => widthsByDepth.set(item.depth, Math.max(widthsByDepth.get(item.depth) ?? 0, nodeWidth(item.node.title, item.depth))));
      const xByDepth = new Map<number, number>(); let depthCursor = cursorX;
      for (let depth = 1; depth <= maxDepth(branch, 1); depth += 1) { const width = widthsByDepth.get(depth) ?? 92; xByDepth.set(depth, depthCursor + width / 2); depthCursor += width + LEVEL_GAP; }
      let distance = routeCorridor;
      items.forEach((item) => { const height = nodeHeight(item.node.title, item.depth); distance += height / 2; add(item.node, item.depth, xByDepth.get(item.depth)!, spineY + side * distance, side, index, item.parentId); distance += height / 2 + NODE_GAP; });
      cursorX = depthCursor + 84;
    });
    return finish(nodes, edges, viewport);
  }

  const tree = document.layout === "tree";
  const logic = document.layout === "logic";
  const rightOnly = document.layout === "right" || logic;
  if (tree) {
    const levelHeights = new Map<number, number>();
    const scan = (current: MindMapNode, depth: number) => { levelHeights.set(depth, Math.max(levelHeights.get(depth) ?? 0, nodeHeight(current.title, depth))); visibleChildren(current).forEach((child) => scan(child, depth + 1)); };
    scan(root, 0);
    const yByDepth = new Map<number, number>(); let yCursor = MARGIN;
    for (let depth = 0; depth <= maxDepth(root); depth += 1) { const height = levelHeights.get(depth) ?? 38; yByDepth.set(depth, yCursor + height / 2); yCursor += height + LEVEL_GAP; }
    const subtreeWidth = (current: MindMapNode, depth: number): number => { const own = nodeWidth(current.title, depth) + NODE_GAP; const children = visibleChildren(current); return children.length ? Math.max(own, children.reduce((sum, child) => sum + subtreeWidth(child, depth + 1), 0)) : own; };
    const place = (current: MindMapNode, depth: number, left: number, colorIndex: number, parentId?: string): number => {
      const span = subtreeWidth(current, depth); const children = visibleChildren(current); let center = left + span / 2;
      if (children.length) { let childLeft = left; const centers = children.map((child) => { const childCenter = place(child, depth + 1, childLeft, colorIndex, current.id); childLeft += subtreeWidth(child, depth + 1); return childCenter; }); center = (centers[0] + centers.at(-1)!) / 2; }
      add(current, depth, center, yByDepth.get(depth)!, depth ? 1 : 0, colorIndex, parentId); return center;
    };
    place(root, 0, MARGIN, 0);
    visibleChildren(root).forEach((branch, index) => nodes.filter((node) => node.id === branch.id).forEach((node) => { node.colorIndex = index; }));
    return finish(nodes, edges, viewport);
  }

  const depthWidths = new Map<number, number>();
  const scanWidths = (current: MindMapNode, depth: number) => { depthWidths.set(depth, Math.max(depthWidths.get(depth) ?? 0, nodeWidth(current.title, depth))); visibleChildren(current).forEach((child) => scanWidths(child, depth + 1)); };
  scanWidths(root, 0);
  const xOffsets = new Map<number, number>([[0, 0]]); let offset = 0;
  for (let depth = 1; depth <= maxDepth(root); depth += 1) { offset += (depthWidths.get(depth - 1) ?? 92) / 2 + LEVEL_GAP + (depthWidths.get(depth) ?? 92) / 2; xOffsets.set(depth, offset); }
  const subtreeHeight = (current: MindMapNode, depth: number): number => { const own = nodeHeight(current.title, depth); const children = visibleChildren(current); return children.length ? Math.max(own, children.reduce((sum, child) => sum + subtreeHeight(child, depth + 1), 0) + NODE_GAP * (children.length - 1)) : own; };
  const branches = visibleChildren(root); const sides = branches.map((_, index) => (rightOnly || index % 2 === 0 ? 1 : -1) as -1 | 1);
  const leftWidth = rightOnly ? 0 : offset; const rootX = rightOnly ? MARGIN + nodeWidth(root.title, 0) / 2 : Math.max(viewport.width / 2, MARGIN + leftWidth + nodeWidth(root.title, 0) / 2); const rootY = Math.max(viewport.height / 2, MARGIN + Math.max(...[-1, 1].map((side) => branches.filter((_, index) => sides[index] === side).reduce((sum, child) => sum + subtreeHeight(child, 1) + NODE_GAP, 0)), 0) / 2);
  add(root, 0, rootX, rootY, 0, 0);
  const placeSide = (side: -1 | 1) => {
    const sideBranches = branches.map((branch, index) => ({ branch, index })).filter((_, index) => sides[index] === side);
    const total = sideBranches.reduce((sum, item) => sum + subtreeHeight(item.branch, 1), 0) + NODE_GAP * Math.max(0, sideBranches.length - 1); let cursorY = rootY - total / 2;
    const place = (current: MindMapNode, depth: number, colorIndex: number, parentId: string): number => { const span = subtreeHeight(current, depth); const children = visibleChildren(current); const center = cursorY + span / 2; add(current, depth, rootX + side * xOffsets.get(depth)!, center, side, colorIndex, parentId); if (children.length) { const start = cursorY; children.forEach((child) => { place(child, depth + 1, colorIndex, current.id); cursorY += NODE_GAP; }); cursorY = Math.max(cursorY, start + span); } else cursorY += span; return center; };
    sideBranches.forEach(({ branch, index }, position) => { place(branch, 1, index, root.id); if (position < sideBranches.length - 1) cursorY += NODE_GAP; });
  };
  if (!rightOnly) placeSide(-1); placeSide(1);
  return finish(nodes, edges, viewport);
}
