using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Tests.Confirmation;

public sealed class CodexSessionSnapshotReaderTests : IDisposable
{
    private readonly string _sessionsRoot = Path.Combine(
        Path.GetTempPath(),
        "CodexThreadWorkbench.SnapshotReader.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task ReadThreadAsync_UsesBoundedTailAndReturnsLatestConversationBoundary()
    {
        const string threadId = "019f7444-4d4d-7771-9864-0043606d7f78";
        var directory = Path.Combine(_sessionsRoot, "2026", "08", "21");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(
            directory,
            $"rollout-2026-08-21T08-00-00-{threadId}.jsonl");
        await File.WriteAllTextAsync(path, new string('x', 2_000_000) + "\n");
        await File.AppendAllLinesAsync(path,
        [
            """{"timestamp":"2026-08-21T08:00:00Z","type":"event_msg","payload":{"type":"task_started"}}""",
            """{"timestamp":"2026-08-21T08:00:01Z","type":"response_item","payload":{"type":"message","id":"user-1","role":"user","content":[{"type":"input_text","text":"请设计结构"}]}}""",
            """{"timestamp":"2026-08-21T08:00:02Z","type":"response_item","payload":{"type":"message","id":"assistant-1","role":"assistant","content":[{"type":"output_text","text":"你确认这个结构后，我再进入规格和开发发布。"}]}}""",
            """{"timestamp":"2026-08-21T08:00:03Z","type":"event_msg","payload":{"type":"task_complete"}}"""
        ]);
        var reader = new CodexSessionSnapshotReader(
            _sessionsRoot,
            tailByteLimit: 4096);

        var state = await reader.ReadThreadAsync(Summary(threadId));

        Assert.Equal(ThreadStatusKind.Completed, state.Status);
        Assert.Equal(ThreadStatusKind.Completed, state.LatestTurnStatus);
        Assert.Collection(
            state.Messages,
            message =>
            {
                Assert.Equal(ChatRole.User, message.Role);
                Assert.Equal("请设计结构", message.Text);
            },
            message =>
            {
                Assert.Equal("assistant-1", message.Id);
                Assert.Equal(ChatRole.Assistant, message.Role);
                Assert.Equal("你确认这个结构后，我再进入规格和开发发布。", message.Text);
            });
    }

    [Fact]
    public async Task ReadThreadAsync_ReturnsEmptySafeStateWhenSessionIsMissing()
    {
        var summary = Summary("019f7444-4d4d-7771-9864-0043606d7f79");
        var reader = new CodexSessionSnapshotReader(_sessionsRoot);

        var state = await reader.ReadThreadAsync(summary);

        Assert.Same(summary, state.Summary);
        Assert.Empty(state.Messages);
        Assert.Equal(ThreadStatusKind.NotLoaded, state.LatestTurnStatus);
    }

    private static ThreadSummary Summary(string threadId) =>
        new(
            threadId,
            "待确认任务",
            "预览",
            @"C:\work",
            new DateTimeOffset(2026, 8, 21, 8, 0, 0, TimeSpan.Zero),
            ThreadStatusKind.NotLoaded);

    public void Dispose()
    {
        if (Directory.Exists(_sessionsRoot))
        {
            Directory.Delete(_sessionsRoot, recursive: true);
        }
    }
}
