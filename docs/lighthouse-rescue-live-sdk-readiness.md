# 《灯塔救援队》正式直播接入记录

核对日期：2026-10-04。1.4.13 Windows 与 WebGL 包只使用本地模拟事件；本记录不表示已连接抖音直播间。

## 已核对的环境与缺口

| 项目 | 当前证据 | 结论 |
| --- | --- | --- |
| Unity | `build/lighthouse-rescue-unity/ProjectSettings/ProjectVersion.txt` 为 2022.3.62f3c1；官方要求 Unity 2020 及以上 LTS | 引擎版本符合文档要求 |
| BGDT | 官方安装页当前给出 3.0.271；已从该页链接下载并检查 279,959 字节的安装包，SHA-256 `21D568AC3C6B1306F21F060FB036FD76913E6839312819D3C794637131F021B7`。2026-10-04 已通过 Unity 2022.3.62f3c1 批处理导入本地工程，编辑器脚本编译通过、退出码 0 | 本机已具备 BGDT 编辑器插件；插件包仅保留本地，不提交公开仓库 |
| LiveOpenSDK | 项目没有 `Packages/com.bytedance.liveopensdk`；官方说明通过 BGDT 的 `cp` 渠道按企业和权限安装 | SDK 不可编译或联调；现有 `DouyinEventSource` 必须保持不可用 |
| 真实直播权限 | 没有经当前任务验证的玩法 AppId、直播间、调试成员和直播伴侣 Token | 不能声称真实连接、ACK 或平台审核完成 |

> 任何账号凭据、Token 和直播间身份都不要写入仓库、日志或长期记忆。

源码中的 `LivePushTranslator` 已把官方 `live_comment`、`live_like`、`live_gift` 消息转换为现有规则事件，并拒绝缺少稳定用户身份、缺少消息 ID、时间早于当前阶段或明显来自未来的消息。它会用消息类型和消息 ID 组成局内去重键；不相关评论不进入规则。`LiveMessageInbox` 进一步提供有界队列：SDK 回调线程只投递消息副本，Unity 主线程按当前房间、本局和阶段时间批量处理；上一局消息、旧阶段消息及规则拒绝会得到不同处理结果，供之后的 ACK 和诊断使用。队列满时 `Post` 返回 `false`，正式适配器必须据此停推或报警，不能静默丢弃。

转换层也限制外部元数据长度：消息 ID、稳定用户 ID 和房间 ID 各最多 512 字符，本局 ID 最多 128 字符；超限事件拒绝。评论超过 64 字符不作指令处理；展示昵称超过 128 字符时置空，保留本来有效的玩法事件，界面用“观众”作回退称呼。这避免超长昵称把已生效事件挤出 16 KiB 持久日志上限。正式 SDK 接入时需核对真实字段长度与这些边界是否相容。

1.4.11 在 SDK 回调进入 `LiveMessageInbox` 时先做内存边界检查：消息 ID、稳定用户 ID、来源房间 ID 最多 512 字符，消息类型最多 64 字符，评论原文最多 1024 字符；超过这些边界返回 `Rejected`，不入队。昵称超过 128 字符时，队列仅保留空昵称，有效互动继续处理。普通长评论若不超过 1024 字符可入队，但超过 64 字符时只会作为无关评论忽略。适配器必须区分 `Rejected` 与 `Full`，不能把无效负载当成队列过载或履约成功。

`LiveMessageInbox` 已接入 `RescueController` 的主线程更新：只有实现 `ILiveMessageSource`、提供已验证房间 ID 且状态为已连接的适配器可调用 `AttachLiveSource`。接入后，SDK 回调只能向有界队列投递消息副本；控制器每帧最多处理 64 条，在规则结算和画面反馈后交还包含原始消息 ID、类型与处理结果的回执。换局会重新绑定队列，同房间检查点可选择恢复；阶段旧消息和上一局消息不能转入新阶段/新局。直播模式关闭本地模拟观众按钮与倍速；断线后拒绝新投递，已入队消息在每帧预算内处理完，期间冻结倒计时，然后暂停，且断线时不能开局或恢复。`TryPost` 区分已入队、无效或未绑定、队列已满；控制器若发现队列已满，会在 Unity 主线程停机、停止消息源、抑制待处理回执并尽可能恢复持久状态。普通断线不触发过载停机。未来适配器仍必须处理回调 `false` 和 `HandleReceipt`；回执本身不等于官方履约 ACK。

这些是**SDK 无关的源码接线**，已进入 1.4.11 源码和模拟版构建，但没有任何可用的官方直播适配器。工程仍没有获授权的 `LiveOpenSDK`，`DouyinEventSource` 仍保持不可用；也没有官方回调、真实房间或 ACK 实测。安装 SDK 后仍须核对真实字段、点赞计数、队列溢出和 ACK 语义，再构建并验收直播版。画面与消息读取使用不含历史集合的轻量快照；阶段内生效事件在反馈及未来履约 ACK 前追加可校验日志，阶段边界继续写完整检查点。恢复会从检查点重放日志；若持久化失败或弹幕入队过载，当前本局进入不可在本进程重连的 `Faulted` 状态，停止输入与回执，尽可能回退到最后可读状态。正式高流量压力验证仍待真实直播间。WebGL 的 IndexedDB 同步为异步，不能作为正式直播消息履约保证。

