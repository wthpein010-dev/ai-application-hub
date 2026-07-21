# Paws 参考关卡删除与固定 7×8 棋盘实施计划

> 依据：`docs/superpowers/specs/2026-07-21-paws-reference-deletion-fixed-board-design.md`

## 任务 1：锁定本地来源与删除 API 契约

1. 在 `tests/paws-level-editor-static-api.test.mjs` 增加本地记录来源、历史记录来源推断、AI 学习资格与事务删除的失败测试。
2. 运行定向测试，确认来源元数据和 `deleteLevel()` 尚未实现导致测试失败。
3. 在 `projects/paws-level-editor/static-api-client.mjs` 为保存记录增加 `import`、`manual`、`ai` 来源，目录摘要暴露 `source` 与 `aiReferenceEligible`。
4. 实现只删除非内置本地记录的事务 `deleteLevel(fileName)`，删除或清单写回失败时恢复记录与清单快照。
5. 重新运行定向测试，确认新旧浏览器记录均兼容且删除错误码稳定。

## 任务 2：固定 AI 生成棋盘为 7×8

1. 在 `tests/paws-level-editor-ai-generator.test.mjs` 先增加 3 难度 × 3 布局、坐标边界、元数据、确定性和 `200 张 / 15 层 / 60 分` 基线断言。
2. 运行生成器测试，确认当前动态棋盘实现不满足 7×8 契约。
3. 在 `projects/paws-level-editor/core/ai-level-generator.mjs` 定义固定棋盘常量，移除按参考统计或层数放大棋盘的逻辑。
4. 必要时只调整 7×8 内的候选锚点与放置策略；不能扩大棋盘或输出越界砖块。
5. 运行生成器测试，确保全部组合可解、数量准确、重叠受控且种子行为不回退。

## 任务 3：让浏览器关卡参与实时 AI 学习

1. 在控制器契约测试中增加“全部关卡”使用最新目录资格、每次重新加载参考文档、导入/普通/AI 保存来源正确的失败断言。
2. 修改 `projects/paws-level-editor/ui/workbench-controller.mjs`，导入保存标记为 `import`，AI 生成保存标记为 `ai`，普通保存与另存标记或保留为 `manual`。
3. 将 `loadAiReferenceDocuments()` 改为每次读取最新目录中 `aiReferenceEligible` 的条目并重新解析，不跨生成缓存统计。
4. 保持“当前关卡”模式可显式参考当前 AI 关卡。
5. 运行控制器和生成器定向测试，确认删除参考后下一次生成的参考集合立即缩小。

## 任务 4：实现桌面端删除交互

1. 在 `tests/paws-level-editor-ui-contract.test.mjs` 和浏览器 smoke 中先增加删除按钮、启用规则、确认文案、默认关回退与移动端只读断言。
2. 在 `projects/paws-level-editor/index.html` 和 `styles.css` 增加与现有关卡库操作区一致的“删除本地”入口和响应式样式。
3. 在控制器中保留当前文档的 `bundled`、`local`、`source` 元数据，仅对已保存的非内置本地关卡启用删除。
4. 删除前提示“删除后无法撤销，AI 下次生成将不再学习这关”；成功后清理编辑/试玩状态、刷新目录并打开默认关卡。
5. 成功提示包含被删文件名与当前 AI 学习参考数量；后续刷新/打开失败时报告真实错误，不回滚已完成的删除。
6. 保持移动端只读模式不显示删除入口。

## 任务 5：完整回归与视觉证明

1. 运行全部 Paws Node 测试、全部相关 `.mjs` 的 `node --check`、`git diff --check`。
2. 运行本地桌面浏览器 smoke：导入关卡、确认参与学习、删除、刷新后不恢复、再次生成参考数减少、AI 关卡不进入“全部关卡”学习集。
3. 验证 3 难度 × 3 布局和 `200 张 / 15 层 / 60 分` 均为 7×8、坐标不越界、可解。
4. 运行 390px 移动端只读 smoke，确认无删除入口、无横向溢出、无控制台/HTTP/页面/请求错误。
5. 重录包含新入口和新 AI 行为的教程视频，完成媒体解码、字幕、章节、源码哈希与画面差异门禁。

## 任务 6：提交、发布与线上验收

1. 检查工作树范围和远端写权限，提交实现与证明资源。
2. 获取并整合最新 `origin/main`，运行新鲜回归后推送到权威远端 `main`。
3. 等待 GitHub Pages 部署完成，核对远端提交 SHA 与部署来源一致。
4. 验收公网主入口、编辑器入口、关卡索引、默认关、PNG、教程视频完整请求与 Range 请求。
5. 在公网桌面浏览器复测导入、学习、删除、固定 7×8 AI 生成与试玩；在公网移动端复测只读布局和视频真实播放。
6. 更新 `AI-Application-Hub.md` 与 `麻将竞品.md` 的已确认发布状态，不写入口令或凭据。
