# CodexThreadWorkbench 跨平台、Mac 下载与演示视频设计

日期：2026-07-20
状态：已确认，待实施计划
适用仓库：`CodexThreadWorkbench` 与 `ai-application-hub`

## 1. 背景与目标

当前 CodexThreadWorkbench 已发布可验证的 Windows x64 成品和 GitHub Pages 分片下载，但 Hub 项目配置没有 `video` 地址，`platforms.mac` 也为空。应用唯一的 GUI 工程使用 `net8.0-windows` 和 WPF，现有 Windows 包不能在 macOS 上运行。

本次工作将应用迁移为基于 Avalonia 的单一跨平台桌面代码库，在不缩减现有一级多任务操作能力的前提下继续发布 Windows 版本，并新增经过对应 macOS 环境验证的 Apple Silicon、Intel 成品。同时制作并发布一段统一样式的中文演示视频，使 Hub 卡片完整提供“演示、视频、Wins下载、Mac下载”四个入口。

## 2. 范围与完成定义

### 2.1 包含范围

- 将 WPF 视觉层迁移到 Avalonia，不保留两套长期并行的桌面 UI。
- 把 Codex 协议、任务状态、消息发送、审批、停止、安全关闭和布局计算移入不依赖具体 UI 平台的 Core 层。
- 发布 Windows x64、macOS Apple Silicon 和 macOS Intel 三个自包含成品。
- 为两个 Mac 架构分别提供带哈希校验、失败重试和进度显示的 Pages 分片下载。
- 制作 60–90 秒的中文演示视频和统一视频页。
- 更新 Hub 卡片、项目介绍页、测试、发布脚本和项目文档。

### 2.2 不包含范围

- 不增加统计仪表盘、常驻侧栏或任务进度汇总。
- 不增加云端远程主机、附件、语音、线程删除或自动审批。
- 不用 Windows 包、源码包、占位文件或未验证的交叉编译产物冒充 Mac 成品。
- 没有 Apple Developer ID 时不宣称应用已经 Apple 公证。

### 2.3 完成定义

只有以下条件全部满足，才能宣称本次发布完成：

1. 现有 35 个自动化场景在迁移后继续通过，并新增跨平台、Avalonia、Mac 打包、视频和网页入口专项测试。
2. Windows 发布包通过现有最小可用流程，原有安全分片下载继续有效。
3. Apple Silicon 和 Intel 包分别在对应 CPU 架构的 macOS 环境完成应用包结构、签名、启动和 Codex app-server 初始化/列任务冒烟测试。
4. 视频满足公网可播放、H.264、16:9、时长不超过 240 秒、字幕不重叠且每条单行。
5. Hub、介绍页、视频页、两个 Mac 下载、Windows 下载和全部媒体/分片完成真实公网验收。

如果缺少某一 Mac CPU 架构的实机或等价 CI runner，该架构按钮不得上线，整体 Mac 双架构交付不得报告为全部完成。

## 3. 应用架构

### 3.1 解决方案结构

解决方案调整为三个主要项目：

```text
src/
  CodexThreadWorkbench.Core/
    Codex/
    Infrastructure/
    Models/
    Persistence/
    Presentation/
  CodexThreadWorkbench.Desktop/
    App.axaml
    MainWindow.axaml
    Views/
    Styles/
    Platform/
tests/
  CodexThreadWorkbench.Tests/
  CodexThreadWorkbench.Desktop.Tests/
```

`CodexThreadWorkbench.Core`
: 目标为普通 `net8.0`。包含 JSONL/JSON-RPC、Codex app-server 客户端、线程投影、状态机、视图模型、工作区设置和布局计算。Core 不引用 WPF、Avalonia 或平台专属 API。

`CodexThreadWorkbench.Desktop`
: 使用 Avalonia Desktop，目标为 `net8.0`。包含 AXAML 视觉树、窗口/全屏控制、键盘交互、平台服务装配和应用入口。同一项目发布 `win-x64`、`osx-x64` 与 `osx-arm64`。

`CodexThreadWorkbench.Tests`
: 保留并迁移现有协议、状态、发送、审批、持久化、布局和退出竞态测试。

`CodexThreadWorkbench.Desktop.Tests`
: 使用 Avalonia Headless 覆盖选择器、多卡片、输入发送、状态样式、响应式列数、全屏命令和错误重试的 UI 行为。