1.4.8 进一步约束主播重置和恢复提示里的重新开局：直播断线或恢复提示未处理时不能由其他主播操作换局；恢复提示在断线期间不能选择。新局检查点若写入失败，控制器进入存储故障停机并尝试恢复旧局，包括结算态的已落盘检查点，不把未落盘的新局当作可继续履约的状态。普通启动仍不会把已结束的局作为待恢复对局。该行为已用故障注入和 Unity EditMode 验证，仍待真实 SDK 联调。

1.4.9 进一步覆盖了回执处理器抛异常的情况：控制器在当前帧停机、停止消息源，抑制队列中后续消息，并尽可能回到已落盘状态；界面显示“回执故障”。已落盘的有效事件仍保留，不能把这次失败当作官方履约 ACK 成功。此保护已进入 1.4.9 模拟包；新局规则配置也已冻结在完整检查点中，恢复与日志重放使用原局参数，旧存档沿用默认规则。真实 SDK 回执行为仍待联调。

1.4.12 进一步覆盖主线程 `LiveMessageInbox.Drain` 中预期之外的异常：控制器在同一帧停机，停止消息源，抑制排队中的后续回执，尽可能回退到已落盘状态，并显示“处理故障”。故障注入测试先红后绿，完整 Unity EditMode 128/128 通过。此保护不代表官方 SDK 或履约 ACK 已验证。

1.4.13 把适配器回执延迟到 `WaitForEndOfFrame`：规则处理、持久化与 UI 更新后，完成画面帧才逐条交付，待呈现队列上限为 256。故障、过载、重置和换局清除未呈现回执；普通断线前已处理的消息仍可交付适配器。此处的 `HandleReceipt` 仍不是官方 `ReportAck`；真实房间的画面可见性、ACK 成功与失败重试必须待获授权 SDK 联调。公开版画面增加第一人称近景浪花、增强探照灯和阵风音效，仍属本地模拟。

## 接入顺序

1. 本机已按[官方 BGDT 安装页](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/rd-to-SCgame/BGDT-handbook/install)导入 3.0.271。取得直播玩法权限后，在 BGDT 的 `cp` 渠道安装获授权的 `LiveOpenSDK`；确认工程出现 `Packages/com.bytedance.liveopensdk`，记录实际 SDK 版本。不要修改 SDK 包内代码，也不要把 SDK 或 BGDT 二进制提交到公开仓库。
2. 按[官方 Unity SDK 接入说明](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/unity-sdk-access)使用 `ByteDance.LiveOpenSdk.Api`；先在包自带的 `SampleGameScene` 验证初始化、直播间信息和直推消息。样例代码若需修改，复制到工程自己的目录，不在包内修改。
3. Windows 专用适配器实现 `ILiveMessageSource`，SDK 类型只留在 Windows 专用程序集。按官方顺序初始化 SDK、等待 `WaitForRoomInfoAsync()`、订阅 `OnConnectionStateChanged` 和 `OnMessage`，启动 `live_comment`、`live_like`、`live_gift` 的 `SinglePush` 任务。只有确认真实房间、权限和稳定事件 ID 并将状态标记为已连接后，才调用 `RescueController.AttachLiveSource`。停止对局时停止推送任务并取消订阅，退出时反初始化。WebGL 构建不能含 SDK 依赖。
4. 适配器必须从 SDK 消息读取稳定 `MsgId`、`MsgType` 和毫秒 `Timestamp`，以真实房间 ID 和本局 ID 构造事件。评论映射“上船／左／右／修理／照明”，点赞按官方增量语义规范化，礼物只触发外观。用户去重字段须从实际 SDK 消息验证为稳定身份；昵称只供展示，不能作为一人一票或冷却键。缺字段或语义未验证时禁用直播模式。
5. SDK 回调把已核对字段复制为 `LivePushEnvelope`，连同真实房间 ID 和接收时间传给 `ILiveMessageSource.Start` 收到的投递函数；函数返回 `false` 时由适配器告警或背压，不能静默丢弃。控制器已负责主线程 `Drain`、换局绑定和阶段时间边界；重连后必须由主播明确恢复倒计时。同房间检查点恢复需在真实直播版验证。不要让 SDK 直推与 HTTPS 双推各自累加同一事件。
6. 按[官方履约 ACK 文档](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/live-unity-sdk-support/ack-ability)在消息完成游戏内处理和表现后，以原始 `MsgId`、`MsgType` 上报一次 `ReportAck`。SDK 自己负责接收确认；游戏侧的履约 ACK 与接收确认是两件事。具体失败重试和重复消息的 ACK 策略必须以已安装 SDK 版本及真实联调结果验证。

## 正式直播验收门槛

- 在获授权的真实测试直播间分别送出评论、点赞、礼物；核对 `MsgId`、稳定用户身份、点赞计数、事件时间、房间 ID 与实际展示，不把文档示例当作实测。
- 完成短路和长路各一局；覆盖零礼物通关、相同事件重放、跨局迟到消息、断线重连、异常退出恢复和 ACK 监控。
- 直播版 Windows 包实跑一局并核对 SDK 状态、主播采集画面和性能；WebGL 仍以模拟模式独立构建与验收。审核通过前继续标注“本地演示”，不显示“直播已连接”。

官方依据：[SDK 概览](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/overview)、[指令直推能力](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/live-unity-sdk-support/direct-push-ability)、[履约 ACK](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/live-unity-sdk-support/ack-ability)。
