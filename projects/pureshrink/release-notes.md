# PureShrink 1.0.3

## 1.0.3 优化

- 网页端通用文件 ZIP 移入独立 Worker，压缩过程中可以立即取消，不再阻塞操作界面。
- “下载全部”会把取消信号传入批量 ZIP Worker；成功前会逐项解压核对文件名和字节，损坏结果不会交付。
- 批量 ZIP 超过安全上限、运行失败或用户取消时，界面会恢复按钮状态并显示明确结果，不再停留在处理中。
- 为整文件 ZIP 路径增加可解释的内存安全边界：网页通用文件 64 MB、网页批量下载 128 MB、桌面通用文件 256 MB；图片、GIF、音视频继续使用专用处理路径。
- GitHub Actions 构建任务改为只读仓库权限，仅最终 Release 任务取得写权限。

## 1.0.2 修复

- 修复 macOS `Contents/Resources` 路径大小写导致的成品校验误判，并加入真实 macOS 目录结构回归测试。

## 1.0.1 修复

- 将 PureShrink 项目资源与 Hub 共享样式、播放器脚本拆分为独立桌面打包来源，修复 macOS Intel 与 Apple Silicon 成品缺少共享资源的问题。

PureShrink 是本地优先的批量媒体压缩工坊，可处理图片、视频、GIF、音频和一般文件。

## 这一版包含

- 严格无损默认模式：PNG 像素验证、音视频码流复制、一般文件 ZIP 字节级还原。
- 在线音视频严格模式会对输入、输出码流分别计算 SHA-256；验证不一致时拒绝结果。
- 明确标注为非无损的高保真模式：WebP 95、H.264 CRF 18、AAC 192 kbps。
- 顺序批量队列、逐项策略、进度、大小和节省率。
- 候选文件不更小时自动保留原件。
- 取消当前任务会立即终止原生进程或 WebAssembly 核心，并保留后续队列等待续跑。
- 在线版固定并同源托管单线程 FFmpeg WebAssembly 与 fflate，不请求第三方 CDN。
- Windows x64 便携版。
- macOS Apple Silicon 与 Intel 双架构应用。

## 安全边界

文件默认不上传，原件永不覆盖。桌面版使用隔离渲染器、来源白名单和受限 IPC，FFmpeg 通过参数数组执行，不经过 shell。一般文件归档在可取消的工作线程中运行，失败时自动清理半成品。

Windows 和 macOS 下载均由对应平台的 GitHub Actions runner 构建并完成启动与 NativeRunner 真实处理证明。macOS 公共包采用 ad-hoc 签名，未使用 Apple Developer ID 公证；首次打开方式已写入下载包 README。
