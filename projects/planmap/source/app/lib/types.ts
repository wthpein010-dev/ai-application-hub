export type ThemeId = "azure" | "teal" | "coral";
export type LayoutMode = "mindmap" | "right" | "tree" | "fishbone" | "logic" | "timeline";

export interface MindMapNode {
  id: string;
  title: string;
  note?: string;
  color?: string;
  collapsed?: boolean;
  children: MindMapNode[];
}

export interface MindMapDocument {
  id: string;
  title: string;
  kind: string;
  updatedAt: string;
  theme: ThemeId;
  layout: LayoutMode;
  root: MindMapNode;
}

export interface LayoutNode {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: -1 | 0 | 1;
  colorIndex: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  side: -1 | 1;
  colorIndex: number;
  siblingIndex: number;
  siblingCount: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export type MindMapOperation =
  | { type: "add-child"; parentId: string; title: string; children?: string[] }
  | { type: "rename"; nodeId: string; title: string }
  | { type: "delete"; nodeId: string }
  | { type: "set-layout"; layout: LayoutMode }
  | { type: "replace-document"; document: MindMapDocument };

export interface EngineResult {
  reply: string;
  operations: MindMapOperation[];
  requiresConfirmation?: boolean;
  suggestion?: string;
}
