using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Tests.Confirmation;

public sealed class ConfirmationDetectorTests
{
    private static readonly DateTimeOffset UpdatedAt =
        new(2026, 8, 20, 8, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("""
        已修复并重启到 v2.3.5。

        - 截图中的 13 条误报已全部排除，题库、已完成审查报告和后台子任务不会再因此触发。
        - 真正要求你确认、选择或回复的任务仍会提醒。
        - 336 项测试通过，开机自启与自动恢复已恢复。

        自动发送目前保持关闭，验收未发送真实消息。当前没有待确认项，悬浮栏已收纳到屏幕顶部。本次仅更新本机。
        """)]
    [InlineData("需要你确认的任务会自动显示，其他已完成任务不会出现。")]
    [InlineData("当需要你选择或回复的消息出现时，悬浮栏才会展开。")]
    [InlineData("已完成，无需你确认或回复。")]
    [InlineData("已完成，不再需要你确认这个方案。")]
    [InlineData("任务已完成，请勿回复确认。")]
    [InlineData("我已经替你确认这个配置，全部检查通过。")]
    [InlineData("已完成，无需你确认是否继续。")]
    [InlineData("不再需要你确认是否按这个方案执行。")]
    public void Detect_RejectsNarratedOrNegatedRequestsInCompletionReport(string text)
    {
        Assert.Null(new ConfirmationDetector().Detect(CreateState(
            text, ChatRole.Assistant, ThreadStatusKind.Completed, ThreadStatusKind.Completed)));
    }

    [Theory]
    [InlineData("需要你确认的任务会自动显示。请确认现在是否发布。")]
    [InlineData("无需你确认配置，但请提供发布地址。")]
    [InlineData("请审核需要你确认的任务，收到后我开始处理。")]
    [InlineData("你确认一下这个配置，我再开始。")]
    [InlineData("确认这个配置，我再开始。")]
    [InlineData("- 你确认一下这个配置，我再开始。")]
    [InlineData("1. 确认这个配置，我再开始。")]
    [InlineData("**你确认**这个配置，我再开始。")]
    [InlineData("接下来你确认这个配置，我再开始。")]
    [InlineData("无需你确认是否继续，但请提供发布地址。")]
    [InlineData("无需你确认配置但请提供发布地址。")]
    public void Detect_PreservesDirectRequestAlongsideNarration(string text)
    {
        Assert.NotNull(new ConfirmationDetector().Detect(CreateState(
            text, ChatRole.Assistant, ThreadStatusKind.Completed, ThreadStatusKind.Completed)));
    }

    [Theory]
    [InlineData("### Critical\nNone.\n### Verdict\n**Ready to merge? Yes.** The update is correctly scoped.")]
    [InlineData("**Ready to merge?** With fixes\n**Reasoning:** Five issues remain in the review report.")]
    [InlineData("**项目概况**\n这是休闲小游戏项目。\n\n**可以直接问的问题**\n1. 你做过哪些项目？\n2. 你会怎么设计架构？\n\n**好的主程画像**\n具备架构和质量意识。")]
    [InlineData("## 面试题\n1. 你会怎么拆模块？\n2. 请说明你的经验。")]
    [InlineData("## 常见问题\n为什么这样设计？\n答案：为了减少重复请求。")]
    [InlineData("是否发布成功？是，已完成线上验收。")]
    [InlineData("完成了。示例代码：\n```text\n请确认后回复继续。\n```")]
    [InlineData("已完成，按钮显示 `请确认`，没有待办。")]
    public void Detect_RejectsDeliveredContentAndAnsweredQuestions(string text)
    {
        Assert.Null(new ConfirmationDetector().Detect(CreateState(
            text, ChatRole.Assistant, ThreadStatusKind.Completed, ThreadStatusKind.Completed)));
    }

    [Theory]
    [InlineData("任务已经完成。")]
    [InlineData("任务已经停止。")]
    public void Detect_RejectsInterruptedStateWithoutAnActualRequest(string text)
    {
        Assert.Null(new ConfirmationDetector().Detect(CreateState(
            text, ChatRole.Assistant, ThreadStatusKind.Interrupted, ThreadStatusKind.Interrupted)));
    }

