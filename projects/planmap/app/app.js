const STORAGE_KEY = "planmap.hub-demo.v1";
const palettes = ["#287fd1", "#16a085", "#eb8c38", "#d95872"];

function node(id, title, children = [], color = "") { return { id, title, children, color }; }
function starterMap(title = "新品发布会策划") {
  return node("root", title, [
    node("goal", "目标与主题", [node("goal-1", "核心目标"), node("goal-2", "主题概念")]),
    node("audience", "受众洞察", [node("audience-1", "核心人群"), node("audience-2", "参与动机")]),
    node("content", "内容与体验", [node("content-1", "产品亮点"), node("content-2", "互动环节")]),
    node("spread", "传播节奏", [node("spread-1", "预热阶段"), node("spread-2", "引爆阶段")]),
  ]);
}

const festivalMap = () => node("root", "校园音乐节策划", [
  node("theme", "主题与目标", [node("theme-1", "青春共鸣"), node("theme-2", "校园品牌")]),
  node("people", "受众洞察", [node("people-1", "在校学生"), node("people-2", "社团与校友")]),
  node("program", "节目与体验", [node("program-1", "乐队舞台"), node("program-2", "社团互动"), node("program-3", "市集打卡")]),
  node("promotion", "传播节奏", [node("promotion-1", "社群预热"), node("promotion-2", "短视频挑战"), node("promotion-3", "现场直播")]),
  node("delivery", "执行保障", [node("delivery-1", "场地与设备"), node("delivery-2", "人员排班"), node("delivery-3", "风险预案")]),
]);

