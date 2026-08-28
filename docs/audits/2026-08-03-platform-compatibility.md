# AI Application Hub 平台兼容矩阵

- 日期：2026-08-21
- 范围：主页当前 29 张公开项目卡片
- 规则：网页、小游戏和工程体验通过现代浏览器覆盖 Windows 与 macOS；只有经过原生构建、架构检查和产物校验的项目显示系统下载。
- 通用门禁：`tests/hub-entry-pages-browser-smoke.mjs`、`tests/hub-video-pages-browser-smoke.mjs`、`tests/hub-platform-artifacts.test.mjs`。

| 项目 ID | 名称 | 交付类型 | Windows | macOS | 公开入口与证据 |
| --- | --- | --- | --- | --- | --- |
| `hub` | AI 应用方案整理器 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [主页](https://wthpein010-dev.github.io/ai-application-hub/index.html)，无系统安装包 |
| `gamepulse-mini-radar` | 小游戏每日排行 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [主页卡片](https://wthpein010-dev.github.io/ai-application-hub/index.html#apps)；演示使用公开托管网页 |
| `icecream` | 吃了个冰 | 小游戏在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/icecream/index.html)，不把 Unity 工程当安装包 |
| `vita-mahjong` | 羊了个羊：对对碰 | 工程在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [工程体验](https://wthpein010-dev.github.io/ai-application-hub/projects/vita-mahjong/index.html)，不提供伪系统包 |
| `zhuanglege-sha` | 装了个啥 | 小游戏在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/zhuanglege-sha/index.html) |
| `paws-home-client` | 羊了个羊：碰碰消 | 工程在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [工程体验](https://wthpein010-dev.github.io/ai-application-hub/projects/paws-home-client/index.html) |
| `paws-level-editor` | 关卡3D编辑器 | 工程在线体验 | Windows：现代浏览器，桌面 Chrome/Edge 可编辑 | macOS：现代浏览器，桌面 Chrome/Edge 可编辑 | [编辑器](https://wthpein010-dev.github.io/ai-application-hub/projects/paws-level-editor/index.html) |
| `fill-what` | 填了个啥 | 小游戏在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/fill-what/index.html) |
| `codex-quota-bar` | Codex 用量悬浮条 | 原生双平台 | Windows： [Wins下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/codex-quota-bar-v1.0.0/CodexQuotaBar-Windows-x64.zip) | macOS： [Mac下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/codex-quota-bar-v1.0.0/CodexQuotaBar-macOS.zip)，arm64/x64 | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-quota-bar/index.html)；包大小、SHA-256 与入口由 `tests/codex-quota-bar-download.test.mjs` 校验 |
| `codex-thread-workbench` | Codex 待确认悬浮助手 | 原生双平台 | Windows： [Wins下载](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/) | macOS： [Mac下载](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/download/mac/)，arm64/x64 | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-thread-workbench/index.html)；`projects/codex-thread-workbench/download/manifest.json`、`projects/codex-thread-workbench/download/mac/manifest-arm64.json`、`projects/codex-thread-workbench/download/mac/manifest-x64.json` |
| `web-media-collector` | 网页素材一键收桌面版 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页演示](https://wthpein010-dev.github.io/ai-application-hub/projects/朋友圈发图神器/01_作品体验入口/网页素材一键收桌面版/index.html)，不把源码包当桌面成品 |
| `xiang-le-ge-xiang` | 箱了个箱 | 小游戏在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/xiang-le-ge-xiang/index.html) |
| `minigame-project-simulator` | 小游戏立项工具 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页工具](https://wthpein010-dev.github.io/ai-application-hub/projects/minigame-project-tool/index.html) |
| `ai-game-requirements-workshop` | AI游戏需求工坊 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [主页卡片](https://wthpein010-dev.github.io/ai-application-hub/index.html#apps)；演示使用公开托管网页 |
| `planner-daily-quiz` | 每日策划知识考核 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [训练工具](https://wthpein010-dev.github.io/ai-application-hub/projects/planner-daily-quiz/index.html) |
| `travel-generator` | 朋友圈发图神器 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页工具](https://wthpein010-dev.github.io/ai-application-hub/projects/朋友圈发图神器/01_作品体验入口/app/index.html) |
| `feishu-downloader` | 飞书文件批量下载插件 | 浏览器扩展 | Windows：Chrome/Edge 扩展 | macOS：Chrome/Edge 扩展 | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/飞书文件批量下载插件/index.html)；同一跨平台包 [feishu-batch-downloader-extension.zip](https://wthpein010-dev.github.io/ai-application-hub/downloads/feishu-batch-downloader-extension.zip)，`projects/飞书文件批量下载插件/manifest.json` |
| `codex-reviewer` | Codex 对话评分工具 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页工具](https://wthpein010-dev.github.io/ai-application-hub/projects/Codex对话评分工具/index.html)，无伪安装包 |
| `codex-habit-tool` | Codex 习惯设置工具 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页演示](https://wthpein010-dev.github.io/ai-application-hub/projects/codex-habit-tool/index.html)，无伪安装包 |
| `wanhuatong` | 万话筒 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页工具](https://wthpein010-dev.github.io/ai-application-hub/projects/万话筒/index.html) |
| `brick-light-motion-lab` | 砖块点亮动效实验台 | 工程在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [美术参考](https://wthpein010-dev.github.io/ai-application-hub/projects/brick-light-motion-lab/index.html) |
| `nang-keng-pai-pai-xiang` | 馕了个馕 | 小游戏在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/nang-keng-pai-pai-xiang/index.html) |
| `clickflow` | ClickFlow 鼠标自动化 | 原生双平台 | Windows： [Wins下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-Windows-x64.zip) | macOS： [Mac下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/clickflow-v2.0.0/ClickFlow-macOS.zip)，arm64/x64 | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/clickflow/index.html)；`projects/clickflow/release-manifest.json`、`.github/workflows/build-clickflow-macos.yml` |
| `pureshrink` | 无损压缩工坊 | 原生双平台 | Windows： [Wins下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.5/PureShrink-Windows-x64.zip) | macOS： [Mac下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/pureshrink-v1.0.5/PureShrink-macOS.zip)，arm64/x64 | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/pureshrink/index.html)；`projects/pureshrink/release-manifest.json` 记录双架构构建、启动和处理验收 |
| `planmap` | 思维导图快捷工具 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/planmap/index.html)；源码附件为 [planmap-source.zip](https://wthpein010-dev.github.io/ai-application-hub/downloads/planmap-source.zip)，不作为系统安装包 |
| `simuai` | 万象实验室 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/simuai/index.html)；公开版从 30 个受控实验中本地匹配，不调用远程模型 |
| `brick-character-copy-preview` | 砖块角色文案预览 | 工程在线体验 | Windows：现代浏览器 | macOS：现代浏览器 | [网页体验](https://wthpein010-dev.github.io/ai-application-hub/projects/brick-character-copy-preview/index.html)；提供表格审阅、角色形象与游戏内详情同步预览 |
| `gamespec-relay` | 游戏需求开工台 | 原生双平台 | Windows： [Wins下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/gamespec-relay-v1.2.0/youxi-xuqiu-kaigongtai-windows-x64.zip)，x64，95,099,625 字节，SHA-256 `D9B82A86BB216E04803D950A4A9E70EFB765DFD9FC0B89A29F22F875CBFE3DA7` | macOS： [Mac下载](https://github.com/wthpein010-dev/ai-application-hub/releases/download/gamespec-relay-v1.2.0/youxi-xuqiu-kaigongtai-macos.zip)，arm64/x64，254,286,944 字节，SHA-256 `AECE9FCB9FD8D29B3E82E04A44BFDC2FD22601B0E6B3FA116EF773657B8995CC` | [项目页](https://wthpein010-dev.github.io/ai-application-hub/projects/gamespec-relay/index.html)；`.github/workflows/build-gamespec-relay-release.yml` 的 Release Run `33153665572` 完成 Windows x64、macOS arm64/x64 构建、架构核对、临时签名、包校验和真实启动；Mac 公网清单见 `docs/audits/evidence/2026-08-07-macos-download-manifest.json`。 |
| `x-ai-codex-radar` | AI / Codex 雷达 | 网页跨平台 | Windows：现代浏览器 | macOS：现代浏览器 | [公开演示](https://wthpein010-dev.github.io/ai-application-hub/projects/x-ai-codex-radar/index.html)；无需登录的交互页明确使用示例数据，私有实时采集入口需 ChatGPT 登录；不提供虚假桌面安装包 |

## 结论

- 29 个项目都可在 Windows 与 macOS 上通过网页查看或体验。
- 5 个项目提供经过验证的原生 Windows/macOS 成品；飞书插件提供同一份跨平台浏览器扩展。
- 其余项目不再显示来源码、Unity 工程、WebGL 压缩包或占位 ZIP 形式的伪系统下载。
