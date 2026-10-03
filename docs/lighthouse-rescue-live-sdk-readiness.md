# 《灯塔救援队》正式直播接入记录

核对日期：2026-10-03。当前公开的 1.4.0 Windows 与 WebGL 包只使用本地模拟事件；本记录不表示已连接抖音直播间。

## 已核对的环境与缺口

| 项目 | 当前证据 | 结论 |
| --- | --- | --- |
| Unity | `build/lighthouse-rescue-unity/ProjectSettings/ProjectVersion.txt` 为 2022.3.62f3c1；官方要求 Unity 2020 及以上 LTS | 引擎版本符合文档要求 |
| BGDT | 官方安装页当前给出 3.0.271；已从该页链接下载并检查 279,959 字节的安装包，SHA-256 `21D568AC3C6B1306F21F060FB036FD76913E6839312819D3C794637131F021B7` | 仅确认安装渠道，尚未导入工程；包不提交仓库 |
| LiveOpenSDK | 项目没有 `Packages/com.bytedance.liveopensdk`；官方说明通过 BGDT 的 `cp` 渠道按企业和权限安装 | SDK 不可编译或联调；现有 `DouyinEventSource` 必须保持不可用 |
| 真实直播权限 | 没有经当前任务验证的玩法 AppId、直播间、调试成员和直播伴侣 Token | 不能声称真实连接、ACK 或平台审核完成 |

> 任何账号凭据、Token 和直播间身份都不要写入仓库、日志或长期记忆。

源码中的 `LivePushTranslator` 已把官方 `live_comment`、`live_like`、`live_gift` 消息转换为现有规则事件，并拒绝缺少稳定用户身份、缺少消息 ID、时间早于当前阶段或明显来自未来的消息。它会用消息类型和消息 ID 组成局内去重键；不相关评论不进入规则。此转换层经过 Unity EditMode 测试，但**没有 SDK 回调接线，也没有进入已发布的 1.4.0 可执行包**。安装 SDK 后仍须核对真实字段和点赞计数语义，再构建并验收直播版。

## 接入顺序

1. 在有直播玩法权限的开发者环境中，从[官方 BGDT 安装页](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/rd-to-SCgame/BGDT-handbook/install)安装工具；选择 `cp` 渠道并安装可授权的 `LiveOpenSDK`。确认工程出现 `Packages/com.bytedance.liveopensdk`，记录实际 SDK 版本。不要修改 SDK 包内代码。
2. 按[官方 Unity SDK 接入说明](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/unity-sdk-access)使用 `ByteDance.LiveOpenSdk.Api`；先在包自带的 `SampleGameScene` 验证初始化、直播间信息和直推消息。样例代码若需修改，复制到工程自己的目录，不在包内修改。
3. Windows 专用适配器以现有 `IEventSource`/`GameEvent` 为边界。按官方顺序初始化 SDK、等待 `WaitForRoomInfoAsync()`、订阅 `OnConnectionStateChanged` 和 `OnMessage`，启动 `live_comment`、`live_like`、`live_gift` 的 `SinglePush` 任务。停止对局时停止推送任务并取消订阅，退出时反初始化。WebGL 构建不能含 SDK 依赖。
4. 适配器必须从 SDK 消息读取稳定 `MsgId`、`MsgType` 和毫秒 `Timestamp`，以真实房间 ID 和本局 ID 构造事件。评论映射“上船／左／右／修理／照明”，点赞按官方增量语义规范化，礼物只触发外观。用户去重字段须从实际 SDK 消息验证为稳定身份；昵称只供展示，不能作为一人一票或冷却键。缺字段或语义未验证时禁用直播模式。
5. SDK 回调统一进入 Unity 主线程上的单局规则权威。收到重复、过期或上一局消息时保留结果码，不重复结算；连接断开时暂停倒计时并显示原因，重连后从本地检查点恢复。不要让 SDK 直推与 HTTPS 双推各自累加同一事件。
6. 按[官方履约 ACK 文档](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/live-unity-sdk-support/ack-ability)在消息完成游戏内处理和表现后，以原始 `MsgId`、`MsgType` 上报一次 `ReportAck`。SDK 自己负责接收确认；游戏侧的履约 ACK 与接收确认是两件事。具体失败重试和重复消息的 ACK 策略必须以已安装 SDK 版本及真实联调结果验证。

## 正式直播验收门槛

- 在获授权的真实测试直播间分别送出评论、点赞、礼物；核对 `MsgId`、稳定用户身份、点赞计数、事件时间、房间 ID 与实际展示，不把文档示例当作实测。
- 完成短路和长路各一局；覆盖零礼物通关、相同事件重放、跨局迟到消息、断线重连、异常退出恢复和 ACK 监控。
- 直播版 Windows 包实跑一局并核对 SDK 状态、主播采集画面和性能；WebGL 仍以模拟模式独立构建与验收。审核通过前继续标注“本地演示”，不显示“直播已连接”。

官方依据：[SDK 概览](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/overview)、[指令直推能力](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/live-unity-sdk-support/direct-push-ability)、[履约 ACK](https://developer.open-douyin.com/docs/resource/zh-CN/interaction/develop/unity-sdk/live-unity-sdk-support/ack-ability)。
