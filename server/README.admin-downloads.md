# 管理员下载接口的部署适配契约

当前只有本地可测试接口与前端，没有监听公网的服务、身份提供方或私有存储配置。`createAdminDownloadApi()` 默认所有请求返回 503；前端 `ADMIN_API_BASE` 为空。生产代码没有 mock、密码或公开包 fallback。

## 接入契约

`createAdminDownloadApi({identity, storage, allowedOrigin})` 返回 `(Request) => Promise<Response>`。部署 runtime 负责把 HTTP 请求转为标准 Request，并流式写回 Response。`allowedOrigin` 为精确 HTTPS 来源；若下载控制台同源，设置该控制台自身来源。

身份适配器：

- `getSession(request)` 返回 null 或 `{role:'superadmin',expiresAt:<毫秒时间戳>,csrfToken:<会话关联随机值>}`；从服务器验证的 Cookie/身份中读取，禁止信任前端角色。非管理员拒绝。
- `login(request)` 验证 JSON 凭据，返回 `{cookie:<Set-Cookie值>}` 或 null；部署前必须实现请求大小上限、正确密码散列/身份提供方、严格来源、登录限流、安全日志。不能使用仓库旧考核 Worker 的固定查询口令。
- `logout(request)` 撤销服务器会话，返回清 Cookie；跨实例状态和失效必须一致。
- 生产 Cookie 必须 Secure、HttpOnly；SameSite 和域名要结合实际控制台/Pages 来源验证。推荐同源受保护控制台，避免依赖跨站第三方 Cookie。

私有存储适配器：

- `list()` 返回服务端固定资源索引：`{id,projectId,name,platform,kind,architecture,version,fileName,bytes,sha256}`。id 仅允许小写字母、数字、下划线、连字符，最大 101 字符。platform 为 windows/mac/cross-platform，kind 为 native/extension/source。
- `open(id)` 根据服务端索引映射 PRIVATE 存储对象，返回 `{body:<Uint8Array或ReadableStream>,fileName}`。禁止代理公开 GitHub URL、客户端路径/URL或公开 bucket。授权只在读取前发生；Response 带 no-store 和附件下载头。
- API 未返回永久对象 URL。`GET /v1/admin/artifacts/:id/file` 每次验证当前管理员会话和索引，匿名 401、非管理员 403、不存在 404；未知异常 503 且不返回内部细节。

登录 POST 需要精确 Origin + JSON；登出 DELETE 需要 Origin + 会话 CSRF。CORS 只允许明确来源，不能通配。响应避免缓存。正式上线还需 TLS、提供方权限最小化、费用上限、日志脱敏、可撤销会话、实际私有对象匿名拒绝验证。

## 本地验证

仅运行 `node --test tests/admin-download-api.test.mjs tests/admin-download-client.test.mjs tests/admin-download-coverage.test.mjs`。

`tests/admin-download-browser-smoke.mjs` 是显式本地 fixture，依赖已有 Playwright 与浏览器；在测试中临时提供测试身份与文本文件，绝不进入生产站点。测试截图标明“本地测试，无真实鉴权，无真实安装包”。没有创建真实用户或使用真实凭据。

## 当前限制

共用 gate 接入 43 个 HTML 页面，首页动态下载控件也有标记。经协调，PlanMap 的两个展示 HTML 已接入；其应用源码、本地服务和跨平台 CI 未改。当前目录内安装包/源码下载入口有覆盖检查；工具在浏览器中生成的用户数据导出不属于安装包分发。

现有公开 Release、ZIP、分片和旧 URL 仍然公开；当前代码只控制所改页面的展示和通过新 API 的授权流。真实“所有包受限”尚需获准迁移到私有存储并调整公开旧入口，否则无法完成访问保护。

Mac 资源标签保持“Mac 运行待验证”。本机 Windows 上的接口/浏览器测试只验证权限 UI，不验证 Mac 应用能启动。上线须按对应版本、摘要、架构补做构建、macOS 自动运行及用户实机验收。
