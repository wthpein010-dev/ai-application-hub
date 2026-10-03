# 《灯塔救援队》高弹幕量画面快照规格

状态：用户已授权持续优化并发布完整版；2026-10-04 现场检查 1.4.3 源码后确定此性能缺口。

## 目标

规则和存档仍保留完整的事件去重、上船观众、投票观众与冷却历史。每帧画面刷新、消息入队后的规则判定不再复制这些持续增长的集合，使观众数量增长时，单帧快照成本保持稳定。

## 边界

- `RescueGame.Snapshot()` 保持完整、可恢复的现有契约；`CheckpointStore.Save` 只能接受完整快照。
- `RescueGame.ViewSnapshot()` 与 `AdvanceForView(double)` 返回相同标量状态，但不复制历史集合。轻量快照的 `RulesVersion` 为 0，不能用于持久化或恢复。
- `RescueController` 和 `LiveMessageInbox` 的每帧、每消息读取使用轻量快照；每次写入检查点仍使用完整快照。阶段、胜负、去重、回复和主播按钮语义不变。
- 不接入未经授权的抖音 SDK。公开包仍标记为本地模拟事件；正式直播需按 `docs/lighthouse-rescue-live-sdk-readiness.md` 完成真实房间联调。

## 验证

- Unity EditMode 覆盖大量上船/事件后的轻量快照、完整快照恢复、阶段推进结果一致性，以及拒绝将轻量快照写入检查点且不覆盖已有存档。
- 全量 Unity EditMode、定向 Hub Node、Windows 和 WebGL 构建通过；从新 ZIP 解压跑完一局，桌面和 390px WebGL 整局无错误。
- 发布时更新版本、视频和 Hub 下载入口，验收精确合并 SHA 的 Pages、CI、公开下载与媒体播放。