    [Theory]
    [InlineData("## 面试题\n1. 你会怎么拆模块？\n\n## 下一步\n需要我继续整理评分表吗？")]
    [InlineData("测试用例：请审核规格。\n\n请确认实际的发布方案。")]
    [InlineData("报告已完成。你希望先做 Windows 还是 macOS？")]
    [InlineData("请选择平台？\nA. Windows\nB. macOS")]
    public void Detect_PreservesActualRequestAfterDeliveredContent(string text)
    {
        Assert.NotNull(new ConfirmationDetector().Detect(CreateState(
            text, ChatRole.Assistant, ThreadStatusKind.Completed, ThreadStatusKind.Completed)));
    }

    [Theory]
    [InlineData("测试报告如下：\n全部通过。\n\n请确认是否发布。")]
    [InlineData("测试报告：\r\n全部通过。\r\n\r\n请确认是否发布。")]
    [InlineData("Test report:\nAll checks passed.\n\nPlease confirm deployment.")]
    [InlineData("测试报告如下：\n全部通过。\n## 下一步\n请确认是否发布。")]
    public void Detect_PreservesRequestAfterReportBoundary(string text)
    {
        Assert.NotNull(new ConfirmationDetector().Detect(CreateState(
            text, ChatRole.Assistant, ThreadStatusKind.Completed, ThreadStatusKind.Completed)));
    }

    [Theory]
    [InlineData("方案已经整理完毕，请确认；确认后我就开始开发。")]
    [InlineData("如果认可这个方案，请回复确认，我会进入实现。")]
    [InlineData("如果你确认这个方向，我就开始实现。")]
    [InlineData("请审阅方案；确认后我会开始编写实施计划。")]
    [InlineData("Please confirm this design and I will start implementation.")]
    public void Detect_ReturnsCandidate_ForExplicitImplementationConfirmation(
        string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.NotNull(candidate);
        Assert.Equal("thread-1", candidate.ThreadId);
        Assert.Equal("等待确认的任务", candidate.Title);
        Assert.Equal("message-1", candidate.MessageId);
        Assert.Equal(UpdatedAt, candidate.UpdatedAt);
    }

    [Theory]
    [InlineData("""
        方案 A 的完整设计规格已写入并提交：

        请审核规格；确认无误后回复“继续”，我会进入实现计划、开发、测试与发布。
        """)]
    [InlineData("这一版优先做桌面端还是移动端？")]
    [InlineData("你希望先发布 Windows 还是 macOS")]
    [InlineData("要吗？")]
    [InlineData("是否要解释这个测试？")]
    [InlineData("是否要说明如何打开预览？")]
    [InlineData("Should I optimize the desktop workflow or the mobile workflow?")]
    [InlineData("Please approve this specification.")]
    [InlineData("Choose one launch option.")]
    [InlineData("Tell me which endpoint to use.")]
    [InlineData("We need your approval before release.")]
    [InlineData("Your approval is required before release.")]
    [InlineData("We are awaiting your approval.")]
    [InlineData("Review this specification.")]
    [InlineData("Approve deployment.")]
    [InlineData("报告结果：\n是否要立即发布？")]
    public void Detect_ReturnsCandidate_WhenAssistantRequestsReviewOrAsksAnyQuestion(
        string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.NotNull(candidate);
    }

    [Theory]
    [InlineData("任务已经完成。")]
    [InlineData("我现在开始开发。")]
    [InlineData("交付已经完成，如需继续优化可以再告诉我。")]
    [InlineData("已完成发布到 GitHub main。公开演示、视频播放、字幕、Pages 部署和远端完整 CI 均已通过。")]
    [InlineData("任务已完成，不需要确认：所有校验已经通过。")]
    [InlineData("任务已完成，无需确认：所有校验已经通过。")]
    [InlineData("已按这个方案开始写入，修改和验收均已完成。")]
    [InlineData("已确认这版设计，现已完成实现、构建和新版验收。")]
    [InlineData("""
        已修复并重启 v2.0.1。
        - 补充“确认执行吗”“下一步需要确认”“下次继续时”等表达。
        - 没有自动点击或自动发送确认消息。
        """)]
    public void Detect_RejectsCompletedReply_WhenNoUserActionRemains(string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.Null(candidate);
    }

