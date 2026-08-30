# 循环乐工房公开版设计

**日期：** 2026-08-30  
**状态：** 已批准实施  
**公开位置：** AI Application Hub「AI 应用」集合末尾  
**项目 ID：** `loop-bgm-lab`

## 目标

把三段本地参考音乐提炼成可迁移的音乐画像，并建设一个纯浏览器、默认不上传原始音频的“循环乐工房”。用户可以导入自己的 MP3/WAV/M4A/OGG，得到节拍、调性、明亮度、动态和循环衔接画像；再生成一组有控制变量的 Suno 提示词、按当天免费额度安排批次、导入候选音乐比较差异，并把实验记录、授权台账和下一轮建议导出为 JSON 与 Markdown，在另一台电脑继续。

当前参考材料仅用于本地分析，不进入 Git 仓库、不嵌入公开页面，也不提交给第三方。公开项目附带由合成 PCM 生成的测试素材，不含用户参考音乐的波形或可还原片段。

## 已确认的参考画像

三段参考音乐指向同一产品方向：轻快、俏皮、电子合成器驱动、节拍稳定、适合作为休闲消除或闯关界面的持续背景音乐。

- 主速度区间：110–116 BPM；默认目标 112 BPM。
- 调性中心：D minor。
- 编配：明亮短促的 synth pluck、弹性低音、清脆轻量电子打击乐、小幅度循环动机。
- 结构：无长前奏、无长尾声、无大幅 breakdown；起止和声与能量相容，优先 64 小节或可裁切的整周期结构。
- 听感：欢乐、机灵、轻微顽皮，持续推进但不压过游戏反馈音。
- 排除：人声、说唱、对白、史诗管弦、预告片式起伏、情绪化慢歌、长氛围前奏、调速转调、戏剧性停顿、淡出、失真重低音、黑胶噪声。

首个默认提示词为：

```text
Instrumental upbeat casual puzzle game background music, D minor, around 112 BPM, bright melodic synth plucks, springy bass, crisp light electronic percussion, playful and cheeky motif, steady energetic groove, polished wide stereo mix, seamless 64-bar gameplay loop, no intro, no outro, ending matches the opening harmony and energy
```

默认排除词为：

```text
vocals, rap, spoken words, cinematic orchestra, epic trailer, long ambient intro, breakdown, dramatic stop, tempo changes, key changes, fade-out, distorted bass, melancholic ballad, lo-fi vinyl noise
```

## 产品边界

- 产品是本地分析、提示词编排、候选比较和实验记忆工具，不承诺生成结果与参考作品相同，也不以复制旋律、音色或编曲为目标。
- 浏览器使用 Web Audio API 解码用户主动选择的文件；原始音频不离开本机，不写入 `localStorage`、导出文件、日志或 Git。
- 文件名只在当前会话界面显示；导出记录默认保存用户可编辑的显示名、音频哈希和数值画像，不保存绝对路径。
- Suno 默认采用人工确认式适配器：复制提示词并打开官方 Create 页面。工具不代替用户登录、不保存 Cookie/Token、不绕过验证码、不读取真实余额、不自动点击生成或下载。
- 页面显示的是“计划额度”，不是账户余额。默认按 2026-08-30 可公开核验的 50 每日免费 credits、每批计划 10 credits、共 5 批编排，并提供“规则可能变化”的日期标识与官方链接。
- 免费档生成物按当前规则标记为个人非商业使用并提醒署名；商业游戏素材必须由用户在有相应商业权利的订阅期间生成，并自行确认具体授权与版权状态。
- 外部音效站只生成搜索链接，不抓取、不批量下载。商业使用筛选默认只把 CC0 标记为低摩擦；CC-BY 要求署名，NC 明确排除。
- 相似度仅作创作风险提示，不是侵权判断或法律保证。

## 核心工作流

### 1. 导入并分析参考音乐

用户可一次选择多段音频。每段文件在浏览器内解码成 PCM，然后计算：

- 时长、采样率、声道数、峰值、RMS。
- 70–160 BPM 范围内的速度与置信度。
- 12 维 chroma、大小调和调性置信度。
- 频谱质心与归一化明亮度。
- 起止窗口的包络、chroma、质心和边界差异，形成 0–1 循环衔接分数。
- SHA-256 文件哈希，用于在实验记录中稳定识别同一文件，不用于重建内容。

