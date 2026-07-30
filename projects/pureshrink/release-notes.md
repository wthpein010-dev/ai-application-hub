# PureShrink 1.0.0

PureShrink 是本地优先的批量媒体压缩工坊，可处理图片、视频、GIF、音频和一般文件。

## 这一版包含

- 严格无损默认模式：PNG 像素验证、音视频码流复制、一般文件 ZIP 字节级还原。
- 明确标注为非无损的高保真模式：WebP 95、H.264 CRF 18、AAC 192 kbps。
- 顺序批量队列、逐项策略、进度、大小和节省率。
- 候选文件不更小时自动保留原件。
- Windows x64 便携版。
- macOS Apple Silicon 与 Intel 双架构应用。

## 安全边界

文件默认不上传，原件永不覆盖。桌面版使用隔离渲染器和受限 IPC，FFmpeg 通过参数数组执行，不经过 shell。

Windows 和 macOS 下载均由对应平台的 GitHub Actions runner 构建并完成启动与 FFmpeg 处理证明。
