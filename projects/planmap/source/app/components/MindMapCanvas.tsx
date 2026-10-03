"use client";

import { CenterFocusStrong } from "@/app/icons";
import { Download, Edit3, Focus, Maximize2, Minimize2, Minus, Palette, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutDocument } from "../lib/layout";
import { edgePath } from "../lib/edge-routing";
import { autoFitKey, calculateFitView, captureMindMapImage, shouldHandleExport, toggleFullscreen } from "../lib/view-actions";
import type { LayoutMode, MindMapDocument } from "../lib/types";

interface MindMapCanvasProps {
  document: MindMapDocument;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, title: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, parentId: string) => void;
  onStyle: (id: string, color: string) => void;
  onExportOpen: () => void;
  onLayout: (layout: LayoutMode) => void;
  exportSignal: { type: "png" | "pdf"; id: number } | null;
  view: "map" | "outline" | "present";
  onView: (view: "map" | "outline" | "present") => void;
}

const branchColors = ["var(--branch-1)", "var(--branch-2)", "var(--branch-3)", "var(--branch-4)", "var(--branch-5)"];
const WIDTH = 1500;
const HEIGHT = 900;

const layouts: Array<{ id: LayoutMode; label: string }> = [
  { id: "mindmap", label: "左右脑图" }, { id: "right", label: "横向脑图" }, { id: "tree", label: "树状图" },
  { id: "fishbone", label: "鱼骨图" }, { id: "logic", label: "逻辑结构" }, { id: "timeline", label: "时间轴" },
];

