# 循环乐工房：Suno 官方 API 准备度设计

**日期：** 2026-09-01  
**状态：** 已批准实施（用户要求持续执行，不逐项确认）  
**现有产品：** `projects/loop-bgm-lab/`

## 背景

循环乐工房当前采用人工 Suno 适配器：复制提示词并打开 `https://suno.com/create`。Suno 已公开 `https://platform.suno.com/` REST API 平台入口，但匿名访问 `/docs`、`/api-docs` 与 `/openapi.json` 都重定向到登录页。公开官方材料尚不能证明 API 鉴权方式、价格或免费试用、消费者每日 50 credits 是否与 API 互通、生成/状态/下载端点、CORS 或速率限制。

因此，工具不能猜测端点、读取浏览器会话、创建密钥、发起未知费用请求，或把消费者免费额度宣传成 API 免费额度。另一方面，等待文档期间仍可以把安全门禁、运行状态和用户界面准备好，使未来接入从“重新设计”缩小为“填入已核验契约并重新审查”。

## 目标

1. 在页面内清楚显示 Suno 官方 API 的六项准备度及当前阻塞原因。
2. 新增纯函数策略模块：只有官方来源证据全部成立、固定官方 origin、费用明确为零时，才允许形成一个“可执行计划”；默认状态必须拒绝。
3. 新增不含秘密的 API 运行状态机，为未来异步生成、轮询、下载和取消建立稳定语义。
4. 保留现有人工复制/打开流程，且打开页面仍不得自动标记批次已提交。
5. 更新 2026-09-03 起生效的消费者下载限制提醒，并链接 Suno 官方说明。
6. 保持静态页面零密钥、零 Suno 网络请求、零 Cookie/Token 持久化。

## 明确不做

- 不实现或猜测 create/status/download HTTP 端点、请求字段或响应映射。
- 不新增 API key、Token、Cookie、密码或账号输入框。
- 不调用隐藏 Studio API，不复用浏览器会话，不抓取登录后文档。
- 不放宽 CSP 为任意 `https:`，不把 `platform.suno.com` 加入 `connect-src`，因为本阶段不会发送请求。
- 不把未知费用、消费者 50 credits 或网页登录状态解释成 API 免费许可。
- 不改动项目导出 schema，不把暂态 API 数据写入 `localStorage`、JSON、Markdown 或 URL。
- 不以该骨架宣称“一键生成已经可用”。

## 方案比较

### A. 只等待官方文档

风险最低，但产品状态没有变化，另一台电脑也无法快速理解缺少哪些证据。

### B. 静态页直接接收 API key

操作路径短，但违反现有“静态页不保存或请求第三方密钥”的设计，并在端点、CORS、价格未知时引入秘密泄露和付费风险。

### C. 协议中立的准备度与运行状态骨架（采用）

只实现可验证的安全策略、状态语义和 UI 门禁，不传输数据。未来文档公开后，必须另行审查本机代理或服务端密钥保管方案，再启用实际 transport。该方案增加真实可复用能力，同时不会伪造当前可用性。

## 架构

### `core/suno-official-adapter.mjs`

提供纯函数和不可变常量，不导入 DOM，不读取存储，不调用 `fetch`：

- `OFFICIAL_PLATFORM_ORIGIN = "https://platform.suno.com"`。
- `CURRENT_OFFICIAL_API_EVIDENCE`：记录六项证据、核验日期和官方来源 URL；当前六项均为未证实。
- `evaluateOfficialApiReadiness(evidence)`：严格校验证据结构，返回 `{ ready, confirmedCount, totalCount, blockers, verifiedAt, sources }`。
- `authorizeOfficialApiAttempt(input)`：只返回策略决定，不创建网络请求。必须同时满足：准备度为 true、origin 精确等于官方 origin、费用类型为 `free` 且最大金额为 `0`、契约版本和端点来源已由官方文档证实。任何未知、付费、非官方 origin 或缺失字段都返回 `{ allowed: false, blockers }`。
- 返回值不得包含密钥、Authorization header、Cookie、浏览器会话或用户音频。

证据键固定为：

