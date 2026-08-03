# Codex 多会话工作台

一个面向 Windows 和 macOS 的轻量 Codex 多线程操作看板。它把多个真实 Codex 线程放进同一个一级界面，每个窗口都可以直接查看上下文、输入消息、停止回合和处理审批。

## 主要能力

- 同屏打开 1–6 个 Codex 线程，自动排列为清晰的等分网格
- 每个线程直接显示标题、项目路径、最近对话和运行状态
- 一级界面直接输入；空闲线程开始新回合，运行中的线程继续追加指令
- 显示进行中、已完成、已停止、需确认、出错和离线状态
- 支持打开、关闭、最小化、搜索和刷新线程
- 支持普通桌面窗口与无边框全屏模式切换
- 记住上次打开的线程和窗口位置
- 拖动任务卡标题栏可交换位置，顺序会自动保存

## 运行要求

- Windows 10/11 x64，或 macOS 13 及以上
- 已安装并登录 Codex 桌面应用或 Codex CLI
- Windows 的 `PATH` 中存在 `codex.exe`，或存在 `%USERPROFILE%\.codex\.sandbox-bin\codex.exe`
- macOS 的 `PATH`、`~/.local/bin`、`/opt/homebrew/bin` 或 `/usr/local/bin` 中存在可执行的 `codex`

## 使用

1. Windows 解压 `CodexThreadWorkbench-Windows-x64.zip` 并运行 `CodexThreadWorkbench.exe`。
2. macOS 解压对应 Apple Silicon 或 Intel 的 `.app.zip`，首次右键打开 `CodexThreadWorkbench.app`。
3. 首次启动会打开最近更新的 4 个线程。
4. 点击“打开线程”可搜索并加入其他线程。
5. 在任一窗口底部输入文字，按 `Enter` 发送，按 `Shift+Enter` 换行。

关闭某张卡片只会从工作台移除，不会删除或归档 Codex 线程。

## 隐私

应用通过本机 `codex app-server` 访问线程，不读取 `auth.json`、Token、Cookie 或其他登录凭据。工作台只保存线程 ID、最小化状态和窗口设置，不另存聊天内容。

## 当前范围

第一版聚焦文本线程操作。图片与文件输入、语音、远程主机线程、全局统计仪表盘和自动审批不在当前版本中。

## 从源码构建

```powershell
dotnet test -c Release
.\scripts\Publish-Windows.ps1
```

Windows 发布包生成在 `artifacts\release`。macOS 包必须在对应架构的 macOS 环境运行：

```bash
scripts/publish-macos.sh osx-arm64
scripts/test-macos-package.sh \
  artifacts/release/CodexThreadWorkbench-macOS-arm64.app.zip \
  osx-arm64
```

首个 Mac 版本使用 ad-hoc 签名，尚未经过 Apple 公证；下载页会明确提示首次打开方式。
