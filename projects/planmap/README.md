# PlanMap

- `app/`：Hub 当前静态网页，继续供原有入口使用。
- `local/`：Windows/macOS 本地网页发行工具与[使用说明](local/README.md)。需要 Node.js；不是原生安装包。
- `source/`：从权威本地源码提交 `caec1ababa80e5bb0ede53800b783e32d6bb9509` 同步的 React/vinext 源码。省略私人设计/审计文档，部署项目 ID 已去除。未合入尚未接通浏览器鉴权的 hardening 分支。

本地启动：`node projects/planmap/local/server.mjs`，打开 <http://127.0.0.1:3210>。

打包：`python projects/planmap/local/package.py --output <输出目录>`。生成 `planmap-local-web.zip` 与 SHA256 校验文件，只包含公开网页和启动入口。

GitHub Actions 的 **PlanMap cross-platform** 工作流在该提交通过验证后提供可下载 artifact。PR 不合并也可以从其 Actions run 下载；没有创建公开 Release 或修改 Hub 下载清单。

开发源码：进入 `source/`，执行 `npm ci`、`npm run dev`。验证为 `npm test`、`npm run lint`、`npx tsc --noEmit`。统一 AI Worker 的生产鉴权尚未完成，不应直接作为公开模型代理部署；本地静态版本不运行它。

源码依赖保留了原提交的版本。本轮 `npm audit` 报告 30 项告警（22 high、6 moderate、2 low），依赖升级与鉴权接通仍需单独处理；测试通过不代表源码已达到安全部署条件。本地网页 ZIP 不包含这些 npm 依赖。
