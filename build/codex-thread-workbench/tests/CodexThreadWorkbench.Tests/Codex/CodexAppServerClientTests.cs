using System.Text.Json;
using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Infrastructure;
using CodexThreadWorkbench.Models;
using CodexThreadWorkbench.Tests.Infrastructure;

namespace CodexThreadWorkbench.Tests.Codex;

public sealed class CodexAppServerClientTests
{
    [Fact]
    public async Task InitializeAsync_PerformsRequiredHandshake()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        await using var client = new CodexAppServerClient(connection);

        var pending = client.InitializeAsync();
        using var initialize = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal("initialize", initialize.RootElement.GetProperty("method").GetString());
        Assert.Equal(
            "codex_thread_workbench",
            initialize.RootElement.GetProperty("params").GetProperty("clientInfo").GetProperty("name").GetString());
        var id = initialize.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming($"{{\"id\":{id},\"result\":{{\"userAgent\":\"test\"}}}}");

        await pending;
        using var initialized = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal("initialized", initialized.RootElement.GetProperty("method").GetString());
    }

    [Fact]
    public async Task ListThreadsAsync_RequestsAllSourceKindsAndMapsThreads()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        await using var client = new CodexAppServerClient(connection);

        var pending = client.ListThreadsAsync(limit: 20);
        using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal("thread/list", request.RootElement.GetProperty("method").GetString());
        Assert.Contains(
            request.RootElement.GetProperty("params").GetProperty("sourceKinds").EnumerateArray(),
            item => item.GetString() == "exec");
        var id = request.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming(
            $$"""
            {
              "id":{{id}},
              "result":{
                "data":[{
                  "id":"thread-1",
                  "name":"真实线程",
                  "preview":"预览",
                  "cwd":"C:\\work",
                  "updatedAt":1784510000,
                  "status":{"type":"idle"},
                  "turns":[]
                }],
                "nextCursor":null,
                "backwardsCursor":null
              }
            }
            """);

        var threads = await pending;
        Assert.Single(threads);
        Assert.Equal("真实线程", threads[0].Title);
    }

    [Fact]
    public async Task ListThreadsAsync_FollowsNextCursorUntilRequestedTotal()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        await using var client = new CodexAppServerClient(connection);

        var pending = client.ListThreadsAsync(limit: 3);
        using var firstRequest = JsonDocument.Parse(await transport.ReadWrittenAsync());
        var firstId = firstRequest.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming(
            $$"""
            {
              "id":{{firstId}},
              "result":{
                "data":[
                  {"id":"thread-1","name":"任务 1","preview":"","cwd":"C:\\work","updatedAt":1784510002,"status":{"type":"idle"},"turns":[]},
                  {"id":"thread-2","name":"任务 2","preview":"","cwd":"C:\\work","updatedAt":1784510001,"status":{"type":"idle"},"turns":[]}
                ],
                "nextCursor":"page-2"
              }
            }
            """);

        using var secondRequest = JsonDocument.Parse(
            await transport.ReadWrittenAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(1)));
        Assert.Equal(
            "page-2",
            secondRequest.RootElement.GetProperty("params").GetProperty("cursor").GetString());
        Assert.Equal(
            1,
            secondRequest.RootElement.GetProperty("params").GetProperty("limit").GetInt32());
        var secondId = secondRequest.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming(
            $$"""
            {
              "id":{{secondId}},
              "result":{
                "data":[
                  {"id":"thread-3","name":"任务 3","preview":"","cwd":"C:\\work","updatedAt":1784510000,"status":{"type":"idle"},"turns":[]}
                ],
                "nextCursor":null
              }
            }
            """);

        var threads = await pending;

        Assert.Equal(["thread-1", "thread-2", "thread-3"], threads.Select(x => x.Id));
    }

    [Fact]
    public async Task SteerTurnAsync_SendsExpectedActiveTurn()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        await using var client = new CodexAppServerClient(connection);

        var pending = client.SteerTurnAsync("thread-1", "turn-1", "继续执行");
        using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal("turn/steer", request.RootElement.GetProperty("method").GetString());
        Assert.Equal(
            "turn-1",
            request.RootElement.GetProperty("params").GetProperty("expectedTurnId").GetString());
        Assert.Equal(
            "继续执行",
            request.RootElement.GetProperty("params").GetProperty("input")[0].GetProperty("text").GetString());
        var id = request.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming($"{{\"id\":{id},\"result\":{{\"turnId\":\"turn-1\"}}}}");

        await pending;
    }

    [Fact]
    public async Task ResumeThreadAsync_SendsSupportedThreadIdWithoutExperimentalExcludeTurns()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        await using var client = new CodexAppServerClient(connection);

        var pending = client.ResumeThreadAsync("thread-1");
        using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal("thread/resume", request.RootElement.GetProperty("method").GetString());
        var parameters = request.RootElement.GetProperty("params");
        Assert.Equal("thread-1", parameters.GetProperty("threadId").GetString());
        Assert.False(parameters.TryGetProperty("excludeTurns", out _));
        var id = request.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming($"{{\"id\":{id},\"result\":{{}}}}");

        await pending;
    }

    [Fact]
    public async Task ReadThreadAsync_WhenStatusIsOmitted_UsesLatestTurnStatus()
    {
        await using var transport = new FakeJsonLineTransport();
        await using var connection = new JsonRpcConnection(transport);
        await using var client = new CodexAppServerClient(connection);

        var pending = client.ReadThreadAsync("thread-1");
        using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
        Assert.Equal("thread/read", request.RootElement.GetProperty("method").GetString());
        var id = request.RootElement.GetProperty("id").GetInt64();
        transport.EnqueueIncoming(
            $$"""
            {
              "id":{{id}},
              "result":{
                "thread":{
                  "id":"thread-1",
                  "name":"已完成任务",
                  "preview":"预览",
                  "cwd":"C:\\work",
                  "updatedAt":1784510000,
                  "turns":[{
                    "id":"turn-1",
                    "status":"completed",
                    "items":[]
                  }]
                }
              }
            }
            """);

        var state = await pending;

        Assert.Equal(ThreadStatusKind.Completed, state.Status);
        Assert.Equal(ThreadStatusKind.Completed, state.LatestTurnStatus);
        Assert.Null(state.ActiveTurnId);
    }

    [Fact]
    public async Task ReadThreadAsync_WhenAppServerStatusIsStale_UsesSessionActivity()
    {
        var sessionsRoot = Path.Combine(
            Path.GetTempPath(),
            "CodexThreadWorkbench.ClientActivity.Tests",
            Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(sessionsRoot);
        await File.WriteAllLinesAsync(
            Path.Combine(sessionsRoot, "rollout-thread-1.jsonl"),
        [
            """{"type":"event_msg","payload":{"type":"task_started"}}"""
        ]);
        try
        {
            await using var transport = new FakeJsonLineTransport();
            await using var connection = new JsonRpcConnection(transport);
            await using var client = new CodexAppServerClient(
                connection,
                new CodexSessionActivityProbe(sessionsRoot));

            var pending = client.ReadThreadAsync("thread-1");
            using var request = JsonDocument.Parse(await transport.ReadWrittenAsync());
            var id = request.RootElement.GetProperty("id").GetInt64();
            transport.EnqueueIncoming(
                $$"""
                {
                  "id":{{id}},
                  "result":{
                    "thread":{
                      "id":"thread-1",
                      "name":"仍在进行的任务",
                      "preview":"预览",
                      "cwd":"C:\\work",
                      "updatedAt":1784510000,
                      "status":{"type":"notLoaded"},
                      "turns":[{
                        "id":"old-turn",
                        "status":"interrupted",
                        "items":[]
                      }]
                    }
                  }
                }
                """);

            var state = await pending;

            Assert.Equal(ThreadStatusKind.Running, state.Status);
            Assert.Null(state.ActiveTurnId);
        }
        finally
        {
            Directory.Delete(sessionsRoot, recursive: true);
        }
    }
}
