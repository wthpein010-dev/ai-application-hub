const STORAGE_KEY = "ai-competition-hub-v2-apps";
const PAGE_TEXT_STORAGE_KEY = "ai-competition-hub-v2-page-text";
const SELECTED_KEY = "ai-competition-hub-v2-selected";
const PROJECT_ROOT_URL = "./projects/";
const OLD_HUB_BRIEF = "把所有应用、体验入口、下载包和提交材料集中在一个本地页面中，方便审核和维护。";
const HUB_BRIEF = "通过 Codex 调用 HyperFrames，快速制作网页动态效果；支持编辑和调整网页描述，沉淀可定制化网页模板的小工具设计。";

const statusLabel = {
  navigation: "项目导航",
  content: "内容工具",
  plugin: "插件工具",
  assistant: "辅助工具",
  game: "小游戏",
  ai: "AI版",
  engineering: "工程体验",
  life: "生活工具",
  training: "训练工具",
  idea: "创意工具",
  desktop: "桌面工具"
};

const defaultPageText = {
  "brand.title": "AI 应用总览",
  "nav.overview": "总览",
  "nav.apps": "应用",
  "nav.platforms": "平台",
  "nav.maintain": "维护",
  "hero.title": "AI 应用方案整理器",
  "hero.description": "通过 Codex 调用 HyperFrames，快速制作网页动态效果；支持编辑修改网页描述，并沉淀可定制化网页模板的小工具设计。",
  "hero.primaryAction": "查看应用集合",
  "hero.secondaryAction": "查看平台入口",
  "metrics.total": "总数",
  "metrics.apps": "应用",
  "metrics.games": "小游戏",
  "metrics.totalNote": "全部收录项目",
  "metrics.appsNote": "工具与内容类",
  "metrics.gamesNote": "可体验游戏原型",
  "filter.title": "筛选应用",
  "filter.searchLabel": "搜索",
  "filter.categoryLabel": "分类",
  "filter.statusLabel": "类型",
  "filter.sortLabel": "排序",
  "apps.title": "应用项目集合",
  "games.title": "小游戏体验集合",
  "engineering.title": "工程在线体验",
  "engineering.description": "项目组打包内部体验测试入口，只保留在线演示，方便快速检查 WebGL 包和浏览器运行状态。",
  "platforms.title": "跨平台体验",
  "platforms.description": "按网页、Windows、Mac 三种方式整理体验入口。网页和通用包可跨系统打开；桌面工具优先提供对应系统包。",
  "maintain.title": "维护控制台",
  "maintain.description": "输入 1 或点击更新，刷新统计、卡片和详情；也可以在右侧编辑主要文案。"
};

const pageTextTargets = [
  { key: "brand.title", label: "品牌标题", selector: ".brand strong", short: true },
  { key: "nav.overview", label: "导航：总览", selector: ".top-nav nav a:nth-child(1)", short: true },
  { key: "nav.apps", label: "导航：应用", selector: ".top-nav nav a:nth-child(2)", short: true },
  { key: "nav.platforms", label: "导航：平台", selector: ".top-nav nav a:nth-child(3)", short: true },
  { key: "nav.maintain", label: "导航：维护", selector: ".top-nav nav a:nth-child(4)", short: true },
  { key: "hero.title", label: "主页标题", selector: ".hero-copy h1" },
  { key: "hero.description", label: "主页描述", selector: ".hero-lead", multiline: true },
  { key: "hero.primaryAction", label: "主按钮", selector: ".hero-actions .primary-action", short: true },
  { key: "hero.secondaryAction", label: "平台按钮", selector: ".hero-actions .ghost-action[href=\"#platforms\"]", short: true },
  { key: "metrics.total", label: "统计：总数", selector: ".metric-strip .metric:nth-child(1) span", short: true },
  { key: "metrics.apps", label: "统计：应用", selector: ".metric-strip .metric:nth-child(2) span", short: true },
  { key: "metrics.games", label: "统计：小游戏", selector: ".metric-strip .metric:nth-child(3) span", short: true },
  { key: "metrics.totalNote", label: "统计说明：总数", selector: ".metric-strip .metric:nth-child(1) .metric-note", short: true },
  { key: "metrics.appsNote", label: "统计说明：应用", selector: ".metric-strip .metric:nth-child(2) .metric-note", short: true },
  { key: "metrics.gamesNote", label: "统计说明：小游戏", selector: ".metric-strip .metric:nth-child(3) .metric-note", short: true },
  { key: "filter.title", label: "筛选标题", selector: ".filter-panel h2" },
  { key: "filter.searchLabel", label: "搜索标签", selector: "label[for=\"searchInput\"]", short: true },
  { key: "filter.categoryLabel", label: "分类标签", selector: "label[for=\"categoryFilter\"]", short: true },
  { key: "filter.statusLabel", label: "类型标签", selector: "label[for=\"statusFilter\"]", short: true },
  { key: "filter.sortLabel", label: "排序标签", selector: "label[for=\"sortMode\"]", short: true },
  { key: "apps.title", label: "应用区标题", selector: ".app-list .section-heading h2" },
  { key: "games.title", label: "小游戏标题", selector: "#games .section-heading h2" },
  { key: "engineering.title", label: "工程体验标题", selector: "#engineering .section-heading h2" },
  { key: "engineering.description", label: "工程体验说明", selector: "#engineering .engineering-description", multiline: true },
  { key: "platforms.title", label: "平台标题", selector: "#platforms h2" },
  { key: "platforms.description", label: "平台描述", selector: "#platforms .section-head > p:last-child", multiline: true },
  { key: "maintain.title", label: "维护标题", selector: "#maintain h2" },
  { key: "maintain.description", label: "维护描述", selector: "#maintain .section-head > p:last-child", multiline: true }
];