分析器对时长短于 8 秒、低采样率、近静音、声道相消、速度低置信度和无法可靠判断调性给出中文警告。单个文件失败不阻断其他文件。

### 2. 聚合风格画像

对成功分析的参考文件使用置信度加权中位数聚合速度、明亮度、动态和循环分数；调性使用加权投票。用户可以覆盖自动结果。聚合输出采用稳定的 `StyleSpec`：

```json
{
  "version": 1,
  "intent": "casual-puzzle-level-bgm",
  "tempo": { "target": 112, "min": 110, "max": 116 },
  "key": "D minor",
  "mood": ["upbeat", "playful", "cheeky"],
  "instruments": ["bright synth plucks", "springy bass", "light electronic percussion"],
  "structure": { "bars": 64, "loopable": true, "intro": "none", "outro": "none" },
  "mix": ["polished", "wide stereo", "gameplay-safe"],
  "exclusions": ["vocals", "fade-out", "tempo changes", "key changes"]
}
```

序列化时对象键、数组顺序和数字精度固定，保证同一画像在不同电脑生成相同提示词和摘要哈希。

### 3. 生成控制变量提示词队列

每次建立 5 个 10-credit 计划批次。第 1 批为基线；第 2–5 批分别只改变一个变量组，避免一次改变太多导致无法归因：

1. 基线：明亮 synth pluck、弹性低音、轻量鼓组。
2. 旋律音色：改为 toy mallet 与短促 marimba-like synth，其他字段不变。
3. 律动：加入轻微 syncopation 与更克制的四拍推进，其他字段不变。
4. 打击乐：改为木质 click、soft clap 和细小 shaker，其他字段不变。
5. 循环结构：改为更短的 32 小节 A/B 循环并加强尾首和声衔接，其他字段不变。

每条记录包含稳定 ID、`changedAxis`、完整 prompt、exclude prompt、预期差异、计划 credits、状态、生成链接、候选哈希、主观评分和下一轮备注。状态只允许 `planned`、`submitted`、`downloaded`、`reviewed`、`rejected`；工具不把“打开 Suno”自动记为 `submitted`。

### 4. Suno 与外部素材入口

“复制提示词”写入剪贴板；“打开 Suno Create”使用用户手势打开 `https://suno.com/create`。页面不拼接原始音频、不携带身份参数。每批由用户显式标记状态，工具只保存本地进度。

外部素材区提供带当前关键词的 Pixabay Music、OpenGameArt 与 Freesound 搜索入口。每个入口旁显示授权核验清单：来源 URL、作者、原始许可证、是否需署名、允许的用途、下载日期和文件哈希。

未来若接入 Suno 官方 API，必须由本机代理或服务端保管密钥，并在官方 API 文档、定价、额度归属与条款已明确后单独设计；静态页面不得保存 API key。

### 5. 候选比较与迭代

候选音频使用与参考相同的本地分析管线。比较视图显示速度差、调性关系、明亮度差、动态差、循环分数差和综合相似度，并允许 A/B 播放。综合分数只使用可解释的数值特征：

- 速度 25%。
- 调性关系 20%。
- 明亮度 15%。
- 动态 10%。
- 循环兼容 20%。
- 时长/结构 10%。

有效特征覆盖率不足 0.70 时只显示“证据不足”。覆盖率至少 0.70、综合相似度至少 0.86，且速度、调性、明亮度三个核心特征同时接近时，结果标记为“过近风险，建议换动机或编配”；0.75–0.86 标记“人工复核”；低于 0.75 标记“差异充分”。阈值是保守的创作工作流提示，不代替听审、版权检索或法律意见。

候选复盘按问题维度生成下一轮建议，例如速度偏快、循环端点突变、低频过重、明亮度不足、动态起伏过大或结构存在淡出。每轮只建议调整一个变量组。

### 6. 可迁移项目记忆

JSON 导出是机器可恢复的完整项目状态，Markdown 导出是给人和 Codex 阅读的交接卡。两者包含：

- schema 版本、工具版本、规则核验日期。
- 风格画像和 5 个提示词批次。
- 每个参考/候选的非可逆哈希和数值特征。
- 生成来源、链接、授权台账、主观评价、接受/拒绝理由。
- 当前最佳候选、尚存问题和下一轮单变量建议。

两种导出都排除原始音频、绝对本机路径、Cookie、Token、API key、恢复密钥和浏览器会话。导入前先完整校验，失败时不覆盖当前状态；未知字段被保留在 `extensions` 中，便于未来升级。

