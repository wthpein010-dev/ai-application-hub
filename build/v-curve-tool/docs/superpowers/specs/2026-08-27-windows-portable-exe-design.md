# Windows 便携 EXE 设计规格

日期：2026-08-27
状态：已由用户确认设计方向，待规格复核后实施

## 1. 目标

把现有离线单文件 `dist/V曲线对比工具.html` 封装成 Windows x64 便携 EXE。用户双击 EXE 后直接进入现有 V 曲线对比界面，选择 `EditorLevels` 文件夹即可分析正式关卡并与内置的《羊了个羊》900121 结构比较。

交付物为单个无需安装的 `V曲线对比工具-1.1.0-Windows-x64.exe`、对应 SHA-256 校验文件和更新后的使用说明。EXE 不修改 Unity 工程或导入的关卡文件。

## 2. 已确认的产品边界

- 目标平台仅为 64 位 Windows 10/11。
- 采用便携单文件 EXE，不制作安装器、开始菜单入口、自动更新或卸载程序。
- 保留现有 UI、V 曲线算法、羊 900121 数据、真实关卡解析、PNG 导出和 JSON 导出行为。
- 每次启动仍由用户主动选择 `EditorLevels` 文件夹；第一版不记忆或静默读取绝对路径。
- 完全离线运行，不访问网络，不上传关卡、报告或诊断数据。
- 第一版不包含代码签名。Windows 可能显示“未知发布者”或 SmartScreen 提示，使用说明必须明确说明这一点。

## 3. 方案比较与选择

### 3.1 Electron 便携版（采用）

Electron 自带 Chromium，能够原样运行已通过验收的 HTML/CSS/JavaScript、Web Worker、文件夹选择器、Canvas 和 Blob 下载。`electron-builder` 的 `portable` 目标可以生成一个自解压的单 EXE，不依赖用户电脑上的 Node.js、.NET、WebView2 版本或浏览器配置。

代价是 EXE 预计为 100–180 MB，首次启动比原生程序略慢。这一取舍优先保证视觉一致性和关卡导入、计算、导出的兼容性。

### 3.2 .NET WebView2 宿主（不采用）

该方案产物更小，但依赖系统 WebView2 Runtime，并会引入目录选择、下载和本地文件协议适配。它在不同 Windows 环境下的运行时差异会扩大验收范围，不适合本次“原样封装并稳定交付”的目标。

### 3.3 安装版或原生重写（不采用）

安装版不符合已确认的便携单文件要求；原生重写会重复现有分析和渲染逻辑，风险与成本都没有必要。

## 4. 架构

新增一个最小 Electron 主进程层，现有 Web 工具继续作为唯一渲染层：

```text
Windows EXE
  └─ Electron 主进程
       ├─ 创建受限 BrowserWindow
       ├─ 加载 asar 内的 dist/V曲线对比工具.html
       ├─ 拒绝外部导航、弹窗和权限请求
       └─ 管理窗口生命周期
            └─ 现有 V 曲线 Web 工具
                 ├─ 用户选择 EditorLevels
                 ├─ 本地只读解析与 Worker 分析
                 └─ PNG / JSON 本地导出
```

不新增 preload 桥、不向渲染层暴露 Node API，也不把文件系统权限扩大到用户主动选择的文件之外。现有 `<input webkitdirectory>` 继续承担目录授权，保持浏览器版本与 EXE 版本的数据流一致。

## 5. 文件与构建配置

计划新增或修改以下内容：