### 3.2 平台适配器

Core 只依赖以下窄接口：

- `ICodexProcessLocator`：Windows 查找 `codex.exe`，macOS 查找可执行的 `codex`；两端均优先使用 PATH，不读取认证文件。
- `IWorkspacePathProvider`：返回当前系统的本地应用数据目录。
- `IWindowModeService`：保存桌面窗口边界并切换全屏。
- `IApplicationLifetime`：统一协调取消、关闭连接和结束本应用启动的子进程。

Codex 进程始终使用参数列表启动，不通过 shell 拼接命令。关闭流程继续使用单一、可重复等待的关闭任务，避免重复关闭和请求完成竞态回归。

### 3.3 数据流

1. Desktop 组装平台适配器并启动 Core。
2. Core 定位 `codex`，以 stdio 启动 `codex app-server`，发送 `initialize` 与 `initialized`。
3. `thread/list` 和 `thread/read` 结果被投影为平台无关的任务、消息和状态模型。
4. 每个任务卡片直接绑定一个 `ThreadCardViewModel`：运行中输入走 `turn/steer`，空闲输入走 `thread/resume` 后的 `turn/start`。
5. app-server 通知按 `threadId` 路由，只更新相关卡片。
6. 退出时所有入口共享同一个关闭任务；连接取消和进程退出完成后才结束应用。

## 4. 界面与交互

- 启动后直接显示任务选择层或恢复上次任务，不增加统计首页。
- 同一个一级界面展示多个任务；每张卡片包含标题、最近对话、状态、输入框和发送/停止/审批/关闭操作。
- 状态集合固定为“进行中、等待输入、等待审批、已完成、已停止、失败、离线”，同时使用颜色、图标和文字，不只依赖颜色。
- 桌面模式根据可用宽度排列 1–3 列；卡片标题区和输入区在同一行带内保持水平对齐。
- 全屏模式复用相同卡片组件，增加可见任务面积；返回桌面模式时恢复之前的窗口边界。
- `Enter` 发送，`Shift+Enter` 换行；Mac 上不改变这组现有快捷键。
- Codex 未安装时显示平台对应的安装检查说明；连接中断时保留现有对话并提供全局重连；发送失败时保留草稿并仅在对应卡片显示错误。
- 关闭卡片只移出工作台，不归档或删除 Codex 任务。

## 5. Windows 与 macOS 打包

### 5.1 Windows

- 继续生成自包含 `win-x64` ZIP，文件名保持 `CodexThreadWorkbench-Windows-x64.zip`。
- 迁移后的 ZIP 重新计算长度与 SHA-256，并重新生成 Pages 分片；旧清单在新包验证完成前保持有效。

### 5.2 macOS

分别发布：

- `CodexThreadWorkbench-macOS-arm64.app.zip`：Apple Silicon。
- `CodexThreadWorkbench-macOS-x64.app.zip`：Intel。

每个 ZIP 内只有对应架构的 `CodexThreadWorkbench.app`。应用包包含 `Info.plist`、图标、托管程序集、自包含 .NET 运行时和 `Contents/MacOS/CodexThreadWorkbench` 入口。最低系统版本在打包时固定并同步显示在下载页；初版目标为 macOS 13 或更高版本。

没有 Developer ID 证书时，CI 使用 ad-hoc `codesign`，下载页明确标注“未公证”以及首次右键打开方法。不得暗示包已经过 Apple 公证。

CI 为 `osx-x64` 和 `osx-arm64` 选择对应 CPU 架构的 macOS runner，并对最终 ZIP 执行：

1. 解压并验证 `.app` 标准目录结构。
2. 使用 `file` 验证原生入口架构。
3. 使用 `codesign --verify --deep --strict` 验证签名结构。
4. 从最终 `.app` 内入口执行无 UI 的 `--smoke-test`：启动 `codex app-server`、初始化、调用 `thread/list`，成功后退出。
5. 启动最终 `.app`，确认进程进入 Avalonia 应用生命周期且无立即崩溃，再受控退出。

CI runner 只安装公开 Codex CLI，不注入用户凭据；冒烟测试允许线程列表为空，但 app-server 初始化和请求响应必须成功。

## 6. Mac 分片下载

