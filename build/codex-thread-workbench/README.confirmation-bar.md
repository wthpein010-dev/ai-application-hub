# Codex 待确认悬浮助手

面向 Windows 和 macOS 的 Codex 待确认提醒工具。它会扫描需要你决定是否继续的 Codex 任务；没有待处理任务时收纳在屏幕顶部，发现任务后展开，让你查看原任务、忽略误报或确认继续。

## Windows 使用

1. 解压 `CodexConfirmationBar-Windows-x64.zip`。
2. 双击 `CodexConfirmationBar.exe`。
3. 程序默认以待确认悬浮模式启动。

需要在登录 Windows 后保持运行时，执行 `Install-ConfirmationBarRecovery.ps1`，并把当前解压目录中的 `CodexConfirmationBar.exe` 路径传入。自动确认默认关闭；它不会处理命令执行、文件修改或其他 Codex 安全审批。

## macOS 使用

根据处理器下载对应安装包：

- Apple Silicon：`CodexConfirmationBar-macOS-arm64.app.zip`
- Intel：`CodexConfirmationBar-macOS-x64.app.zip`

首次使用请右键应用并选择“打开”。当前公开包采用 ad-hoc 签名，尚未经过 Apple 公证。

## 隐私

程序只连接本机 Codex app-server 和会话日志，用于判断是否存在待确认任务；不读取或保存登录凭据、密码、Token、Cookie 或私钥，也不上传聊天内容。
