# Codex Workbench Pages 分片下载设计

## 背景

`CodexThreadWorkbench-Windows-x64.zip` 是 65,596,799 字节的 Windows x64 自包含包。GitHub Release 资产上传不可用，单个 65 MB Git 对象又会在当前网络链路中长时间卡住。线上现有 Release 直链返回 404，必须替换为可验证的 GitHub Pages 下载流程。

## 已批准方案

把 ZIP 按 8 MiB（8,388,608 字节）切成 8 个静态分片：

- 前 7 片各 8,388,608 字节。
- 最后一片 6,876,543 字节。
- 分片按 `part-000.bin` 至 `part-007.bin` 命名。
- 每片独立提交并逐次非强制快进推送，避免单次传输 65 MB Git 对象。

下载页位于：

`projects/codex-thread-workbench/download/`

清单位于：

`projects/codex-thread-workbench/download/manifest.json`

分片位于：

`projects/codex-thread-workbench/download/parts/`

## 清单协议

`manifest.json` 固定包含：

- `version`: `1`
- `fileName`: `CodexThreadWorkbench-Windows-x64.zip`
- `totalSize`: `65596799`
- `chunkSize`: `8388608`
- `sha256`: `1D78557926FB97F46CF7FAA068BA65BEE12C3C7EA9DC3F9235450A9AB17CF454`
- `parts`: 严格按索引递增的数组，每项包含 `index`、`path`、`size` 和 `sha256`

页面在下载前验证索引连续、路径唯一、尺寸为正、分片尺寸之和等于 `totalSize`。

## 下载与校验流程

1. 页面加载清单并显示文件名、总大小和分片数。
2. 用户点击“开始下载”。
3. 浏览器按清单顺序逐片 `fetch`，每片最多尝试 3 次。
4. 每片检查 HTTP 状态、实际长度和分片 SHA-256；失败时在页面显示原因和重试次数。
5. 所有分片完成后按顺序复制到一个 `Uint8Array`。
6. 检查合并长度为 65,596,799 字节。
7. 使用 Web Crypto 计算完整 ZIP 的 SHA-256，并与清单值比较。
8. 仅在长度和 SHA-256 都匹配后创建 Blob，并下载原名 `CodexThreadWorkbench-Windows-x64.zip`。
9. 任一步失败都不产生下载文件；页面保留“重试”按钮，从头重新执行。

## UI

下载页保持简单直接：

- 产品名称与 Windows 下载说明
- 文件大小、分片数和 SHA-256 摘要
- 主操作按钮
- 当前分片、已完成字节、百分比进度条
- 明确的“准备中 / 下载中 / 校验中 / 已完成 / 失败”状态
- 失败原因与重试按钮

Hub 卡片的 `package`、`platforms.windows` 以及介绍页的两个下载链接统一指向该下载页，不再保留任何 Release 404 链接。

## 测试

Node 测试覆盖：

- 清单字段、8 个连续分片、顺序、总长度、最终 SHA-256
- 下载严格按清单顺序执行
- HTTP 失败、长度不符或分片 SHA 不符时重试
- 达到重试上限后抛出明确错误
- 合并结果长度与完整 SHA 不符时拒绝下载
- 下载页具备进度、失败与重试 UI
- Hub 的 4 处入口全部指向 Pages 下载页，且无旧 Release 直链

线上验收覆盖：

- 8 个分片逐个返回 HTTP 200 和正确长度
- 浏览器实际拉取并重组完整 ZIP
- 重组产物长度为 65,596,799，SHA-256 为指定值
- 介绍页、`index.html#games` 和下载页正常呈现

## 发布安全

- 以每次推送前最新的 `origin/main` 为基线。
- 每个分片一个提交，并在每次推送前 fetch、验证祖先关系和远端 lease。
- 只做快进更新，不覆盖 GamePulse、QuotaBar、Paws 或其他最新主线提交。
- 不创建 GitHub Release 草稿，也不保留已知 404 下载入口。
