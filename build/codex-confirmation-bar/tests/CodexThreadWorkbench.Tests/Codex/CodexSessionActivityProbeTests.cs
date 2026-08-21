using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Tests.Codex;

public sealed class CodexSessionActivityProbeTests : IDisposable
{
    private readonly string _sessionsRoot = Path.Combine(
        Path.GetTempPath(),
        "CodexThreadWorkbench.SessionProbe.Tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task GetLatestStatusAsync_UsesNewestTurnBoundaryAndIgnoresTextMentions()
    {
        const string threadId = "019f7d77-9b04-7800-962d-eb56d3c1e4ad";
        var directory = Path.Combine(_sessionsRoot, "2026", "07", "22");
        Directory.CreateDirectory(directory);
        var sessionPath = Path.Combine(
            directory,
            $"rollout-2026-07-22T08-00-00-{threadId}.jsonl");
        await File.WriteAllLinesAsync(sessionPath,
        [
            """{"type":"event_msg","payload":{"type":"task_complete"}}""",
            """{"type":"event_msg","payload":{"type":"user_message","message":"task_started is documentation text"}}""",
            """{"type":"event_msg","payload":{"type":"task_started"}}"""
        ]);
        var probe = new CodexSessionActivityProbe(_sessionsRoot);

        Assert.Equal(
            ThreadStatusKind.Running,
            await probe.GetLatestStatusAsync(threadId));

        await File.AppendAllLinesAsync(sessionPath,
        [
            """{"type":"event_msg","payload":{"type":"task_complete"}}"""
        ]);
        Assert.Equal(
            ThreadStatusKind.Completed,
            await probe.GetLatestStatusAsync(threadId));

        await File.AppendAllLinesAsync(sessionPath,
        [
            """{"type":"event_msg","payload":{"type":"turn_aborted"}}"""
        ]);
        Assert.Equal(
            ThreadStatusKind.Interrupted,
            await probe.GetLatestStatusAsync(threadId));
    }

    public void Dispose()
    {
        if (Directory.Exists(_sessionsRoot))
        {
            Directory.Delete(_sessionsRoot, recursive: true);
        }
    }
}
