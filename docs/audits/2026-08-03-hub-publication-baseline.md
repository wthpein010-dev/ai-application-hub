# AI Application Hub 发布审计基线

- 日期：2026-08-03
- 命令：`node scripts/hub-publication-audit.mjs --format markdown`
- 目录卡片：24
- 可见动作：76
- 发现：51（重要 49，普通 2）
- 状态：修复前基线，命令按预期返回非零退出码

## 平台资源（28）

以下项目暴露了没有真实双平台成品证据的系统动作；同一路径出现多次时，分别对应系统动作和 `package` 回退风险。

- `hub`（3）：`downloads/ai-application-hub.zip`
- `icecream`（3）：`downloads/icecream-unity-project.zip`、`downloads/icecream-wechat-minigame.zip`
- `vita-mahjong`（3）：`downloads/vita-mahjong-webgl.zip`
- `fill-what`（2）：`downloads/fill-what-unity-project.zip`
- `web-media-collector`（3）：`downloads/web-media-collector-desktop-source.zip`、`projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html#macos`
- `minigame-project-simulator`（2）：`downloads/minigame-project-simulator-windows.zip`
- `travel-generator`（3）：`downloads/travel-generator-universal.zip`、`downloads/travel-generator-mac-source.zip`
- `codex-reviewer`（3）：`downloads/codex-reviewer-windows.zip`、`downloads/codex-reviewer-mac-source.zip`
- `codex-habit-tool`（3）：`downloads/codex-habit-tool-windows.zip`、`downloads/codex-habit-tool-mac-source.zip`
- `wanhuatong`（3）：`downloads/wanhuatong.zip`

## 视频返回（21）

以下页面返回裸主页，未回到卡片所属分区：

- `#apps`：`projects/AI应用方案整理器/视频资源/index.html`
- `#apps`：`projects/gamepulse-mini-radar/video/index.html`
- `#apps`：`projects/codex-quota-bar/video/index.html`
- `#apps`：`projects/codex-thread-workbench/video/index.html`
- `#apps`：`projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/视频资源/演示视频.html`
- `#apps`：`projects/minigame-project-tool/video/index.html`
- `#apps`：`projects/ai-game-requirements-workshop/video/index.html`
- `#apps`：`projects/planner-daily-quiz/video/index.html`
- `#apps`：`projects/朋友圈发图神器/03_演示视频/演示视频.html`
- `#apps`：`projects/飞书文件批量下载插件/视频资源/演示视频.html`
- `#apps`：`projects/Codex对话评分工具/视频资源/演示视频.html`
- `#apps`：`videos/codex-habit-tool-demo.html`
- `#apps`：`projects/万话筒/视频资源/演示视频.html`
- `#games`：`projects/icecream/video/index.html`
- `#games`：`projects/zhuanglege-sha/video/index.html`
- `#games`：`projects/fill-what/视频资源/index.html`
- `#games`：`projects/xiang-le-ge-xiang/video/index.html`
- `#engineering`：`projects/vita-mahjong/video/index.html`
- `#engineering`：`projects/paws-home-client/video/index.html`
- `#engineering`：`projects/paws-level-editor/video/index.html`
- `#engineering`：`projects/brick-light-motion-lab/video/index.html`

## 公开占位目录（2）

- `projects/AI面试陪练小剧场`
- `projects/备选应用工具创意库`

这两项没有进入 24 张公开卡片，内容仍明确标注为方案或视频占位；删除前还需验证下载包、测试、工作流和文档没有活动引用。
