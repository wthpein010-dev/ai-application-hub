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
        Assert.Null(state.ActiveTurnId);
    }
}
