'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BASES, CRATERS } from '../lib/simulation.mjs';
import { NPCS } from '../lib/campaign.mjs';
import { createRuntime } from '../lib/runtime.mjs';

type Cargo = {
  id: string; name: string; state: 'carried' | 'dropped' | 'delivered';
  x?: number; z?: number; mass?: number; integrity?: number;
  destination?: { id: string; name: string; x: number; z: number; color: string };
};
const integrityOf = (cargo: Cargo) => Math.max(0, Math.min(100, cargo.integrity ?? 100));

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<any>(null);
  const [s, setState] = useState<any>(null);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  useEffect(() => {
    try { game.current = createRuntime(canvas.current, setState, setError); }
    catch (e) { setError('三维场景未能启动，请使用支持 WebGL 的浏览器刷新重试。'); console.error(e); }
    return () => game.current?.dispose();
  }, []);

  const act = (action: string, value?: number) => game.current?.action(action, value);
  const cargo: Cargo[] = s?.cargo ?? [];
  const campaign = s?.campaign;
  const dialogue = campaign?.dialogue;
  const nearbyNpc = campaign?.nearbyNpc;
  const target = cargo.find(c => c.state === 'dropped') ?? cargo.find(c => c.state !== 'delivered');
  const targetBase = target?.destination ?? BASES.find(b => b.id === target?.id);
  const fallbackTarget = target?.state === 'dropped' ? target : targetBase;
  const objective = campaign?.objective ?? (fallbackTarget ? { ...fallbackTarget, label: target?.state === 'dropped' ? '找回掉落货物' : targetBase?.name } : null);
  const distance = objective && s ? Math.hypot(objective.x - s.x, objective.z - s.z) : 0;
  const total = s?.totalDeliveries ?? 5;
  const loadMass = s?.loadMass ?? cargo.filter(c => c.state === 'carried').reduce((sum, c) => sum + (c.mass ?? 0), 0);
  const battery = s?.battery ?? 100;
  const stage = Math.min(3, Math.max(1, campaign?.stage ?? 1));
  const canDrive = Boolean(s?.started && !s.paused && !s.complete && !dialogue && !help && !error);
  const showOverlay = Boolean(error || ((!s?.started || s?.paused || s?.complete) && !dialogue && !help));
  const touch = (code: string) => ({
    onPointerDown: (e: any) => { e.currentTarget.setPointerCapture(e.pointerId); game.current?.hold(code, true); },
    onPointerUp: () => game.current?.hold(code, false),
    onPointerCancel: () => game.current?.hold(code, false),
    onLostPointerCapture: () => game.current?.hold(code, false),
  });

  return <main className={dialogue ? 'has-dialogue' : ''}>
    <canvas ref={canvas} tabIndex={0} aria-label="实时三维月球运输场景，用 W A S D 驾驶" />
    <header>
      <div className="brand"><b><i aria-hidden="true">◈</i> LUNAR FREIGHT</b><span>月面货运局 <i /> 第 07 区</span></div>
      <div className="top-right">
        <span className="telemetry"><i className="live-dot" />月面链路在线</span>
        <Button variant="ghost" onClick={() => { if (s?.started && !s.paused && !dialogue && !s.complete) act('pause'); setHelp(true); }}>操作指南</Button>
        <Button variant="ghost" disabled={!s?.started || s?.complete || !!dialogue} onClick={() => act('pause')}>{s?.paused ? '继续' : '暂停'} <kbd>Esc</kbd></Button>
      </div>
    </header>
    <aside className="mission panel" aria-label="当前委托与货物">
      <div className="eyebrow">委托记录 <span>{s?.complete ? '已完成' : `0${stage} / 03`}</span></div>
      <div className="stage-track" aria-label={`已完成 ${Math.min(3, Math.max(0, (campaign?.stage ?? 1) - 1))} 个委托`}>{['重连基地', '搜救遗失箱', '紧急供能'].map((name, i) => <span key={name} className={s?.complete || (campaign?.stage ?? 0) > i + 1 ? 'done' : stage === i + 1 ? 'current' : ''}><i />{name}</span>)}</div>
      <h1>{s?.complete ? '月面线路已重连' : campaign?.title ?? '等待派遣'}</h1>
      <p className="mission-brief">{campaign?.brief ?? '与调度员确认路线，接下今天的第一份委托。'}</p>
      <div className="objective"><span className="objective-mark" aria-hidden="true">↗</span><div><small>当前目标</small><b>{s?.complete ? '所有委托均已完成' : objective?.label ?? '联系出发站调度员'}</b></div>{!s?.complete && <strong>{Math.round(distance)}<small>m</small></strong>}</div>
      <div className="manifest-title"><span>货物清单</span><b>{Math.round(loadMass)} <small>kg 在载</small></b></div>
      <div className="cargo-list">
        {cargo.length ? cargo.map(c => {
          const base = c.destination ?? BASES.find(b => b.id === c.id);
          const integrity = integrityOf(c);
          return <div className={`cargo-row ${c.state}`} key={c.id}>
            <span className="cargo-id" style={{ color: base?.color ?? '#e7bb71' }}>{c.state === 'delivered' ? '✓' : c.id}</span>
            <div className="cargo-info"><div className="cargo-name"><b>{c.name}</b><em className={c.state === 'dropped' ? 'danger' : ''}>{c.state === 'delivered' ? '已交付' : c.state === 'dropped' ? '待回收' : '车载'}</em></div><div className="cargo-detail"><span>{base?.name ?? '等待分配'} · {c.mass ?? 0} kg</span><span className={integrity < 60 ? 'danger' : ''}>完好 {Math.round(integrity)}%</span></div><div className="integrity-track" aria-hidden="true"><i style={{ width: `${integrity}%`, backgroundColor: integrity < 60 ? '#f18d78' : base?.color ?? '#e7bb71' }} /></div></div>
          </div>;
        }) : <p className="empty-cargo">任务确认后显示货物清单</p>}
      </div>
      <div className="mission-footer"><span>信誉 <b>{Math.round(campaign?.reputation ?? 0)}</b></span><span>货物交付 <b>{s?.delivered ?? 0} / {total}</b></span></div>
    </aside>
    <div className="gravity">月球表面 <i /> 1.62 m/s² <span>保持平衡 · 稳妥送达</span></div>
    <div className="cameras panel" aria-label="镜头选择">{['驾驶舱', '跟随', '观察'].map((name, i) => <Button key={name} className={(s?.mode ?? 2) === i + 1 ? 'selected' : ''} aria-pressed={(s?.mode ?? 2) === i + 1} variant="ghost" onClick={() => act('camera', i + 1)}><kbd>{i + 1}</kbd>{name}</Button>)}</div>
    <aside className="map panel">
      <div className="eyebrow">区域导航 <span>N ↑</span></div>
      <svg viewBox="-130 -140 310 250" role="img" aria-label="地图：基地、NPC、陨石坑、目标连线、掉落货物和车辆位置">
        <defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#526773" strokeWidth=".5" /></pattern></defs>
        <rect x="-130" y="-140" width="310" height="250" fill="url(#grid)" />
        {CRATERS.map(c => <circle key={`${c.x},${c.z}`} cx={c.x} cy={c.z} r={c.r} fill="#24333c" stroke="#52616b" strokeWidth=".8" />)}
        {objective && s && !s.complete && <path d={`M ${s.x} ${s.z} L ${objective.x} ${objective.z}`} fill="none" stroke="#f1c07a" strokeWidth="1.5" strokeDasharray="4 4" />}
        {BASES.map(b => <g key={b.id}><circle cx={b.x} cy={b.z} r="7" fill="#101d27" stroke={b.color} strokeWidth="2" /><text x={b.x + 11} y={b.z + 4} fill={b.color}>{b.id}</text></g>)}
        {NPCS.map(npc => <g key={npc.id}><title>{npc.name} · {npc.role}</title><path d="M0 -4 L4 0 L0 4 L-4 0 Z" fill={npc.color} stroke="#0b1520" strokeWidth=".7" transform={`translate(${npc.x} ${npc.z})`} /></g>)}
        {cargo.filter(c => c.state === 'dropped' && c.x != null && c.z != null).map(c => <rect key={c.id} x={c.x! - 4} y={c.z! - 4} width="8" height="8" fill="#f18d78" />)}
        {objective && !s?.complete && <circle cx={objective.x} cy={objective.z} r="12" fill="none" stroke="#f1c07a" strokeWidth="1" strokeDasharray="2 3" />}
        {s && <path d="M0 -7 L5 6 L0 3 L-5 6 Z" fill="#fff8e8" stroke="#071422" strokeWidth="1" transform={`translate(${s.x} ${s.z}) rotate(${-(s.heading ?? 0) * 180 / Math.PI})`} />}
      </svg>
      <div className="coordinates"><span>X {(s?.x ?? 0).toFixed(0)}　Z {(s?.z ?? 30).toFixed(0)}</span><span>◆ 联络员　▲ 车辆</span></div>
      <small className="map-note">虚线指向当前目标，请绕开陨石坑</small>
    </aside>
    <section className="instruments panel" aria-label="车辆遥测">
      <div className="speed"><strong>{((s?.speed ?? 0) * 3.6).toFixed(0)}</strong><div><span>km/h</span><small>{s?.grounded === 0 ? '低重力腾空' : s?.upright < .4 ? '车辆翻覆' : '六轮驱动'}</small></div></div>
      <div className="battery"><div><span>电池电量</span><b className={battery < 20 ? 'danger' : ''}>{battery.toFixed(0)}%</b></div><Progress value={battery} aria-label="剩余电量" /><small>{battery < 20 ? '停车按住 T · 太阳能充电' : '交付货物可补充电量'}</small></div>
      <div className="load-gauge"><b>{Math.round(loadMass)}<span> kg</span></b><small>在载重量</small></div>
    </section>
    <div className="action-bar">
      <Button className="talk-action" variant="outline" disabled={!canDrive || !nearbyNpc} onClick={() => act('talk')}><kbd>F</kbd>{nearbyNpc ? `联系${nearbyNpc.name}` : '联系 NPC'}</Button>
      <Button className="action" disabled={!canDrive} onClick={() => act('interact')}><kbd>E</kbd>{target?.state === 'dropped' ? '拾取货物' : '交付货物'}</Button>
      <Button variant="outline" disabled={!canDrive} onClick={() => act('reset')}><kbd>R</kbd>扶正</Button>
    </div>
    <div className="controls"><span><kbd>W</kbd><kbd>S</kbd> 加速 / 倒车</span><span><kbd>A</kbd><kbd>D</kbd> 转向</span><span><kbd>Space</kbd> 制动</span><span><kbd>T</kbd> 停车充电</span><span><kbd>F</kbd> 与联络员交谈</span></div>
    {s?.mode === 1 && <div className="cockpit" aria-hidden="true"><i /><i /><span>LRV-07　/　{((s.speed ?? 0) * 3.6).toFixed(1)} KM/H</span></div>}
    {canDrive && (s?.message || s?.upright < .4 || nearbyNpc) && <div role="status" className="notice">{s.upright < .4 ? '车辆翻覆 · 按 R 扶正，原地货物仍可回收' : s.message || `联络员 ${nearbyNpc.name} 在附近 · 按 F 交谈`}</div>}
    <div className="touch" aria-label="触屏驾驶"><Button disabled={!canDrive} aria-label="左转" {...touch('KeyA')}>←</Button><Button disabled={!canDrive} aria-label="加速" {...touch('KeyW')}>↑</Button><Button disabled={!canDrive} aria-label="倒车" {...touch('KeyS')}>↓</Button><Button disabled={!canDrive} aria-label="右转" {...touch('KeyD')}>→</Button><Button disabled={!canDrive} {...touch('Space')}>制动</Button><Button disabled={!canDrive} {...touch('KeyT')}>充电</Button></div>
    {showOverlay && <div className="overlay"><section className="launch panel">
      <div className="eyebrow">月面运输 / 第 07 区 <span>{s?.complete ? '线路恢复' : '派遣待命'}</span></div>
      <h2>{error ? '启动遇到问题' : s?.complete ? '每一份托付，\n都已送达。' : s?.paused ? '任务已暂停' : '跨过荒原，\n连接彼此。'}</h2>
      <p>{error || (s?.complete ? `完成 3 项委托、交付 ${total} 件货物。用时 ${Math.floor(s.time / 60)} 分 ${Math.floor(s.time % 60)} 秒。` : s?.paused ? '车辆与任务计时已暂停。准备好后，继续这趟月面旅途。' : '驾驶六轮运输车，与驻站联络员合作，重连三座基地、找回遗失货物，并送达一份紧急电源。')}</p>
      {s?.complete && !error && s.message && <p className="completion-message" role="status">{s.message}</p>}
      {s?.complete && <div className="result-grid"><div><small>配送评级</small><strong>{campaign?.rank ?? 'B'}</strong></div><div><small>信誉</small><strong>{Math.round(campaign?.reputation ?? 0)}</strong></div><div><small>车辆扶正</small><strong>{s.resets}<em>次</em></strong></div></div>}
      {!s?.started && !error && <div className="launch-rules"><span><b>01</b> 与联络员交谈，接取三段委托</span><span><b>02</b> 管理载重与电量，保护货物完好</span><span><b>03</b> 驶入基地圆环，停车按 E 交付</span></div>}
      <Button className="launch-button" disabled={!s || !!error} onClick={() => act(s?.complete ? 'restart' : s?.paused ? 'pause' : 'start')}>{s?.complete ? '再次出发　→' : s?.paused ? '继续驾驶　→' : '联系调度员　→'}</Button>
      <small>W A S D 驾驶 · 空格制动 · F 交谈 · 1 / 2 / 3 切换镜头</small>
    </section></div>}
    <Dialog open={Boolean(dialogue && !help && !error)} onOpenChange={() => {}}>
      <DialogContent className="npc-dialog" showCloseButton={false} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } }}>
        <div className="dialogue-heading"><div className="npc-avatar" aria-hidden="true"><span>◉</span><small>COMMS</small></div><div><div className="eyebrow">本地通讯 <span><i className="live-dot" /> 已接通</span></div><DialogTitle>{dialogue?.name ?? '联络员'}<span>{dialogue?.role}</span></DialogTitle></div></div>
        <DialogDescription className="dialogue-text">{dialogue?.text}</DialogDescription>
        <div className="dialogue-footer"><small>通讯期间车辆与任务计时暂停</small><Button className="dialogue-confirm" onClick={() => act('confirm')}>{dialogue?.actionLabel ?? '确认'}<kbd>Enter</kbd><span aria-hidden="true">→</span></Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="help-dialog"><DialogTitle>月面驾驶指南</DialogTitle><DialogDescription>低重力意味着更长的滑行距离。稳妥的交付，比冲刺更重要。</DialogDescription><p>W / ↑ 加速，S / ↓ 倒车；A / D 或左右箭头转向；空格制动。F 联系附近联络员，Enter 确认对话。</p><p>共 3 项委托、5 件货物。进入对应基地圆环并停至 3 km/h 以下，按 E 交付；靠近掉落货物 6 米内停车，按 E 拾取。</p><p>撞击与掉落会损伤货物，影响交付评价。载重越高，车辆越难加速和制动。翻覆按 R 扶正，消耗 3% 电量。</p><p>1 驾驶舱，2 跟随，3 观察，C 轮换镜头。Esc 暂停。电量不足时停车按住 T 充电，触屏可按住“充电”。离开窗口会自动暂停。</p></DialogContent></Dialog>
  </main>;
}