const defaultApps = [
  {
    id: "hub",
    name: "AI 应用方案整理器",
    category: "项目总览",
    status: "navigation",
    brief: HUB_BRIEF,
    problem: "项目材料分散在多个目录，临近提交时难以快速判断哪个项目最完整、入口在哪里、还缺什么。",
    aiUse: "AI 用于整理应用说明、维护建议、入口状态和提交材料清单。",
    folder: "./",
    entry: "./index.html",
    video: "./projects/AI\u5e94\u7528\u65b9\u6848\u6574\u7406\u5668/\u89c6\u9891\u8d44\u6e90/index.html",
    package: "./downloads/ai-application-hub.zip",
    platforms: {
      web: "./index.html",
      windows: "./downloads/ai-application-hub.zip",
      mac: "./downloads/ai-application-hub.zip"
    },
    tags: ["总览", "导航", "清单", "维护"],
    speed: 9,
    impact: 8,
    risk: 9,
    polish: 9
  },
  {
    id: "gamepulse-mini-radar",
    name: "小游戏每日排行",
    category: "小游戏产品洞察",
    status: "assistant",
    brief: "把国内微信小游戏热门榜、畅销榜与海外美国 iOS 休闲前十放在同一张开发者工作台上。",
    problem: "小游戏开发者需要快速发现国内轻休闲产品与海外休闲榜变化，同时保留可核验的原始名次和数据状态。",
    aiUse: "AI 参与榜单清洗、轻休闲筛选、产品信号整理和异常回退；站点每天北京时间 07:10 后检查更新。",
    folder: "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site",
    entry: "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site",
    video: "./projects/gamepulse-mini-radar/video/index.html",
    package: "",
    platforms: {
      web: {
        href: "https://gamepulse-mini-radar.polite-chord-7994.chatgpt.site",
        label: "演示"
      },
      windows: "",
      mac: ""
    },
    tags: ["小游戏排行", "微信小游戏", "iOS 休闲榜", "产品洞察"],
    speed: 9,
    impact: 9,
    risk: 8,
    polish: 9
  },
  {
    id: "icecream",
    name: "IceCream 冰激凌工坊",
    category: "Unity 微信小游戏",
    status: "game",
    brief: "面向微信小游戏的竖屏冰激凌配单游戏：按顾客需求选择口味、制作甜筒并连续闯过 10 个关卡。",
    problem: "需要一套可直接网页试玩、可下载完整 Unity 工程、同时提供微信小游戏转换包的 UGUI 项目样例。",
    aiUse: "AI 参与玩法扩展、10 关配置、UGUI 预制体、750×1624 安全区适配、进度存档、WebGL 与微信小游戏构建及发布验证。",
    folder: "./projects/icecream/",
    entry: "./projects/icecream/index.html",
    video: "./projects/icecream/video/index.html",
    package: "./downloads/icecream-unity-project.zip",
    platforms: {
      web: { href: "./projects/icecream/index.html", label: "试玩" },
      windows: { href: "./downloads/icecream-unity-project.zip", label: "工程下载" },
      mac: { href: "./downloads/icecream-wechat-minigame.zip", label: "微信包下载" }
    },
    tags: ["Unity", "UGUI", "冰激凌", "微信小游戏"],
    speed: 9,
    impact: 9,
    risk: 7,
    polish: 8
  },
  {
    id: "vita-mahjong",
    name: "羊了个羊：对对碰",
    category: "Unity H5 AI版",
    status: "ai",
    brief: "基于羊了个羊体验做的后续玩法变形，以拟人砖块、槽位、道具和城市羊群包装构成可直接游玩的 H5 原型。",
    problem: "需要一个外网可访问的最新 WebGL 包，方便团队、朋友或外部评审直接打开体验，不依赖局域网服务。",
    aiUse: "AI 参与关卡编辑器、关卡逻辑、道具流程、UI 调整、WebGL 打包和外网发布流程维护。",
    folder: "./projects/vita-mahjong/",
    entry: "./projects/vita-mahjong/index.html",
    video: "./projects/vita-mahjong/video/index.html",
    package: "./downloads/vita-mahjong-webgl.zip",
    platforms: {
      web: "./projects/vita-mahjong/index.html",
      windows: "./downloads/vita-mahjong-webgl.zip",
      mac: "./downloads/vita-mahjong-webgl.zip"
    },
    tags: ["Unity", "WebGL", "AI版", "羊了个羊"],
    speed: 8,
    impact: 9,
    risk: 7,
    polish: 8
  },
  {
    id: "zhuanglege-sha",
    name: "装了个啥",
    category: "Unity H5 小游戏",
    status: "game",
    brief: "机场安检审核题材的竖屏闯关小游戏，切换普通、X 光和轮廓视图，判断行李能否放行。",
    problem: "玩家像安检员一样观察行李内部物品，在不计时的轻解谜节奏中识别危险品、干扰物和条件违规物。",
    aiUse: "AI 参与玩法设定、关卡规则、文档排版、Unity 工程拆分、程序化 UI 和 WebGL 构建同步。",
    folder: "./projects/zhuanglege-sha/",
    entry: "./projects/zhuanglege-sha/index.html",
    video: "./projects/zhuanglege-sha/video/index.html",
    package: "",
    platforms: {
      web: "./projects/zhuanglege-sha/index.html",
      windows: "",
      mac: ""
    },
    tags: ["Unity", "WebGL", "安检", "观察判定"],
    speed: 8,
    impact: 8,
    risk: 7,
    polish: 8
  },
  {
    id: "paws-home-client",
    name: "羊了个羊：碰碰消",
    category: "项目组打包内部体验测试",
    status: "engineering",
    brief: "用于项目组打包测试，已打出 WebGL 体验包，适合直接在浏览器里打开试玩。",
    problem: "作为工程在线体验入口，只保留浏览器演示，用于快速检查 WebGL 包、加载状态和运行表现。",
    aiUse: "AI 参与离线 WebGL 打包、私有依赖兼容处理、发布目录整理、主页入口接入和跨平台访问验证。",
    folder: "./projects/paws-home-client/",
    entry: "./projects/paws-home-client/index.html",
    video: "./projects/paws-home-client/video/index.html",
    package: "",
    platforms: {
      web: "./projects/paws-home-client/index.html",
      windows: "",
      mac: ""
    },
    tags: ["Unity", "WebGL", "内部测试", "工程包"],
    speed: 8,
    impact: 8,
    risk: 7,
    polish: 8
  },
  {
    id: "paws-level-editor",
    name: "关卡3D编辑器",
    category: "关卡编辑与3D预览",
    status: "engineering",
    brief: "已同步 22 个当前工程关卡：可导入本地 JSON、浏览器内 AI 生成可解关卡，并在 2D/3D 中编辑和试玩验证。",
    problem: "关卡布局、遮挡关系与实际试玩分散在不同工具中，修改后难以快速确认空间层级和可玩性。",
    aiUse: "AI 参与关卡统计学习、受约束布局生成、自动求解、JSON 兼容、2D/3D 编辑视图和自动化验收。",
    folder: "./projects/paws-level-editor/",
    entry: "./projects/paws-level-editor/index.html",
    video: "./projects/paws-level-editor/video/index.html",
    package: "",
    platforms: {
      web: "./projects/paws-level-editor/index.html",
      windows: "",
      mac: ""
    },
    tags: ["关卡编辑", "AI关卡", "Three.js", "2D/3D", "试玩"],
    speed: 9,
    impact: 9,
    risk: 9,
    polish: 9
  },
  {
    id: "fill-what",
    name: "填了个啥",
    category: "Unity 微信小游戏原型",
    status: "game",
    brief: "以成语填字和诗意来信为核心的竖屏小游戏，使用 Unity UGUI 搭建界面，支持调试面板、关卡快照和过关结算。",
    problem: "需要一个能直接在线体验、又能下载完整 Unity 工程继续改预制体和资源的小游戏样例，方便后续迁移到微信小游戏流程。",
    aiUse: "AI 参与玩法拆解、UGUI 预制体结构、750×1624 适配、关卡内容、WebGL 发布页和下载包整理。",
    folder: "./projects/fill-what/",
    entry: "./projects/fill-what/index.html",
    video: "./projects/fill-what/\u89c6\u9891\u8d44\u6e90/index.html",
    package: "./downloads/fill-what-unity-project.zip",
    platforms: {
      web: { href: "./projects/fill-what/index.html", label: "演示" },
      windows: { href: "./downloads/fill-what-unity-project.zip", label: "下载工程" }
    },
    tags: ["Unity", "UGUI", "成语填字", "微信小游戏"],
    speed: 8,
    impact: 8,
    risk: 7,
    polish: 8
  },
  {
    id: "codex-quota-bar",
    name: "Codex 用量悬浮条",
    category: "AI 开发桌面工具",
    status: "desktop",
    brief: "把 Codex 桌宠、醒目的剩余百分比和进度条贴合成一个悬浮工具，任务完成时用中文侧栏提示。",
    problem: "长时间使用 Codex 时，需要同时看清剩余额度与任务完成状态，又不能让详情切换、提示卡或重复桌宠干扰当前工作。",
    aiUse: "工具只读本机 Codex 额度与任务完成事件，不接触 auth.json；支持开机启动、托盘、固定置顶及 Windows/macOS 双平台工具包。",
    folder: "./projects/codex-quota-bar/",
    entry: "./projects/codex-quota-bar/index.html",
    video: "./projects/codex-quota-bar/video/index.html",
    package: "./downloads/CodexQuotaBar-Windows-x64.zip",
    platforms: {
      web: { href: "./projects/codex-quota-bar/index.html", label: "演示" },
      windows: { href: "./downloads/CodexQuotaBar-Windows-x64.zip", label: "Wins下载" },
      mac: { href: "./downloads/CodexQuotaBar-macOS.zip", label: "Mac下载" }
    },
    tags: ["Codex", "桌宠额度", "任务提示", "跨平台"],
    speed: 9,
    impact: 9,
    risk: 9,
    polish: 9
  },
  {
    id: "codex-thread-workbench",
    name: "Codex 多会话工作台",
    category: "AI 开发桌面工具",
    status: "desktop",
    brief: "在同一个 Windows 或 macOS 一级界面中同时查看和操作多个真实 Codex 线程，直接输入、停止、审批，并清晰区分进行中与已完成任务。",
    problem: "并行推进多个 Codex 任务时，频繁切换线程会打断判断，也难以及时发现等待输入、等待审批或已经完成的任务。",
    aiUse: "工具通过本机 codex app-server 连接真实线程，不读取凭据；AI 参与协议接入、状态投影、多窗口会话交互和 Windows、macOS 双架构发布验证。",
    folder: "./projects/codex-thread-workbench/",
    entry: "./projects/codex-thread-workbench/index.html",
    video: "./projects/codex-thread-workbench/video/index.html",
    package: "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/",
    platforms: {
      web: { href: "./projects/codex-thread-workbench/index.html", label: "交互演示" },
      windows: { href: "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/", label: "Windows下载" },
      mac: { href: "https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/", label: "Mac下载" }
    },
    tags: ["Codex", "多线程", "桌面工作台", "Windows", "macOS"],
    speed: 9,
    impact: 9,
    risk: 9,
    polish: 9
  },
  {
    id: "web-media-collector",
    name: "网页素材一键收桌面版",
    category: "网页素材整理",
    status: "desktop",
    brief: "输入网页 URL，在始终置顶的桌面窗口里扫描、筛选、预览并批量下载公开网页素材。",
    problem: "浏览器扩展弹窗无法真正固定置顶，做设计参考、资料整理和内容采集时，需要一个能停留在屏幕上方的独立工具。",
    aiUse: "AI 参与产品定位、桌面交互设计、跨平台打包说明、参赛说明和工具文案整理。",
    folder: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/",
    entry: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html",
    video: "./projects/\u670b\u53cb\u5708\u53d1\u56fe\u795e\u5668/01_\u4f5c\u54c1\u4f53\u9a8c\u5165\u53e3/\u7f51\u9875\u7d20\u6750\u4e00\u952e\u6536\u684c\u9762\u7248/\u89c6\u9891\u8d44\u6e90/\u6f14\u793a\u89c6\u9891.html",
    package: "./downloads/web-media-collector-desktop-source.zip",
    platforms: {
      web: { href: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html", label: "演示" },
      windows: { href: "./downloads/web-media-collector-desktop-source.zip", label: "源码包" },
      mac: { href: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html#macos", label: "macOS说明" }
    },
    tags: ["网页素材", "桌面版", "始终置顶", "批量下载"],
    speed: 8,
    impact: 8,
    risk: 7,
    polish: 8
  },
  {
    id: "xiang-le-ge-xiang",
    name: "箱了个箱",
    category: "2D 推箱子解谜小游戏",
    status: "game",
    brief: "只有两关的竖屏推箱子原型：第一关一推即过，第二关开场扫出大地图，再缩回当前区域，让玩家在低理解成本里一路觉得快过了。",
    problem: "需要一个能直接在线体验的微信/抖音小游戏方向样例，用第二关难度飞升制造传播梗，同时保持基础推箱子规则清晰易懂。",
    aiUse: "AI 参与玩法定位、第二关大地图结构、推箱子规则引擎、Canvas 渲染、移动端操作和自动化通关测试。",
    folder: "./projects/xiang-le-ge-xiang/",
    entry: "./projects/xiang-le-ge-xiang/index.html",
    video: "./projects/xiang-le-ge-xiang/video/index.html",
    package: "",
    platforms: {
      web: { href: "./projects/xiang-le-ge-xiang/index.html", label: "体验" },
      windows: "",
      mac: ""
    },
    tags: ["推箱子", "小游戏", "第二关", "解谜"],
    speed: 9,
    impact: 9,
    risk: 8,
    polish: 8
  },
  {
    id: "minigame-project-simulator",
    name: "小游戏立项工具",
    category: "游戏立项与需求工具",
    status: "assistant",
    brief: "用快速选项和可展开问卷整理小游戏立项需求，生成可直接交给 Codex 的项目需求与 Unity 微信小游戏通用开发记忆。",
    problem: "新游戏开始前，玩法、范围、视觉风格、微信能力、性能和验收要求容易缺失，导致 Codex 或开发人员反复追问、方向漂移，也不便于形成可回退的书面基线。",
    aiUse: "工具把用户选择整理为结构化 Markdown，让 Codex 先检查关键缺失和冲突，再按 Unity 2022.3.62f3c1、uGUI、750×1624 与微信小游戏约束开展设计和开发。",
    folder: "./projects/minigame-project-tool/",
    entry: "./projects/minigame-project-tool/index.html",
    video: "./projects/minigame-project-tool/video/index.html",
    package: "./downloads/minigame-project-simulator-windows.zip",
    platforms: {
      web: { href: "./projects/minigame-project-tool/index.html", label: "演示" },
      windows: { href: "./downloads/minigame-project-simulator-windows.zip", label: "Windows下载" },
      mac: ""
    },
    tags: ["微信小游戏", "Unity", "需求文档", "Codex"],
    speed: 9,
    impact: 9,
    risk: 8,
    polish: 9
  },
  {
    id: "ai-game-requirements-workshop",
    name: "AI游戏需求工坊",
    category: "游戏需求与 AI 开发",
    status: "assistant",
    brief: "通过灵感组合和开发配置，一次生成可直接交给 Codex 等 AI 工具执行的游戏开发任务书。",
    problem: "游戏灵感、玩法范围和开发约束常被拆成多轮消息，AI 反复追问后仍容易遗漏引擎版本、UI 技术和验收标准。",
    aiUse: "工具把设计者的选择整理成包含技术环境、核心循环、MVP、模块、风险、验收标准和原型计划的结构化 Markdown。",
    folder: "https://gamepop-studio-20260713.polite-chord-7994.chatgpt.site",
    entry: "https://gamepop-studio-20260713.polite-chord-7994.chatgpt.site",
    video: "./projects/ai-game-requirements-workshop/video/index.html",
    package: "",
    platforms: {
      web: { href: "https://gamepop-studio-20260713.polite-chord-7994.chatgpt.site", label: "演示" },
      windows: "",
      mac: ""
    },
    tags: ["游戏策划", "Unity", "Cocos", "Codex"],
    speed: 9,
    impact: 9,
    risk: 9,
    polish: 9
  },
  {
    id: "planner-daily-quiz",
    name: "每日策划知识考核",
    category: "策划训练答卷",
    status: "training",
    brief: "面向休闲游戏和对对碰项目的每日训练题库，每天 0 点刷新一轮题，限时答题后给出批改、答案说明和错题强化建议。",
    problem: "策划训练如果只靠文档阅读，很难形成稳定复习节奏，也不容易沉淀错题、薄弱能力和每日训练记录。",
    aiUse: "AI 后续可接入主观题点评、错题解释、同类练习生成和能力画像总结；当前版本先完成每日抽题、倒计时、自动批改和本地记录。",
    folder: "./projects/planner-daily-quiz/",
    entry: "./projects/planner-daily-quiz/index.html",
    video: "./projects/planner-daily-quiz/video/index.html",
    package: "",
    platforms: {
      web: "./projects/planner-daily-quiz/index.html",
      windows: "",
      mac: ""
    },
    tags: ["策划训练", "每日答题", "错题反馈", "题库"],
    speed: 9,
    impact: 8,
    risk: 8,
    polish: 8
  },
  {
    id: "travel-generator",
    name: "朋友圈发图神器",
    category: "AI 内容生成",
    status: "content",
    brief: "输入旅行心情和目的地，生成拍照任务、九宫格结构、预算建议和可直接发布的朋友圈文案。",
    problem: "旅行后照片很多，但整理成可发布的内容费时，文案、配图和节奏经常不统一。",
    aiUse: "AI 理解场景与情绪，生成拍照任务、图片收集建议、预算提醒和多风格分享文案。",
    folder: "./projects/朋友圈发图神器/",
    entry: "./projects/朋友圈发图神器/01_作品体验入口/app/index.html",
    video: "./projects/朋友圈发图神器/03_演示视频/演示视频.html",
    package: "./downloads/travel-generator-universal.zip",
    platforms: {
      web: "./projects/朋友圈发图神器/01_作品体验入口/app/index.html",
      windows: "./downloads/travel-generator-universal.zip",
      mac: "./downloads/travel-generator-mac-source.zip"
    },
    tags: ["旅行", "朋友圈", "文案", "九宫格"],
    speed: 9,
    impact: 9,
    risk: 8,
    polish: 9
  },
  {
    id: "feishu-downloader",
    name: "飞书文件批量下载插件",
    category: "浏览器插件",
    status: "plugin",
    brief: "面向飞书文档和文件资源整理场景，提供更清晰的批量下载和插件说明入口。",
    problem: "飞书资料分散在不同文档和文件里，手动逐个下载效率低，交付审核时也难以复查。",
    aiUse: "AI 参与需求拆解、交互文案、安装说明和审核材料梳理。",
    folder: "./projects/飞书文件批量下载插件/",
    entry: "./projects/飞书文件批量下载插件/index.html",
    video: "./projects/\u98de\u4e66\u6587\u4ef6\u6279\u91cf\u4e0b\u8f7d\u63d2\u4ef6/\u89c6\u9891\u8d44\u6e90/\u6f14\u793a\u89c6\u9891.html",
    package: "./downloads/feishu-batch-downloader-extension.zip",
    platforms: {
      web: "./projects/飞书文件批量下载插件/index.html",
      windows: "./downloads/feishu-batch-downloader-extension.zip",
      mac: "./downloads/feishu-batch-downloader-extension.zip"
    },
    tags: ["飞书", "插件", "批量下载", "资料整理"],
    speed: 8,
    impact: 9,
    risk: 7,
    polish: 8
  },
  {
    id: "codex-reviewer",
    name: "Codex 对话评分工具",
    category: "效率工具",
    status: "assistant",
    brief: "读取 Codex 对话记录并进行整理、分析和导出，帮助复盘 AI 协作过程。",
    problem: "长对话里有大量决策、修改和验证记录，人工复盘成本高，也不容易发现质量波动。",
    aiUse: "AI 用于总结对话、抽取任务进展、检查风险点并形成复盘报告。",
    folder: "./projects/Codex对话评分工具/",
    entry: "./projects/Codex对话评分工具/index.html",
    video: "./projects/Codex对话评分工具/视频资源/演示视频.html",
    package: "./downloads/codex-reviewer-windows.zip",
    platforms: {
      web: "./projects/Codex对话评分工具/index.html",
      windows: "./downloads/codex-reviewer-windows.zip",
      mac: "./downloads/codex-reviewer-mac-source.zip"
    },
    tags: ["Codex", "复盘", "报告", "整理"],
    speed: 8,
    impact: 8,
    risk: 8,
    polish: 7
  },
  {
    id: "codex-habit-tool",
    name: "Codex 习惯设置工具",
    category: "Codex 效率工具",
    status: "desktop",
    brief: "把常用模型、中文界面、全局快捷键、任务命名和对话报告集中到一个本地设置工具里。",
    problem: "每台新电脑都要重复配置 Codex，常用模型、中文偏好和快捷键容易遗漏，任务名称也缺少统一整理入口。",
    aiUse: "AI 用于归纳任务内容、生成精简名称、提取对话报告，并把个人使用习惯沉淀为可复用的本地配置。",
    folder: "./projects/codex-habit-tool/",
    entry: "./projects/codex-habit-tool/index.html",
    video: "./videos/codex-habit-tool-demo.html",
    package: "./downloads/codex-habit-tool-windows.zip",
    platforms: {
      web: { href: "./projects/codex-habit-tool/index.html", label: "演示" },
      windows: { href: "./downloads/codex-habit-tool-windows.zip", label: "Windows 下载" },
      mac: { href: "./downloads/codex-habit-tool-mac-source.zip", label: "Mac 源码包" }
    },
    tags: ["Codex", "快捷键", "中文界面", "任务命名"],
    speed: 9,
    impact: 9,
    risk: 8,
    polish: 8
  },
  {
    id: "wanhuatong",
    name: "万话筒",
    category: "AI 表达转换",
    status: "life",
    brief: "把一段话转换成情绪表达、生活说明、情书暗语、多语言或古诗古文版本。",
    problem: "同一句话在不同关系、场景和语言里需要不同说法，临时组织表达既费时又容易说偏。",
    aiUse: "AI 用于识别表达意图、切换语气风格、生成多语言版本，并把复杂内容整理成可直接使用的文本。",
    folder: "./projects/万话筒/",
    entry: "./projects/万话筒/index.html",
    video: "./projects/万话筒/视频资源/演示视频.html",
    package: "./downloads/wanhuatong.zip",
    platforms: {
      web: "./projects/万话筒/index.html",
      windows: "./downloads/wanhuatong.zip",
      mac: "./downloads/wanhuatong.zip"
    },
    tags: ["表达转换", "多语言", "情书", "古诗古文"],
    speed: 9,
    impact: 8,
    risk: 8,
    polish: 8
  },
];

let apps = loadApps();
let pageText = loadPageText();

const state = {
  query: "",
  category: "all",
  status: "all",
  sort: "default",
  selectedId: localStorage.getItem(SELECTED_KEY) || "travel-generator",
  editing: false
};

const nodes = {
  statTotal: document.querySelector("#statTotal"),
  statApps: document.querySelector("#statApps"),
  statGames: document.querySelector("#statGames"),
  spotlight: document.querySelector("#spotlightCard"),
  dots: document.querySelector("#showcaseDots"),
  prevApp: document.querySelector("#prevApp"),
  nextApp: document.querySelector("#nextApp"),
  search: document.querySelector("#searchInput"),
  category: document.querySelector("#categoryFilter"),
  status: document.querySelector("#statusFilter"),
  sort: document.querySelector("#sortMode"),
  grid: document.querySelector("#appGrid"),
  resultCount: document.querySelector("#resultCount"),
  gameGrid: document.querySelector("#gameGrid"),
  gameCount: document.querySelector("#gameCount"),
  engineeringGrid: document.querySelector("#engineeringGrid"),
  engineeringCount: document.querySelector("#engineeringCount"),
  platformGrid: document.querySelector("#platformGrid"),
  command: document.querySelector("#commandInput"),
  log: document.querySelector("#responseLog"),
  commandRun: document.querySelector("#commandRun"),
  runUpdate: document.querySelector("#runUpdate"),
  exportButton: document.querySelector("#exportButton"),
  editPanel: document.querySelector("#editPanel"),
  editClose: document.querySelector("#editClose"),
  editSave: document.querySelector("#editSave"),
  editReset: document.querySelector("#editReset"),
  editAppSelect: document.querySelector("#editAppSelect"),
  editName: document.querySelector("#editName"),
  editCategory: document.querySelector("#editCategory"),
  editBrief: document.querySelector("#editBrief"),
  editStatus: document.querySelector("#editStatus"),
  editTags: document.querySelector("#editTags"),
  editProblem: document.querySelector("#editProblem"),
  editAiUse: document.querySelector("#editAiUse"),
  editFolder: document.querySelector("#editFolder"),
  editEntry: document.querySelector("#editEntry"),
  editPackage: document.querySelector("#editPackage"),
  editVideo: document.querySelector("#editVideo"),
  pageTextFields: document.querySelector("#pageTextFields"),
};

bindEvents();
renderCategoryOptions();
render();
alignHashTarget();
finishListIntroAnimation();
log("页面已加载。输入 1 或点击更新，可刷新当前应用清单。");

function bindEvents() {
  nodes.search.addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  nodes.category.addEventListener("change", event => {
    state.category = event.target.value;
    render();
  });

  nodes.status.addEventListener("change", event => {
    state.status = event.target.value;
    render();
  });

  nodes.sort.addEventListener("change", event => {
    state.sort = event.target.value;
    render();
  });

  nodes.dots.addEventListener("click", event => {
    const dot = event.target.closest("[data-dot-id]");
    if (!dot) return;
    selectApp(dot.dataset.dotId);
  });

  nodes.grid.addEventListener("click", handleAppCardClick);
  nodes.gameGrid?.addEventListener("click", handleAppCardClick);
  nodes.engineeringGrid?.addEventListener("click", handleAppCardClick);
  document.addEventListener("click", handleInlineEditClick);

  nodes.prevApp.addEventListener("click", () => switchApp(-1));
  nodes.nextApp.addEventListener("click", () => switchApp(1));

  nodes.command.addEventListener("keydown", event => {
    if (event.key === "Enter") runCommand();
  });

  nodes.commandRun.addEventListener("click", runCommand);
  nodes.runUpdate.addEventListener("click", runMaintenance);
  nodes.exportButton.addEventListener("click", toggleEditMode);
  nodes.editClose.addEventListener("click", closeEditMode);
  nodes.editSave.addEventListener("click", saveEditForm);
  nodes.editReset.addEventListener("click", resetEdits);

  nodes.editAppSelect.addEventListener("change", event => {
    selectApp(event.target.value);
    renderEditForm();
  });
}

function render() {
  const filtered = getFilteredApps();
  ensureSelectedApp(filtered);
  renderPageText();
  renderStats();
  renderSpotlight();
  renderDots(filtered);
  renderGrid(filtered);
  renderGameGrid(filtered);
  renderEngineeringGrid(filtered);
  renderPlatformShowcase(filtered);
  renderEditForm();
}

function finishListIntroAnimation() {
  window.setTimeout(() => {
    document.body.classList.add("card-intro-complete");
  }, 900);
}

function alignHashTarget() {
  const id = window.location.hash.slice(1);
  if (!id) return;
  window.setTimeout(() => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ block: "start" });
  }, 0);
}

