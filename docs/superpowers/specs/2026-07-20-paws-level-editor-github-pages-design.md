# 关卡3D编辑器 GitHub Pages 发布设计

日期：2026-07-20

状态：用户已批准推荐方案

## 背景

Paws 内网关卡工作台已经支持读取 Paws 关卡 JSON、2D 编辑、3D 检查、2D/3D 试玩、规则校验和安全写回。现在需要把其中可公开演示的部分发布到 `wthpein010-dev/ai-application-hub` 的 GitHub Pages，并在“工程在线体验”中新增“关卡3D编辑器”，同时提供与其他项目一致的教学视频入口。

GitHub Pages 只能托管静态文件，不能运行原工作台的 Node 服务，也不能直接读取访客电脑上的 `E:\Mahjong\...` 目录。因此公开版使用内置示例关卡和浏览器本地存储，真实工程目录扫描、口令写回、自动备份与并发保护仍保留在内网版。

## 用户可见结果

发布后应用中心的“工程在线体验”新增一张卡片：

- 名称：`关卡3D编辑器`
- 类型：`工程体验`
- 分类：`关卡编辑与3D预览`
- 演示：跳转到 `./projects/paws-level-editor/index.html`
- 视频：跳转到 `./projects/paws-level-editor/video/index.html`
- 标签：`关卡编辑`、`Three.js`、`2D/3D`、`试玩`

演示页可以打开内置示例关卡，在编辑/试玩与 2D/3D 间切换，修改关卡后保存到当前浏览器，也可以恢复内置版本。页面必须明确标注“公开演示版”，避免用户误以为修改会写回 Paws 工程。

视频页沿用应用中心现有教学视频样式，提供网页内播放、直接打开 MP4、返回演示和返回应用中心入口。

## 方案选择

### 采用：同仓库静态演示快照

把浏览器端工作台代码、Three.js 运行文件、38 张砖块图片和独立示例关卡放到应用中心仓库的 `projects/paws-level-editor/`。

优点：

- 与应用中心同域、同版本、同一次 GitHub Pages 发布。
- “演示”和“视频”链接稳定，不依赖内网电脑在线。
- 不公开真实关卡，不暴露本机路径或保存口令。
- 可以复用现有 2D/3D 编辑和试玩引擎。

代价：

- 公开版不能自动扫描 Paws 工程目录。
- 浏览器保存只在当前设备生效。
- 内网版更新后，公开演示快照需要显式同步。

### 未采用：独立动态服务

把 Node 服务部署到云端可以保留完整接口，但需要持续运行的后端、凭据和数据存储，不符合当前 GitHub Pages 发布范围。

### 未采用：连接内网服务

公开页面调用局域网 Node 服务会受混合内容、跨域、防火墙和网络可达性限制，也会把内部工程暴露给不可信页面，不采用。

## 静态演示架构

### 目录

```text
projects/paws-level-editor/
  index.html
  styles.css
  app.mjs
  static-api-client.mjs
  core/
  ui/
  views/
  vendor/
    three.module.js
    OrbitControls.js
  assets/blocks/
    block_1.png ... block_32.png
    block_1001.png ... block_1006.png
  levels/
    index.json
    level_showcase.json
  video/
    index.html
    paws-level-editor-tutorial.mp4
    paws-level-editor-tutorial.vtt
    poster.jpg
    tutorial-script.md
```

`core/`、`ui/` 和 `views/` 来自已验证的 Paws 工作台浏览器代码。公开快照只调整模块路径与数据入口，不改关卡规则。

### 静态数据接口

`static-api-client.mjs` 实现与 `WorkbenchController` 需要的最小接口：

- `health()`：返回在线、可写和静态演示标记。
- `listLevels()`：读取 `levels/index.json`，并合并浏览器本地保存的版本。
- `loadLevel(fileName)`：优先读取本地保存版本，否则读取内置 JSON。
- `saveLevel(payload)`：校验文件名后写入 `localStorage`，返回新的本地版本号。
- `login()` / `logout()`：静态演示不要求口令，保持接口兼容。
- `blockImageUrl(type)`：返回 `assets/blocks/block_<type>.png`。
- `resetLevel(fileName)`：删除该关卡的本地覆盖并恢复内置版本。

