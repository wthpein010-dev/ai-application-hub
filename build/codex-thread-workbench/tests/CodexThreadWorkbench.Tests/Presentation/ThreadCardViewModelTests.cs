using System.Text.Json;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Tests.Presentation;

public sealed class ThreadCardViewModelTests
{
    [Fact]
    public async Task SendAsync_WhenActive_SteersCurrentTurn()
    {
        var client = new FakeCodexThreadClient();
        var viewModel = CreateViewModel(
            client,
            ThreadStatusKind.Running,
            activeTurnId: "turn-1");
        viewModel.Draft = "继续执行";

        await viewModel.SendAsync();

        Assert.Equal(("thread-1", "turn-1", "继续执行"), client.LastSteer);
        Assert.False(client.Resumed);
        Assert.Equal(string.Empty, viewModel.Draft);
    }

    [Fact]
    public async Task SendAsync_WhenIdle_ResumesThenStartsTurn()
    {
        var client = new FakeCodexThreadClient();
        var viewModel = CreateViewModel(client, ThreadStatusKind.Idle);
        viewModel.Draft = "开始";

        await viewModel.SendAsync();

        Assert.True(client.Resumed);
        Assert.Equal(("thread-1", "开始"), client.LastStart);
        Assert.Equal("new-turn", viewModel.ActiveTurnId);
        Assert.Equal(ThreadStatusKind.Running, viewModel.Status);
    }

    [Fact]
    public async Task SendAsync_WhenCodexFails_PreservesDraftAndShowsError()
    {
        var client = new FakeCodexThreadClient
        {
            SendException = new InvalidOperationException("无法发送")
        };
        var viewModel = CreateViewModel(client, ThreadStatusKind.Running, "turn-1");
        viewModel.Draft = "不要丢失";

        await viewModel.SendAsync();

        Assert.Equal("不要丢失", viewModel.Draft);
        Assert.Contains("无法发送", viewModel.ErrorMessage);
    }

