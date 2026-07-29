# ClickFlow macOS 本地构建说明

本压缩包包含 macOS 兼容源码和一键构建脚本，不包含预先生成的 `.app`。PyInstaller 必须在 Mac 上运行，生成的应用架构与该 Mac 和所用 Python 的架构一致。

## 构建要求

- macOS 12 或更高版本
- Python 3.10 或更高版本，且包含 Tkinter
- 可访问 PyPI 以安装固定版本的 `pynput` 和 `PyInstaller`

## 构建

在“终端”中进入解压目录后运行：

```bash
bash build_macos.sh
```

构建脚本会创建独立的 `.venv-build-macos` 环境、执行语法检查和完整自动测试，然后生成：

```text
dist/ClickFlow.app
```

## 权限

ClickFlow 的录制和模拟点击需要 macOS 系统输入权限。第一次运行或第一次使用相关功能时，请打开：

`系统设置 → 隐私与安全性 → 辅助功能`

允许 ClickFlow。如果录制仍不可用，再检查：

`系统设置 → 隐私与安全性 → 输入监控`

修改权限后，请彻底退出 ClickFlow 再重新打开。

## 未签名应用首次打开

本地生成的 `ClickFlow.app` 未签名、未公证，不是 App Store 发布包。首次打开时 macOS 可能拦截它。请在 Finder 中找到 `ClickFlow.app`，按住 Control 点击并选择“打开”，核对来源后确认。不要关闭系统整体安全机制。

## 快捷键

- F6：开始或结束录制
- F7：开始、暂停或继续回放
- F8：开始、暂停或继续定点点击
- F9：停止全部任务

快捷键仅在 ClickFlow 窗口获得焦点时生效。如果 Mac 把功能键用于亮度、媒体等系统功能，需要同时按 `Fn`。

## 使用限制

- 默认会在自动点击后恢复光标，但点击瞬间仍可能影响手动鼠标操作。
- 录制时，ClickFlow 自身窗口矩形区域内的点击会被过滤。
- JSON 的 `steps` 动作结构与 Windows 版兼容。
- 请只在你有权操作的本地应用和合规场景中使用。
