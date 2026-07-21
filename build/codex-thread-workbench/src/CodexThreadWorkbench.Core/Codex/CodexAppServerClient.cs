using System.Text.Json;
using CodexThreadWorkbench.Infrastructure;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Codex;

public sealed class CodexAppServerClient : ICodexThreadClient
{
    private static readonly string[] AllSourceKinds =
    [
        "cli",
        "vscode",
        "exec",
        "appServer",
        "subAgent",
        "subAgentReview",
        "subAgentCompact",
        "subAgentThreadSpawn",
        "subAgentOther",
        "unknown"
    ];

    private readonly JsonRpcConnection _rpc;
    private bool _disposed;

    public CodexAppServerClient(JsonRpcConnection rpc)
    {
        _rpc = rpc;
        _rpc.NotificationReceived += OnNotification;
        _rpc.ServerRequestReceived += OnServerRequest;
    }

    public event Action<CodexNotification>? NotificationReceived;

    public event Action<CodexApprovalRequest>? ApprovalRequested;

    public bool IsConnected { get; private set; }

    public static async Task<CodexAppServerClient> ConnectAsync(
        ICodexProcessLocator? processLocator = null,
        CancellationToken cancellationToken = default)
    {
        var codexPath = (processLocator ?? CodexProcessLocator.CreateDefault()).Find();
        var transport = ProcessJsonLineTransport.Start(codexPath);
        var connection = new JsonRpcConnection(transport);
        var client = new CodexAppServerClient(connection);
        try
        {
            await client.InitializeAsync(cancellationToken);
            return client;
        }
        catch
        {
            await client.DisposeAsync();
            throw;
        }
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _rpc.RequestAsync(
            "initialize",
            new
            {
                clientInfo = new
                {
                    name = "codex_thread_workbench",
                    title = "Codex Thread Workbench",
                    version = "0.1.0"
                }
            },
            cancellationToken);
        await _rpc.NotifyAsync("initialized", new { }, cancellationToken);
        IsConnected = true;
    }

    public async Task<IReadOnlyList<ThreadSummary>> ListThreadsAsync(
        int limit = 100,
        string? searchTerm = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _rpc.RequestAsync(
            "thread/list",
            new
            {
                limit,
                sortKey = "updated_at",
                sortDirection = "desc",
                sourceKinds = AllSourceKinds,
                archived = false,
                searchTerm
            },
            cancellationToken);
        if (!result.TryGetProperty("data", out var data) ||
            data.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return data.EnumerateArray()
            .Select(ThreadProjection.FromThread)
            .ToArray();
    }

    public async Task<ThreadCardState> ReadThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        var result = await _rpc.RequestAsync(
            "thread/read",
            new { threadId, includeTurns = true },
            cancellationToken);
        var thread = result.GetProperty("thread");
        var summary = ThreadProjection.FromThread(thread);
        var messages = ThreadProjection.MessagesFromThread(thread);
        var activeTurnId = FindActiveTurnId(thread);
        var state = activeTurnId is not null
            ? ThreadStatusKind.Running
            : summary.Status == ThreadStatusKind.NotLoaded
                ? FindLatestTurnStatus(thread)
                : summary.Status;
        return new ThreadCardState(summary, messages, state, activeTurnId);
    }

