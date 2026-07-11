# 小游戏立项模拟器网站卡片设计

## 目标

把 Windows 桌面应用“小游戏立项模拟器”加入 AI 应用总览网站的 `#games` 小游戏体验集合，让用户能够理解用途并下载完整工具包。

## 网站落位

- 卡片名称：小游戏立项模拟器
- ID：`minigame-project-simulator`
- 分类：小游戏开发辅助工具
- 状态：`game`，确保进入 `#games` 区域
- 标签：Unity、微信小游戏、需求生成、UGUI
- 不提供网页体验入口，因为应用是 Windows WPF 桌面程序
- 提供 Windows 下载按钮，指向站内 ZIP 包

## 卡片文案

一句话说明：

> 用快速选项和可展开问卷整理小游戏立项需求，生成可直接交给 Codex 的项目需求与 Unity 微信小游戏通用开发记忆。

解决的问题：

> 新游戏开始前，玩法、范围、视觉风格、微信能力、性能和验收要求容易缺失，导致 Codex 或开发人员反复追问、方向漂移，也不便于形成可回退的书面基线。

AI 使用方式：

> 工具把用户选择整理为结构化 Markdown，让 Codex先检查关键缺失和冲突，再按 Unity 2022.3.62f3c1、uGUI、750×1624 与微信小游戏约束开展设计和开发。

## 下载包

站内文件：`downloads/minigame-project-simulator-windows.zip`

ZIP 内容：

- `MinigameBrief_v1.1.exe`
- `README.md`
- `UNITY_MINIGAME_MEMORY.md`
- `VERIFICATION.md`

不把旧版 `MinigameBrief.exe` 放入 ZIP，避免用户下载错误版本。下载包必须可解压，且内部 EXE 的 SHA-256 与已验证 v1.1 交付物一致。

## 展示素材

复制高对比度界面截图到 `assets/minigame-project-simulator-preview.png`，用于仓库留档和后续扩展。当前网站卡片模板不显示缩略图，因此首版不改动全站卡片布局，避免为单个应用引入无关设计变化。

## 数据接入

当前页面加载 `app-20260706-restore-games.js`。只修改这个活跃脚本中的 `defaultApps` 数据和必要的游戏排序规则，不同步改写历史版本脚本。

卡片数据使用：

- `folder`: `./projects/minigame-project-simulator/`
- `entry`: 空字符串
- `package`: `./downloads/minigame-project-simulator-windows.zip`
- `platforms.windows`: 同一 ZIP 地址，标签为“Windows下载”
- `platforms.web` 与 `platforms.mac`: 空字符串
- `speed`: 9
- `impact`: 9
- `risk`: 8
- `polish`: 9

## 排序

在 `gameDisplayRank` 中把该工具排在现有小游戏之后，避免开发辅助工具抢占可玩小游戏的首屏优先级。

## 验证

1. JavaScript 语法检查通过。
2. 仓库现有测试通过。
3. 本地静态服务器中访问 `index.html#games`，卡片出现在小游戏区域。
4. 卡片名称、分类、简介和四个标签正确。
5. Windows 下载链接返回 ZIP，ZIP 可解压且只包含指定文件。
6. 下载包内 EXE 哈希与 v1.1 原文件一致。
7. 页面统计中的小游戏数量自动增加 1。
8. 桌面和窄屏布局没有溢出或遮挡。

## 发布

在独立分支提交网站数据、ZIP 和截图，验证后推送至 GitHub。优先使用草稿 PR；如果仓库既有流程明确允许直接更新 GitHub Pages 主分支，则在用户确认后采用直接合并。
