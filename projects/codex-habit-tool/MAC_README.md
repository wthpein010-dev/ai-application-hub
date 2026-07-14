# Codex Habit Tool for macOS

当前稳定发布版是 Windows WinForms 程序，不能直接在 macOS 运行。本包提供完整 C# 源码、功能说明和迁移参考，便于在 Mac 上使用 .NET 8 与 Avalonia 或 MAUI 制作原生版本。

## 包含内容

- `CodexHabitTool.cs`: 设置窗口、Codex 配置写入和任务命名逻辑。
- `CodexHotkeyHelper.cs`: 全局快捷键助手。
- `CodexHabitTool.Tests.cs`: 现有行为测试。

## macOS 迁移建议

1. 安装 .NET 8 SDK。
2. 用 Avalonia 创建跨平台桌面项目。
3. 复用配置、命名和报告逻辑，将 WinForms 控件替换为 Avalonia 控件。
4. 将全局快捷键实现替换为 macOS 对应 API，并在系统“隐私与安全性”中授予辅助功能权限。

网页演示可直接在浏览器中使用，不依赖 Windows。