    [Theory]
    [InlineData("请确认这段文字是否准确。")]
    [InlineData("需要我继续吗？")]
    [InlineData("请选择 A 或 B，我会按你的选择继续实现。")]
    [InlineData("请提供 API 地址，收到后我继续。")]
    [InlineData("你确认这个结构后，我再进入规格和开发发布。")]
    [InlineData("确认这个结构后，我再进入规格和开发发布。")]
    [InlineData("已定位并确认无同名任务。下一步会创建任务并上传附件。确认执行吗？")]
    [InlineData("下一步首先需要确认：你要分析现有客户群，还是使用新的客服入口？")]
    [InlineData("你刚才按了 Esc，本轮已中止。下次继续时我会恢复脚本域并完成验收。")]
    [InlineData("请按提示回复：“确认执行吗？”收到后我继续。")]
    [InlineData("“确认执行吗？”")]
    [InlineData("图片已确认。建议这样写入：每张图 6 套，共 180 格。这样写入可以吗？")]
    [InlineData("按这个方案处理可行吗？")]
    [InlineData("以上安排是否合适？")]
    [InlineData("照此执行行不行？")]
    [InlineData("这样写入可以吗")]
    [InlineData("这样做行吗？")]
    [InlineData("""
        这是现有布局系统的响应式扩展，按以下方案处理：
        - 窗口任意拖拽时实时重排，不依赖固定分辨率。
        - 棋盘按可用空间等比缩放并居中，道具栏跟随棋盘，保证完整显示、不裁切。
        - 竖屏采用“棋盘＋分析滚动区＋底部播放坞”；横屏采用“棋盘左侧＋分析和操作区右侧”。
        - 曲线全屏时标题固定，图表自动铺满剩余宽高，并在尺寸变化后立即重绘。
        - 增加多种比例及连续拖拽回归测试，覆盖重叠、越界、空引用和显示完整性。
        - 音乐、音效默认关闭，用户点击声音开关后再启用。
        确认这版设计后我立即实现、构建并打开新版验收。
        """)]
    [InlineData("""
        这属于范围明确的表格文案返修，我按 bounded 方式处理。
        拟按以下口径写回：
        - 名称、获得描述：兼容新方向的黄绿内容保留，其余重写。
        - 图鉴内描述：全部重新设计。
        - 同步刷新右侧整套评分与评价。
        按这个方案开始写入吗？
        """)]
    [InlineData("Please choose A or B so I can continue.")]
    public void Detect_ReturnsCandidate_ForCompletedReplyRequestingUserAction(
        string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.NotNull(candidate);
    }

    [Theory]
    [InlineData("这部分更适合直接看效果。我可以做一个浏览器里的三套主页设计对比，用真实应用图片、不同排版和交互方式呈现，方便你直接选择。要现在打开吗？")]
    [InlineData("我可以先生成三套对比稿。要不要现在打开？")]
    [InlineData("预览环境已经准备好。是否要立即开始生成？")]
    [InlineData("预览已经准备好，要现在打开吗？")]
    [InlineData("预览已经准备好：要不要现在打开？")]
    [InlineData("预览已经准备好。要不要打开？")]
    [InlineData("测试报告已生成。要现在打开吗？")]
    [InlineData("自动化报告已经完成，要现在打开吗？")]
    [InlineData("回归报告已准备好：是否要立即打开？")]
    [InlineData("要不要现在直接打开？")]
    [InlineData("要不要现在把预览打开？")]
    [InlineData("要不要我现在就打开？")]
    [InlineData("要不要到浏览器里打开？")]
    [InlineData("报告内容已生成。要不要打开？")]
    public void Detect_ReturnsCandidate_ForImmediateActionQuestionAtMessageEnd(
        string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.NotNull(candidate);
    }

    [Theory]
    [InlineData("测试覆盖示例：‘要现在打开吗？’已写入自动化报告。")]
    [InlineData("演示文案里会显示要不要现在打开，但页面已经发布完成。")]
    [InlineData("预览已经打开，三套主页对比也已生成完成。")]
    [InlineData("测试报告如下：\n要不要现在打开？")]
    [InlineData("自动化报告示例：要现在打开吗？")]
    [InlineData("文案引用：\n“要不要现在打开？”")]
    [InlineData("测试用例：\n'是否要立即开始生成？'")]
    [InlineData("报告原文：是否要立即打开？")]
    [InlineData("以下是原始回复：要不要现在打开？")]
    [InlineData("报告内容：是否要立即打开？")]
    [InlineData("日志输出：要不要现在打开？")]
    public void Detect_RejectsReportedQuestion_WhenItIsNotAnActualRequest(
        string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.Null(candidate);
    }

