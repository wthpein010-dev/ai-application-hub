# Codex 多线程工作台

一个面向 Windows 和 macOS 的 Codex 多线程桌面工作台。它把多个真实 Codex 任务放在同一个一级界面中：直接查看标题和对话、输入消息、停止回合、处理审批，并通过拖拽交换各任务卡片的位置。

## 主要能力

- 同屏打开 1–6 个 Codex 任务，自动排列为清晰的等分网格
- 每张任务卡直接显示标题、项目路径、最近对话和实时状态
- 在一级界面直接输入；空闲任务开始新回合，进行中的任务继续追加指令
- 清晰区分进行中、已完成、已停止、需确认、出错和离线状态
- 支持打开、关闭、最小化、搜索、刷新和停止任务
- 支持普通桌面窗口与无边框全屏模式切换
- 拖动任务卡标题栏即可交换位置，顺序自动保存
- 记住上次打开的任务、卡片顺序和窗口位置
- 用户消息使用轻量气泡；Codex 回复采用无整块底框的正文排版
- 对超长会话只读取本地日志末尾 4 MiB，避免周期性加载完整历史

## 系统要求

- Windows 10/11 x64，或 macOS 13 及以上
- 已安装并登录 Codex 桌面应用或 Codex CLI
- Windows：`PATH` 中存在 `codex.exe`，或存在 `%USERPROFILE%\.codex\.sandbox-bin\codex.exe`
- macOS：`PATH`、`~/.local/bin`、`/opt/homebrew/bin` 或 `/usr/local/bin` 中存在可执行的 `codex`
- 本机存在 `CODEX_HOME\sessions` 或 `~/.codex/sessions` 会话记录

## Windows 使用

1. 解压 `CodexThreadWorkbench-Windows-x64.zip`。
2. 双击 `CodexThreadWorkbench.exe`。
3. 程序会直接打开完整多线程桌面工作台，无需安装。

首次启动会恢复上次打开的任务；没有保存记录时会载入最近更新的任务。点击“打开线程”可搜索并加入其他任务，在任一卡片底部输入文字后按 `Enter` 发送，按 `Shift+Enter` 换行。

## macOS 使用

根据处理器下载并解压：

- Apple Silicon：`CodexThreadWorkbench-macOS-arm64.app.zip`
- Intel：`CodexThreadWorkbench-macOS-x64.app.zip`

首次使用请右键 `CodexThreadWorkbench.app` 并选择“打开”。当前公开包使用 ad-hoc 签名，尚未经过 Apple 公证。

## 可选启动模式

不带参数时默认打开完整桌面工作台；也可显式使用：

```powershell
.\CodexThreadWorkbench.exe --workbench
```

如需顶部待确认助手，可显式运行：

```powershell
.\CodexThreadWorkbench.exe --confirmation-overlay
```

如需圆形悬浮按钮，可显式运行：

```powershell
.\CodexThreadWorkbench.exe --floating-launcher
```

`Install-WindowsRecoveryTask.ps1` 只适用于希望让顶部待确认助手登录后常驻并自动恢复的用户，不是完整桌面工作台的默认安装步骤。

## 工作方式与隐私

应用通过本机 `codex app-server` 操作任务，并从本地会话日志读取状态和最近对话。它不读取或保存 `auth.json`、密码、Token、Cookie 或私钥，不上传聊天内容，也不另建云端账户。工作台只保存任务 ID、卡片顺序、最小化状态和窗口设置，不另存对话正文。

关闭某张卡片只会从工作台移除，不会删除或归档对应 Codex 任务。关闭完整桌面窗口会先保存布局并释放本机连接，然后正常退出应用。

顶部待确认助手和圆形悬浮按钮属于可选模式。待确认助手支持手动或用户主动开启后的自动确认，但不会自动同意命令执行、文件修改、连接器或其他 Codex 安全审批。

## 从源码构建

```powershell
dotnet test CodexThreadWorkbench.sln --configuration Release
.\scripts\Publish-Windows.ps1
```

Windows 产物生成在 `artifacts\release`。macOS 包必须在对应架构的 macOS 环境构建：

```bash
scripts/publish-macos.sh osx-arm64
scripts/test-macos-package.sh \
  artifacts/release/CodexThreadWorkbench-macOS-arm64.app.zip \
  osx-arm64
```