const state = { root: starterMap(), selectedId: null, theme: "azure", layout: "mindmap", scale: 1, history: [], future: [] };
const ui = Object.fromEntries(["messages","chatScroll","chatInput","sendButton","selectionChip","nodesLayer","connections","mapStage","canvasViewport","nodeCount","documentTitle","undoButton","redoButton","settingsBackdrop","exportBackdrop","modeButton","zoomValue","toast"].map((id) => [id, document.getElementById(id)]));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function walk(current, visit, parent = null, depth = 0) { visit(current, parent, depth); current.children.forEach((child) => walk(child, visit, current, depth + 1)); }
function findNode(id) { let found; walk(state.root, (item) => { if (item.id === id) found = item; }); return found; }
function findParent(id) { let found; walk(state.root, (item) => { if (item.children.some((child) => child.id === id)) found = item; }); return found; }
function countNodes() { let count = 0; walk(state.root, () => count++); return count; }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ root: state.root, theme: state.theme, layout: state.layout })); }
function commit(nextRoot) { state.history.push(clone(state.root)); state.history = state.history.slice(-30); state.future = []; state.root = nextRoot; state.selectedId = null; save(); render(); }
function uniqueId(prefix = "node") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`; }

function nodeRows(item) { return Math.max(1,Math.ceil([...item.title].length / (item.id === state.root.id ? 13 : 9))); }
function nodeHeight(item, depth = 2) { return Math.max(item.id === state.root.id ? 58 : depth === 1 ? 47 : 42,12 + nodeRows(item) * 14); }
function leafSpan(item) { return item.children.length ? Math.max(nodeHeight(item),item.children.reduce((sum, child) => sum + leafSpan(child),0)) : nodeHeight(item); }
function maxDepth(item, depth = 0) { return item.children.reduce((value, child) => Math.max(value,maxDepth(child,depth + 1)),depth); }
function positions() {
  const points = new Map();
  const root = state.root;
  if (state.layout === "tree") {
    let cursorX = 80;
    const gapX = 180; const levelGap = 45; const levelHeights = [];
    walk(root,(item,_parent,depth) => { levelHeights[depth] = Math.max(levelHeights[depth] || 0,nodeHeight(item,depth)); });
    const levelY = [90];
    for (let depth = 1; depth < levelHeights.length; depth++) levelY[depth] = levelY[depth - 1] + levelHeights[depth - 1] + levelGap;
    const place = (item, depth) => {
      const childXs = item.children.map((child) => place(child,depth + 1));
      const x = childXs.length ? (childXs[0] + childXs.at(-1)) / 2 : cursorX;
      if (!childXs.length) cursorX += gapX;
      points.set(item.id,{x,y:levelY[depth]}); return x;
    };
    place(root,0);
    const width = Math.max(1100,cursorX + 80);
    const lastDepth = levelHeights.length - 1; const height = Math.max(760,levelY[lastDepth] + levelHeights[lastDepth] + 120);
    return { points, width, height, rootPoint: points.get(root.id) };
  }
  const branches = root.children;
  const left = state.layout === "right" ? [] : branches.filter((_, index) => index % 2 === 0);
  const right = state.layout === "right" ? branches : branches.filter((_, index) => index % 2 === 1);
  const leftDepth = left.reduce((value,item) => Math.max(value,maxDepth(item,1)),0);
  const rightDepth = right.reduce((value,item) => Math.max(value,maxDepth(item,1)),0);
  const gapX = 220; const gapY = 68; const margin = 80;
  const rootX = state.layout === "right" ? margin : margin + Math.max(1,leftDepth) * gapX;
  const leftSpan = left.reduce((sum,item) => sum + leafSpan(item) + gapY / 2,0);
  const rightSpan = right.reduce((sum,item) => sum + leafSpan(item) + gapY / 2,0);
  const totalSpan = Math.max(nodeHeight(root),leftSpan,rightSpan);
  const rootY = margin + totalSpan / 2 - nodeHeight(root) / 2;
  points.set(root.id,{x:rootX,y:rootY});
  const placeSide = (items, side, sideSpan) => {
    let cursorY = margin + (totalSpan - sideSpan) / 2;
    const place = (item, depth) => {
      const start = cursorY; const childYs = item.children.map((child) => place(child,depth + 1));
      const height = nodeHeight(item,depth); const y = childYs.length ? (childYs[0] + childYs.at(-1)) / 2 : cursorY;
      cursorY = Math.max(cursorY + height + gapY / 2,start + leafSpan(item) + gapY / 2);
      points.set(item.id,{x:rootX + (side === "left" ? -1 : 1) * depth * gapX,y}); return y;
    };
    items.forEach((item) => place(item,1));
  };
  placeSide(left,"left",leftSpan); placeSide(right,"right",rightSpan);
  const width = Math.max(1100,rootX + Math.max(1,rightDepth) * gapX + 230);
  const height = Math.max(760,margin * 2 + totalSpan);
  return { points, width, height, rootPoint: points.get(root.id) };
}

function renderConnections(layout) {
  const paths = [];
  walk(state.root, (item, parent) => {
    if (!parent) return;
    const from = layout.get(parent.id); const to = layout.get(item.id);
    if (!from || !to) return;
    const fromWidth = parent.id === "root" ? 170 : 142;
    const fromX = to.x >= from.x ? from.x + fromWidth : from.x;
    const toX = to.x >= from.x ? to.x : to.x + 142;
    const fromY = from.y + nodeHeight(parent) / 2;
    const toY = to.y + nodeHeight(item) / 2;
    if (state.layout === "tree") {
      paths.push(`<path d="M ${from.x + fromWidth / 2} ${from.y + nodeHeight(parent)} C ${from.x + fromWidth / 2} ${(fromY + toY) / 2}, ${to.x + 71} ${(fromY + toY) / 2}, ${to.x + 71} ${to.y}" />`);
    } else {
      const mid = (fromX + toX) / 2;
      paths.push(`<path d="M ${fromX} ${fromY} C ${mid} ${fromY}, ${mid} ${toY}, ${toX} ${toY}" />`);
    }
  });
  ui.connections.innerHTML = paths.join("");
}

function nodeTools(item) {
  if (item.id === "root") return `<span class="node-tools"><button data-tool="rename" title="改名">✎</button><button data-tool="add" title="添加子节点">＋</button><button data-tool="color" title="切换节点颜色">◉</button></span>`;
  return `<span class="node-tools"><button data-tool="rename" title="改名">✎</button><button data-tool="add" title="添加子节点">＋</button><button data-tool="color" title="切换节点颜色">◉</button><button data-tool="delete" class="danger" title="删除节点">×</button></span>`;
}

function render() {
  const mapLayout = positions(); const layout = mapLayout.points;
  ui.mapStage.style.width = `${mapLayout.width}px`; ui.mapStage.style.height = `${mapLayout.height}px`;
  ui.mapStage.dataset.rootX = mapLayout.rootPoint.x; ui.mapStage.dataset.rootY = mapLayout.rootPoint.y;
  ui.nodesLayer.innerHTML = "";
  walk(state.root, (item, _parent, depth) => {
    const point = layout.get(item.id); if (!point) return;
    const element = document.createElement("button");
    element.type = "button"; element.className = `map-node level-${Math.min(depth,2)} ${item.id === "root" ? "root" : ""} ${item.id === state.selectedId ? "selected" : ""}`;
    element.dataset.id = item.id; element.style.left = `${point.x}px`; element.style.top = `${point.y}px`; element.style.minHeight = `${nodeHeight(item,depth)}px`;
    element.style.setProperty("--node-color", item.color || palettes[Math.max(0,(state.root.children.findIndex((branch) => branch === item || branch.children.includes(item)) + 4) % 4)]);
    const label = document.createElement("span"); label.textContent = item.title;
    element.append(label); element.insertAdjacentHTML("beforeend", nodeTools(item));
    ui.nodesLayer.append(element);
  });
  renderConnections(layout);
  ui.nodeCount.textContent = `共 ${countNodes()} 个节点 · 已自动排版`;
  ui.documentTitle.value = state.root.title;
  ui.undoButton.disabled = state.history.length === 0; ui.redoButton.disabled = state.future.length === 0;
  ui.mapStage.style.transform = `scale(${state.scale})`; ui.zoomValue.textContent = `${Math.round(state.scale * 100)}%`;
  const selected = findNode(state.selectedId);
  ui.selectionChip.hidden = !selected; ui.selectionChip.querySelector("span").textContent = selected ? `@ ${selected.title}` : "";
  document.querySelector(".app-shell").className = `app-shell theme-${state.theme}`;
}

function addMessage(role, text, thinking = false) {
  const row = document.createElement("div"); row.className = `message-row ${role}${thinking ? " thinking" : ""}`;
  const avatar = document.createElement("span"); avatar.textContent = role === "user" ? "你" : "✦";
  const content = document.createElement("p"); content.textContent = text;
  row.append(avatar, content); ui.messages.append(row); ui.chatScroll.scrollTop = ui.chatScroll.scrollHeight; return row;
}

function addChildren(target, titles) { const next = clone(state.root); let nodeToEdit; walk(next, (item) => { if (item.id === target.id) nodeToEdit = item; }); titles.forEach((title) => nodeToEdit.children.push(node(uniqueId(target.id),title))); return next; }
function removeFromTree(root, id) { root.children = root.children.filter((child) => child.id !== id); root.children.forEach((child) => removeFromTree(child,id)); }
function replaceRoot(next) { commit(next); }

function applyPrompt(message) {
  const normalized = message.replace(/\s+/g, "");
  const selected = findNode(state.selectedId);
  if (/校园.*音乐节|音乐节/.test(normalized)) { replaceRoot(festivalMap()); return "已生成校园音乐节完整策划，并按主题、受众、节目、传播和执行五条主线自动排版。"; }
  if (/风险|预案/.test(normalized)) { const target = selected || findNode("delivery") || state.root; commit(addChildren(target,["天气备选方案","安全与医疗","舆情响应"])); return `已在“${target.title}”下补充三项风险预案。`; }
  if (/预算|资源/.test(normalized)) { commit(addChildren(state.root,["预算与资源"])); const added = state.root; const latest = clone(added); const branch = latest.children.at(-1); branch.children = [node(uniqueId("budget"),"场地与设备"),node(uniqueId("budget"),"人员与宣传"),node(uniqueId("budget"),"机动预算")]; state.root = latest; save(); render(); return "已加入预算与资源分支，并拆分场地、人员宣传和机动预算。"; }
  if (/删除/.test(normalized) && selected && selected.id !== "root") { const title = selected.title; const next = clone(state.root); removeFromTree(next,selected.id); commit(next); return `已删除“${title}”，其余分支已自动整理。`; }
  if (/改成|重命名/.test(normalized) && selected) { const title = message.split(/改成|重命名为/).at(-1).replace(/[“”"。]/g, "").trim() || "新名称"; const next = clone(state.root); walk(next,(item) => { if (item.id === selected.id) item.title = title; }); commit(next); return `已把选中节点改为“${title}”。`; }
  if (/展开|补充|可执行/.test(normalized)) { const target = selected || state.root.children[0]; commit(addChildren(target,["负责人和截止时间","验收标准","下一步动作"])); return `已把“${target.title}”展开为三项可执行动作，并保持自动排版。`; }
  return "我理解了。你可以点选一个节点，再说“展开这部分”“改成…”或“删除这个节点”，也可以让我重新生成完整策划。";
}

async function send() {
  const message = ui.chatInput.value.trim(); if (!message) return;
  ui.chatInput.value = ""; addMessage("user",message); const thinking = addMessage("assistant","正在分析策划结构…",true);
  ui.sendButton.disabled = true; await new Promise((resolve) => setTimeout(resolve,450)); thinking.remove(); const reply = applyPrompt(message); addMessage("assistant",reply); ui.sendButton.disabled = false;
}

function download(name, content, type = "text/plain") { const link = document.createElement("a"); const blob = content instanceof Blob ? content : new Blob([content],{type}); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); }
function markdown(item = state.root, depth = 1) { return `${"  ".repeat(depth - 1)}- ${item.title}\n${item.children.map((child) => markdown(child,depth + 1)).join("")}`; }
function showToast(text) { ui.toast.textContent = text; ui.toast.hidden = false; setTimeout(() => { ui.toast.hidden = true; },1900); }

function branchColor(item) {
  if (item.id === state.root.id) return getComputedStyle(document.querySelector(".app-shell")).getPropertyValue("--accent").trim() || palettes[0];
  let index = 0;
  for (const branch of state.root.children) {
    let contains = false; walk(branch,(candidate) => { if (candidate.id === item.id) contains = true; });
    if (contains) return item.color || palettes[index % palettes.length]; index++;
  }
  return item.color || palettes[0];
}

function exportCanvas() {
  const layout = positions(); const scale = 1.5;
  const canvas = document.createElement("canvas"); canvas.width = Math.ceil(layout.width * scale); canvas.height = Math.ceil(layout.height * scale);
  const context = canvas.getContext("2d"); context.scale(scale,scale); context.fillStyle = "#f5f8fb"; context.fillRect(0,0,layout.width,layout.height);
  context.lineWidth = 2; context.strokeStyle = "#a9bdcc";
  walk(state.root,(item,parent) => {
    if (!parent) return; const from = layout.points.get(parent.id); const to = layout.points.get(item.id); const fromWidth = parent.id === state.root.id ? 170 : 142;
    context.beginPath();
    if (state.layout === "tree") {
      context.moveTo(from.x + fromWidth / 2,from.y + nodeHeight(parent));
      const middle = (from.y + to.y) / 2; context.bezierCurveTo(from.x + fromWidth / 2,middle,to.x + 71,middle,to.x + 71,to.y);
    } else {
      const rightward = to.x >= from.x; const fromX = rightward ? from.x + fromWidth : from.x; const toX = rightward ? to.x : to.x + 142; const fromY = from.y + nodeHeight(parent) / 2; const toY = to.y + nodeHeight(item) / 2; const middle = (fromX + toX) / 2;
      context.moveTo(fromX,fromY); context.bezierCurveTo(middle,fromY,middle,toY,toX,toY);
    }
    context.stroke();
  });
  walk(state.root,(item,_parent,depth) => {
    const point = layout.points.get(item.id); const isRoot = item.id === state.root.id; const width = isRoot ? 170 : 142; const height = nodeHeight(item,depth); const color = branchColor(item);
    context.fillStyle = isRoot ? color : "#ffffff"; context.strokeStyle = color; context.lineWidth = isRoot ? 0 : 2; context.beginPath(); context.roundRect(point.x,point.y,width,height,isRoot ? 15 : 10); context.fill(); if (!isRoot) context.stroke();
    context.fillStyle = isRoot ? "#ffffff" : "#33495b"; context.font = `${isRoot ? 700 : depth === 1 ? 650 : 500} ${isRoot ? 15 : 12}px "Microsoft YaHei", sans-serif`; context.textAlign = "center"; context.textBaseline = "middle";
    drawTitle(context,item.title,point.x + width / 2,point.y + height / 2,width - 16,height - 8,isRoot ? 15 : 12);
  });
  return canvas;
}

function canvasBlob(canvas, type, quality) { return new Promise((resolve) => canvas.toBlob(resolve,type,quality)); }
function textLines(context, value, maxWidth) {
  const characters = [...value]; const lines = []; let line = "";
  for (const character of characters) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) { lines.push(line); line = character; } else line = candidate;
  }
  if (line || lines.length === 0) lines.push(line); return lines;
}
function drawTitle(context, title, centerX, centerY, maxWidth, maxHeight, lineHeight) {
  let lines = textLines(context,title,maxWidth); const availableLines = Math.max(1,Math.floor(maxHeight / lineHeight));
  if (lines.length > availableLines) { const condensed = context.font.replace(/\b(1[0-9]|[2-9][0-9])px\b/,(_,size) => `${Math.max(7,Math.floor(Number(size) * availableLines / lines.length))}px`); context.font = condensed; lines = textLines(context,title,maxWidth); }
  const top = centerY - (lines.length - 1) * lineHeight / 2; lines.forEach((line,index) => context.fillText(line,centerX,top + index * lineHeight,maxWidth));
}
function bytesFromBase64(value) { const binary = atob(value); return Uint8Array.from(binary,(char) => char.charCodeAt(0)); }
function concatBytes(parts) { const length = parts.reduce((sum,part) => sum + part.length,0); const output = new Uint8Array(length); let offset = 0; for (const part of parts) { output.set(part,offset); offset += part.length; } return output; }
function textBytes(value) { return new TextEncoder().encode(value); }

function pdfFromCanvas(canvas) {
  const jpeg = bytesFromBase64(canvas.toDataURL("image/jpeg",.92).split(",")[1]); const pageWidth = 842; const pageHeight = 595; const margin = 20;
  const ratio = Math.min((pageWidth - margin * 2) / canvas.width,(pageHeight - margin * 2) / canvas.height); const width = canvas.width * ratio; const height = canvas.height * ratio; const x = (pageWidth - width) / 2; const y = (pageHeight - height) / 2;
  const content = textBytes(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
  const objects = [
    textBytes("<< /Type /Catalog /Pages 2 0 R >>"),
    textBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    textBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    concatBytes([textBytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,textBytes("\nendstream")]),
    concatBytes([textBytes(`<< /Length ${content.length} >>\nstream\n`),content,textBytes("\nendstream")]),
  ];
  const parts = [textBytes("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n")]; const offsets = [0]; let offset = parts[0].length;
  objects.forEach((object,index) => { offsets.push(offset); const part = concatBytes([textBytes(`${index + 1} 0 obj\n`),object,textBytes("\nendobj\n")]); parts.push(part); offset += part.length; });
  const xrefOffset = offset; let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let index = 1; index <= objects.length; index++) xref += `${String(offsets[index]).padStart(10,"0")} 00000 n \n`;
  parts.push(textBytes(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)); return new Blob(parts,{type:"application/pdf"});
}

const crcTable = Array.from({length:256},(_,value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zipBytes(entries) {
  const local = []; const central = []; let offset = 0;
  for (const [name,value] of entries) {
    const nameBytes = textBytes(name); const data = typeof value === "string" ? textBytes(value) : value; const crc = crc32(data);
    const header = new Uint8Array(30 + nameBytes.length); const view = new DataView(header.buffer); view.setUint32(0,0x04034b50,true); view.setUint16(4,20,true); view.setUint16(6,0x0800,true); view.setUint32(14,crc,true); view.setUint32(18,data.length,true); view.setUint32(22,data.length,true); view.setUint16(26,nameBytes.length,true); header.set(nameBytes,30); local.push(header,data);
    const directory = new Uint8Array(46 + nameBytes.length); const directoryView = new DataView(directory.buffer); directoryView.setUint32(0,0x02014b50,true); directoryView.setUint16(4,20,true); directoryView.setUint16(6,20,true); directoryView.setUint16(8,0x0800,true); directoryView.setUint32(16,crc,true); directoryView.setUint32(20,data.length,true); directoryView.setUint32(24,data.length,true); directoryView.setUint16(28,nameBytes.length,true); directoryView.setUint32(42,offset,true); directory.set(nameBytes,46); central.push(directory); offset += header.length + data.length;
  }
  const centralBytes = concatBytes(central); const end = new Uint8Array(22); const endView = new DataView(end.buffer); endView.setUint32(0,0x06054b50,true); endView.setUint16(8,entries.length,true); endView.setUint16(10,entries.length,true); endView.setUint32(12,centralBytes.length,true); endView.setUint32(16,offset,true); return concatBytes([...local,centralBytes,end]);
}
function xmindTopic(item) { return { id:item.id, class:"topic", title:item.title, ...(item.children.length ? { children:{ attached:item.children.map(xmindTopic) } } : {}) }; }
function xmindArchive() {
  const sheetId = `sheet-${Date.now()}`; const content = JSON.stringify([{id:sheetId,class:"sheet",title:state.root.title,rootTopic:xmindTopic(state.root)}]);
  const metadata = JSON.stringify({creator:{name:"PlanMap",version:"1.0"},activeSheetId:sheetId}); const manifest = JSON.stringify({"file-entries":{"content.json":{},"metadata.json":{},"manifest.json":{}}});
  return new Blob([zipBytes([["content.json",content],["metadata.json",metadata],["manifest.json",manifest]])],{type:"application/vnd.xmind.workbook"});
}
function safeName(value) { return value.replace(/[<>:"/\\|?*\x00-\x1f]/g,"-").trim() || "PlanMap"; }

ui.sendButton.addEventListener("click",send);
ui.chatInput.addEventListener("keydown",(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } });
document.querySelectorAll(".quick-prompts button").forEach((button) => button.addEventListener("click",() => { ui.chatInput.value = button.textContent; send(); }));
ui.nodesLayer.addEventListener("click",(event) => {
  const element = event.target.closest(".map-node"); if (!element) return; const id = element.dataset.id;
  const tool = event.target.closest("[data-tool]")?.dataset.tool;
  if (!tool) { state.selectedId = state.selectedId === id ? null : id; render(); return; }
  const selected = findNode(id); state.selectedId = id;
  if (tool === "add") { commit(addChildren(selected,["待补充"])); return; }
  if (tool === "delete") { const next = clone(state.root); removeFromTree(next,id); commit(next); return; }
  if (tool === "rename") { const title = prompt("节点名称",selected.title)?.trim(); if (!title) return; const next = clone(state.root); walk(next,(item) => { if (item.id === id) item.title = title; }); commit(next); return; }
  if (tool === "color") { const next = clone(state.root); walk(next,(item) => { if (item.id === id) item.color = palettes[(palettes.indexOf(item.color) + 1) % palettes.length]; }); commit(next); }
});
ui.nodesLayer.addEventListener("dblclick",(event) => { const element = event.target.closest(".map-node"); if (element) element.querySelector('[data-tool="rename"]')?.click(); });
ui.documentTitle.addEventListener("change",() => { const next = clone(state.root); next.title = ui.documentTitle.value.trim() || "未命名策划"; commit(next); });
ui.undoButton.addEventListener("click",() => { const previous = state.history.pop(); if (!previous) return; state.future.unshift(clone(state.root)); state.root = previous; render(); save(); });
ui.redoButton.addEventListener("click",() => { const next = state.future.shift(); if (!next) return; state.history.push(clone(state.root)); state.root = next; render(); save(); });
ui.selectionChip.querySelector("button").addEventListener("click",() => { state.selectedId = null; render(); });
document.getElementById("autoLayout").addEventListener("click",() => { render(); showToast("脑图已自动整理"); });
document.getElementById("settingsButton").addEventListener("click",() => { ui.settingsBackdrop.hidden = false; });
ui.modeButton.addEventListener("click",() => { ui.settingsBackdrop.hidden = false; });
document.querySelectorAll(".close-settings").forEach((button) => button.addEventListener("click",() => { ui.settingsBackdrop.hidden = true; }));
document.querySelectorAll(".ai-modes button").forEach((button) => button.addEventListener("click",() => { document.querySelectorAll(".ai-modes button").forEach((item) => item.classList.toggle("active",item === button)); ui.modeButton.querySelector("b").textContent = button.dataset.mode; showToast(button.dataset.mode === "演示模式" ? "演示模式已开启" : "公开体验仅演示模式可用"); }));
document.querySelectorAll(".theme-options button").forEach((button) => button.addEventListener("click",() => { state.theme = button.dataset.theme; document.querySelectorAll(".theme-options button").forEach((item) => item.classList.toggle("active",item === button)); save(); render(); }));
document.querySelectorAll(".layout-options button").forEach((button) => button.addEventListener("click",() => { state.layout = button.dataset.layout; document.querySelectorAll(".layout-options button").forEach((item) => item.classList.toggle("active",item === button)); save(); render(); centerMap(); }));
document.getElementById("exportButton").addEventListener("click",() => { ui.exportBackdrop.hidden = false; });
document.querySelector(".close-export").addEventListener("click",() => { ui.exportBackdrop.hidden = true; });
document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click",async() => {
  const format = button.dataset.export; const name = safeName(state.root.title); ui.exportBackdrop.hidden = true; button.disabled = true;
  try {
    if (format === "markdown") download(`${name}.md`,`# ${state.root.title}\n\n${markdown()}`,"text/markdown;charset=utf-8");
    else if (format === "xmind") download(`${name}.xmind`,xmindArchive());
    else { const canvas = exportCanvas(); if (format === "png") download(`${name}.png`,await canvasBlob(canvas,"image/png")); else download(`${name}.pdf`,pdfFromCanvas(canvas)); }
    showToast(`${button.querySelector("b").textContent} 已下载`);
  } catch (error) { console.error(error); showToast("导出失败，请重试"); }
  finally { button.disabled = false; }
}));
document.getElementById("zoomOut").addEventListener("click",() => { state.scale = Math.max(.5,state.scale - .1); render(); });
document.getElementById("zoomIn").addEventListener("click",() => { state.scale = Math.min(1.4,state.scale + .1); render(); });
function centerMap() { const rootX = Number(ui.mapStage.dataset.rootX || 650); const rootY = Number(ui.mapStage.dataset.rootY || 390); ui.canvasViewport.scrollLeft = Math.max(0,(rootX + 85) * state.scale - ui.canvasViewport.clientWidth / 2); ui.canvasViewport.scrollTop = Math.max(0,(rootY + 29) * state.scale - ui.canvasViewport.clientHeight / 2); }
document.getElementById("centerMap").addEventListener("click",centerMap);
document.querySelectorAll("[data-mobile-view]").forEach((button) => button.addEventListener("click",() => { document.querySelectorAll("[data-mobile-view]").forEach((item) => item.classList.toggle("active",item === button)); document.querySelector(".workspace").className = `workspace mobile-${button.dataset.mobileView}`; if (button.dataset.mobileView === "map") setTimeout(centerMap); }));

function isValidRoot(root) {
  if (root?.id !== "root") return false;
  const ids = new Set();
  const valid = (item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.title !== "string" || !Array.isArray(item.children) || (item.color != null && typeof item.color !== "string")) return false;
    ids.add(item.id); return item.children.every(valid);
  };
  return valid(root);
}
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (stored && isValidRoot(stored.root)) {
    state.root = stored.root;
    if (["azure","teal","coral"].includes(stored.theme)) state.theme = stored.theme;
    if (["mindmap","right","tree"].includes(stored.layout)) state.layout = stored.layout;
  } else if (stored) localStorage.removeItem(STORAGE_KEY);
} catch { localStorage.removeItem(STORAGE_KEY); }
render(); requestAnimationFrame(centerMap);
