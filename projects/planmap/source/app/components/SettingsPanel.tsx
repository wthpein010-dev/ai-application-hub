"use client";
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */

import { Check, Cloud, KeyRound, Palette, Sparkles, X } from "lucide-react";
import { providerDefaults, settingsForProvider, type AISettings } from "../lib/ai-client";
import type { LayoutMode, ThemeId } from "../lib/types";

interface SettingsPanelProps {
  open: boolean;
  settings: AISettings;
  theme: ThemeId;
  layout: LayoutMode;
  onSettings: (settings: AISettings) => void;
  onTheme: (theme: ThemeId) => void;
  onLayout: (layout: LayoutMode) => void;
  onClose: () => void;
}

const themes: Array<{ id: ThemeId; name: string; color: string }> = [
  { id: "azure", name: "清透办公蓝", color: "#1677ff" },
  { id: "teal", name: "清新青绿", color: "#0f8a7b" },
  { id: "coral", name: "温暖珊瑚", color: "#e66b45" },
];

const providers = [
  { id: "ollama", name: "Ollama", note: "本机开源", ...providerDefaults.ollama },
  { id: "lmstudio", name: "LM Studio", note: "本机开源", ...providerDefaults.lmstudio },
  { id: "localai", name: "LocalAI", note: "自托管", ...providerDefaults.localai },
  { id: "openai", name: "OpenAI 兼容", note: "自定义服务", ...providerDefaults.openai },
] as const;

export function SettingsPanel({ open, settings, theme, layout, onSettings, onTheme, onLayout, onClose }: SettingsPanelProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="button" tabIndex={0} aria-label="关闭设置遮罩" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} onMouseDown={onClose}>
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label="思维导图快捷工具设置" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header"><div><span className="eyebrow">工作台偏好</span><h2>设置</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置"><X size={19} /></button></div>
        <div className="drawer-scroll">
          <section className="setting-section">
            <div className="setting-title"><Sparkles size={17} /><div><strong>AI 模型</strong><p>离线演示开箱即用，也可连接开源模型</p></div></div>
            <div className="segmented ai-modes">
              {([ ["demo", "演示模式"], ["hosted", "托管 AI"], ["custom", "开源 / 自定义"] ] as const).map(([id, label]) => (
                <button type="button" key={id} className={settings.mode === id ? "active" : ""} onClick={() => onSettings({ ...settings, mode: id })}>{label}</button>
              ))}
            </div>
            {settings.mode === "demo" && <div className="info-note"><Check size={15} />无需密钥，可完整体验对话修改流程。</div>}
            {settings.mode === "hosted" && <div className="info-note"><Cloud size={15} />使用应用部署方配置的 AI；未配置时会提示你切回演示模式。</div>}
            {settings.mode === "custom" && (
              <div className="form-stack">
                <div className="model-preset-grid">
                  {providers.map((provider) => <button type="button" key={provider.id} className={settings.provider === provider.id ? "active" : ""} onClick={() => onSettings(settingsForProvider(settings, provider.id))}><strong>{provider.name}</strong><small>{provider.note}</small></button>)}
                </div>
                <label>API 地址<input value={settings.endpoint} onChange={(event) => onSettings({ ...settings, endpoint: event.target.value })} placeholder="https://api.openai.com/v1" /></label>
                <label>模型<input value={settings.model} onChange={(event) => onSettings({ ...settings, model: event.target.value })} placeholder="gpt-4.1-mini" /></label>
                <label>API 密钥（本机服务可留空）<div className="input-with-icon"><KeyRound size={15} /><input type="password" value={settings.apiKey} onChange={(event) => onSettings({ ...settings, apiKey: event.target.value })} placeholder="仅在当前页面内存中使用" /></div></label>
                <p className="privacy-note">地址和模型保存在本机浏览器；密钥不落盘，刷新即清空，切换服务也会清空。本机服务需允许浏览器跨域访问。</p>
              </div>
            )}
          </section>
          <section className="setting-section">
            <div className="setting-title"><Palette size={17} /><div><strong>界面主题</strong><p>分支颜色会随主题自动调整</p></div></div>
            <div className="theme-options">
              {themes.map((item) => <button type="button" className={theme === item.id ? "active" : ""} key={item.id} onClick={() => onTheme(item.id)}><span style={{ background: item.color }} />{item.name}{theme === item.id && <Check size={15} />}</button>)}
            </div>
          </section>
          <section className="setting-section">
            <div className="setting-title"><div><strong>脑图结构</strong><p>切换后自动重新排版</p></div></div>
            <div className="layout-options">
              {([ ["mindmap", "左右脑图"], ["right", "横向脑图"], ["tree", "树状图"], ["fishbone", "鱼骨图"], ["logic", "逻辑结构"], ["timeline", "时间轴"] ] as const).map(([id, label]) => <button type="button" className={layout === id ? "active" : ""} onClick={() => onLayout(id)} key={id}>{label}</button>)}
            </div>
          </section>
          <section className="setting-section cloud-teaser">
            <div className="setting-title"><Cloud size={17} /><div><strong>云端同步</strong><p>登录后跨设备继续编辑</p></div></div>
            <button type="button" disabled>登录并开启同步 <span>即将开放</span></button>
          </section>
        </div>
        <div className="drawer-footer"><button className="primary" type="button" onClick={onClose}>完成</button></div>
      </aside>
    </div>
  );
}
