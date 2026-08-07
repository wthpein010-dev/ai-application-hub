# Codex Quota Bar

一个轻量的 Codex 剩余用量悬浮条，支持 Windows 10/11 与 macOS 13 及以上版本。它通过本机 `codex app-server` 获取实时额度，每 30 秒刷新；不会读取 `auth.json`，也不会上传遥测数据。

## Windows

1. 解压 `CodexQuotaBar-Windows-x64.zip`。
2. 运行 `CodexQuotaBar.exe`。
3. 如果 SmartScreen 提示未知发布者，选择“更多信息”，确认文件来自本项目后再运行。

工具默认开机启动。关闭悬浮窗只会隐藏到系统托盘；需要彻底退出时，在托盘图标菜单中选择“退出”。

## macOS

1. Apple 芯片 Mac 使用 `arm64/CodexQuotaBar.app`，Intel Mac 使用 `x64/CodexQuotaBar.app`。
2. 将对应的 App 拖到“应用程序”目录后打开。
3. 首次运行若被系统拦截，可在 Finder 中右键 App 并选择“打开”，或在“系统设置 > 隐私与安全性”中允许打开。

本项目提供的是未签名构建。请只使用可信来源的压缩包，不要关闭系统的全局安全检查。

## 使用

- 顶部百分比是 Codex 主额度的剩余量；其他额度会显示为独立进度条。
- 绿色表示剩余量高于 20%，黄色表示 10% 至 20%，红色表示低于 10%。
- 桌宠开启时会优先显示当前 Codex 桌宠；新电脑未配置桌宠或资源不可用时，会自动显示应用内置的西装仓鼠。
- 用量百分比和进度条固定显示在桌宠上方；任务完成时会在侧边显示中文提示，不遮挡额度或桌宠。
- 点击标题栏的折叠按钮可以切换为 48 像素高的紧凑栏。
- 托盘或菜单栏提供显示/隐藏、立即刷新、始终置顶、开机启动、选择 Codex 程序和退出。
- 如果自动找不到 Codex，可通过托盘菜单手动选择 `codex.exe` 或 `codex`。

## 数据与日志

额度只在本机通过 `codex app-server --stdio` 读取。工具不会读取 Codex 登录令牌，不包含统计、通知、声音或自动更新功能。

诊断日志只记录连接事件和错误摘要，单个文件最多 2 MB，保留 3 个历史文件：

- Windows：`%LOCALAPPDATA%\CodexQuotaBar\logs`
- macOS：`~/Library/Application Support/CodexQuotaBar/logs`

## 故障排查

- 一直显示“未找到 Codex”：确认 Codex 桌面端或 CLI 已安装，或从托盘菜单手动选择程序。
- 显示“请先登录 Codex”：先在 Codex 中完成登录，再点击“立即刷新”。
- 显示“正在重连”：确认 Codex 可正常启动；工具会按 2、4、8、16、30 秒的间隔自动重试。
- 窗口消失：它通常已隐藏到托盘或菜单栏，点击图标即可恢复。