- `desktop/window-options.cjs`：只包含可单元测试的窗口和 WebPreferences 配置。
- `desktop/main.cjs`：Electron 生命周期、加载本地 HTML、导航与权限拦截。
- `tests/desktop/window-options.test.js`：窗口大小和安全配置的红绿测试。
- `tests/desktop/package-config.test.js`：便携 x64 目标、产物命名和打包文件白名单的红绿测试。
- `scripts/verify-windows-build.mjs`：检查 EXE、文件大小、外层 NSIS 引导器与内层 Electron 应用的 PE 头、命名和 SHA-256，并生成校验文件。
- `package.json` / `package-lock.json`：固定 `electron@44.0.0`、`electron-builder@26.15.3`，把只在 Vite 构建期使用的 `html2canvas` 调整为开发依赖，并增加桌面开发、Windows 构建和验收脚本。
- `README.md`：增加 EXE 使用、构建、校验与未签名提示。
- `release/`：生成最终 EXE 与 `.sha256.txt`；该目录是交付产物，不承载源码。

`electron-builder` 只打包 `desktop/**`、`dist/V曲线对比工具.html` 和运行所需的 `package.json`。源码测试、视觉验收图、Unity 目录和其他本机文件不会进入 EXE。

## 6. 运行时安全与错误处理

BrowserWindow 使用以下固定边界：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `devTools: false`
- 不设置 preload
- 禁止新窗口和外部 URL 打开
- 除目标本地 HTML 自身加载外，拒绝主框架导航
- 所有权限请求一律拒绝
- 菜单栏隐藏，不开放开发者工具快捷入口

若 HTML 加载失败，主进程显示本地错误对话框并退出，不能留下空白窗口。分析、导入和导出错误继续使用现有页面内提示，不在桌面层复制业务错误处理。

## 7. 窗口体验

- 初始窗口为 `1440×900`，居中显示。
- 最小窗口为 `1000×700`，与现有响应式断点匹配。
- 窗口标题为“V 曲线对比工具”。
- 支持最大化、最小化、缩放和正常关闭。
- 关闭最后一个窗口时结束进程；macOS 生命周期不在本次范围内。

## 8. 测试与验收

实施遵循 TDD：先增加会失败的桌面配置与打包配置测试，再补最小实现。

最终必须完成以下新鲜验证：

1. `npm test`：现有 60 项测试和新增桌面测试全部通过。
2. `npm run verify:real`：真实 `EditorLevels` 仍导入 25 个正式关卡、忽略非正式文件且无新增 warning。
3. `npm run build` 与 `npm run verify:dist`：原 HTML 成品仍自包含且无外部 URL。
4. `npm run build:win`：生成唯一的 Windows x64 portable EXE。
5. `npm run verify:win`：允许 electron-builder 标准的 x86/x64 NSIS 外层引导器，但强制校验内层 Electron 应用为 x64 `0x8664`；同时检查合理文件大小、产物命名并生成 SHA-256。
6. 在 Windows 上实际双击 EXE，确认窗口能启动、无白屏、无开发者控制台。
7. 在 EXE 中导入真实 `EditorLevels`，默认分析 `level_0020`，确认 25 关、280 砖、22 层和 1–15 类型结果与 HTML 版一致。
8. 在 EXE 中完成一次 PNG 和 JSON 导出，并回读 PNG 尺寸与 JSON schema `vcurve-comparison/1`。
9. 检查普通窗口、最大化和 1000px 最小宽度布局，确认双图、指标、警告和导出区域无截断或重叠。

## 9. 发布与版本

- 应用版本从 `1.0.0` 提升为 `1.1.0`，表示新增桌面分发形态但不改变分析口径。
- 最终 EXE 位于 `release/V曲线对比工具-1.1.0-Windows-x64.exe`。
- 校验文件位于同目录，内容为小写 SHA-256、两个空格和 EXE 文件名。
- 本次只在当前功能分支提交，不自动合并、推送或创建 PR。

## 10. 完成标准

只有当源码测试、真实关卡验证、HTML 单文件验证、Windows 构建检查和 EXE 实机导入/导出/视觉验收全部通过，才可宣布 Windows EXE 完成。若 Electron 下载或打包受网络、代理或系统策略阻塞，必须给出精确失败证据，不能用未验证的目录或中间产物冒充最终交付。
