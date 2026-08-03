# AI Application Hub 本地验收

- 日期：2026-08-03
- 分支：`audit/hub-full-audit-20260803`
- 基线：`origin/main`（`c0479cf`）
- 范围：主页 24 张卡片、58 个可见动作、21 个本地演示入口、24 个视频页、平台下载与 CI 门禁。

## 结果

- 发布审计：24 个项目，58 个动作，0 个发现。
- 全量测试：527 项，522 通过，0 失败，5 条条件跳过。
- 视频页浏览器验收：24 页 × 桌面/手机，全部通过。
- 首页卡片交互与演示页浏览器验收：桌面/手机卡片切换，以及 21 个入口，全部通过。
- `馕了个馕`：仅在 `#games` 出现，名称、标签、演示和视频入口一致；不在应用区或工程区重复出现。
- 修复前截图：`docs/audits/evidence/2026-08-03-nang-old-catalog.png`。
- Paws 关卡编辑器：使用当前页面外壳重新录制 88 秒教学视频，并重建海报与录制证明；媒体、源码哈希、章节时间和真实操作状态全部匹配。

## 验证命令

```powershell
$env:FFMPEG_PATH = node -p "require('ffmpeg-static')"
node --test
node --check app-20260706-restore-games.js
git diff --check
npm run audit:hub -- --check-external --format markdown
node tests/hub-video-pages-browser-smoke.mjs
node tests/hub-entry-pages-browser-smoke.mjs
```

## 条件跳过

- 4 条 Paws Unity 真题库门禁未执行：本机未设置 `PAWS_EDITOR_LEVELS`；相关网页与静态生成测试已执行。
- 1 条 Windows 文件符号链接用例未执行：当前账户无文件 symlink 权限；目录 junction 覆盖已执行。

## 平台结论

- 24 个项目均可在 Windows 与 macOS 的现代浏览器中查看或体验。
- 仅经过真实原生构建和产物验证的项目显示 `Wins下载` / `Mac下载`。
- 源码包、Unity 工程、WebGL 压缩包和占位 ZIP 不再冒充系统安装包。
- 详细矩阵见 `docs/audits/2026-08-03-platform-compatibility.md`。