浏览器本地存储键使用独立前缀 `paws-level-editor-demo-v1`。保存失败、存储空间不足或示例文件损坏时显示明确错误，不能静默丢失编辑内容。

### 示例关卡

示例关卡是为公开演示单独生成的数据，不复制 `EditorLevels` 下的真实关卡。它需要覆盖：

- 多层叠放和遮挡。
- 普通图案、局部随机和全随机。
- 至少一组翻转牌。
- 至少一组 `1001–1006` 特效牌。
- 足够的可操作配对，用于教学视频演示试玩。

保存时仍同步顶层 `tiles` 与 `designerNote.levelData`，确保公开演示展示真实的数据往返能力。

### Three.js

GitHub Pages 版本使用仓库内 `vendor/` 文件和相对路径，不依赖 Node 的 `/vendor` 路由。`index.html` 提供 import map，把裸模块名 `three` 指向本地 `three.module.js`。3D 视图保持当前材质、相机和完整砖块图案比例。

## 应用中心接入

在 `app.js` 的默认应用数据中增加 `paws-level-editor`。卡片状态为 `engineering`，因此只出现在“工程在线体验”和网页体验列表，不进入普通工具或小游戏区域。

工程体验卡片的动作规则改为：

- 有网页入口时显示“演示”。
- `app.video` 非空时显示“视频”。
- 不配置下载包。
- 现有工程项目没有视频配置时，布局与行为保持不变。

应用数据加载需要把新增默认项目合并进已有浏览器本地数据，避免老用户因为 `localStorage` 中仍是旧列表而看不到新卡片。

## 教学视频

视频是对实际静态演示页的操作录制，不使用纯占位动画。目标时长 75–110 秒，16:9，H.264 MP4，网页可直接播放。

章节：

1. `00:00` 工具定位与示例关卡。
2. `00:12` 2D 选择、移动和属性修改。
3. `00:32` 切换 3D 检查层级与遮挡。
4. `00:50` 进入试玩并完成配对。
5. `01:10` 浏览器保存与恢复内置版本。

同时生成：

- 中文 WebVTT 字幕。
- `poster.jpg` 封面。
- `tutorial-script.md` 旁白与操作脚本。
- 与现有项目一致的 `video/index.html`，支持章节跳转。

## 隐私和安全

- 不提交 Paws 真实 `EditorLevels` JSON。
- 不提交保存口令、会话 Cookie、备份文件或本机绝对路径。
- 只提交用户已指定的 38 张砖块展示资源。
- 公开版不提供任意磁盘路径浏览或服务器文件写入。
- 外部 JSON、文件名和本地存储内容在进入页面前继续经过现有解析与转义逻辑。

## 测试与验收

### 自动化

- 静态 API：列出、加载、本地保存、重载和恢复示例关卡。
- GitHub Pages 路径：所有模块、Three.js、砖块图片、关卡和视频文件存在。
- 应用数据：默认列表包含且只包含一个 `paws-level-editor`。
- 工程卡片：同时输出“演示”和“视频”，无配置时不输出空视频链接。
- 视频：MP4 可解析、时长与尺寸符合要求，VTT 与视频页引用一致。
- 原应用中心现有测试全部通过。

### 本地浏览器

- 打开示例关卡，2D 砖块图案完整。
- 2D 编辑后撤销、重做和本地保存可用。
- 3D 能渲染全部可见砖块，旋转和点选可用。
- 2D/3D 试玩共享状态，配对后数量同步减少。
- 刷新后加载浏览器保存版本，恢复后回到内置版本。
- 视频页可播放 MP4、显示字幕并按章节跳转。
- 桌面和 390px 窄屏无横向溢出，控制台无错误。

### 在线

推送到 `origin/main` 并等待 GitHub Pages 更新后，逐项验证：

- 应用中心首页 HTTP 200。
- “工程在线体验”显示“关卡3D编辑器”。
- “演示”跳转到公开编辑器并可进入 2D/3D。
- “视频”跳转到播放器并能加载 MP4。
- 所有新资源 URL 返回 HTTP 200。

## 发布

在独立功能分支完成并验证后，快进合并到本地 `main`，推送 `origin/main`。GitHub Pages 当前从 `main` 发布；推送后轮询线上页面直到新提交可见，再执行在线验收。

