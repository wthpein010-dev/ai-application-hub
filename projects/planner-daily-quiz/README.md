# 每日策划知识考核

静态网页版每日训练系统，入口为 `projects/planner-daily-quiz/index.html`。

## 当前能力

- 每天按日期从 `data/questions.json` 抽题。
- 以选择题、判断题、多选题为主。
- 倒计时提交，自动批改。
- 展示错题解析、薄弱标签和同类练习方向。
- 本地保存答题记录，同一用户同一天只允许完成一次，0 点后刷新。

## 云端存储接入

GitHub Pages 是静态站点，不能安全地在前端直接写 GitHub 仓库。后续需要部署一个后端代理，将提交结果写入仓库文件、Issue、飞书表格或数据库。

前端已预留接口：

```json
{
  "submitEndpoint": "https://your-worker.example.com/submit",
  "aiFeedbackEndpoint": "https://your-worker.example.com/feedback"
}
```

配置位置：`data/config.json`。

提交数据会以 JSON POST 到 `submitEndpoint`。如果未配置，系统只进行本地保存。
