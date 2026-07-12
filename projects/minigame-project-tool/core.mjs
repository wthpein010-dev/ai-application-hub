export const quickQuestions = [
  q("project_name", "项目名称", "给游戏一个便于识别的名称", { critical: true }),
  q("game_type", "游戏主类型", "选择最接近核心体验的类型", { critical: true, options: ["休闲益智", "合成放置", "模拟经营", "动作闯关", "塔防策略", "卡牌养成", "跑酷", "自定义"] }),
  q("core_gameplay", "一句话核心玩法", "描述玩家反复进行的核心操作", { critical: true, multiline: true }),
  q("art_style", "主美术风格", "高级问卷会根据风格联动", { critical: true, options: ["卡通", "像素", "国风", "科幻", "写实", "极简", "手绘", "低多边形", "赛博朋克", "奇幻", "自定义"] }),
  q("first_version_scope", "首版主要目标", "例如：完成一局可玩的核心循环", { critical: true, multiline: true })
];

export const advancedSections = [
  section("gameplay", "核心玩法", [
    q("player_goal", "玩家目标", "玩家最终要完成什么", { multiline: true }),
    q("win_condition", "胜利条件", "怎样算赢"),
    q("fail_condition", "失败条件", "怎样算失败"),
    q("session_length", "单局时长", "推荐 1–5 分钟", { options: ["1分钟内", "1–3分钟", "3–5分钟", "5–10分钟", "10分钟以上"] }),
    q("difficulty_curve", "难度曲线", "难度怎样逐步增加", { multiline: true })
  ]),
  section("player", "玩家体验", [
    q("target_player", "目标玩家", "主要面向谁"),
    q("control_mode", "操作方式", "微信小游戏优先触控", { options: ["单指点击", "单指拖动", "双指操作", "虚拟摇杆", "自动进行"] }),
    q("desired_emotion", "期望情绪", "例如轻松、紧张、治愈"),
    q("tutorial", "新手引导", "如何帮助玩家理解规则", { multiline: true })
  ]),
  section("visual", "视觉风格", [
    q("theme", "题材主题", "例如动物、城市、太空"),
    q("color_direction", "色彩倾向", "主色和氛围"),
    q("character_style", "角色表现", "比例、轮廓与表情", { multiline: true }),
    q("pixel_density", "像素密度", "例如 16px 或 32px 基准", { visibleForStyle: "像素" }),
    q("ink_style", "国风表现", "水墨、工笔或剪纸", { options: ["水墨", "工笔", "剪纸", "传统纹样"], visibleForStyle: "国风" }),
    q("sci_fi_tone", "科幻倾向", "硬科幻或软科幻", { options: ["硬科幻", "软科幻", "霓虹未来"], visibleForStyle: "科幻" })
  ]),
  section("ui", "UI 与页面", [
    q("pages", "主要页面", "用逗号列出页面", { multiline: true }),
    q("hud", "游戏内 HUD", "需要持续显示的信息", { multiline: true }),
    q("safe_area", "安全区策略", "适配刘海和底部系统区域", { options: ["自动安全区", "关键按钮内缩", "自定义"] }),
    q("ui_motion", "UI 动效强度", "界面动画的丰富程度", { options: ["极少", "适中", "丰富"] })
  ]),
  section("wechat", "微信能力", [
    q("wechat_features", "需要的平台能力", "登录、存档、分享、广告、排行或网络", { multiline: true }),
    q("sdk_solution", "转换或发布方案", "未确定可留空"),
    q("privacy", "隐私授权要求", "涉及哪些权限和授权时机", { multiline: true }),
    q("monetization", "商业化方式", "首版变现设计", { options: ["无", "激励广告", "插屏广告", "支付", "混合"] })
  ]),
  section("content", "资源与音频", [
    q("content_scale", "内容规模", "角色、场景和关卡数量", { multiline: true }),
    q("music", "音乐需求", "是否需要循环背景音乐"),
    q("sound", "音效需求", "关键反馈音效"),
    q("asset_source", "素材来源", "默认先用色块原型", { options: ["色块原型", "用户提供", "许可素材", "生成素材", "混合"] })
  ]),
  section("performance", "性能与适配", [
    q("target_devices", "目标设备", "低端、中端或高端"),
    q("target_fps", "目标帧率", "推荐 60 或稳定 30", { options: ["30 FPS", "60 FPS"] }),
    q("offline_behavior", "断网表现", "断网时如何提示或继续", { multiline: true }),
    q("memory_budget", "内存预算", "包体和运行内存约束")
  ]),
  section("acceptance", "验收标准", [
    q("acceptance", "首版验收标准", "怎样判断第一版可确认", { multiline: true }),
    q("excluded_scope", "首版明确不做", "用于控制范围", { multiline: true }),
    q("test_devices", "测试设备", "至少覆盖哪些设备", { multiline: true }),
    q("version_strategy", "版本回退策略", "大改动如何记录和回退", { multiline: true })
  ])
];