    public async Task ResumeThreadAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        await _rpc.RequestAsync(
            "thread/resume",
            new { threadId, excludeTurns = true },
            cancellationToken);
    }

    public async Task<string> StartTurnAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default)
    {
        var result = await _rpc.RequestAsync(
            "turn/start",
            new
            {
                threadId,
                input = new[] { new { type = "text", text } }
            },
            cancellationToken);
        return result.GetProperty("turn").GetProperty("id").GetString()
               ?? throw new InvalidOperationException("Codex 未返回 turn id。");
    }

    public async Task SteerTurnAsync(
        string threadId,
        string expectedTurnId,
        string text,
        CancellationToken cancellationToken = default)
    {
        await _rpc.RequestAsync(
            "turn/steer",
            new
            {
                threadId,
                expectedTurnId,
                input = new[] { new { type = "text", text } }
            },
            cancellationToken);
    }

    public async Task InterruptTurnAsync(
        string threadId,
        string turnId,
        CancellationToken cancellationToken = default)
    {
        await _rpc.RequestAsync(
            "turn/interrupt",
            new { threadId, turnId },
            cancellationToken);
    }

    public Task RespondToApprovalAsync(
        CodexApprovalRequest request,
        bool accept,
        CancellationToken cancellationToken = default) =>
        _rpc.RespondAsync(
            request.RequestId,
            new { decision = accept ? "accept" : "decline" },
            cancellationToken);

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        IsConnected = false;
        _rpc.NotificationReceived -= OnNotification;
        _rpc.ServerRequestReceived -= OnServerRequest;
        await _rpc.DisposeAsync();
    }

    private void OnNotification(JsonRpcNotification notification)
    {
        var parameters = notification.Params;
        var threadId = GetOptionalString(parameters, "threadId");
        if (string.IsNullOrWhiteSpace(threadId) &&
            parameters.TryGetProperty("thread", out var thread))
        {
            threadId = GetOptionalString(thread, "id");
        }

        if (string.IsNullOrWhiteSpace(threadId))
        {
            return;
        }

        var kind = notification.Method switch
        {
            "thread/status/changed" => CodexNotificationKind.ThreadStatusChanged,
            "turn/started" => CodexNotificationKind.TurnStarted,
            "turn/completed" => CodexNotificationKind.TurnCompleted,
            "item/agentMessage/delta" => CodexNotificationKind.AgentMessageDelta,
            "item/started" => CodexNotificationKind.ItemStarted,
            "item/completed" => CodexNotificationKind.ItemCompleted,
            "thread/name/updated" => CodexNotificationKind.ThreadNameUpdated,
            "thread/archived" => CodexNotificationKind.ThreadArchived,
            "error" => CodexNotificationKind.Error,
            _ => CodexNotificationKind.Other
        };
        NotificationReceived?.Invoke(
            new CodexNotification(
                kind,
                threadId,
                parameters,
                GetOptionalString(parameters, "turnId"),
                GetOptionalString(parameters, "itemId")));
    }

    private void OnServerRequest(JsonRpcServerRequest request)
    {
        if (request.Method is not (
                "item/commandExecution/requestApproval" or
                "item/fileChange/requestApproval"))
        {
            return;
        }

        var threadId = GetOptionalString(request.Params, "threadId");
        if (string.IsNullOrWhiteSpace(threadId))
        {
            return;
        }

        var description = GetOptionalString(request.Params, "reason");
        if (string.IsNullOrWhiteSpace(description))
        {
            description = GetOptionalString(request.Params, "command");
        }

        if (string.IsNullOrWhiteSpace(description))
        {
            description = request.Method.Contains("fileChange", StringComparison.Ordinal)
                ? "Codex 请求修改文件。"
                : "Codex 请求执行命令。";
        }

        ApprovalRequested?.Invoke(
            new CodexApprovalRequest(
                request.Id.Clone(),
                threadId,
                request.Method,
                description));
    }

    private static string? FindActiveTurnId(JsonElement thread)
    {
        if (!thread.TryGetProperty("turns", out var turns) ||
            turns.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        foreach (var turn in turns.EnumerateArray().Reverse())
        {
            if (GetOptionalString(turn, "status") == "inProgress")
            {
                return GetOptionalString(turn, "id");
            }
        }

        return null;
    }

    private static ThreadStatusKind FindLatestTurnStatus(JsonElement thread)
    {
        if (!thread.TryGetProperty("turns", out var turns) ||
            turns.ValueKind != JsonValueKind.Array)
        {
            return ThreadStatusKind.Idle;
        }

        foreach (var turn in turns.EnumerateArray().Reverse())
        {
            return GetOptionalString(turn, "status") switch
            {
                "completed" => ThreadStatusKind.Completed,
                "interrupted" => ThreadStatusKind.Interrupted,
                "failed" => ThreadStatusKind.Error,
                "inProgress" => ThreadStatusKind.Running,
                _ => ThreadStatusKind.Idle
            };
        }

        return ThreadStatusKind.Idle;
    }

    private static string GetOptionalString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) ||
            value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return string.Empty;
        }

        return value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : value.ToString();
    }
}
