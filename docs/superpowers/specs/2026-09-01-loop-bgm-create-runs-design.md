# 循环乐工房：Create 运行与多候选衔接设计

**日期：** 2026-09-01
**状态：** 已批准实施
**项目：** `loop-bgm-lab`

## 目标

补齐人工 Suno 工作流中最影响连续迭代的两个断点：

1. 用户点击“登记本次 Create”时立即冻结当前批次的 prompt、exclude prompt 与 StyleSpec；即使暂时不能下载，也能保存本次返回的 1–2 个 Suno 结果链接、评分、备注与处置。
2. 一次文件选择导入多首候选时，只绑定一个用户明确选择的 run；所有成功候选共享该 run 的冻结条件，单个坏文件不会阻断其他文件。

此功能仍是本地人工适配层。它不会调用 Suno API、读取账号余额、保存凭据、自动点击生成或把音频上传到第三方。

## 已选方案

### Run 输出

项目 schema 升到 version 2；StyleSpec 继续保持 version 1。`run` 用最多两个 rich `outputs` 取代旧的单一 `generatedUrl`：

```json
{
  "id": "run-1",
  "sourceUrl": "https://suno.com/create",
  "status": "submitted",
  "outputs": [
    {
      "generatedUrl": "https://suno.com/song/example-a",
      "subjectiveScore": 4,
      "reviewNote": "循环接缝尚可，主旋律略抢耳。",
      "disposition": "accepted"
    },
    {
      "generatedUrl": "https://suno.com/song/example-b",
      "subjectiveScore": null,
      "reviewNote": "",
      "disposition": "unrated"
    }
  ],
  "generationConditions": {}
}
```

约束：

- `outputs` 长度为 0–2；每个已保存输出必须有无凭据、无秘密参数的 HTTPS URL。
- 评分为 `null` 或 1–5；处置为 `unrated|accepted|rejected`；拒绝时必须填写备注。
- 链接可在没有音频、候选哈希或实验记录时独立存在。

### 候选绑定

`experiment` 新增可选的 `outputIndex`：`null` 表示未绑定链接，`0`/`1` 表示绑定同一 run 的对应 output。绑定后，实验的链接、评分、备注与处置必须与 output 一致；从候选卡或 run 输出编辑器修改时同步更新两侧，当前 batch 继续镜像当前 experiment。

绑定必须由用户在候选卡明确选择，不能按文件顺序猜测 Suno 结果对应关系。

选择 N 个候选文件时：

- 最多 8 个，按用户选择顺序逐个解码。
- 开始前要求用户明确选择已登记 run，导入本身不创建 run。
- 所有成功候选先以 `outputIndex: null` 保存；用户之后可选择该 run 的结果 1 或结果 2。
- 每个成功候选追加独立 candidate 与 experiment；最后一个成功候选成为 batch 的当前候选，`currentBestCandidate` 不自动改变。
- 单个文件失败只进入失败摘要，不撤销已经成功的文件；全部失败时 run 仍保留，因为它代表真实 Create 行为。

### 显式登记

批次卡新增“登记本次 Create”按钮：

- 每次点击都代表一次新的真实 Create，因此建立新的 `submitted` run 并冻结条件。
- 新 run 会清空该批次的当前候选/链接/复核镜像；历史 run、candidate、experiment 不变。
- “打开 Suno Create”仍只打开官方网页，不自动登记，避免把一次打开误记成已经提交。
- 旧的状态下拉不能绕过登记按钮偷偷创建 Create run；`submitted` 由显式登记动作产生。

## 兼容与迁移

- v1 导入先补齐早期缺失 runs，再迁移到 v2。
- 导入旧 run 时，把 run、同 run experiments 和当前 batch 中的唯一旧链接汇总为 outputs，并保留可匹配的评分/备注/处置；超过两个唯一链接时明确拒绝，绝不静默截断。
- 旧 experiment 若缺少 `outputIndex`，保留为未绑定；不能仅凭相同 URL 猜测绑定关系。
- localStorage 读取 v2 键优先，回退 v1 后迁移；不主动删除 v1，避免破坏回退。
- JSON/Markdown 导出新增 run outputs 和 experiment 绑定，不保存音频字节、文件名、本机路径或秘密参数。

## UI

- 批次操作区：`复制提示词`、`打开 Suno Create`、`登记本次 Create`。
- 已登记 run 下方显示 run ID、冻结状态和两个结果编辑卡；每张卡含 HTTPS 链接、1–5 分、备注、处置。
- 候选区先选批次，再从该批次历史中明确选择 run。
- 候选文件选择器改为 `multiple`，文案明确“一次最多 8 个；同一次选择共用一个 run”。
- 候选处理进度显示成功/失败数量；失败文件名只出现在当前会话提示，不进入持久化或导出。

## 安全与非目标

- 所有链接继续复用无凭据 HTTPS 校验，拒绝 URL userinfo、秘密查询参数和本机路径。
- 不增加 API transport、密钥输入、自动登录、验证码处理、付费动作或额度读取。
- 本轮不实现外部许可证 bundle、候选来源类型和 Markdown 无损导入；它们作为后续独立切片。

## 验收

- 一次登记后可仅保存 1–2 个结果链接并完成 JSON/Markdown 往返。
- 一次选择两首有效音频不新增 run、只向选中 run 追加两个 candidate 与两个 experiment，且共享冻结条件。
- 一个有效 + 一个坏文件仍保存有效候选和失败摘要。
- 旧项目 JSON 可导入；新项目中的 output/experiment 不一致会被拒绝。
- 真实浏览器测试覆盖登记、链接编辑、显式绑定、多文件、对象 URL 回收、最佳候选不自动变更和安全导出。