Hub 的 `platforms.mac` 指向 `projects/codex-thread-workbench/download/mac/`。该页提供 Apple Silicon 与 Intel 两张清晰的下载选项，分别显示架构、最低系统版本、版本号、总字节数、完整 SHA-256 和首次打开说明。

每个包使用独立清单并切为不超过 8 MiB 的静态分片。下载控制器必须：

1. 按清单顺序获取分片。
2. 每片最多尝试 3 次，并显示总体进度和当前分片。
3. 验证每片长度与 SHA-256。
4. 合并后验证完整长度与 SHA-256。
5. 只有全部匹配才触发原始文件名下载。
6. 失败时保留架构选择并提供明确的重试操作。

Windows 下载页保持原路径。新 Mac 清单和入口只在所有分片已经推送并通过公网 200 验证后激活。

## 7. 演示视频

视频目标时长为 60–90 秒，使用发布候选 Avalonia Windows 构建和匿名的演示任务录制，不展示真实聊天、账户、路径、Token 或其他个人信息。

章节顺序为：

1. 打开任务选择器并选择多个任务。
2. 同屏查看标题和具体对话。
3. 在不同卡片直接输入和发送。
4. 展示进行中、等待输入、等待审批和已完成状态。
5. 停止一个正在运行的任务。
6. 在桌面与全屏之间切换。

媒体为 16:9 H.264 MP4，使用独立 JPG 封面和中文 WebVTT 字幕。字幕条目不得重叠，每个 cue 只含一个非空文本行；长句拆成连续短句。视频页复用 Hub 已有的统一背景、延迟加载播放器、控制条和“返回主页”按钮。

## 8. Hub 接入

Workbench 项目对象更新为：

- `video` 指向项目视频页。
- `platforms.web` 继续指向交互演示。
- `platforms.windows` 继续指向 Windows 安全下载页。
- `platforms.mac` 指向 Mac 双架构下载页。
- `package` 继续指向 Windows 默认下载页，保持既有兼容行为。

项目介绍页同步增加视频和 Mac 下载入口。Hub 卡片顺序固定为“演示、视频、Wins下载、Mac下载”，不更改其他项目排序。

## 9. 测试与验收

### 9.1 自动化

- Core：迁移后的现有 35 个场景全部通过；Debug 和 Release 都运行。
- Desktop：Avalonia Headless UI 行为和关键控件可访问性测试。
- 跨平台：Windows、macOS x64、macOS arm64 的编译与发布矩阵。
- 打包：文件名、架构、应用包结构、签名、完整长度、完整 SHA-256 和解压测试。
- 分片：清单顺序、单片长度/哈希、三次重试、合并长度/哈希和错误状态。
- 视频：H.264、16:9、时长 `<= 240` 秒、封面存在、VTT 时间有序且不重叠、每条字幕单行。
- Hub：Workbench 四个按钮存在、顺序正确、目标非空且没有占位或错平台链接。

### 9.2 本地与 CI 验收

- Windows：连接真实本机 Codex，打开至少四个任务，验证独立输入、流式状态、停止、审批、关闭卡片和桌面/全屏往返。
- macOS：两个 CPU 架构分别执行第 5.2 节的最终包冒烟验证。
- 网页：桌面和移动宽度均无横向溢出、控制台错误或资源加载错误。

### 9.3 公网验收

- 等待 GitHub Pages 部署成功。
- 逐项验证 Hub、介绍页、视频页、MP4、VTT、Windows 下载页、Mac 下载页和所有分片返回有效响应。
- 在真实浏览器中播放视频并检查单行字幕。
- 在真实浏览器中分别重组两个 Mac 包，核对下载后的字节数和 SHA-256，再解压检查 `.app`。
- 任何未通过项都不得以空按钮、坏链接或未经验证的包绕过。

## 10. 发布顺序与安全

1. 基于最新 `origin/main` 工作，不覆盖其他项目提交。
2. 先完成应用迁移和三平台测试，再生成成品。
3. 先推送下载基础设施，再按单片小提交逐次非强制快进推送分片。
4. 所有分片公网可用后再提交清单、视频和四入口激活变更。
5. 每次推送前 fetch 并检查祖先关系；不使用强推。
6. 最终报告远端提交、Pages 部署、视频时长、三个包的大小/SHA-256、测试数字和全部公开 URL。