1. `publicDocsReadable`
2. `authenticationDocumented`
3. `apiPricingDocumented`
4. `consumerCreditsInteroperable`
5. `generationContractDocumented`
6. `corsAndRateLimitsDocumented`

### `core/api-run-state.mjs`

提供不含秘密、与 transport 无关的运行状态：

- 状态：`queued | generating | ready | downloading | downloaded | failed | cancelled`。
- 合法主路径：`queued → generating → ready → downloading → downloaded`。
- `queued`、`generating`、`ready`、`downloading` 可进入 `failed` 或 `cancelled`；终态不可恢复或倒退。
- `createApiRun(input)` 创建深拷贝记录，只允许 batch ID、公开 job ID、尝试次数、下一轮询时间、公开生成 URL、下载 SHA-256、错误码和时间戳等显式字段。
- `transitionApiRun(run, nextStatus, patch)` 使用字段白名单和转换表，拒绝密钥、header、Cookie、Token、本机路径、blob/file URL 和原始音频。
- `scheduleNextPoll(run, { now, retryAfterMs })` 采用有上限的指数退避并优先尊重合法 `Retry-After`；不执行计时器或网络请求。

该状态机本阶段只由单元测试证明契约，不进入持久项目 schema。未来 transport 接入时，必须先决定哪些无秘密证据值得持久化。

## 页面与交互

在现有“今日批次”区域内新增“官方 API 准备度”卡片，不增加主工作流 section 数量：

- 状态显示“0/6 项已证实，官方 API 自动生成未启用”。
- 六项逐条显示“未证实”及简短原因。
- 主按钮为禁用状态，文案“官方 API 尚不可用”。
- 提供 `https://platform.suno.com/` 官方平台链接和核验日期 `2026-09-01`。
- 保留“复制提示词”和“打开 Suno Create”作为当前可用路径。
- 页面不得出现 API key 输入框，也不得通过脚本创建此类字段。

消费者规则提醒增加：Suno 官方已公告自 2026-09-03 起调整下载次数；页面只转述官方消费者产品限制并明确“这不是 API 下载契约”。规则随时可能变化，使用时仍需打开官方页面复核。

## 安全与隐私不变量

- CSP 保持 `connect-src 'self'`；生产代码没有 Suno `fetch`、XHR、WebSocket 或 EventSource。
- `localStorage` 仍只保存经 `project-state.mjs` 验证的 `loop-bgm-lab-v1` 项目状态。
- JSON/Markdown 导出继续拒绝 `apiKey`、Token、Cookie、Authorization、secret URL 参数和本机路径。
- 任何未来启用实际请求的变更必须：读取当时官方文档、单独设计密钥托管、做费用动作时确认、更新 CSP 为精确官方 origin，并补真实契约测试。

## 测试

### Node 策略测试

- 当前证据严格得到 `ready: false`、`0/6` 和六个阻塞项。
- 缺一项证据、价格未知、非零费用、非官方 origin、未证实契约都拒绝。
- 只有六项证据全部证实、官方 origin、明确零费用和官方契约版本同时存在时才允许策略计划。
- 运行状态只允许指定转换，终态不可变；退避有界并正确处理合法/非法 `Retry-After`。
- 任意秘密字段、用户音频、绝对路径或本地 URL 在状态 patch 中被拒绝。

### 页面与浏览器测试

- 准备度卡显示 0/6、禁用按钮、平台链接和核验日期。
- 人工 Suno 按钮继续工作且不改变 submitted 状态。
- CSP 仍为 `connect-src 'self'`；页面和脚本没有密码/API key 输入框或 Suno 网络请求。
- 重载、JSON/Markdown 导出后都不出现 API key、Token、Cookie、Authorization、准备度暂态或本机路径。
- 1440×900、1024×768、390×844、360×800 无横向溢出，键盘焦点和减少动态效果保持可用。

## 发布边界

本次发布只能声称“官方 API 接入门禁和状态契约已准备，实际调用未启用”。实际 Suno 生成、下载和免费额度消耗仍必须由可控的官方消费者网页，或未来经官方文档证明且费用明确的 API transport 完成。
