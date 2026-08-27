# Codex 多线程悬浮工作台

Codex 多线程悬浮工作台是一个面向 Windows 和 macOS 的常驻桌面工具。默认运行待确认悬浮栏：没有待确认任务时收入屏幕顶部，有任务时自动弹出并允许直接确认继续。完整多线程悬浮工作台作为显式可选模式保留。

## 主要能力

- 72×72 轻量悬浮按钮常驻桌面，可拖动并自动吸附左右边缘
- 单击展开或收起完整多线程工作台，窗口关闭时回到悬浮按钮而不退出后台
- 右键可直接打开、全屏、刷新任务或退出
- 橙色角标提示待确认数量，无待处理任务时保持安静
- 每张任务卡可直接继续对话，支持拖拽交换布局并保存位置
- 每两秒重新扫描近期普通任务，自动排除自动化任务和纯完成报告
- 多显示器环境中，默认固定在最左侧显示器顶部水平居中
- 兼容模式继续提供“确认继续”“忽略”和“一键全部确认”悬浮栏
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
3. 应用默认运行待确认悬浮栏；没有候选时只在屏幕顶部保留收纳把手，有候选时自动展开。

推荐安装当前 Windows 用户的常驻恢复任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\Install-WindowsRecoveryTask.ps1 `
  -ExecutablePath .\CodexConfirmationBar.exe
```

恢复任务会在登录时启动应用，并每分钟检查一次；应用被正常关闭或外部结束后，最迟一分钟自动恢复。任务使用 `IgnoreNew` 策略，应用本身也有单实例保护，不会因重复触发出现多个悬浮栏。

## macOS 使用

根据处理器下载并解压：

- Apple Silicon：`CodexConfirmationBar-macOS-arm64.app.zip`
- Intel：`CodexConfirmationBar-macOS-x64.app.zip`

首次使用请右键 `CodexConfirmationBar.app`，选择“打开”。当前公开包使用 ad-hoc 签名，没有经过 Apple 公证。

如需登录后自动启动，可在“系统设置 → 通用 → 登录项”中添加 `CodexConfirmationBar.app`。

正常发送优先使用本机 `codex app-server`，不需要辅助功能权限。只有 Codex 桌面应用已经占用对应任务、必须通过桌面深链提交时，macOS 才需要在“系统设置 → 隐私与安全性 → 辅助功能”中允许“Codex 待确认悬浮助手”。没有权限时工具不会发送键盘输入，候选会保留并提示重试。

## 工作方式

默认模式连接本机 Codex App Server 后运行待确认悬浮栏。显式传入 `--floating-launcher` 时，应用才显示多线程悬浮按钮；完整工作台只在第一次展开时按需初始化，任务卡和后续状态刷新都使用本地会话最后 4 MiB 的有界内容，不会周期性载入整段超长历史。拖动按钮会自动吸附到最近的左右边缘并保存位置；关闭工作台只会收起，右键悬浮按钮选择“退出多线程工具”才会结束后台进程。

启动时补扫最近 24 小时的普通任务，随后持续扫描。被中断的任务会保留；正常结束的任务只有在最后回复仍明确要求确认、选择、补充信息、回复或询问是否继续时才显示。纯“已完成、已发布、验收通过”以及礼貌性的后续优化邀请不会显示。

点击确认后，工具先通过官方 Codex App Server 恢复对应任务并开始新回合。若任务已有活动写入者，工具会打开精确任务深链并在确认前台应用属于 OpenAI 后提交。Windows 和 macOS 都会在任务日志中回读固定消息；没有核验到消息时，项目不会从列表消失。

“忽略”只隐藏当前回复对应的候选，不发送消息；同一任务出现新的 Codex 回复后会重新评估。“一键全部确认”按列表顺序处理，单条失败不会阻止其他任务。

工具不会自动同意命令执行、文件修改、连接器或其他 Codex 安全审批；这些仍需在原任务中明确处理。

Windows 待确认悬浮栏会拦截普通窗口关闭请求；系统关机和明确维护退出仍正常放行。生命周期、关闭请求和未处理异常默认记录在：

```text
%LOCALAPPDATA%\CodexThreadWorkbench\logs\confirmation-overlay-lifecycle.log
```

## 隐私

应用只连接本机 `codex app-server` 并读取本地会话日志，不读取或保存 `auth.json`、密码、Token、Cookie 或私钥，不上传聊天内容，也不另建云端账户。

## 启动模式

默认启动即为待确认悬浮栏；旧快捷方式中的同名参数继续兼容：

```powershell
.\CodexConfirmationBar.exe --confirmation-overlay
```

若需要悬浮按钮与多线程工作台，可显式运行：

```powershell
.\CodexConfirmationBar.exe --floating-launcher
```

若需要跳过悬浮按钮并直接打开多线程工作台，可运行：

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
