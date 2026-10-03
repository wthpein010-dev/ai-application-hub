import type { MindMapDocument, MindMapNode, MindMapOperation } from "./types.ts";

let idCounter = 0;

export function createId(prefix = "node"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

function node(title: string, children: MindMapNode[] = []): MindMapNode {
  return { id: createId(), title, children };
}

interface StarterDocumentOptions {
  seed?: string;
  updatedAt?: string;
}

export function createStarterDocument(title = "新品发布会策划", options: StarterDocumentOptions = {}): MindMapDocument {
  let seededCounter = 0;
  const nextId = (prefix = "node") => {
    if (!options.seed) return createId(prefix);
    seededCounter += 1;
    return `${prefix}-${options.seed}-${seededCounter}`;
  };
  const starterNode = (nodeTitle: string, children: MindMapNode[] = []): MindMapNode => ({ id: nextId(), title: nodeTitle, children });
  return {
    id: nextId("map"),
    title,
    kind: "活动策划",
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    theme: "azure",
    layout: "mindmap",
    root: starterNode(title.replace(/策划$/, ""), [
      starterNode("目标与主题", [starterNode("核心目标"), starterNode("主题概念")]),
      starterNode("受众洞察", [starterNode("核心人群"), starterNode("关键需求")]),
      starterNode("传播节奏", [starterNode("预热阶段"), starterNode("引爆阶段")]),
      starterNode("现场流程", [starterNode("开场亮点"), starterNode("核心环节")]),
    ]),
  };
}

export function findNode(root: MindMapNode, id: string): MindMapNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function flattenTree(root: MindMapNode): MindMapNode[] {
  return [root, ...root.children.flatMap(flattenTree)];
}

function mapNode(root: MindMapNode, id: string, transform: (node: MindMapNode) => MindMapNode): MindMapNode {
  if (root.id === id) return transform(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = mapNode(child, id, transform);
    changed ||= next !== child;
    return next;
  });
  return changed ? { ...root, children } : root;
}

function touch(document: MindMapDocument, root: MindMapNode): MindMapDocument {
  return root === document.root ? document : { ...document, root, updatedAt: new Date().toISOString() };
}

export function addChild(document: MindMapDocument, parentId: string, title = "新节点"): MindMapDocument {
  if (!findNode(document.root, parentId)) return document;
  const child = node(title);
  return touch(document, mapNode(document.root, parentId, (parent) => ({ ...parent, collapsed: false, children: [...parent.children, child] })));
}

function addSiblingNode(root: MindMapNode, nodeId: string, title: string): [MindMapNode, boolean] {
  const index = root.children.findIndex((child) => child.id === nodeId);
  if (index >= 0) {
    const children = [...root.children];
    children.splice(index + 1, 0, node(title));
    return [{ ...root, children }, true];
  }
  for (let index = 0; index < root.children.length; index += 1) {
    const [next, changed] = addSiblingNode(root.children[index], nodeId, title);
    if (changed) {
      const children = [...root.children];
      children[index] = next;
      return [{ ...root, children }, true];
    }
  }
  return [root, false];
}

export function addSibling(document: MindMapDocument, nodeId: string, title = "新节点"): MindMapDocument {
  if (nodeId === document.root.id) return document;
  const [root, changed] = addSiblingNode(document.root, nodeId, title);
  return changed ? touch(document, root) : document;
}

export function updateNode(document: MindMapDocument, nodeId: string, patch: Partial<Omit<MindMapNode, "id" | "children">>): MindMapDocument {
  return touch(document, mapNode(document.root, nodeId, (current) => ({ ...current, ...patch })));
}

function removeFromTree(root: MindMapNode, nodeId: string): [MindMapNode, MindMapNode | undefined] {
  const direct = root.children.find((child) => child.id === nodeId);
  if (direct) return [{ ...root, children: root.children.filter((child) => child.id !== nodeId) }, direct];
  for (let index = 0; index < root.children.length; index += 1) {
    const [next, removed] = removeFromTree(root.children[index], nodeId);
    if (removed) {
      const children = [...root.children];
      children[index] = next;
      return [{ ...root, children }, removed];
    }
  }
  return [root, undefined];
}

export function removeNode(document: MindMapDocument, nodeId: string): MindMapDocument {
  if (nodeId === document.root.id) return document;
  const [root, removed] = removeFromTree(document.root, nodeId);
  return removed ? touch(document, root) : document;
}

export function moveNode(document: MindMapDocument, nodeId: string, newParentId: string): MindMapDocument {
  if (nodeId === document.root.id || nodeId === newParentId) return document;
  const moving = findNode(document.root, nodeId);
  const target = findNode(document.root, newParentId);
  if (!moving || !target || findNode(moving, newParentId)) return document;
  const [without, removed] = removeFromTree(document.root, nodeId);
  if (!removed) return document;
  const root = mapNode(without, newParentId, (parent) => ({ ...parent, children: [...parent.children, removed] }));
  return touch(document, root);
}

export function applyOperations(document: MindMapDocument, operations: MindMapOperation[]): MindMapDocument {
  return operations.reduce((current, operation) => {
    if (operation.type === "replace-document") return operation.document;
    if (operation.type === "set-layout") return { ...current, layout: operation.layout, updatedAt: new Date().toISOString() };
    if (operation.type === "rename") return updateNode(current, operation.nodeId, { title: operation.title });
    if (operation.type === "delete") return removeNode(current, operation.nodeId);
    let next = addChild(current, operation.parentId, operation.title);
    const parent = findNode(next.root, operation.parentId);
    const added = parent?.children.at(-1);
    for (const childTitle of operation.children ?? []) {
      if (added) next = addChild(next, added.id, childTitle);
    }
    return next;
  }, document);
}
