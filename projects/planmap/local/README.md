# PlanMap 本地网页发行版

这是可运行的本地网页 ZIP，**不是 Windows/macOS 原生安装包**。安装 Node.js 22.13 或更新版本后，无需 npm 安装、构建或账号即可使用内置演示模式。包内没有模型服务、模型权重或 Node.js 本身。

## Windows

1. 解压整个 ZIP 到一个文件夹，不要直接在压缩包内运行。
2. 打开 `local/Start-PlanMap.cmd`。也可以在该目录执行 `node server.mjs`。
3. 在 Chrome、Edge 或 Firefox 打开终端显示的 `http://127.0.0.1:3210`。
4. 使用完毕，在终端按 Ctrl+C 停止服务。

## macOS

1. 解压整个 ZIP。终端进入解压后的 `planmap-local-web` 目录。
2. 执行 `sh local/Start-PlanMap.command`，然后在 Safari、Chrome 或 Firefox 打开 `http://127.0.0.1:3210`。
3. ZIP 保留了 `.command` 可执行权限，允许时也可双击启动。若系统阻止运行，请用上面的终端命令；不要关闭 Gatekeeper 或修改系统安全设置。
4. 按 Ctrl+C 停止服务。

Node.js 安装地址：<https://nodejs.org/>。找不到 `node` 时，安装后重新打开终端。端口占用时先停止已有服务；必要时 Windows PowerShell 执行 `$env:PLANMAP_PORT=3211; node local/server.mjs`，macOS 执行 `PLANMAP_PORT=3211 node local/server.mjs`。服务器只监听 `127.0.0.1`，不提供网络共享或统一 AI 代理。

## 使用和数据

对话修改导图、双击节点编辑、撤销/重做、切换结构、导出 PNG/PDF/Markdown/XMind 均在浏览器进行。演示模式无需联网；自定义 OpenAI 兼容服务需要网络、模型权限及允许此网页来源的 CORS 配置。Ollama/LM Studio 等本地模型需另行安装和运行。API key 仅在页面内存中，刷新后需重新填写；不要把密钥写入启动脚本。

自动保存使用当前浏览器的 localStorage。保持相同浏览器、用户配置和 `http://127.0.0.1:3210` 地址；`localhost`、端口变化或换浏览器都会切换存储空间。清除网站数据/隐私模式可能丢失导图。跨机器迁移前导出 XMind 和 Markdown 到文件；当前版本没有导入恢复、账号或云同步，导出文件可以在支持的外部工具中使用。

Mac 字体可能与 Windows 略有不同。保存 PNG/PDF 时检查长标题、中文字符和布局是否完整。下载权限由浏览器管理。

## 版本与验证

该下载版来自 Hub 已发布的 `projects/planmap/app` 静态实现。`../source` 是另行同步的权威 React/vinext 开发源码；两者并非同一个构建产物。本 ZIP 不包含 React 开发源码、私有报告、部署配置或凭据。

CI 在 Windows x64、macOS 15 Apple Silicon/Intel、Linux x64 runner 实际执行本机服务器、含空格路径内 ZIP 解压后的启动脚本，并通过其服务检查编辑、刷新恢复和 Chromium 的四种导出；两种 macOS 架构另测 WebKit 引擎，使用系统 unzip 核对 `.command` 权限及 LF 换行。下载版仅依赖对应架构的 Node.js 与浏览器，没有包内原生二进制或 npm 运行依赖。CI 不能替代用户机器的 Finder 双击、Safari 浏览器及签名/安装验证，实际运行记录以本提交的 Actions 结果为准；未测试的旧 macOS 或 Windows ARM 不在本轮保证范围。

原生版本下一步可选：Electron 搭配现有网页，增加体积但可统一运行时；Tauri 使用系统 WebView，包更小但增加 Rust、平台 WebView 和适配工作。二者均需独立设计、平台构建及 macOS 签名/notarization、Windows 签名决定。本轮不添加这些依赖或冒称已有原生安装包。
