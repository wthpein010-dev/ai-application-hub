import JSZip from "jszip";
import type { MindMapDocument, MindMapNode } from "./types.ts";

export function toMarkdown(document: MindMapDocument): string {
  const lines = [`# ${document.title}`, "", `> 类型：${document.kind} · 由思维导图快捷工具生成`, ""];
  const visit = (node: MindMapNode, depth: number) => {
    lines.push(`${"  ".repeat(Math.max(0, depth - 1))}- ${node.title}`);
    if (node.note) lines.push(`${"  ".repeat(depth)}${node.note}`);
    node.children.forEach((child) => visit(child, depth + 1));
  };
  document.root.children.forEach((child) => visit(child, 1));
  return `${lines.join("\n")}\n`;
}

function toXMindTopic(node: MindMapNode): Record<string, unknown> {
  return {
    id: node.id,
    title: node.title,
    ...(node.children.length ? { children: { attached: node.children.map(toXMindTopic) } } : {}),
  };
}

export async function buildXMindArchive(document: MindMapDocument): Promise<Uint8Array> {
  const zip = new JSZip();
  const sheetId = `sheet-${document.id}`;
  zip.file("content.json", JSON.stringify([{ id: sheetId, class: "sheet", title: document.title, rootTopic: { ...toXMindTopic(document.root), class: "topic" } }]));
  zip.file("metadata.json", JSON.stringify({ creator: { name: "思维导图快捷工具", version: "2.0" }, activeSheetId: sheetId }));
  zip.file("manifest.json", JSON.stringify({ "file-entries": { "content.json": {}, "metadata.json": {} } }));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function downloadText(text: string, filename: string) {
  downloadBlob(new Blob([text], { type: "text/markdown;charset=utf-8" }), filename);
}

export function downloadBinary(data: Uint8Array, filename: string, type: string) {
  const bytes = Uint8Array.from(data);
  downloadBlob(new Blob([bytes.buffer], { type }), filename);
}
