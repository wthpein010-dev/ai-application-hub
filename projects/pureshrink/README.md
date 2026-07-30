# PureShrink 无损压缩工坊

PureShrink 是 AI Application Hub 的本地优先批量媒体压缩工具。在线版直接在浏览器中处理资源；Windows 和 macOS 桌面版使用随包附带的原生 FFmpeg。

在线运行时固定并同源托管 `@ffmpeg/ffmpeg 0.11.6`、`@ffmpeg/core-st 0.11.1` 与 `fflate 0.8.2`。单线程 FFmpeg 核心无需 `SharedArrayBuffer`，可直接在 GitHub Pages 使用；所有第三方许可见 [`vendor/THIRD-PARTY-NOTICES.md`](./vendor/THIRD-PARTY-NOTICES.md)。

## 压缩模式

- 严格无损（默认）：PNG 逐像素验证，媒体码流复制，一般文件使用可逆 ZIP。候选不更小时保留原件。
- 高保真（非无损）：图片使用 WebP 95，视频使用 H.264 CRF 18 与 AAC 192 kbps。

## 隐私与安全

- 文件不上传。
- 运行时不从第三方 CDN 加载。
- 原件不覆盖。
- 页面不记录文件名、媒体内容、路径或压缩历史。
- 桌面版通过隔离的 preload API 调用 FFmpeg，不向页面开放 Node.js。

## 使用

1. 拖入或选择图片、视频、GIF、音频及其他文件。
2. 选择严格无损或高保真。
3. 点击“开始压缩”，逐项查看策略、进度和结果。
4. 在线版下载单项或批量 ZIP；桌面版在输出目录中显示结果。

浏览器推荐处理 500 MB 以内的视频；更大的文件建议使用桌面版。
