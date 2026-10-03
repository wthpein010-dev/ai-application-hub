"use client";
/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */

import {
  Boxes, Check, ChevronDown, Cloud, FileImage, FilePlus2, FileText,
  FolderClock, History, LayoutDashboard, Map, Menu, Redo2,
  Settings, Share2, Sparkles, Undo2, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatPanel, type ChatMessage } from "./ChatPanel";
import { MindMapCanvas } from "./MindMapCanvas";
import { SettingsPanel } from "./SettingsPanel";
import { askCustomAI, askHostedAI, toPersistentAISettings, type AISettings } from "../lib/ai-client";
import { interpretDemoMessage } from "../lib/demo-engine";
import { buildXMindArchive, downloadBinary, downloadText, toMarkdown } from "../lib/exporters";
import { addChild, applyOperations, createStarterDocument, findNode, moveNode, removeNode, updateNode } from "../lib/mindmap";
import { shareMindMap } from "../lib/view-actions";
import type { EngineResult, MindMapDocument, ThemeId } from "../lib/types";

const STORAGE_KEY = "planmap.projects.v1";
const SETTINGS_KEY = "planmap.ai-settings.v1";

const initialDocument = createStarterDocument("新品发布会策划", { seed: "starter", updatedAt: "2026-08-12T00:00:00.000Z" });
const initialMessages: ChatMessage[] = [
  { id: "welcome", role: "assistant", content: "第一版脑图已经就位。你可以直接说要改哪段文字、补什么内容，或把整张图切换成鱼骨、树状、横向等结构。" },
];

function loadProjects(): MindMapDocument[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as MindMapDocument[];
    return Array.isArray(parsed) && parsed.length ? parsed : [initialDocument];
  } catch { return [initialDocument]; }
}

function loadSettings(): AISettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AISettings>;
    return { mode: "demo", provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini", ...stored, apiKey: "" };
  } catch { return { mode: "demo", provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "" }; }
}

