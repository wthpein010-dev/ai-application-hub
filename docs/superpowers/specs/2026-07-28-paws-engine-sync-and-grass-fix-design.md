# Paws 工程同步与草地修正设计

日期：2026-07-28
状态：已确认直接实施
适用范围：`projects/paws-level-editor` 公网页面与 `tools/paws-level-editor-lan` 内网工程工作台

## 目标

把网页关卡编辑器同步到 Unity 工程 `76464973` 的当前关卡生产能力，同时保留已经上线的安全边界：

- 草图在线性尺寸上缩小为现有效果的 `50%`，并围绕每株草自身中心旋转 `180°`。
- 2D 编辑、2D 试玩和 3D 试玩使用相同的草地尺寸、朝向、布局与 `1.0667s` 脉冲动画。
- 内网工作台继续允许删除工程内置关卡：JSON 与同名 `.json.meta` 成对移入 `EditorLevels\_Trash`，所有用户通过 SSE 立即同步，并可恢复。
- 公开关卡库严格镜像 Unity 当前 23 个 JSON，默认打开 `level_0021_r2_第二关模板12.json`；公开站点不发布 `_Trash`、`.meta` 或工程路径。
- 资源目录使用 Unity 当前 `Assets\SheepLevelEditor\Res\SheepLevelEditor`，启动器兼容旧 `Resources` 目录。
- 补齐 Unity 新增的全随机平铺起点层、保存前通关率评估和恢复上次打开关卡。

## 不在本轮扩大的范围

- `DynamicBlocks` 的数百张序列帧不发布到 GitHub Pages。用户已允许动画简化，网页继续使用真实 `block_1001…1006` 静态皮肤和现有轻量反馈。
- 公网 Pages 仍是浏览器本地编辑存储，不获得 Unity 工程写权限。
- 不修改 Unity 工程源码、关卡或用户未跟踪文件；Unity 工程只作为当前规则和资源的只读来源。
- 不改变已经确认的 AI 难度模型、固定 7×8 棋盘或生成器求解门禁。

## 架构

### 1. 草地视觉常量

`core/grass-layout.mjs` 导出：

- `GRASS_VISUAL_SCALE = 0.5`
- `GRASS_ROTATION_RADIANS = Math.PI`

`drawGrassAtlasPatch` 在每株草渲染矩形中心应用旋转，再处理 atlas 内部的 Grass2 旋转裁剪。这样全局 `180°` 不会把草的位置绕地面锚点甩开。

`ui/grass-field.mjs` 用共享缩放常量计算 2D 像素尺寸；`views/three-3d.mjs` 用同一常量创建平面尺寸，并在裁剪纹理中应用同一旋转。3D 平面仍直立、双面、关闭深度写入，避免透明面片遮挡牌面。

### 2. LAN 删除、回收站和资源路径

现有 LAN 服务已经具备以下完整链路，本轮只做回归和路径同步：

1. 删除前验证口令和 SHA-256 版本。
2. JSON 与同名 `.json.meta` 成对移动到 `_Trash`。
3. 任一移动失败时按相反顺序回滚。
4. 恢复时拒绝覆盖活动 JSON、活动 `.meta` 或冲突目标。
5. 服务写入和 Unity/资源管理器直接变动都通过 SSE 刷新所有内网用户。
6. 当前脏文档被他人删除时保留内存内容，允许另存或先恢复；干净文档安全回退默认关。

LAN 默认牌图目录切换到：

`E:\Mahjong\PawsHomeClient\Assets\SheepLevelEditor\Res\SheepLevelEditor\Blocks`

PowerShell 启动器在未显式传入路径且新目录不存在时，才回退旧 `Resources` 路径。显式传入的错误路径继续直接报错，避免静默使用错误资源。

### 3. 全随机平铺

新增 `core/fill-tool.mjs`，只负责纯数据规划：

- 起点层必须是整数且 `>= 1`。
- 在固定 7×8 棋盘微格内，根据拖动主方向生成水平或垂直路径；步长为 1 微格。
- 第 `index` 个候选格使用 `startLayer + index`。
- 新砖固定 `type=-1`，跟随关卡 `fullRandomTypeMin…fullRandomTypeMax`。
- 同层正面积重叠、越界、上层已有砖遮住候选位置时跳过该格。
- 整批新增作为一个撤销命令提交。
- 新批次和现有棋盘一起判断遮挡：被上层覆盖的平铺砖使用 `presetColorType=3, moldType=1`；当前最上层使用 `presetColorType=1, moldType=2`。

