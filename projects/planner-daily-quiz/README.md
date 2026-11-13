# 每日策划知识考核

静态网页版每日训练系统，入口为 `projects/planner-daily-quiz/index.html`。

## 通用策划基础题库（2026-11-13）

- 60道原创基础练习，覆盖玩法、系统、关卡、数值与概率、游戏经济、成长养成、交互反馈、数据分析、运营商业化、研发验收10类知识。
- 包含单选、多选和判断，每题提供答案与解析；不依赖特定项目、内部文档或未提供的文章。
- 题目按通用行业概念编写，不冒充公司面试原题或官方认证试题。概念参考：
  - [Unity：核心玩法循环](https://unity.com/blog/find-your-core-game-loop)
  - [Unity：游戏经济的资源产出与消耗](https://unity.com/how-to/building-game-economy-guide-part-2)
  - [Unity Analytics：活跃、留存与收入指标](https://docs.unity.com/en-us/analytics/dashboards/dashboards)
  - [Screen Australia：游戏行业术语](https://www.screenaustralia.gov.au/australian-games-industry-glossary-of-terms/?tagid=499)
- 数值题在题干中明确概率独立性、加算方式、时间窗口和分母口径，答案附计算过程。
- 姓名栏保持空白，提示为“请输入姓名或昵称”；用户自己保存的姓名仍会恢复。
- 本次题库版本为 `2026.11.13-foundations`。旧答卷保留原题、原答案和成绩；旧题库的当天记录不会锁住新题库考核，提交新答卷也不会覆盖旧版成绩。

## 当前能力

- 每天按日期从 `data/questions.json` 抽题。
- 以选择题、判断题、多选题为主。
- 倒计时提交，自动批改。
- 展示错题解析、薄弱标签和同类练习方向。
- 本地保存答题记录，同一用户在同一题库版本下每天只允许完成一次，0 点后刷新。

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