    [Fact]
    public async Task StopAsync_ImmediatelyShowsStoppedWhileInterruptIsPending()
    {
        var client = new FakeCodexThreadClient { DelayInterrupt = true };
        var viewModel = CreateViewModel(
            client,
            ThreadStatusKind.Running,
            activeTurnId: "turn-1");

        var stopTask = viewModel.StopAsync();
        await client.InterruptStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));

        Assert.Equal(ThreadStatusKind.Interrupted, viewModel.Status);
        Assert.Equal("已停止", viewModel.StatusText);
        Assert.False(viewModel.IsRunning);
        Assert.Equal("turn-1", viewModel.ActiveTurnId);

        client.InterruptCompletion.TrySetResult();
        await stopTask;

        Assert.Null(viewModel.ActiveTurnId);
    }

    [Fact]
    public async Task StopAsync_WhenInterruptFails_RestoresRunningState()
    {
        var client = new FakeCodexThreadClient
        {
            InterruptException = new InvalidOperationException("停止失败")
        };
        var viewModel = CreateViewModel(
            client,
            ThreadStatusKind.Running,
            activeTurnId: "turn-1");

        await viewModel.StopAsync();

        Assert.Equal(ThreadStatusKind.Running, viewModel.Status);
        Assert.Equal("turn-1", viewModel.ActiveTurnId);
        Assert.True(viewModel.IsRunning);
        Assert.Contains("停止失败", viewModel.ErrorMessage);
    }

    [Fact]
    public void ApplyStatusSnapshot_NonAuthoritativeRunningStatePreservesKnownTurnId()
    {
        var client = new FakeCodexThreadClient();
        var viewModel = CreateViewModel(
            client,
            ThreadStatusKind.Running,
            activeTurnId: "known-turn");
        var summary = new ThreadSummary(
            "thread-1",
            "测试线程",
            "预览",
            "C:\\work",
            DateTimeOffset.UtcNow,
            ThreadStatusKind.Running);

        viewModel.ApplyStatusSnapshot(new ThreadCardState(
            summary,
            [],
            ThreadStatusKind.Running,
            ActiveTurnId: null,
            LatestTurnStatus: ThreadStatusKind.NotLoaded));

        Assert.Equal("known-turn", viewModel.ActiveTurnId);
        Assert.True(viewModel.IsRunning);
    }

    [Fact]
    public void ApplyStatusSnapshot_ExplicitCompletedStateClearsKnownTurnId()
    {
        var client = new FakeCodexThreadClient();
        var viewModel = CreateViewModel(
            client,
            ThreadStatusKind.Running,
            activeTurnId: "known-turn");
        var summary = new ThreadSummary(
            "thread-1",
            "测试线程",
            "预览",
            "C:\\work",
            DateTimeOffset.UtcNow,
            ThreadStatusKind.Completed);

        viewModel.ApplyStatusSnapshot(new ThreadCardState(
            summary,
            [],
            ThreadStatusKind.Completed,
            ActiveTurnId: null,
            LatestTurnStatus: ThreadStatusKind.Completed));

        Assert.Null(viewModel.ActiveTurnId);
        Assert.False(viewModel.IsRunning);
    }

    [Fact]
    public async Task ApplyStatusSnapshot_PartialApprovalStateReturnsToRunningAfterApproval()
    {
        var client = new FakeCodexThreadClient();
        var viewModel = CreateViewModel(
            client,
            ThreadStatusKind.Running,
            activeTurnId: "known-turn");
        using var requestId = JsonDocument.Parse("77");
        viewModel.SetApproval(new CodexApprovalRequest(
            requestId.RootElement.Clone(),
            "thread-1",
            "item/fileChange/requestApproval",
            "允许写入文件"));
        var summary = new ThreadSummary(
            "thread-1",
            "测试线程",
            "预览",
            "C:\\work",
            DateTimeOffset.UtcNow,
            ThreadStatusKind.NeedsApproval);

        viewModel.ApplyStatusSnapshot(new ThreadCardState(
            summary,
            [],
            ThreadStatusKind.NeedsApproval,
            ActiveTurnId: null,
            LatestTurnStatus: ThreadStatusKind.NotLoaded));
        await viewModel.RespondToApprovalAsync(accept: true);

        Assert.Equal("known-turn", viewModel.ActiveTurnId);
        Assert.Equal(ThreadStatusKind.Running, viewModel.Status);
        Assert.True(viewModel.IsRunning);
    }

    [Fact]
    public void ApplyNotification_AgentDeltaBuildsStreamingMessage()
    {
        var viewModel = CreateViewModel(
            new FakeCodexThreadClient(),
            ThreadStatusKind.Running,
            "turn-1");
        using var first = JsonDocument.Parse(
            """{"threadId":"thread-1","turnId":"turn-1","itemId":"agent-1","delta":"正在"}""");
        using var second = JsonDocument.Parse(
            """{"threadId":"thread-1","turnId":"turn-1","itemId":"agent-1","delta":"处理"}""");

        viewModel.ApplyNotification(
            new CodexNotification(
                CodexNotificationKind.AgentMessageDelta,
                "thread-1",
                first.RootElement.Clone(),
                "turn-1",
                "agent-1"));
        viewModel.ApplyNotification(
            new CodexNotification(
                CodexNotificationKind.AgentMessageDelta,
                "thread-1",
                second.RootElement.Clone(),
                "turn-1",
                "agent-1"));

        var message = Assert.Single(viewModel.Messages);
        Assert.Equal("正在处理", message.Text);
        Assert.True(message.IsStreaming);
    }

    [Fact]
    public async Task RespondToApprovalAsync_UsesExplicitUserDecision()
    {
        var client = new FakeCodexThreadClient();
        var viewModel = CreateViewModel(client, ThreadStatusKind.Running, "turn-1");
        using var requestId = JsonDocument.Parse("77");
        var request = new CodexApprovalRequest(
            requestId.RootElement.Clone(),
            "thread-1",
            "item/fileChange/requestApproval",
            "允许写入文件");
        viewModel.SetApproval(request);

        await viewModel.RespondToApprovalAsync(accept: false);

        Assert.False(client.LastApproval!.Value.Accept);
        Assert.Null(viewModel.PendingApproval);
    }

    private static ThreadCardViewModel CreateViewModel(
        ICodexThreadClient client,
        ThreadStatusKind status,
        string? activeTurnId = null)
    {
        var summary = new ThreadSummary(
            "thread-1",
            "测试线程",
            "预览",
            "C:\\work",
            DateTimeOffset.UtcNow,
            status);
        return new ThreadCardViewModel(
            client,
            new ThreadCardState(summary, [], status, activeTurnId));
    }
}
