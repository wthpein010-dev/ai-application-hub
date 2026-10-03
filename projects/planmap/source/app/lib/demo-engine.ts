import { createStarterDocument, findNode, flattenTree } from "./mindmap.ts";
import type { EngineResult, LayoutMode, MindMapDocument, MindMapOperation } from "./types.ts";

const branchIdeas: Record<string, string[]> = {
  "目标与主题": ["成功指标", "主题口号", "差异化亮点"],
  "受众洞察": ["典型场景", "核心痛点", "决策动机"],
  "传播节奏": ["内容种草", "渠道联动", "数据复盘"],
  "现场流程": ["嘉宾动线", "互动机制", "应急预案"],
  "风险预案": ["风险清单", "责任人员", "处置时限"],
};

function classifyKind(message: string): string {
  if (/游戏|关卡|玩法|数值/.test(message)) return "游戏策划";
  if (/活动|发布会|音乐节|展会/.test(message)) return "活动策划";
  if (/内容|选题|账号|视频|栏目/.test(message)) return "内容策划";
  return "产品策划";
}

function titleFromMessage(message: string): string {
  const clean = message
    .replace(/^(请|帮我|给我|重新)?(做|策划|生成|设计)(一个|一份|一下)?/, "")
    .replace(/(完整)?策划(方案|脑图)?$/g, "")
    .trim();
  return clean || "新策划项目";
}

function createDocumentFromMessage(message: string): MindMapDocument {
  const title = titleFromMessage(message);
  const document = createStarterDocument(`${title}策划`);
  const kind = classifyKind(message);
  const rootTitle = title.replace(/策划$/, "");
  const branchSets: Record<string, Array<[string, string[]]>> = {
    游戏策划: [["核心玩法", ["循环体验", "操作反馈"]], ["玩家与目标", ["目标玩家", "乐趣来源"]], ["系统设计", ["成长系统", "关卡结构"]], ["上线计划", ["版本范围", "数据指标"]]],
    活动策划: [["目标与主题", ["核心目标", "主题概念"]], ["受众洞察", ["核心人群", "参与动机"]], ["传播节奏", ["预热阶段", "引爆阶段"]], ["执行保障", ["现场流程", "风险预案"]]],
    内容策划: [["内容定位", ["核心命题", "表达风格"]], ["目标受众", ["典型用户", "观看动机"]], ["选题结构", ["内容支柱", "更新节奏"]], ["传播复盘", ["分发渠道", "数据指标"]]],
    产品策划: [["用户与问题", ["目标用户", "核心痛点"]], ["解决方案", ["价值主张", "关键流程"]], ["功能范围", ["核心功能", "暂不包含"]], ["验证计划", ["成功指标", "迭代节奏"]]],
  };
  const branches = branchSets[kind];
  let next: MindMapDocument = { ...document, title: `${rootTitle}策划`, kind, root: { ...document.root, title: rootTitle, children: [] } };
  const operations: MindMapOperation[] = branches.map(([branch, children]) => ({ type: "add-child", parentId: next.root.id, title: branch, children }));
  const { applyOperations } = requireApplyOperations();
  next = applyOperations(next, operations);
  return next;
}

function requireApplyOperations() {
  return {
    applyOperations(document: MindMapDocument, operations: MindMapOperation[]) {
      let next = document;
      for (const operation of operations) {
        if (operation.type !== "add-child") continue;
        const branch = {
          id: `ai-${Math.random().toString(36).slice(2, 9)}`,
          title: operation.title,
          children: (operation.children ?? []).map((title) => ({ id: `ai-${Math.random().toString(36).slice(2, 9)}`, title, children: [] })),
        };
        next = { ...next, root: { ...next.root, children: [...next.root.children, branch] } };
      }
      return next;
    },
  };
}

