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
