"use client";

import { ArrowUp, Bot, Check, ChevronRight, LoaderCircle, Sparkles, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  pending?: boolean;
}

interface PendingChange {
  label: string;
  apply: () => void;
  cancel: () => void;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  selectedTitle?: string;
  pendingChange?: PendingChange | null;
  busy: boolean;
  onSend: (message: string) => void;
  onClearSelection: () => void;
}

const quickPrompts = ["切换成鱼骨图", "把核心目标改成品牌破圈", "补充风险预案", "让结构更可执行"];

export function ChatPanel({ messages, selectedTitle, pendingChange, busy, onSend, onClearSelection }: ChatPanelProps) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingChange]);

  const submit = () => {
    const message = value.trim();
    if (!message || busy) return;
    onSend(message);
    setValue("");
  };

  return (
    <section className="chat-panel" aria-label="AI 对话区">
      <div className="panel-heading chat-heading">
        <div className="assistant-avatar"><Sparkles size={17} strokeWidth={2.4} /></div>
        <div>
          <h2>AI 脑图搭档</h2>
          <p><span className="online-dot" /> 可直接调整整张脑图</p>
        </div>
        <span className="beta-badge">智能共创</span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="guide-card">
          <span className="guide-icon"><Bot size={17} /></span>
          <div><strong>只管说想法，结构与排版交给我</strong><p>无需选择节点。可直接替换原文或切换鱼骨、树状、横向等结构。</p></div>
        </div>
        {messages.map((message) => (
          <div className={`message-row ${message.role}`} key={message.id}>
            <span className="message-avatar">{message.role === "assistant" ? <Sparkles size={15} /> : <User size={15} />}</span>
            <div className={`message-bubble ${message.pending ? "thinking" : ""}`}>
              {message.pending ? <><LoaderCircle size={15} className="spin" /> 正在分析策划结构…</> : message.content}
            </div>
          </div>
        ))}

        {pendingChange && (
          <div className="change-card">
            <span className="change-eyebrow">整体变更预览</span>
            <strong>{pendingChange.label}</strong>
            <p>当前脑图会进入历史记录，应用后仍可撤销。</p>
            <div className="change-actions">
              <button type="button" className="primary compact" onClick={pendingChange.apply}><Check size={15} />应用变更</button>
              <button type="button" className="ghost compact" onClick={pendingChange.cancel}><X size={15} />取消</button>
            </div>
          </div>
        )}

        <div className="quick-prompts">
          <span>试着这样说</span>
          {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => onSend(prompt)} disabled={busy}>{prompt}<ChevronRight size={13} /></button>)}
        </div>
      </div>

      <div className="composer-wrap">
        {selectedTitle && <div className="selection-chip"><span>@ {selectedTitle}</span><button type="button" onClick={onClearSelection} aria-label="取消选择节点"><X size={13} /></button></div>}
        <div className="composer">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
            }}
            placeholder={selectedTitle ? `告诉我怎么调整“${selectedTitle}”…` : "描述你的策划，或直接告诉我怎么调整整张脑图…"}
            rows={2}
          />
          <button className="send-button" type="button" onClick={submit} aria-label="发送消息" disabled={!value.trim() || busy}><ArrowUp size={18} /></button>
        </div>
        <p className="composer-hint">不必先选节点 · Enter 发送 · Shift + Enter 换行</p>
      </div>
    </section>
  );
}
