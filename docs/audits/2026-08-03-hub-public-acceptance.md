# AI Application Hub 公网验收

- 日期：2026-08-03
- 公网主页：`https://wthpein010-dev.github.io/ai-application-hub/index.html`
- 已发布提交：`959e419d83617d7c78f27f8af4e342ea8a502ea4`
- 验收范围：主页 24 张卡片、58 个可见动作、21 个本地演示入口、24 个视频页，以及桌面端和移动端布局。

## 发布状态

- GitHub Pages workflow `30782130218`：成功，部署提交与上述 SHA 一致。
- 完整验证 workflow `30782130695`：成功，测试、发布审计、全部 Hub 页面浏览器验收和 ClickFlow 验收均通过。
- Pages API：`built`，构建提交与上述 SHA 一致。

## 公网结果

- 全量本地回归：527 项，522 通过、0 失败、5 条环境性跳过。
- 发布资源审计：24 个项目、58 个动作、0 个发现。
- 首页卡片交互：桌面端和移动端均可点击选中并同步右上展示、持久化选中项和圆点导航，切换时不重建卡片。
- 演示入口：21 页在桌面端和移动端均通过；统一外壳、返回按钮、分区锚点、精确标题、非空内容和横向溢出检查全部正常。
- 视频入口：24 页在桌面端和移动端均通过；播放器尺寸、返回按钮、资源状态和控制台检查全部正常。
- 真实播放：Paws 关卡编辑器与“馕了个馕”视频均在公网点击加载并开始播放；Paws 使用当前重录资源版本 `20260803-current-shell-rerecord`。
- `馕了个馕`：公网只在“小游戏体验集合”出现 1 次，应用区和工程区均为 0；名称、演示、视频、选中状态及右上展示同步一致。

## 验证命令

```powershell
npm run audit:hub -- --online-base https://wthpein010-dev.github.io/ai-application-hub/ --format markdown

$env:HUB_BASE_URL = 'https://wthpein010-dev.github.io/ai-application-hub'
node tests/hub-entry-pages-browser-smoke.mjs
node tests/hub-video-pages-browser-smoke.mjs
```

两个浏览器门禁也保留本地静态服务器模式；未设置 `HUB_BASE_URL` 时会继续检查当前工作树。
