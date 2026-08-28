# V 曲线对比工具

这是一个完全离线的关卡结构分析工具。它把当前 Paws 正式关卡与内置的《羊了个羊》900121 结构放在同一套 Paws“两两配对＋暂存槽”规则下，生成双图、关键指标、结构诊断和导出文件。

## Windows 便携 EXE

推荐使用 `release/V曲线对比工具-1.2.0-开箱即用-Windows-x64.zip`：完整解压后，双击目录中的 `V曲线对比工具-1.2.0-Windows-x64.exe`，工具会自动只读加载同目录 `Editorlevel`，无需安装 Node.js 或手动选择文件夹。当前打包数据来自：

`E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\Editorlevel`

开箱即用包会导入 31 个有效关卡、忽略 31 个 Unity 伴随文件并默认选择 `level_0020`。EXE 完全离线，只读取相邻固定目录或用户主动选择的关卡文件，不会修改 Unity 工程或关卡。当前版本未使用商业代码证书签名，Windows 首次运行时可能显示“未知发布者”提示。

ZIP 同目录的 `.sha256.txt` 和解压目录中的 EXE `.sha256.txt` 是完整性校验文件，可用 PowerShell 核对：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\release\V曲线对比工具-1.2.0-开箱即用-Windows-x64.zip'
```

命令结果应与 `.sha256.txt` 中的哈希一致。

## macOS 构建

仓库同时提供 `build:mac:arm64` 与 `build:mac:x64` 两个原生构建入口。macOS 包会把 `bundled-levels/Editorlevel` 放入应用资源目录，启动后与 Windows 开箱即用包一样自动只读导入 31 个有效关卡；该目录的 62 个文件与用户指定的 Unity `Editorlevel` 已逐文件校验一致。公开 macOS 包由 GitHub 的 Apple Silicon 和 Intel runner 分别构建、启动验证后再组合发布。

## 直接使用

1. 双击 `dist/V曲线对比工具.html`，用 Edge 或 Chrome 打开。
2. 点击“选择 EditorLevels 文件夹”。
3. 选择：

   `E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\EditorLevels`

4. 工具会导入 25 个正式关卡并默认选择 `level_0020`；等待进度条结束即可查看与羊 900121 的 V 曲线对比。
5. 如需改模型，可调整 Seeds（20～2000）、暂存槽（1～2）和策略（贪心前沿/随机决策）。
6. 使用“导出 PNG”保存完整 2× 报告图，或用“导出 JSON”保存可复算的曲线、指标和诊断数据。

浏览器安全机制不允许本地网页静默读取固定绝对路径，所以每次重新打开 HTML 后都需要主动选择一次文件夹。工具只读取文件，不会修改或回写 Unity 关卡。

## 曲线口径

- 实际 V 对齐当前 Paws 运行时：任意正面积的上层 8×8 足迹重叠会覆盖；同层同 y、x±8 两侧砖同时存在会侧锁；背面砖仍计入可操作前沿。
- 河道上界(max)与河道下界(min)按 T=1、无暂存槽和 20 次确定性重启搜索。它们是经验包络，不是穷举证明的绝对上下界。
- E[V]近似来自覆盖 DAG，忽略侧锁与合法移除顺序，不能解释为真实上界或真人平均。
- MC 默认使用 300 seeds、1 个暂存槽、无道具和贪心前沿策略；MC P90/P50/P10 只绘制仍有至少 5% seeds 提供样本的进度点。
- 关卡出盘使用 Unity 正式运行时同款 128-bit XorShift 随机序列；`gameLevelOrder=1`（或 `_r1_`）按第一关规则把随机图案限制在 1–8，其余关卡使用各随机组配置的完整图案池。
- `pseudoRandomTilesMode=0` 不约束初始可操作砖；模式 1 要求同组初始可操作砖能立即成对，模式 2 要求不能立即成对。验证只按上层正面积覆盖判断初始可操作性，并按正式运行时分别最多重试 128 次；第一关固定最多重试 96 次。
- 羊 900121 只借用 258 砖、23 层、15 图案的结构，统一按 Paws 规则模拟，不使用原作七槽三消玩法。

## 开发与验证

```powershell
npm install
npm test
npm run verify:real
npm run build
npm run verify:dist
npm run verify:electron
npm run verify:electron:bundled
npm run build:win
npm run verify:win
npm run build:mac:arm64
npm run build:mac:x64
npm run package:bundled -- "E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\Editorlevel"
npm run verify:bundle -- "E:\Mahjong\PawsHomeClient\Assets\Editor\Res\Config\Gameplay\Editorlevel"
```

源码、测试和成品都位于本独立仓库；不会改动 `E:\Mahjong\PawsHomeClient`。
