# ClickFlow

ClickFlow 是一个 Windows 与 macOS 鼠标自动化桌面工具，使用 Python、Tkinter 和 `pynput` 实现。它支持定点自动点击、点击过程录制、动作编辑、JSON 保存和循环回放。

## 主要功能

### 定点点击

- 读取当前鼠标坐标，或直接填写 X、Y。
- 设置点击间隔、次数、鼠标按键和按下时长。
- 执行次数填 `0` 时持续运行。
- 默认在每次点击后恢复光标位置，减少对手动鼠标操作的影响。
- 支持开始、暂停、继续和停止。
- 右侧按屏幕比例预览目标位置。

### 录制回放

- 录制左键、右键和中键点击。
- 自动记录坐标与相邻有效动作的间隔。
- 支持手动添加当前位置。
- 点击 ClickFlow 自身窗口矩形区域时不会写入动作序列。
- 支持编辑、上移、下移、删除和清空动作。
- 保存或打开 JSON 动作序列。
- 支持循环次数、循环间隔、速度倍率、录制间隔和固定间隔。
- 循环次数填 `0` 时持续循环。
- 支持暂停、继续和停止回放。

## 主题和设置

界面支持跟随系统、明亮和深色三种主题。

- Windows 设置：`%APPDATA%\ClickFlow\settings.json`
- macOS 设置：`~/Library/Application Support/ClickFlow/settings.json`

## 快捷键

快捷键只在 ClickFlow 应用窗口获得焦点时生效：

| 快捷键 | 功能 |
| --- | --- |
| `F6` | 开始或结束鼠标点击录制 |
| `F7` | 开始、暂停或继续序列回放 |
| `F8` | 开始、暂停或继续定点点击 |
| `F9` | 停止录制、回放和定点点击 |
| `Ctrl+S` | 保存当前动作序列 |
| `Ctrl+O` | 打开动作序列 |

macOS 键盘如果把功能键用于亮度、媒体等系统功能，可能需要同时按 `Fn`。

## 从源码运行

要求 Python 3.10 或更高版本，并且 Python 包含 Tkinter。

Windows：

```powershell
cd "C:\Users\ASUS\Documents\AI Project\auto-clicker"
python -m pip install -r .\requirements.txt
python .\auto_clicker.py
```

macOS：

```bash
python3 -m pip install -r requirements.txt
python3 auto_clicker.py
```

macOS 的录制和模拟点击需要在“系统设置 → 隐私与安全性”中授予“辅助功能”权限；如果录制仍不可用，还需检查“输入监控”。修改权限后请彻底退出并重新打开 ClickFlow。

## 构建独立应用

### Windows x64

在 Windows x64 上运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1
```

脚本会创建独立构建环境、安装固定依赖、执行语法检查和完整测试、生成 EXE、执行启动冒烟检查，并输出：

```text
release/ClickFlow-Windows-x64.zip
```

### macOS

在 Mac 上运行：

```bash
bash scripts/build_macos.sh
```

或者使用 `ClickFlow-macOS-build.zip`，解压后运行：

```bash
bash build_macos.sh
```

输出位置：

```text
dist/ClickFlow.app
```

macOS `.app` 必须在 Mac 上构建。本地构建默认未签名、未公证，首次启动请通过 Finder 按住 Control 点击应用并选择“打开”；不要关闭系统整体安全机制。

在 Windows 上生成 macOS 源码构建包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package_macos_source.ps1
```

## JSON 兼容性

ClickFlow 继续支持 v1.0.0 的动作结构：

```json
{
  "version": "1.0.0",
  "updated_at": "2026-07-29 12:00:00",
  "steps": [
    {
      "x": 842,
      "y": 516,
      "button": "left",
      "delay": 0.0,
      "hold_ms": 20,
      "restore_cursor": true
    }
  ]
}
```

新文件的 `steps` 字段与现有文件保持兼容。

## 项目结构

- `auto_clicker.py`：Tkinter 界面、状态和任务编排。
- `clickflow_input.py`：Windows/macOS 共用鼠标输入和录制监听适配层。
- `clickflow_core.py`：动作数据结构与可测试的回放核心。
- `clickflow_theme.py`：跨平台主题和设置持久化。
- `ClickFlow.spec`：共用 PyInstaller 配置。
- `scripts/`：Windows、macOS 构建和源码打包脚本。
- `tests/`：不会触发真实点击的自动测试。

## 验证

```powershell
python -m py_compile .\auto_clicker.py .\clickflow_input.py .\clickflow_core.py .\clickflow_theme.py
python -m unittest discover -s .\tests -v
```

自动测试使用假的控制器、监听器、时钟和点击回调，不会移动或点击真实鼠标。

## 使用提示

- 自动点击仍需短暂把系统光标移动到目标点；开启“恢复鼠标位置”后会立即还原，但高频点击仍可能影响同时进行的手动操作。
- 开始前请确认目标窗口位置稳定且可交互。
- 录制时建议使用 F6 开始和结束；ClickFlow 自身窗口区域内的点击会被过滤。
- 可随时按 F9 或点击顶部“停止全部”终止任务。
- 请只在你有权操作的本地应用和合规场景中使用。
