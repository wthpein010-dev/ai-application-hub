# Codex 待确认悬浮助手

Codex Confirmation Bar 是一个面向 Windows 和 macOS 的常驻桌面工具。它持续扫描本机近期 Codex 任务，把仍在等待确认、选择、补充信息或继续指令的任务集中显示在桌面最上层，并支持单条确认和一键全部确认。

## 主要能力

- 常驻桌面最上层；没有候选时显示“暂无待确认 · 常驻扫描”
- 每两秒重新扫描近期普通任务，自动排除自动化任务和纯完成报告
- 支持拖动悬浮栏改变位置
- 支持“确认继续”“忽略”和“一键全部确认”
- 固定发送：`确认，继续开始做，完成前不要停。`
- 只有从对应任务记录中确认消息确实写入后才移除候选
- 发送失败时保留候选并显示重试，不会把失败误报成成功
- 只读取每个本地会话日志最后 4 MiB，避免把超长任务完整载入内存

## 系统要求

- Windows 10/11 x64，或 macOS 13 及以上
- 已安装并登录 Codex CLI
- Windows：`PATH` 中存在 `codex.exe`，或存在 `%USERPROFILE%\.codex\.sandbox-bin\codex.exe`
- macOS：`PATH`、`~/.local/bin`、`/opt/homebrew/bin` 或 `/usr/local/bin` 中存在可执行的 `codex`
- 本机存在 `CODEX_HOME\sessions` 或 `~/.codex/sessions` 会话记录

## Windows 使用

1. 解压 `CodexConfirmationBar-Windows-x64.zip`。
2. 双击 `CodexConfirmationBar.exe`。
3. 应用默认只启动待确认悬浮栏，不打开多会话主窗口。

如需当前 Windows 用户登录后自动启动，可把 `CodexConfirmationBar.exe` 的快捷方式放入：

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

## macOS 使用

根据处理器下载并解压：

- Apple Silicon：`CodexConfirmationBar-macOS-arm64.app.zip`
- Intel：`CodexConfirmationBar-macOS-x64.app.zip`

首次使用请右键 `CodexConfirmationBar.app`，选择“打开”。当前公开包使用 ad-hoc 签名，没有经过 Apple 公证。

如需登录后自动启动，可在“系统设置 → 通用 → 登录项”中添加 `CodexConfirmationBar.app`。

正常发送优先使用本机 `codex app-server`，不需要辅助功能权限。只有 Codex 桌面应用已经占用对应任务、必须通过桌面深链提交时，macOS 才需要在“系统设置 → 隐私与安全性 → 辅助功能”中允许“Codex 待确认悬浮助手”。没有权限时工具不会发送键盘输入，候选会保留并提示重试。

## 工作方式

启动时补扫最近 24 小时的普通任务，随后持续扫描。被中断的任务会保留；正常结束的任务只有在最后回复仍明确要求确认、选择、补充信息、回复或询问是否继续时才显示。纯“已完成、已发布、验收通过”以及礼貌性的后续优化邀请不会显示。

点击确认后，工具先通过官方 Codex App Server 恢复对应任务并开始新回合。若任务已有活动写入者，工具会打开精确任务深链并在确认前台应用属于 OpenAI 后提交。Windows 和 macOS 都会在任务日志中回读固定消息；没有核验到消息时，项目不会从列表消失。

“忽略”只隐藏当前回复对应的候选，不发送消息；同一任务出现新的 Codex 回复后会重新评估。“一键全部确认”按列表顺序处理，单条失败不会阻止其他任务。

工具不会自动同意命令执行、文件修改、连接器或其他 Codex 安全审批；这些仍需在原任务中明确处理。

## 隐私

应用只连接本机 `codex app-server` 并读取本地会话日志，不读取或保存 `auth.json`、密码、Token、Cookie 或私钥，不上传聊天内容，也不另建云端账户。

## 兼容模式

`--confirmation-overlay` 继续等价于默认启动方式。若确实需要旧版多会话主界面，可显式运行：

```powershell
.\CodexConfirmationBar.exe --workbench
```

## 从源码构建

```powershell
dotnet test CodexThreadWorkbench.sln --configuration Release
.\scripts\Publish-Windows.ps1
```

Windows 产物生成在 `artifacts\release`。macOS 包必须在对应架构的 macOS 环境构建：

```bash
scripts/publish-macos.sh osx-arm64
scripts/test-macos-package.sh \
  artifacts/release/CodexConfirmationBar-macOS-arm64.app.zip \
  osx-arm64
```