export function interpretDemoMessage(message: string, document: MindMapDocument, selectedId?: string | null): EngineResult {
  const text = message.trim();
  const selected = selectedId ? findNode(document.root, selectedId) : undefined;

  const replacement = text.replace(/[。！!]+$/, "").match(/^(?:请)?(?:把|将)[“"']?(.+?)[”"']?(?:替换成|改成|换成)[“"']?(.+?)[”"']?$/);
  if (replacement && selected && /^(这个|此节点|选中节点)$/.test(replacement[1].trim())) {
    return { reply: `已将“${selected.title}”改为“${replacement[2].trim()}”。`, operations: [{ type: "rename", nodeId: selected.id, title: replacement[2].trim() }] };
  }
  if (replacement) {
    const [, source, target] = replacement;
    const all = flattenTree(document.root);
    const exact = all.filter((node) => node.title === source.trim());
    const candidates = exact.length ? exact : all.filter((node) => node.title.includes(source.trim()) || source.trim().includes(node.title));
    if (candidates.length === 1) return { reply: `已找到“${source.trim()}”并替换为“${target.trim()}”，版面已同步整理。`, operations: [{ type: "rename", nodeId: candidates[0].id, title: target.trim() }] };
    if (!candidates.length) return { reply: `没有找到包含“${source.trim()}”的节点，请换用节点里的完整文字。`, operations: [] };
    return { reply: `找到 ${candidates.length} 个可能节点：${candidates.slice(0, 5).map((node) => `“${node.title}”`).join("、")}。请把原文字说完整。`, operations: [] };
  }

  const layouts: Array<[LayoutMode, RegExp, string]> = [
    ["fishbone", /鱼骨/, "鱼骨图"], ["timeline", /时间轴|时间线/, "时间轴"],
    ["tree", /树状|组织结构/, "树状图"], ["logic", /逻辑|括号/, "逻辑结构"],
    ["right", /横向|向右/, "横向脑图"], ["mindmap", /左右|平衡|标准脑图/, "左右脑图"],
  ];
  const requestedLayout = layouts.find(([, pattern]) => pattern.test(text));
  if (requestedLayout && /(切换|换成|改成|结构|布局|排版|使用)/.test(text)) {
    return { reply: `已切换为${requestedLayout[2]}，所有节点已自动重新排版。`, operations: [{ type: "set-layout", layout: requestedLayout[0] }] };
  }

  if (/(重新|重做|换一个|完整策划)/.test(text) && /(做|策划|生成|设计)/.test(text)) {
    const next = createDocumentFromMessage(text);
    return { reply: `这会整体重构当前脑图。我已经准备好“${next.title}”的新结构，请确认后应用。`, operations: [{ type: "replace-document", document: next }], requiresConfirmation: true };
  }

  if (selected && /(删除|移除|不要)/.test(text)) {
    return { reply: `已移除“${selected.title}”。需要时可以撤销。`, operations: [{ type: "delete", nodeId: selected.id }] };
  }

  if (selected && /(改成|重命名|换成)/.test(text)) {
    const match = text.match(/(?:改成|重命名为|换成)[“「]?([^”」。，]+)[”」]?/);
    const title = match?.[1]?.trim() || "新的节点名称";
    return { reply: `已将“${selected.title}”改为“${title}”。`, operations: [{ type: "rename", nodeId: selected.id, title }] };
  }

  if (selected && /(展开|补充|细化|增加|添加)/.test(text)) {
    const ideas = branchIdeas[selected.title] ?? ["关键动作", "负责人", "验收标准"];
    return { reply: `我把“${selected.title}”继续拆成了 3 个可执行方向，你可以再点选其中一个继续深入。`, operations: ideas.map((title) => ({ type: "add-child", parentId: selected.id, title })) };
  }

  if (/(风险|预案)/.test(text)) {
    return { reply: "已补充风险预案，并拆出了风险识别、负责人和响应机制。", operations: [{ type: "add-child", parentId: document.root.id, title: "风险预案", children: ["风险识别", "责任人员", "响应机制"] }] };
  }

  if (/(预算|成本|资源)/.test(text)) {
    return { reply: "我增加了预算与资源分支，方便把投入和责任落实到位。", operations: [{ type: "add-child", parentId: document.root.id, title: "预算与资源", children: ["费用拆分", "人员分工", "外部资源"] }] };
  }

  if (/(精简|收敛|合并)/.test(text)) {
    return { reply: "这会调整多个分支，建议先预览整体变化。演示模式会保留当前结构，你可以点选具体节点让我逐项精简。", operations: [], requiresConfirmation: true };
  }

  return { reply: "我理解了。为了让这张策划更可执行，我建议下一步补充成功指标、负责人和时间节点。你也可以先点选任意节点，再说“展开这部分”。", operations: [], suggestion: "补充成功指标和时间节点" };
}
