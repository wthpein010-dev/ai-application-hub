using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Tests.Confirmation;

public sealed class ConfirmationDetectorTests
{
    private static readonly DateTimeOffset UpdatedAt =
        new(2026, 8, 20, 8, 0, 0, TimeSpan.Zero);

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
