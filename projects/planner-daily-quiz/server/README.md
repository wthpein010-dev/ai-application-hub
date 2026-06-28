# GitHub 提交代理

GitHub Pages 不能直接安全写仓库，因为前端不能暴露 GitHub token。这个 Worker 用来接收网页提交，并把答题记录写入 GitHub 仓库。

## 环境变量

- `GITHUB_TOKEN`：有目标仓库 contents 写权限的 token。
- `GITHUB_OWNER`：例如 `wthpein010-dev`。
- `GITHUB_REPO`：例如 `ai-application-hub`。
- `GITHUB_BRANCH`：默认 `main`。
- `ALLOWED_ORIGIN`：例如 `https://wthpein010-dev.github.io`。

## 写入路径

每次提交会创建一个独立 JSON 文件：

`data/planner-daily-quiz/submissions/YYYY-MM-DD/<submission-id>.json`

部署后，把 Worker 地址写入：

`projects/planner-daily-quiz/data/config.json` 的 `submitEndpoint` 字段。

管理员页面会通过 GET 读取同一个 Worker：

`https://your-worker.example.com/submit?password=admin`

如果希望提交和管理分开，也可以把地址写入 `adminRecordsEndpoint`。