## 技术结构

- `projects/loop-bgm-lab/index.html`：语义结构、统一返回主页按钮、文件导入、画像、批次、比较、授权与导出区域。
- `projects/loop-bgm-lab/styles.css`：明亮游戏化界面、响应式布局、状态与可访问性样式。
- `projects/loop-bgm-lab/app.js`：浏览器协调器、Web Audio 解码、对象 URL 生命周期、剪贴板、文件下载和本地状态。
- `projects/loop-bgm-lab/core/audio-analysis.mjs`：PCM 校验、STFT、速度、chroma、调性、频谱和循环评分。
- `projects/loop-bgm-lab/core/project-state.mjs`：schema、批次状态、授权台账、稳定序列化、JSON/Markdown 导入导出。
- `projects/loop-bgm-lab/core/prompt-engine.mjs`：`StyleSpec` 标准化、基线与四个单变量变体。
- `projects/loop-bgm-lab/core/candidate-score.mjs`：特征覆盖率、相似度、风险门和下一轮建议。
- `projects/loop-bgm-lab/video/`：统一播放器、H.264 教程、单行中文字幕与封面。
- `assets/hub-showcase/loop-bgm-lab.webp` 与 `hub-project-media.js`：真实页面展示图。
- `app-20260706-restore-games.js`：注册 `status: "assistant"` 卡片，只显示“演示 / 视频”。

## 视觉与可访问性

- 视觉语言采用奶油黄、草绿、珊瑚橙和深墨色，像轻松益智游戏的关卡准备桌；不用模仿任何现有游戏的商标、角色或界面。
- 桌面两栏呈现“分析台”和“今日批次”，移动端按工作流单栏排列；核心操作在 390×844 和 360×800 下无横向溢出。
- 速度、调性和循环分数同时用文字与图形表达，不仅依赖颜色。
- 文件选择、批次状态、错误、复制结果和分析进度通过可访问的 live region 告知。
- 遵循 `prefers-reduced-motion`；音频只在用户点击后播放，切换候选前停止上一段。

## 错误、性能与隐私

- 单文件最大 80 MB；默认最多同时分析 8 个文件，逐个解码并及时释放中间引用。
- STFT 采用 2048 点 Hann 窗与 512 hop；长音频可等距抽样分析，总帧数设上限，避免阻塞浏览器。
- 不支持或损坏的文件给出文件级错误；其余文件继续。
- `localStorage` 不可用时保持当前会话并提示导出 JSON；只读写 `loop-bgm-lab-v1` 命名空间。
- 对象 URL 在替换文件、删除记录和卸载页面时释放。
- 所有外链使用 `noopener,noreferrer`；导入文本作为数据渲染，不使用 `innerHTML` 注入用户内容。

## 测试与发布

- Node 单元测试使用合成正弦、节拍脉冲、静音、立体声相消和已知首尾窗口，验证数值容差、警告、稳定序列化、单变量提示词、额度编排、导入拒绝和相似度门。
- 页面契约测试验证标题、统一子页壳、隐私文案、官方 Suno 链接、规则日期、无 API key/Cookie 字段和无空下载按钮。
- Playwright 在 1440×900、1024×768、390×844、360×800 验证导入合成 WAV、分析、生成 5 批、复制、打开外链、候选比较、状态保存、JSON/Markdown 导出导入、授权台账和无横向溢出。
- 教程视频为 H.264、1280×720、45–90 秒、无受版权保护音频，字幕任一时刻只显示一行。
- 发布前运行项目聚焦测试、Hub 契约、全量 `node --test`、`npm run audit:hub`、入口页与视频页浏览器冒烟；PR 合并后等待精确 SHA 的 Pages 与校验工作流成功，再验证公网卡片、演示、视频和 MP4 Range。

## 明确不做

- 不上传、公开、提交或嵌入三段用户参考音乐。
- 不复刻可识别旋律，不声称“无版权风险”，不把相似度分数当法律结论。
- 不自动登录 Suno，不读取或导出会话，不绕过 CAPTCHA，不调用未公开 Studio 接口，不通过多账号规避额度。
- 不承诺每天一定消耗完真实额度；只提供可核验的本地计划、状态与提醒。
- 不在纯静态前端保存第三方 API key。
- 不抓取或重新分发音效站文件，不把未知/NC 授权默认标为商业可用。
- 不创建 Windows/macOS 空下载按钮，不删除、重排或重命名现有 Hub 项目。