function renderCategoryOptions() {
  const categories = [...new Set(apps.map(app => app.category))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  nodes.category.innerHTML = [
    `<option value="all">全部分类</option>`,
    ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");
  nodes.category.value = state.category;
}

function getFilteredApps() {
  const query = state.query;
  return apps
    .filter(app => {
      const haystack = [app.name, app.category, app.brief, app.problem, app.aiUse, ...app.tags].join(" ").toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesCategory = state.category === "all" || app.category === state.category;
      const matchesStatus = state.status === "all" || app.status === state.status;
      return matchesQuery && matchesCategory && matchesStatus;
    })
    .sort((a, b) => {
      if (state.sort === "type") return statusLabel[a.status].localeCompare(statusLabel[b.status], "zh-CN") || a.name.localeCompare(b.name, "zh-CN");
      if (state.sort === "category") return a.category.localeCompare(b.category, "zh-CN") || a.name.localeCompare(b.name, "zh-CN");
      if (state.sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      return defaultApps.findIndex(item => item.id === a.id) - defaultApps.findIndex(item => item.id === b.id);
    });
}

function getNavigationApps(filtered = getFilteredApps()) {
  return [
    ...filtered.filter(app => !["game", "engineering", "ai"].includes(app.status)),
    ...filtered.filter(app => app.status === "game").sort((a, b) => gameDisplayRank(a) - gameDisplayRank(b)),
    ...filtered.filter(app => ["engineering", "ai"].includes(app.status))
  ];
}

function renderStats() {
  nodes.statTotal.textContent = apps.length;
  nodes.statApps.textContent = apps.filter(app => app.status !== "navigation" && app.status !== "game").length;
  nodes.statGames.textContent = apps.filter(app => app.status === "game").length;
}

function renderSpotlight() {
  const app = getSelectedApp();
  const introText = spotlightIntro(app);
  const richText = app.problem;
  nodes.spotlight.innerHTML = `
    <div class="summary-copy">
      <span class="summary-type">${escapeHtml(app.category)}</span>
      <strong>${escapeHtml(app.name)}</strong>
      <p class="summary-intro">${escapeHtml(introText)}</p>
      <p class="summary-richtext"><span>使用场景</span><em>${escapeHtml(richText)}</em></p>
    </div>
  `;
}

function spotlightIntro(app) {
  const aiText = app.aiUse
    .replace(/^AI\s*用于/, "AI 负责")
    .replace(/^AI\s*参与/, "AI 参与");
  return `${app.brief} ${aiText}`;
}

function renderDots(filtered = getFilteredApps()) {
  nodes.dots.innerHTML = getNavigationApps(filtered).map(app => `
    <button class="showcase-dot ${app.id === state.selectedId ? "active" : ""}" type="button" data-dot-id="${escapeHtml(app.id)}" aria-label="${escapeHtml(app.name)}"></button>
  `).join("");
}

function renderGrid(filtered) {
  const applicationList = filtered.filter(app => !["game", "engineering", "ai"].includes(app.status));
  nodes.resultCount.textContent = `${applicationList.length} 个应用`;
  if (!applicationList.length) {
    nodes.grid.innerHTML = `<article class="app-card"><h3>没有匹配结果</h3><p>换个关键词或重置筛选条件再试。</p></article>`;
    return;
  }

  nodes.grid.innerHTML = applicationList.map((app, index) => renderAppCard(app, index)).join("");
}

function renderGameGrid(filtered) {
  if (!nodes.gameGrid) return;
  const gameList = filtered
    .filter(app => app.status === "game")
    .sort((a, b) => gameDisplayRank(a) - gameDisplayRank(b));
  if (nodes.gameCount) {
    nodes.gameCount.textContent = `${gameList.length} 个小游戏`;
  }
  if (!gameList.length) {
    nodes.gameGrid.innerHTML = `<article class="app-card"><h3>没有匹配结果</h3><p>换个关键词或重置筛选条件再试。</p></article>`;
    return;
  }

  nodes.gameGrid.innerHTML = gameList.map((app, index) => renderAppCard(app, index, " game-experience-card")).join("");
}

function renderEngineeringGrid(filtered) {
  if (!nodes.engineeringGrid) return;
  const engineeringList = filtered.filter(app => ["engineering", "ai"].includes(app.status));
  if (nodes.engineeringCount) {
    nodes.engineeringCount.textContent = `${engineeringList.length} 个工程体验`;
  }
  if (!engineeringList.length) {
    nodes.engineeringGrid.innerHTML = `<article class="app-card engineering-experience-card"><h3>没有匹配结果</h3><p>换个关键词或重置筛选条件再试。</p></article>`;
    return;
  }

  nodes.engineeringGrid.innerHTML = engineeringList.map((app, index) => renderAppCard(app, index, " engineering-experience-card", "engineering")).join("");
}

function renderAppCard(app, index = 0, extraClass = "", actionMode = "default") {
  return `
    <article class="app-card${extraClass} ${app.id === state.selectedId ? "selected" : ""}" data-app-id="${escapeHtml(app.id)}" style="--card-order:${index}">
      <div class="card-topline">
        <div class="card-meta">
          <span class="status-badge status-${escapeHtml(app.status)}">${escapeHtml(statusLabel[app.status])}</span>
          <span>${renderEditableText("app", "category", app.category, app.id)}</span>
        </div>
        ${renderRegionEditButton("app", "name", app.id, "name", "编辑此应用")}
      </div>
      <h3>${renderEditableText("app", "name", app.name, app.id)}</h3>
      <p>${renderEditableText("app", "brief", app.brief, app.id)}</p>
      <div class="tag-row">${app.tags.slice(0, 4).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="card-bottom">
        ${renderActions(app, true, actionMode)}
      </div>
    </article>
  `;
}

function gameDisplayRank(app) {
  if (app.id === "icecream") return -4;
  if (app.id === "zhuanglege-sha") return -3;
  if (app.id === "xiang-le-ge-xiang") return -2;
  return defaultApps.findIndex(item => item.id === app.id);
}

function handleAppCardClick(event) {
  if (event.target.closest("a, button, .inline-edit-button, .region-edit-button")) return;
}

function updateSelectedCards() {
  document.querySelectorAll("[data-app-id]").forEach(card => {
    card.classList.toggle("selected", card.dataset.appId === state.selectedId);
  });
}

function renderSelectedApp() {
  renderSpotlight();
  renderDots();
  updateSelectedCards();
  renderEditForm();
}

function isDirectPackageHref(href) {
  const path = String(href || "").split(/[?#]/, 1)[0];
  return /\.(?:zip|exe|msi|msix|appx|dmg|pkg|tar|gz|7z)$/i.test(path);
}

function renderPlatformShowcase(filtered) {
  if (!nodes.platformGrid) return;
  const list = filtered.length ? filtered : apps;
  const platformGroups = [
    { key: "web", label: "网页体验", note: "浏览器直接打开，Windows 和 Mac 都可使用。" },
    { key: "windows", label: "Windows", note: "优先提供 exe、插件包或通用 zip。" },
    { key: "mac", label: "Mac", note: "优先提供 Mac 包；网页工具使用通用 zip 或源码包。" }
  ];

  nodes.platformGrid.innerHTML = platformGroups.map(group => {
    const available = list.filter(app => platformValue(app, group.key) || (group.key === "web" && app.entry));
    return `
      <article class="platform-card platform-${escapeHtml(group.key)}">
        <div class="platform-card-head">
          <span>${escapeHtml(group.label)}</span>
          <strong>${available.length}</strong>
        </div>
        <p>${escapeHtml(group.note)}</p>
        <div class="platform-apps">
          ${available.map(app => {
            const href = platformValue(app, group.key) || app.entry;
            const download =
              group.key !== "web" && isDirectPackageHref(href) ? " download" : "";
            return `<a href="${escapeHtml(projectHref(href))}"${download}>${escapeHtml(app.name)}</a>`;
          }).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderActions(app, stopPropagation = false, mode = "default") {
  const stop = stopPropagation ? ` onclick="event.stopPropagation()"` : "";
  const web = platformValue(app, "web") || app.entry;
  const engineeringVideoLink = app.video ? `<a data-action="video" href="${escapeHtml(projectHref(videoHref(app)))}"${stop}>\u89c6\u9891</a>` : "";
  if (mode === "engineering") {
    const webLink = web ? `<a class="primary-link" data-action="web" href="${escapeHtml(projectHref(web))}"${stop}>演示</a>` : "";
    return `
      <div class="card-actions actions-engineering">
        ${webLink}
        ${engineeringVideoLink}
      </div>
    `;
  }
  const windows = platformValue(app, "windows") || app.package;
  const mac = platformValue(app, "mac");
  const windowsDownload = isDirectPackageHref(windows) ? " download" : "";
  const macDownload = isDirectPackageHref(mac) ? " download" : "";
  const webLink = web ? `<a class="primary-link" data-action="web" href="${escapeHtml(projectHref(web))}"${stop}>演示</a>` : "";
  const windowsLink = windows ? `<a class="download-link" data-action="download" href="${escapeHtml(projectHref(windows))}"${windowsDownload}${stop}>Wins下载</a>` : "";
  const macLink = mac ? `<a class="mac-link" data-action="mac" href="${escapeHtml(projectHref(mac))}"${macDownload}${stop}>Mac下载</a>` : "";
  const video = app.video
    ? `<a data-action="video" href="${escapeHtml(projectHref(videoHref(app)))}"${stop}>视频</a>`
    : "";
  return `
    <div class="card-actions">
      ${webLink}
      ${video}
      ${windowsLink}
      ${macLink}
    </div>
  `;
}

function platformValue(app, key) {
  const value = app.platforms?.[key];
  if (!value) return "";
  return typeof value === "string" ? value : value.href;
}

function platformLabel(app, key, fallback) {
  const value = app.platforms?.[key];
  if (!value || typeof value === "string") return fallback;
  return value.label || fallback;
}

function platformCount(app) {
  return ["web", "windows", "mac"].filter(key => platformValue(app, key)).length;
}

function renderEditForm() {
  const app = getSelectedApp();
  renderPageTextFields();
  markAppFieldLabels();
  nodes.editAppSelect.innerHTML = apps.map(item => (
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
  )).join("");
  nodes.editAppSelect.value = app.id;
  nodes.editName.value = app.name;
  nodes.editCategory.value = app.category;
  nodes.editBrief.value = app.brief;
  nodes.editStatus.value = app.status;
  nodes.editTags.value = app.tags.join(", ");
  nodes.editProblem.value = app.problem;
  nodes.editAiUse.value = app.aiUse;
  nodes.editFolder.value = app.folder;
  nodes.editEntry.value = app.entry;
  if (nodes.editPackage) nodes.editPackage.value = app.package || "";
  if (nodes.editVideo) nodes.editVideo.value = app.video || "";
  highlightEditTarget();
}

function renderPageTextFields() {
  if (!nodes.pageTextFields) return;
  nodes.pageTextFields.innerHTML = pageTextTargets.map(target => {
    const value = pageText[target.key] ?? defaultPageText[target.key] ?? "";
    const isWide = target.multiline || !target.short || value.length > 24;
    const field = target.multiline || value.length > 72
      ? '<textarea data-page-text-input="' + escapeHtml(target.key) + '" rows="3">' + escapeHtml(value) + '</textarea>'
      : '<input data-page-text-input="' + escapeHtml(target.key) + '" type="text" value="' + escapeHtml(value) + '" />';
    return '<label class="' + (isWide ? 'wide' : '') + '" data-page-text-field="' + escapeHtml(target.key) + '"><span>' + escapeHtml(target.label) + '</span>' + field + '</label>';
  }).join("");
}

function markAppFieldLabels() {
  const fieldMap = { editName: "name", editCategory: "category", editBrief: "brief", editStatus: "status", editTags: "tags", editProblem: "problem", editAiUse: "aiUse", editFolder: "folder", editEntry: "entry", editPackage: "package", editVideo: "video" };
  Object.entries(fieldMap).forEach(([id, field]) => {
    document.querySelector("#" + id)?.closest("label")?.setAttribute("data-app-field", field);
  });
  nodes.editAppSelect?.closest("label")?.setAttribute("data-app-field", "select");
}

function highlightEditTarget() {
  document.querySelectorAll(".editing-focus").forEach(element => element.classList.remove("editing-focus"));
  if (!state.editTarget) return;
  const selector = state.editTarget.kind === "page" ? '[data-page-text-field="' + cssEscape(state.editTarget.key) + '"]' : '[data-app-field="' + cssEscape(state.editTarget.field) + '"]';
  const field = document.querySelector(selector);
  if (!field) return;
  field.classList.add("editing-focus");
  requestAnimationFrame(() => {
    field.scrollIntoView({ block: "center", behavior: "smooth" });
    field.querySelector("input, textarea, select")?.focus();
  });
}

function selectApp(id) {
  if (!apps.some(app => app.id === id)) return;
  state.selectedId = id;
  localStorage.setItem(SELECTED_KEY, id);
  renderSelectedApp();
}

function ensureSelectedApp(filtered) {
  if (filtered.some(app => app.id === state.selectedId)) return;
  state.selectedId = (getNavigationApps(filtered)[0] || apps[0]).id;
}

function getSelectedApp() {
  return apps.find(app => app.id === state.selectedId) || apps[0];
}

function switchApp(direction) {
  const navigationApps = getNavigationApps();
  if (!navigationApps.length) return;
  const fallbackIndex = direction > 0 ? -1 : 0;
  const currentIndex = navigationApps.findIndex(app => app.id === state.selectedId);
  const nextIndex = ((currentIndex === -1 ? fallbackIndex : currentIndex) + direction + navigationApps.length) % navigationApps.length;
  selectApp(navigationApps[nextIndex].id);
}

function getAdvice(app) {
  if (app.status === "navigation") return "作为总览入口使用，重点保证网页、Windows、Mac 入口清晰可打开。";
  if (app.status === "plugin") return "作为插件工具展示时，优先说明安装方式、使用场景和跨平台可用方式。";
  if (app.status === "game") return "作为小游戏展示时，优先保留清晰玩法、即时反馈和可打开的网页体验入口。";
  if (app.status === "training") return "作为训练工具展示时，优先说明角色流程、追问机制和复盘输出。";
  if (platformCount(app) < 2) return "建议至少保留网页体验和一个可下载平台包，让使用者能直接打开。";
  return "平台入口较清晰，继续确认网页、Windows、Mac 和视频链接都能直接打开。";
}

function runCommand() {
  if (nodes.command.value.trim() === "1") {
    nodes.command.value = "";
    runMaintenance();
  } else {
    log("未知命令。当前维护命令是 1。");
  }
}

function runMaintenance() {
  renderCategoryOptions();
  render();
  log(`维护完成：已刷新 ${apps.length} 个应用，类型 ${new Set(apps.map(app => app.status)).size} 类，网页体验 ${apps.filter(app => platformValue(app, "web") || app.entry).length} 个。`);
}

function toggleEditMode() {
  setEditMode(!state.editing);
}

function setEditMode(active) {
  state.editing = active;
  document.body.classList.toggle("editing", state.editing);
  nodes.editPanel.setAttribute("aria-hidden", String(!state.editing));
  nodes.exportButton.textContent = state.editing ? "退出编辑" : "编辑";
  renderEditForm();
}

function closeEditMode() {
  setEditMode(false);
  state.editTarget = null;
}

function selectEditTarget(kind, key, appId, appField) {
  if (kind === "app" && appId) selectApp(appId);
  state.editTarget = kind === "page" ? { kind, key } : { kind, appId: appId || state.selectedId, field: appField };
  setEditMode(true);
}

function saveEditForm() {
  pageText = { ...pageText, ...Object.fromEntries(Array.from(document.querySelectorAll("[data-page-text-input]")).map(input => [input.dataset.pageTextInput, input.value.trim()])) };
  apps = apps.map(app => {
    if (app.id !== state.selectedId) return app;
    return {
      ...app,
      name: nodes.editName.value.trim() || app.name,
      category: nodes.editCategory.value.trim() || app.category,
      brief: nodes.editBrief.value.trim() || app.brief,
      status: nodes.editStatus.value,
      tags: nodes.editTags.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
      problem: nodes.editProblem.value.trim() || app.problem,
      aiUse: nodes.editAiUse.value.trim() || app.aiUse,
      folder: nodes.editFolder.value.trim() || app.folder,
      entry: nodes.editEntry.value.trim() || app.entry,
      package: nodes.editPackage?.value.trim() || app.package,
      video: nodes.editVideo?.value.trim() || app.video
    };
  });
  localStorage.setItem(PAGE_TEXT_STORAGE_KEY, JSON.stringify(pageText));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  renderCategoryOptions();
  render();
  log("已保存到当前浏览器本地存储。");
}

function resetEdits() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PAGE_TEXT_STORAGE_KEY);
  apps = defaultApps.map(cloneApp);
  pageText = normalizePageText();
  renderCategoryOptions();
  render();
  log("已恢复默认应用数据。");
}

function exportList() {
  const markdown = [
    "# AI 应用项目清单",
    "",
    ...apps.map(app => [
      `## ${app.name}`,
      `- 类型：${statusLabel[app.status]}`,
      `- 分类：${app.category}`,
      `- 简介：${app.brief}`,
      `- 平台：${platformCount(app)}/3`,
      platformValue(app, "web") ? `- 网页：${platformValue(app, "web")}` : "",
      platformValue(app, "windows") ? `- Windows：${platformValue(app, "windows")}` : "",
      platformValue(app, "mac") ? `- Mac：${platformValue(app, "mac")}` : "",
      app.video ? `- 视频：${app.video}` : ""
    ].filter(Boolean).join("\n"))
  ].join("\n\n");

  navigator.clipboard?.writeText(markdown).then(() => {
    log("已复制 Markdown 清单到剪贴板。");
  }).catch(() => {
    log(markdown);
  });
}

function renderPageText() {
  pageTextTargets.forEach(target => {
    const element = document.querySelector(target.selector);
    if (!element) return;
    const value = pageText[target.key] ?? defaultPageText[target.key] ?? "";
    element.innerHTML = renderEditableText("page", target.key, value);
  });
}

function renderEditableText(kind, key, value, appId = "") {
  const dataKey = kind === "page" ? key : appId + "." + key;
  return '<span class="editable-text" data-edit-key="' + escapeHtml(dataKey) + '"><span class="editable-value">' + escapeHtml(value ?? "") + '</span></span>';
}

function renderRegionEditButton(kind, key, appId = "", appField = "", label = "编辑") {
  const appData = kind === "app" ? ' data-app-id="' + escapeHtml(appId) + '" data-app-field="' + escapeHtml(appField || key) + '"' : "";
  return '<button class="region-edit-button card-edit-button" type="button" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '" data-edit-kind="' + escapeHtml(kind) + '" data-edit-key="' + escapeHtml(key) + '"' + appData + '></button>';
}

function handleInlineEditClick(event) {
  const button = event.target.closest(".inline-edit-button, .region-edit-button");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  selectEditTarget(button.dataset.editKind, button.dataset.editKey, button.dataset.appId, button.dataset.appField);
}

function loadPageText() {
  try {
    const stored = JSON.parse(localStorage.getItem(PAGE_TEXT_STORAGE_KEY) || "null");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) return normalizePageText(stored);
  } catch {
    localStorage.removeItem(PAGE_TEXT_STORAGE_KEY);
  }
  return normalizePageText();
}

function normalizePageText(stored = {}) {
  const merged = { ...defaultPageText, ...Object.fromEntries(Object.entries(stored).filter(([key, value]) => key in defaultPageText && typeof value === "string")) };
  const staleGameText = {
    "metrics.games": "训练工具",
    "metrics.gamesNote": "答题与训练原型",
    "games.title": "训练工具集合"
  };
  Object.entries(staleGameText).forEach(([key, value]) => {
    if (merged[key] === value) merged[key] = defaultPageText[key];
  });
  return merged;
}

function loadApps() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(stored) && stored.length) {
      const storedById = new Map(stored.map(app => [app.id, app]));
      return defaultApps.map(app => normalizeApp(storedById.get(app.id) || app));
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return defaultApps.map(cloneApp);
}

function normalizeApp(app) {
  const base = cloneApp(defaultApps.find(item => item.id === app.id) || defaultApps[0]);
  const normalized = {
    ...base,
    ...app,
    tags: Array.isArray(app.tags) ? app.tags : []
  };
  if (!normalized.video && base.video) {
    normalized.video = base.video;
  }
  if (!statusLabel[normalized.status]) {
    normalized.status = base.status;
  }
  if (normalized.id === "hub" && normalized.brief === OLD_HUB_BRIEF) {
    normalized.brief = HUB_BRIEF;
  }
  if (normalized.id === "codex-thread-workbench" && app.platforms?.mac === "") {
    const legacyBrief = "在同一个 Windows 一级界面中同时查看和操作多个真实 Codex 线程，直接输入、停止、审批，并清晰区分进行中与已完成任务。";
    const legacyAiUse = "工具通过本机 codex app-server 连接真实线程，不读取凭据；AI 参与协议接入、状态投影、多窗口会话交互和 Windows 发布验证。";
    if (normalized.brief === legacyBrief) normalized.brief = base.brief;
    if (normalized.aiUse === legacyAiUse) normalized.aiUse = base.aiUse;
    normalized.tags = [...new Set([...normalized.tags, "macOS"])];
    normalized.platforms = {
      ...(normalized.platforms || {}),
      mac: base.platforms.mac
    };
  }
  if (normalized.id === "gamepulse-mini-radar") {
    const legacyName = "GamePulse 小游雷达";
    const legacyBrief = "把国内微信小游戏热门榜、畅销榜与海外 US iOS Casual Top 10 放在同一张开发者工作台上。";
    const legacyTags = ["小游戏排行", "微信小游戏", "iOS Casual", "产品洞察"];
    if (normalized.name === legacyName) normalized.name = base.name;
    if (normalized.brief === legacyBrief) normalized.brief = base.brief;
    if (
      normalized.tags.length === legacyTags.length &&
      normalized.tags.every((tag, index) => tag === legacyTags[index])
    ) {
      normalized.tags = [...base.tags];
    }
  }
  if (normalized.id === "icecream") {
    normalized.entry = "./projects/icecream/index.html";
    normalized.package = "./downloads/icecream-unity-project.zip";
    normalized.platforms = {
      web: { href: "./projects/icecream/index.html", label: "试玩" },
      windows: { href: "./downloads/icecream-unity-project.zip", label: "工程下载" },
      mac: { href: "./downloads/icecream-wechat-minigame.zip", label: "微信包下载" }
    };
    normalized.status = "game";
  }
  if (normalized.id === "vita-mahjong") {
    normalized.category = "Unity H5 AI版";
    normalized.entry = "./projects/vita-mahjong/index.html";
    normalized.package = "./downloads/vita-mahjong-webgl.zip";
    normalized.platforms = {
      ...normalized.platforms,
      web: "./projects/vita-mahjong/index.html",
      windows: "./downloads/vita-mahjong-webgl.zip",
      mac: "./downloads/vita-mahjong-webgl.zip"
    };
    normalized.status = "ai";
    normalized.tags = ["Unity", "WebGL", "AI版", "羊了个羊"];
  }
  if (normalized.id === "fill-what") {
    normalized.entry = "./projects/fill-what/index.html";
    normalized.package = "./downloads/fill-what-unity-project.zip";
    normalized.platforms = {
      ...normalized.platforms,
      web: { href: "./projects/fill-what/index.html", label: "演示" },
      windows: { href: "./downloads/fill-what-unity-project.zip", label: "下载工程" },
      mac: ""
    };
    normalized.status = "game";
  }
  if (normalized.id === "web-media-collector") {
    normalized.video = "./projects/\u670b\u53cb\u5708\u53d1\u56fe\u795e\u5668/01_\u4f5c\u54c1\u4f53\u9a8c\u5165\u53e3/\u7f51\u9875\u7d20\u6750\u4e00\u952e\u6536\u684c\u9762\u7248/\u89c6\u9891\u8d44\u6e90/\u6f14\u793a\u89c6\u9891.html";
    normalized.entry = "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html";
    normalized.package = "./downloads/web-media-collector-desktop-source.zip";
    normalized.platforms = {
      ...normalized.platforms,
      web: { href: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html", label: "演示" },
      windows: { href: "./downloads/web-media-collector-desktop-source.zip", label: "源码包" },
      mac: { href: "./projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html#macos", label: "macOS说明" }
    };
    normalized.status = "desktop";
  }
  if (normalized.id === "paws-home-client") {
    normalized.category = "项目组打包内部体验测试";
    normalized.entry = "./projects/paws-home-client/index.html";
    normalized.package = "";
    normalized.platforms = {
      ...normalized.platforms,
      web: "./projects/paws-home-client/index.html",
      windows: "",
      mac: ""
    };
    normalized.status = "engineering";
    normalized.tags = ["Unity", "WebGL", "内部测试", "工程包"];
  }
  if (normalized.id === "minigame-project-simulator") {
    normalized.name = "小游戏立项工具";
    normalized.category = "游戏立项与需求工具";
    normalized.status = "assistant";
    normalized.folder = "./projects/minigame-project-tool/";
    normalized.entry = "./projects/minigame-project-tool/index.html";
    normalized.video = "./projects/minigame-project-tool/video/index.html";
    normalized.package = "./downloads/minigame-project-simulator-windows.zip";
    normalized.platforms = {
      web: { href: "./projects/minigame-project-tool/index.html", label: "演示" },
      windows: { href: "./downloads/minigame-project-simulator-windows.zip", label: "Windows下载" },
      mac: ""
    };
    normalized.tags = ["微信小游戏", "Unity", "需求文档", "Codex"];
  }
  if (normalized.id === "codex-reviewer") {
    normalized.video = "./projects/Codex对话评分工具/视频资源/演示视频.html";
  }
  if (normalized.id === "wanhuatong") {
    normalized.name = "万话筒";
    normalized.folder = "./projects/万话筒/";
    normalized.entry = "./projects/万话筒/index.html";
    normalized.video = "./projects/万话筒/视频资源/演示视频.html";
    normalized.package = "./downloads/wanhuatong.zip";
    normalized.platforms = {
      ...normalized.platforms,
      web: "./projects/万话筒/index.html"
    };
  }
  const currentPlatforms = normalized.platforms || {};
  normalized.platforms = {
    ...currentPlatforms,
    web: currentPlatforms.web || normalized.entry || "",
    windows: currentPlatforms.windows || normalized.package || "",
    mac: currentPlatforms.mac || ""
  };
  if (normalized.video && normalized.video.includes("演示视频占位")) {
    delete normalized.video;
  }
  return normalized;
}

function cloneApp(app) {
  return {
    ...app,
    tags: [...app.tags],
    platforms: { ...(app.platforms || {}) }
  };
}

function projectHref(value) {
  if (!value) return "#";
  if (/^(https?:|file:|#)/i.test(value)) return value;
  if (value.startsWith("../")) return PROJECT_ROOT_URL + encodeURI(value.slice(3));
  return value;
}

function videoHref(app) {
  return app.video || "./videos/placeholder.html";
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function log(message) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  nodes.log.textContent += `[${time}] ${message}\n`;
  nodes.log.scrollTop = nodes.log.scrollHeight;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