export function PlanMapApp() {
  const [projects, setProjects] = useState<MindMapDocument[]>([initialDocument]);
  const [document, setDocument] = useState<MindMapDocument>(initialDocument);
  const [history, setHistory] = useState<MindMapDocument[]>([]);
  const [future, setFuture] = useState<MindMapDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [settings, setSettings] = useState<AISettings>({ mode: "demo", provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState<{ result: EngineResult; label: string } | null>(null);
  const [exportSignal, setExportSignal] = useState<{ type: "png" | "pdf"; id: number } | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "map">("chat");
  const [canvasView, setCanvasView] = useState<"map" | "outline" | "present">("map");
  const [shareNotice, setShareNotice] = useState("");
  const shareNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loaded = loadProjects();
    setProjects(loaded);
    setDocument(loaded[0]);
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => {
      setProjects((current) => {
        const exists = current.some((item) => item.id === document.id);
        const next = exists ? current.map((item) => item.id === document.id ? document : item) : [document, ...current];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setSaved(true);
    }, 420);
    return () => clearTimeout(timer);
  }, [document]);

  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(toPersistentAISettings(settings))); }, [settings]);

  useEffect(() => () => { if (shareNoticeTimer.current) clearTimeout(shareNoticeTimer.current); }, []);

  const selectedNode = useMemo(() => selectedId ? findNode(document.root, selectedId) : undefined, [document, selectedId]);

  const commit = (next: MindMapDocument) => {
    if (next === document) return;
    setHistory((current) => [...current.slice(-39), document]);
    setFuture([]);
    setDocument(next);
  };

  const undo = () => {
    const previous = history.at(-1); if (!previous) return;
    setHistory((current) => current.slice(0, -1)); setFuture((current) => [document, ...current]); setDocument(previous); setSelectedId(null);
  };
  const redo = () => {
    const next = future[0]; if (!next) return;
    setFuture((current) => current.slice(1)); setHistory((current) => [...current, document]); setDocument(next); setSelectedId(null);
  };

  const applyResult = (result: EngineResult) => {
    const next = applyOperations(document, result.operations);
    commit(next);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply }]);
  };

  const sendMessage = async (message: string) => {
    if (!message.trim() || busy) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }, { id: "pending", role: "assistant", content: "", pending: true }]);
    setBusy(true);
    try {
      let result: EngineResult;
      if (settings.mode === "custom") result = await askCustomAI(message, document, selectedId, settings);
      else if (settings.mode === "hosted") result = await askHostedAI(message, document, selectedId);
      else {
        await new Promise((resolve) => setTimeout(resolve, 460));
        result = interpretDemoMessage(message, document, selectedId);
      }
      setMessages((current) => current.filter((item) => item.id !== "pending"));
      if (result.requiresConfirmation && result.operations.length) {
        setPending({ result, label: result.reply.replace(/请确认后应用。?$/, "") });
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.reply }]);
      } else applyResult(result);
    } catch (error) {
      setMessages((current) => [...current.filter((item) => item.id !== "pending"), { id: crypto.randomUUID(), role: "assistant", content: error instanceof Error ? error.message : "处理失败，请稍后重试。" }]);
    } finally { setBusy(false); }
  };

  const newProject = () => {
    const title = globalThis.prompt("新策划叫什么？", "新产品策划")?.trim(); if (!title) return;
    const next = createStarterDocument(title.endsWith("策划") ? title : `${title}策划`);
    setProjects((current) => [next, ...current]); setDocument(next); setHistory([]); setFuture([]); setSelectedId(null); setMessages(initialMessages); setProjectPanelOpen(false);
  };

  const switchProject = (project: MindMapDocument) => { setDocument(project); setHistory([]); setFuture([]); setSelectedId(null); setProjectPanelOpen(false); };

  const exportFile = async (type: "png" | "pdf" | "markdown" | "xmind") => {
    setExportOpen(false);
    if (type === "png" || type === "pdf") { setExportSignal({ type, id: Date.now() }); return; }
    if (type === "markdown") { downloadText(toMarkdown(document), `${document.title}.md`); return; }
    const archive = await buildXMindArchive(document);
    downloadBinary(archive, `${document.title}.xmind`, "application/vnd.xmind.workbook");
  };

  const shareDocument = async () => {
    try {
      const result = await shareMindMap({ title: document.title, text: toMarkdown(document) }, globalThis.navigator);
      if (result === "cancelled") return;
      const notice = result === "shared" ? "已打开系统分享面板" : result === "copied" ? "脑图大纲已复制" : "当前浏览器不支持分享或剪贴板";
      setShareNotice(notice);
    } catch {
      setShareNotice("分享失败，请使用导出功能");
    }
    if (shareNoticeTimer.current) clearTimeout(shareNoticeTimer.current);
    shareNoticeTimer.current = setTimeout(() => setShareNotice(""), 2800);
  };

  return (
    <main className={`app-shell theme-${document.theme}`}>
      <span className="sr-only">支持 Ollama、LM Studio、LocalAI 与 OpenAI 兼容模型</span>
      <header className="app-header">
        <button type="button" className="brand" onClick={() => setProjectPanelOpen(true)}><span className="brand-mark mind-ai-logo"><Map size={18} /><Sparkles size={11} /></span><span className="brand-name"><strong>思维导图快捷工具</strong><small>脑图 + AI</small></span><ChevronDown size={14} /></button>
        <div className="document-meta">
          <input value={document.title} onChange={(event) => setDocument((current) => ({ ...current, title: event.target.value, updatedAt: new Date().toISOString() }))} aria-label="脑图名称" />
          <span className={saved ? "saved" : "saving"}>{saved ? <><Check size={12} /> 已保存到本机</> : "正在保存…"}</span>
        </div>
        <div className="header-actions">
          <button type="button" className="icon-button" aria-label="撤销" onClick={undo} disabled={!history.length}><Undo2 size={18} /></button>
          <button type="button" className="icon-button" aria-label="重做" onClick={redo} disabled={!future.length}><Redo2 size={18} /></button>
          <span className="header-divider" />
          <button type="button" className="mode-pill" onClick={() => setSettingsOpen(true)}><Sparkles size={14} />{settings.mode === "demo" ? "演示模式" : settings.mode === "custom" ? settings.model || "开源模型" : "托管 AI"}</button>
          <button type="button" className="icon-button" aria-label="打开设置" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button>
          <button type="button" className="secondary-button share-button" onClick={() => void shareDocument()}><Share2 size={15} />分享</button>
        </div>
      </header>
      <div className={`share-status ${shareNotice ? "visible" : ""}`} role="status" aria-live="polite">{shareNotice}</div>

      <div className="mobile-tabs"><button className={mobileView === "chat" ? "active" : ""} onClick={() => setMobileView("chat")}><Sparkles size={15} />对话</button><button className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}><Map size={15} />脑图</button></div>
      <div className={`workspace mobile-${mobileView}`}>
        <ChatPanel messages={messages} selectedTitle={selectedNode?.title} pendingChange={pending ? { label: pending.label, apply: () => { applyResult(pending.result); setPending(null); }, cancel: () => setPending(null) } : null} busy={busy} onSend={sendMessage} onClearSelection={() => setSelectedId(null)} />
        <MindMapCanvas
          document={document}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRename={(id, title) => commit(updateNode(document, id, { title }))}
          onAddChild={(id) => commit(addChild(document, id, "待补充"))}
          onDelete={(id) => { commit(removeNode(document, id)); setSelectedId(null); }}
          onMove={(id, parentId) => commit(moveNode(document, id, parentId))}
          onStyle={(id, color) => commit(updateNode(document, id, { color }))}
          onExportOpen={() => setExportOpen(true)}
          onLayout={(layout) => commit({ ...document, layout, updatedAt: new Date().toISOString() })}
          exportSignal={exportSignal}
          view={canvasView}
          onView={setCanvasView}
        />
      </div>

      {projectPanelOpen && <div className="modal-backdrop project-backdrop" onMouseDown={() => setProjectPanelOpen(false)}><aside className="project-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">我的空间</span><h2>策划项目</h2></div><button className="icon-button" type="button" onClick={() => setProjectPanelOpen(false)}><X size={19} /></button></div><button type="button" className="new-project-button" onClick={newProject}><FilePlus2 size={17} />新建策划脑图</button><div className="project-list"><span>最近编辑</span>{projects.map((project) => <button type="button" className={project.id === document.id ? "active" : ""} key={project.id} onClick={() => switchProject(project)}><span className="project-icon"><Map size={16} /></span><span><strong>{project.title}</strong><small>{project.kind} · 本机保存</small></span>{project.id === document.id && <Check size={15} />}</button>)}</div><div className="drawer-nav"><button><LayoutDashboard size={16} />模板中心</button><button><FolderClock size={16} />最近打开</button><button><History size={16} />版本历史</button><button disabled><Cloud size={16} />云同步 <small>登录后开启</small></button></div></aside></div>}

      {exportOpen && <div className="popover-backdrop" onMouseDown={() => setExportOpen(false)}><div className="export-popover" onMouseDown={(event) => event.stopPropagation()}><div><span className="eyebrow">交付脑图</span><h3>选择导出格式</h3></div><button onClick={() => exportFile("png")}><FileImage size={18} /><span><strong>PNG 图片</strong><small>适合汇报和分享</small></span></button><button onClick={() => exportFile("pdf")}><FileText size={18} /><span><strong>PDF 文档</strong><small>适合打印和归档</small></span></button><button onClick={() => exportFile("markdown")}><Menu size={18} /><span><strong>Markdown 大纲</strong><small>保留完整层级结构</small></span></button><button onClick={() => exportFile("xmind")}><Boxes size={18} /><span><strong>XMind 文件</strong><small>可继续在 XMind 中编辑</small></span></button></div></div>}

      <SettingsPanel open={settingsOpen} settings={settings} theme={document.theme} layout={document.layout} onSettings={setSettings} onTheme={(theme: ThemeId) => commit({ ...document, theme })} onLayout={(layout) => commit({ ...document, layout })} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
