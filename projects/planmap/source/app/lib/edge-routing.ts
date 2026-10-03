import type { LayoutEdge, LayoutMode, LayoutNode } from "./types.ts";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function portOffset(index: number, count: number, extent: number): number {
  if (count <= 1) return 0;
  const usable = Math.max(0, extent - 18);
  return -usable / 2 + usable * index / (count - 1);
}

export function edgePath(layout: LayoutMode, from: LayoutNode, to: LayoutNode, edge: Pick<LayoutEdge, "siblingIndex" | "siblingCount">): string {
  if (layout === "tree") {
    const startX = from.x + portOffset(edge.siblingIndex, edge.siblingCount, from.width);
    const startY = from.y + from.height / 2;
    const endX = to.x;
    const endY = to.y - to.height / 2;
    const curve = Math.max(28, Math.min(96, Math.abs(endY - startY) * 0.52));
    return `M ${round(startX)} ${round(startY)} C ${round(startX)} ${round(startY + curve)}, ${round(endX)} ${round(endY - curve)}, ${round(endX)} ${round(endY)}`;
  }

  if (layout === "timeline") {
    if (from.depth === 0 && to.depth === 1) {
      const startX = from.x + portOffset(edge.siblingIndex, edge.siblingCount, from.width);
      const startY = from.y - from.height / 2;
      const endX = to.x;
      const endY = to.y - to.height / 2;
      const laneY = startY - (24 + edge.siblingIndex * 12);
      return `M ${round(startX)} ${round(startY)} C ${round(startX)} ${round(laneY)}, ${round(startX)} ${round(laneY)}, ${round(startX)} ${round(laneY)} C ${round(startX)} ${round(laneY)}, ${round(endX)} ${round(laneY)}, ${round(endX)} ${round(laneY)} C ${round(endX)} ${round(laneY)}, ${round(endX)} ${round(endY)}, ${round(endX)} ${round(endY)}`;
    }
    const direction = to.y >= from.y ? 1 : -1;
    const startX = from.x + portOffset(edge.siblingIndex, edge.siblingCount, from.width);
    const startY = from.y + direction * from.height / 2;
    const endX = to.x;
    const endY = to.y - direction * to.height / 2;
    const laneY = startY + direction * (20 + edge.siblingIndex * 10);
    return `M ${round(startX)} ${round(startY)} C ${round(startX)} ${round(laneY)}, ${round(startX)} ${round(laneY)}, ${round(startX)} ${round(laneY)} C ${round(startX)} ${round(laneY)}, ${round(endX)} ${round(laneY)}, ${round(endX)} ${round(laneY)} C ${round(endX)} ${round(laneY)}, ${round(endX)} ${round(endY)}, ${round(endX)} ${round(endY)}`;
  }

  if (layout === "fishbone") {
    const direction = to.y < from.y ? -1 : 1;
    const startX = from.depth === 0 ? from.x + portOffset(edge.siblingIndex, edge.siblingCount, from.width) : from.x + from.width / 2;
    const startY = from.depth === 0 ? from.y + direction * from.height / 2 : from.y + portOffset(edge.siblingIndex, edge.siblingCount, from.height);
    const endX = to.x - to.width / 2;
    const endY = to.y;
    const laneX = from.depth === 0 ? endX - 28 - edge.siblingIndex * 4 : Math.min(endX - 18, startX + 12 + edge.siblingIndex * 8);
    if (from.depth === 0) {
      const laneY = startY + direction * (24 + edge.siblingIndex * 12);
      return `M ${round(startX)} ${round(startY)} C ${round(startX)} ${round(laneY)}, ${round(startX)} ${round(laneY)}, ${round(startX)} ${round(laneY)} C ${round(startX)} ${round(laneY)}, ${round(laneX)} ${round(laneY)}, ${round(laneX)} ${round(laneY)} C ${round(laneX)} ${round(laneY)}, ${round(laneX)} ${round(endY)}, ${round(laneX)} ${round(endY)} C ${round(laneX)} ${round(endY)}, ${round(endX)} ${round(endY)}, ${round(endX)} ${round(endY)}`;
    }
    return `M ${round(startX)} ${round(startY)} C ${round(laneX)} ${round(startY)}, ${round(laneX)} ${round(startY)}, ${round(laneX)} ${round(startY)} C ${round(laneX)} ${round(startY)}, ${round(laneX)} ${round(endY)}, ${round(laneX)} ${round(endY)} C ${round(laneX)} ${round(endY)}, ${round(endX)} ${round(endY)}, ${round(endX)} ${round(endY)}`;
  }

  const direction = to.x >= from.x ? 1 : -1;
  const startX = from.x + direction * from.width / 2;
  const startY = from.y + portOffset(edge.siblingIndex, edge.siblingCount, from.height);
  const endX = to.x - direction * to.width / 2;
  const endY = to.y;
  const curve = Math.max(30, Math.min(118, Math.abs(endX - startX) * 0.5));
  return `M ${round(startX)} ${round(startY)} C ${round(startX + direction * curve)} ${round(startY)}, ${round(endX - direction * curve)} ${round(endY)}, ${round(endX)} ${round(endY)}`;
}
