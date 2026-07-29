# ClickFlow 2.0.0

ClickFlow 是一个 Windows 与 macOS 鼠标自动化工作台，支持定点自动点击、点击过程录制、动作编辑、JSON 保存和循环回放。

## 本次发布

- 定点点击和录制回放双模式工作台
- 点击间隔、执行次数、鼠标按键和按下时长设置
- 每次点击后恢复光标位置
- 左键、右键和中键录制
- 动作编辑、排序、删除、保存和打开
- 循环次数、循环间隔、速度倍率和固定间隔
- F6 录制、F7 回放、F8 定点点击、F9 停止全部
- 跟随系统、明亮和深色主题

## 下载与校验

### Windows x64

- 文件：`ClickFlow-Windows-x64.zip`
- 大小：11,553,084 字节
- SHA-256：`c732d791651209e8eb67b929d9a5468f2a76083911a8a472a7498d353f8cb443`
- 入口：`ClickFlow-Windows-x64/ClickFlow.exe`

### macOS arm64 / x64

- 文件：`ClickFlow-macOS.zip`
- 大小：24,377,657 字节
- SHA-256：`5378c5d4e957ba22b2db7f119803901bf6b85e4a94184892678ec42ca5778793`
- Apple Silicon 入口：`arm64/ClickFlow.app`
- Intel 入口：`x64/ClickFlow.app`

## 验证

- ClickFlow 源码完成 51 项自动测试。
- Windows 包完成解压、入口检查和后台启动冒烟检查。
- GitHub Actions 运行 `30431295165` 分别在 arm64 与 x64 macOS Runner 上完成测试、构建、ad-hoc 签名、架构检查和应用启动检查。
- 合并后的 Mac ZIP 通过完整性检查，两个架构入口均存在。

## macOS 首次运行

当前 Mac 应用经过 ad-hoc 签名，但没有 Apple Developer ID 公证。首次运行时请在 Finder 中按住 Control 点击 `ClickFlow.app`，选择“打开”并核对来源。

录制与模拟点击需要在 `系统设置 → 隐私与安全性 → 辅助功能` 中允许 ClickFlow；如果录制仍不可用，再检查“输入监控”。不要关闭 macOS 整体安全机制。