    [Theory]
    [InlineData("测试用例引用：“这一版优先做桌面端还是移动端？”已覆盖。")]
    [InlineData("下载地址：https://example.test/download?platform=windows&source=report")]
    [InlineData("报告原文：‘请审核规格；确认无误后回复继续。’")]
    [InlineData("报告原文：请审核规格；确认无误后回复继续。")]
    [InlineData("https://example.test/?note=请审核规格")]
    [InlineData("测试用例：\n请审核规格；确认无误后回复继续。")]
    [InlineData("Original text: \"Should I approve this?\"")]
    [InlineData("Reply sent successfully.")]
    [InlineData("Review passed.")]
    [InlineData("Review done.")]
    [InlineData("Review results are available.")]
    [InlineData("Reply to the customer was sent.")]
    [InlineData("> 报告原文：请审核规格；确认无误后回复继续。")]
    [InlineData("- 测试用例：请审核规格；确认无误后回复继续。")]
    [InlineData("""
        报告原文：
        方案 A 的完整设计规格已写入并提交：

        请审核规格；确认无误后回复“继续”。
        """)]
    public void Detect_RejectsQuotedOrUrlQuestionMarks_WhenNoUserActionRemains(
        string text)
    {
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        var candidate = new ConfirmationDetector().Detect(state);

        Assert.Null(candidate);
    }

    [Fact]
    public void Detect_RejectsUserLastMessage()
    {
        var state = CreateState(
            "请确认，确认后开始实施。",
            ChatRole.User,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed);

        Assert.Null(new ConfirmationDetector().Detect(state));
    }

    [Fact]
    public void Detect_ReturnsCandidate_ForInterruptedTurn()
    {
        var state = CreateState(
            "执行被中断，等待继续。",
            ChatRole.Assistant,
            ThreadStatusKind.Interrupted,
            ThreadStatusKind.Interrupted);

        Assert.NotNull(new ConfirmationDetector().Detect(state));
    }

    [Theory]
    [InlineData(ThreadStatusKind.Running, ThreadStatusKind.Completed)]
    [InlineData(ThreadStatusKind.Idle, ThreadStatusKind.Running)]
    [InlineData(ThreadStatusKind.Error, ThreadStatusKind.Error)]
    public void Detect_RejectsThread_WhenConversationIsNotEnded(
        ThreadStatusKind status,
        ThreadStatusKind latestTurnStatus)
    {
        var state = CreateState(
            "请确认，确认后开始实施。",
            ChatRole.Assistant,
            status,
            latestTurnStatus);

        Assert.Null(new ConfirmationDetector().Detect(state));
    }

    [Theory]
    [InlineData(@"C:\Users\ASUS\Documents\自动化", "普通任务预览")]
    [InlineData(@"C:\work", "Automation: 每天发送一次提醒")]
    public void Detect_RejectsAutomationThreads(
        string workingDirectory,
        string preview)
    {
        var state = CreateState(
            "请确认，确认后开始实施。",
            ChatRole.Assistant,
            ThreadStatusKind.Completed,
            ThreadStatusKind.Completed,
            workingDirectory,
            preview);

        Assert.Null(new ConfirmationDetector().Detect(state));
    }

    [Fact]
    public void Detect_NormalizesAndTruncatesPreview()
    {
        var text = "请确认。\r\n\r\n确认后开始实施。 " + new string('长', 180);
        var state = CreateState(
            text,
            ChatRole.Assistant,
            ThreadStatusKind.Idle,
            ThreadStatusKind.Completed);

        var candidate = Assert.IsType<ConfirmationCandidate>(
            new ConfirmationDetector().Detect(state));

        Assert.DoesNotContain('\r', candidate.RequestPreview);
        Assert.DoesNotContain('\n', candidate.RequestPreview);
        Assert.Equal(140, candidate.RequestPreview.Length);
        Assert.EndsWith("…", candidate.RequestPreview);
    }

    private static ThreadCardState CreateState(
        string text,
        ChatRole role,
        ThreadStatusKind status,
        ThreadStatusKind latestTurnStatus,
        string workingDirectory = @"C:\work",
        string preview = "预览") =>
        new(
            new ThreadSummary(
                "thread-1",
                "等待确认的任务",
                preview,
                workingDirectory,
                UpdatedAt,
                ThreadStatusKind.Idle),
            [new ChatMessage("message-1", role, text)],
            status,
            LatestTurnStatus: latestTurnStatus);
}