export function MindMapCanvas({ document, selectedId, onSelect, onRename, onAddChild, onDelete, onMove, onStyle, onExportOpen, onLayout, exportSignal, view, onView }: MindMapCanvasProps) {
  const [scale, setScale] = useState(0.78);
  const [pan, setPan] = useState({ x: -165, y: -90 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [presentIndex, setPresentIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const exportRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const editingInputRef = useRef<HTMLInputElement>(null);
  const exportStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lastHandledExportId = useRef<number | null>(null);
  const layout = useMemo(() => layoutDocument(document, { width: WIDTH, height: HEIGHT }), [document]);
  const layoutRef = useRef(layout);
  const fitKey = autoFitKey(document);
  const nodeMap = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout]);

  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const next = calculateFitView(layoutRef.current, { width: bounds.width, height: bounds.height });
    if (!next) return;
    setScale(next.scale);
    setPan(next.pan);
  }, []);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      if (lastWidth && Math.abs(width - lastWidth) < 0.5 && Math.abs(height - lastHeight) < 0.5) return;
      lastWidth = width;
      lastHeight = height;
      fitView();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitView]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitView);
    return () => cancelAnimationFrame(frame);
  }, [fitKey, fitView]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(globalThis.document.fullscreenElement === viewportRef.current);
    globalThis.document.addEventListener("fullscreenchange", syncFullscreen);
    return () => globalThis.document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!editingId) return;
    editingInputRef.current?.focus();
    editingInputRef.current?.select();
  }, [editingId]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (exportStatusTimer.current) clearTimeout(exportStatusTimer.current);
  }, []);

  useEffect(() => {
    const target = exportRef.current;
    if (!target || !shouldHandleExport(lastHandledExportId.current, exportSignal)) return;
    const request = exportSignal;
    lastHandledExportId.current = request.id;
    if (exportStatusTimer.current) clearTimeout(exportStatusTimer.current);
    setExportStatus(`正在生成 ${request.type.toUpperCase()}…`);
    const showResult = (message: string) => {
      if (!mountedRef.current) return;
      setExportStatus(message);
      exportStatusTimer.current = setTimeout(() => {
        setExportStatus("");
        exportStatusTimer.current = null;
      }, 2600);
    };
    const run = async () => {
      try {
        const { toPng } = await import("html-to-image");
        const backgroundColor = getComputedStyle(documentElement()).getPropertyValue("--canvas-bg").trim() || "#f7f9fc";
        const dataUrl = await captureMindMapImage(target, layout, backgroundColor, toPng);
        if (request.type === "png") {
          const anchor = globalThis.document.createElement("a");
          anchor.href = dataUrl;
          anchor.download = `${document.title}.png`;
          anchor.click();
          showResult("PNG 已导出");
          return;
        }
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(dataUrl, "PNG", 8, 8, pageWidth - 16, pageHeight - 16, undefined, "FAST");
        pdf.save(`${document.title}.pdf`);
        showResult("PDF 已导出");
      } catch (error) {
        console.error("Mind map export failed", error);
        showResult(`${request.type.toUpperCase()} 导出失败，请重试`);
      }
    };
    void run();
  }, [exportSignal, document.title, layout]);

  const resetView = fitView;
  const beginEdit = (id: string, title: string) => { setEditingId(id); setDraft(title); };
  const finishEdit = () => { if (editingId && draft.trim()) onRename(editingId, draft.trim()); setEditingId(null); };
  const toggleCanvasFullscreen = async () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    await toggleFullscreen(viewport, globalThis.document);
  };

  return (
    <section className="canvas-panel" aria-label="脑图画布">
      <div className="canvas-heading">
        <div className="canvas-title"><strong>{document.title}</strong><span>{document.kind}</span></div>
        <div className="canvas-view-tabs" role="tablist" aria-label="作品视图">
          <button type="button" role="tab" aria-selected={view === "map"} tabIndex={view === "map" ? 0 : -1} className={view === "map" ? "active" : ""} onClick={() => onView("map")}>脑图视图</button>
          <button type="button" role="tab" aria-selected={view === "outline"} tabIndex={view === "outline" ? 0 : -1} className={view === "outline" ? "active" : ""} onClick={() => onView("outline")}>大纲模式</button>
          <button type="button" role="tab" aria-selected={view === "present"} tabIndex={view === "present" ? 0 : -1} className={view === "present" ? "active" : ""} onClick={() => onView("present")}>演示模式</button>
        </div>
        <div className="canvas-actions">
          <button className="secondary-button auto-layout" type="button" onClick={resetView}><RotateCcw size={15} />自动整理</button>
          <button className="primary export-button" type="button" onClick={onExportOpen}><Download size={16} />导出</button>
        </div>
      </div>
      <div className="canvas-layout-picker" aria-label="选择脑图结构">
        {layouts.map((item) => <button type="button" key={item.id} aria-pressed={document.layout === item.id} className={document.layout === item.id ? "active" : ""} onClick={() => onLayout(item.id)}><span className={`layout-mini layout-${item.id}`}><i /><i /><i /></span>{item.label}</button>)}
      </div>
      <div className={view === "map" ? "canvas-view active" : "canvas-view"}>
      <div
        ref={viewportRef}
        className={`canvas-viewport ${dragOrigin ? "dragging" : ""}`}
        onPointerDown={(event) => { if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("canvas-grid")) { setDragOrigin({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }); onSelect(null); } }}
        onPointerMove={(event) => { if (dragOrigin) setPan({ x: dragOrigin.panX + event.clientX - dragOrigin.x, y: dragOrigin.panY + event.clientY - dragOrigin.y }); }}
        onPointerUp={() => setDragOrigin(null)}
        onPointerLeave={() => setDragOrigin(null)}
        onWheel={(event) => { event.preventDefault(); setScale((current) => Math.max(0.2, Math.min(1.45, current - event.deltaY * 0.0007))); }}
      >
        <div className="canvas-grid" />
        <div className="mindmap-stage" ref={exportRef} style={{ width: layout.width, height: layout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
          <svg className="edge-layer" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.edges.map((edge) => {
              const from = nodeMap.get(edge.from); const to = nodeMap.get(edge.to); if (!from || !to) return null;
              return <path key={edge.id} d={edgePath(document.layout, from, to, edge)} stroke={branchColors[edge.colorIndex % branchColors.length]} data-parent={edge.from} data-child={edge.to} />;
            })}
          </svg>
          {layout.nodes.map((node) => {
            const selected = selectedId === node.id;
            const root = node.depth === 0;
            const sourceNode = findSource(document.root, node.id);
            const nodeColor = sourceNode?.color || branchColors[node.colorIndex % branchColors.length];
            return (
              <div
                key={node.id}
                className={`map-node ${root ? "root-node" : ""} ${selected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                style={{ left: node.x, top: node.y, width: node.width, height: node.height, "--node-color": nodeColor } as React.CSSProperties}
                draggable={!root && editingId !== node.id}
                onDragStart={(event) => { setDraggedId(node.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/planmap-node", node.id); }}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(event) => { if (draggedId && draggedId !== node.id) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
                onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/planmap-node") || draggedId; if (source && source !== node.id) onMove(source, node.id); setDraggedId(null); }}
                onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } if (event.key === "F2") beginEdit(node.id, node.title); }}
                onDoubleClick={() => beginEdit(node.id, node.title)}
              >
                {editingId === node.id ? <input ref={editingInputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={finishEdit} onKeyDown={(event) => { if (event.key === "Enter") finishEdit(); if (event.key === "Escape") setEditingId(null); }} /> : <span>{node.title}</span>}
                {!root && <i className="branch-bar" />}
                {selected && (
                  <div className="node-toolbar">
                    <button type="button" title="改名" onClick={(event) => { event.stopPropagation(); beginEdit(node.id, node.title); }}><Edit3 size={14} /></button>
                    <button type="button" title="添加子节点" onClick={(event) => { event.stopPropagation(); onAddChild(node.id); }}><Plus size={14} /></button>
                    <button type="button" title="切换节点颜色" onClick={(event) => { event.stopPropagation(); const palette = ["#2f80ed", "#7a67e8", "#12a594", "#ef8b43", "#e45d75"]; const index = sourceNode?.color ? palette.indexOf(sourceNode.color) : -1; onStyle(node.id, palette[(index + 1) % palette.length]); }}><Palette size={14} /></button>
                    {!root && <button type="button" title="删除节点" className="danger" onClick={(event) => { event.stopPropagation(); onDelete(node.id); }}><Trash2 size={14} /></button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="zoom-toolbar">
          <button type="button" aria-label="缩小画布" onClick={() => setScale((current) => Math.max(0.2, current - 0.1))}><Minus size={16} /></button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="放大画布" onClick={() => setScale((current) => Math.min(1.45, current + 0.1))}><Plus size={16} /></button>
          <i />
          <button type="button" aria-label="居中脑图" onClick={resetView}><Focus size={16} /></button>
          <button type="button" aria-label={fullscreen ? "退出全屏" : "全屏查看"} aria-pressed={fullscreen} onClick={() => void toggleCanvasFullscreen()}>{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        </div>
        <div className="mini-map" aria-hidden="true"><div className="mini-lines"><i /><i /><i /><i /><b /></div><span><CenterFocusStrong />画布导航</span></div>
        <div className="drag-hint">拖动节点到另一节点可重新连接</div>
      </div>
      </div>
      <div className={view === "outline" ? "canvas-view outline-view active" : "canvas-view outline-view"}>
        <div className="outline-card"><header><strong>大纲</strong><span>点击定位，双击改名</span></header>{outlineRows(document.root).map(({ node, depth }) => <div className={`outline-row ${selectedId === node.id ? "active" : ""}`} key={node.id} style={{ paddingLeft: 14 + depth * 24 }}>{editingId === node.id ? <input ref={editingInputRef} value={draft} aria-label={`编辑${node.title}`} onChange={(event) => setDraft(event.target.value)} onBlur={finishEdit} onKeyDown={(event) => { if (event.key === "Enter") finishEdit(); if (event.key === "Escape") setEditingId(null); }} /> : <button type="button" className="outline-node" onClick={() => onSelect(node.id)} onDoubleClick={() => beginEdit(node.id, node.title)}><i />{node.title}<small>{node.children.length ? `${node.children.length} 项` : ""}</small></button>}<button type="button" className="outline-edit" aria-label={`重命名${node.title}`} onClick={() => beginEdit(node.id, node.title)}><Edit3 size={14} /></button></div>)}</div>
      </div>
      <div className={view === "present" ? "canvas-view present-view active" : "canvas-view present-view"}>
        {(() => { const branches = document.root.children.length ? document.root.children : [document.root]; const index = Math.min(presentIndex, branches.length - 1); const branch = branches[index]; return <article className="present-card"><small>{index + 1} / {branches.length}</small><h2>{branch.title}</h2><ul>{(branch.children.length ? branch.children : [branch]).map((item) => <li key={item.id}>{item.title}</li>)}</ul><footer><button type="button" disabled={!index} onClick={() => setPresentIndex(Math.max(0, index - 1))}>← 上一页</button><button type="button" className="primary" disabled={index === branches.length - 1} onClick={() => setPresentIndex(Math.min(branches.length - 1, index + 1))}>下一页 →</button></footer></article>; })()}
      </div>
      <div className={exportStatus ? "canvas-export-status visible" : "canvas-export-status"} role="status" aria-live="polite" aria-atomic="true">{exportStatus}</div>
    </section>
  );
}

function documentElement() {
  return globalThis.document?.documentElement;
}

function findSource(root: MindMapDocument["root"], id: string): MindMapDocument["root"] | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findSource(child, id);
    if (match) return match;
  }
  return undefined;
}

function outlineRows(root: MindMapDocument["root"], depth = 0): Array<{ node: MindMapDocument["root"]; depth: number }> {
  return [{ node: root, depth }, ...root.children.flatMap((child) => outlineRows(child, depth + 1))];
}