2D 画布新增“平铺”工具。按下开始、拖动预览、松开一次提交；单击产生一个候选格。Inspector 在未选择砖块时显示“平铺起点层”，并说明“第 N 层起逐格向上”。3D 不执行放置或平铺，只做选择、删除和属性检查。

### 4. Unity 同口径通关率

新增 `core/pass-rate-evaluator.mjs`，移植 `SheepLevelPassRateEvaluator.cs`：

- 条件固定为 2 个暂存槽、洗牌 1 次、清槽复活 1 次。
- 试验种子为 `100000 + levelId * 1000 + trial`。
- `<=40` 张使用 24 次试验、6 次 rollout、每次 2500 节点。
- `<=120` 张使用 16 次试验、5 次 rollout、每次 6000 节点。
- 其余使用 12 次试验、4 次 rollout、每次 10000 节点。
- 第一回合把随机砖按层分配不同图案；第二回合分别给普通随机池与全随机池分配偶数对子。
- 求解顺序依次为贪心清可见对子、最多 8 个对子分支、最多 6 个暂存分支、一次清槽复活、最多 48 次洗牌寻找可见对子。
- 阻挡规则与 Unity 一致：任意上层正面积覆盖，或同层左右各相邻 8 微格。

评估器按 trial 让出事件循环并提供进度，避免 200 张基准关卡冻结页面。控制器允许 Inspector 手动运行；保存和另存前必须重新评估。结果写入 `designerNote`：

- `passRatePercent`
- `passRatePassCount`
- `passRateTrialCount`
- `passRateInvalidDeal`
- `passRateFailSolve`
- `passRateReasonsText`

重开关卡读取这些字段。任何编辑、撤销或重做都把结果标记为“已过期”；保存会生成新结果后再序列化。评估低于 100% 不替代已有结构校验门禁，但在 Inspector 明确显示原因和 Unity 建议。

### 5. 恢复上次打开关卡

新增 `ui/last-opened-level.mjs`，用 localStorage 分别保存 `static` 和 `lan` 模式最后一次成功打开的文件名：

- 仅保存通过共享文件名校验的 `.json` 名称。
- 启动目录刷新时，优先打开仍存在的上次关卡。
- 记录缺失、损坏或已删除时清除记录并回退当前目录默认关。
- 只有最终胜出的打开请求才写记录，旧异步请求不能覆盖新选择。
- LAN 当前脏文档被外部删除时不清空文档；下次启动再按目录安全回退。

### 6. 公开关卡和资源

运行现有原子同步脚本，公开目录严格替换为 Unity 当前 23 关，不残留已经从工程移除的旧 JSON。默认关仍为 `level_0021_r2_第二关模板12.json`。

网页砖块资源用新 `Res` 目录逐一校验 38 张 PNG 的尺寸和哈希；文件字节未变化时不产生无意义二进制提交。草 atlas 继续使用当前公开 `grass.png`，因为它的两个裁剪区域与 Unity 当前独立 `grass1.png/grass2.png` 像素一致。

## 错误处理

- 平铺起点层非法时不修改关卡，并在 Inspector/Toast 显示 `平铺起点层须为 ≥1 的整数`。
- 平铺路径没有合法格时不进入撤销栈。
- 通关率评估异常时不覆盖上次有效 `designerNote`，保存停止并显示错误。
- LAN 删除/恢复继续使用现有认证、并发冲突和事务回滚错误。
- 上次关卡存储不可用时静默回退默认关，不影响编辑器启动。
- 关卡同步先解析全部源 JSON；任一源文件损坏时不修改公开目录。

## 验证

自动化门禁包括：

- 草地共享缩放与中心旋转单元测试，以及 2D/3D 浏览器像素与场景对象断言。
- 平铺路径、层级、全随机类型、`moldType/presetColorType`、越界/重叠和原子撤销测试。
- 通关率空关、合法小关、无法偶数配对、结果字段往返、保存触发和 UI 状态测试。
- 上次关卡 static/LAN 隔离、缺失回退和并发打开竞态测试。
- 新 `Res` 路径、旧路径兼容、23 关镜像和默认关测试。
- LAN JSON/meta 删除、回滚、恢复、冲突和 SSE 浏览器验收。
- 全量 Paws Node 测试、模块语法、`git diff --check`。

视觉验收覆盖桌面 2D、桌面 3D、试玩和 390×844 只读页面；必须确认草的线性尺寸为旧版一半、朝向旋转 180°、动画仍运行且减少动态效果时静止。发布后等待 GitHub Pages workflow 对齐提交 SHA，再进行线上 HTTP、浏览器控制台、WebGL、AI 生成、完整试玩和视频播放验收。