export const defaultMemory = `# Unity 微信小游戏通用开发记忆库

## 固定技术基线

- Unity 工程版本：2022.3.62f3c1。
- UI 使用 UGUI，界面组件优先制作成可编辑预制体。
- 设计画布为 750×1624，并保持比例适配不同分辨率和安全区。
- 初版界面先使用 Unity 色块图形验证结构与交互。
- 第一版确认后再整理正式资源，资源名中的下划线最多使用两个。

## 开发流程

- 开发前先写文档，检查关键缺失项和相互冲突的要求。
- 保留已有内容；删除、覆盖、批量移动等高风险操作先确认。
- 每次大改动同步更新记忆文件和变更记录，保持可版本回退。
- 微信小游戏能力、性能预算、隐私授权和验收设备应在实施前确认。
`;

const baseline = {
  unity_version: "2022.3.62f3c1",
  ui_technology: "UGUI",
  reference_width: "750",
  reference_height: "1624",
  target_platform: "微信小游戏",
  orientation: "竖屏",
  adaptation: "等比缩放 + 安全区适配",
  asset_prototype: "Unity 色块图形",
  version_strategy: "每次大改动更新文档并创建可回退版本"
};

export function createDefaultDraft() {
  const values = { ...baseline };
  for (const question of [...quickQuestions, ...advancedSections.flatMap(item => item.questions)]) {
    if (!(question.id in values)) values[question.id] = "";
  }
  return values;
}

export function getVisibleQuestions(style = "") {
  return [...quickQuestions, ...advancedSections.flatMap(item => item.questions)]
    .filter(question => !question.visibleForStyle || question.visibleForStyle === style);
}

export function checkCompleteness(draft = {}) {
  const issues = [];
  for (const question of quickQuestions.filter(item => item.critical)) {
    if (!text(draft[question.id])) {
      issues.push({ level: "critical", sectionId: "quick", fieldId: question.id, message: missingMessage(question.id) });
    }
  }
  recommend(issues, draft, "confirmation", "wechat", "sdk_solution", "实施微信平台能力前确认转换或发布方案");
  recommend(issues, draft, "confirmation", "ui", "pages", "进入完整 UI 制作前确认页面清单");
  recommend(issues, draft, "suggestion", "performance", "target_fps", "建议选择目标帧率");
  recommend(issues, draft, "suggestion", "acceptance", "acceptance", "建议补充首版验收标准");
  return issues;
}

export function generateMarkdown(draft = {}, generatedAt = formatDate(new Date())) {
  const data = { ...createDefaultDraft(), ...draft };
  const issues = checkCompleteness(data);
  const lines = [
    `# 游戏项目需求：${text(data.project_name) || "未命名游戏"}`,
    "",
    `> 生成时间：${generatedAt}`,
    `> Unity ${data.unity_version}｜平台：${data.target_platform}｜UI：${data.ui_technology}｜基准：${data.reference_width}×${data.reference_height}`,
    "",
    "## 项目摘要",
    "",
    row("游戏类型", data.game_type || "待确认"),
    row("核心玩法", data.core_gameplay || "待确认"),
    row("美术风格", data.art_style || "待确认"),
    row("首版目标", data.first_version_scope || "待确认"),
    ""
  ];

  for (const item of advancedSections) {
    const answers = item.questions
      .filter(question => !question.visibleForStyle || question.visibleForStyle === data.art_style)
      .filter(question => text(data[question.id]));
    if (!answers.length) continue;
    lines.push(`## ${item.title}`, "", ...answers.map(question => row(question.label, data[question.id])), "");
  }

  lines.push("## 技术基线", "",
    row("Unity", data.unity_version),
    row("目标平台", data.target_platform),
    row("UI 技术", data.ui_technology),
    row("设计画布", `${data.reference_width}×${data.reference_height}`),
    row("适配策略", data.adaptation),
    row("原型资源", data.asset_prototype),
    "",
    "## 待确认事项", "");

  if (!issues.length) lines.push("- 当前没有已知缺失项。");
  for (const issue of issues) lines.push(`- [${levelLabel(issue.level)}] ${issue.message}`);

  lines.push("", "## Codex 开发指令", "",
    "请先同时阅读本文件中的项目需求与 `UNITY_MINIGAME_MEMORY.md` 通用记忆，检查冲突和缺失，确认设计后再开始实现。默认建议不得替代用户明确需求。",
    "",
    defaultMemory.trim(),
    "");

  return lines.join("\n");
}

export function sanitizeFileName(name) {
  const cleaned = text(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/[. ]+$/g, "").trim();
  return cleaned || "小游戏立项需求";
}

function q(id, label, help, options = {}) {
  return { id, label, help, options: [], multiline: false, critical: false, visibleForStyle: "", ...options };
}

function section(id, title, questions) {
  return { id, title, questions: questions.map(question => ({ ...question, sectionId: id })) };
}

function recommend(issues, draft, level, sectionId, fieldId, message) {
  if (!text(draft[fieldId])) issues.push({ level, sectionId, fieldId, message });
}

function missingMessage(id) {
  return {
    project_name: "请填写项目名称",
    game_type: "请选择游戏主类型",
    core_gameplay: "请说明玩家反复进行的核心操作",
    art_style: "请选择主美术风格",
    first_version_scope: "请确定首版主要目标"
  }[id];
}

function levelLabel(level) {
  return level === "critical" ? "关键缺失" : level === "confirmation" ? "实施前确认" : "优化建议";
}

function row(label, value) {
  return `- **${label}：** ${String(value).replace(/[\r\n]+/g, " ").trim()}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function formatDate(date) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
