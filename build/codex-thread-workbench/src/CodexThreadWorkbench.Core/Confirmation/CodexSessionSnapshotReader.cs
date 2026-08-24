using System.Text;
using System.Text.Json;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Confirmation;

public sealed class CodexSessionSnapshotReader : IConfirmationThreadReader
{
    private const int DefaultTailByteLimit = 4 * 1024 * 1024;
    private static readonly TimeSpan MissingPathRefreshInterval =
        TimeSpan.FromSeconds(2);
    private readonly string _sessionsRoot;
    private readonly int _tailByteLimit;
    private readonly SemaphoreSlim _indexGate = new(1, 1);
    private Dictionary<string, string> _sessionPaths =
        new(StringComparer.Ordinal);
    private DateTimeOffset _lastIndexRefresh = DateTimeOffset.MinValue;
    private bool _hasIndexed;

    public CodexSessionSnapshotReader(
        string? sessionsRoot = null,
        int tailByteLimit = DefaultTailByteLimit)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(tailByteLimit, 1024);
        _sessionsRoot = sessionsRoot ?? GetDefaultSessionsRoot();
        _tailByteLimit = tailByteLimit;
    }

    public async Task<ThreadCardState> ReadThreadAsync(
        ThreadSummary summary,
        CancellationToken cancellationToken = default)
    {
        var path = await GetSessionPathAsync(summary.Id, cancellationToken);
        if (path is null)
        {
            return EmptyState(summary);
        }

        try
        {
            return await ReadTailAsync(summary, path, cancellationToken);
        }
        catch (IOException)
        {
            return EmptyState(summary);
        }
        catch (UnauthorizedAccessException)
        {
            return EmptyState(summary);
        }
        catch (JsonException)
        {
            return EmptyState(summary);
        }
    }

    private async Task<string?> GetSessionPathAsync(
        string threadId,
        CancellationToken cancellationToken)
    {
        await _indexGate.WaitAsync(cancellationToken);
        try
        {
            var shouldRefresh = !_hasIndexed ||
                                (!_sessionPaths.ContainsKey(threadId) &&
                                 DateTimeOffset.UtcNow - _lastIndexRefresh >=
                                 MissingPathRefreshInterval);
            if (shouldRefresh)
            {
                RefreshIndex();
            }

            return _sessionPaths.GetValueOrDefault(threadId);
        }
        finally
        {
            _indexGate.Release();
        }
    }

    private void RefreshIndex()
    {
        var next = new Dictionary<string, string>(StringComparer.Ordinal);
        if (Directory.Exists(_sessionsRoot))
        {
            foreach (var path in Directory.EnumerateFiles(
                         _sessionsRoot,
                         "rollout-*.jsonl",
                         SearchOption.AllDirectories))
            {
                var threadId = TryGetThreadId(path);
                if (threadId is null)
                {
                    continue;
                }

                if (!next.TryGetValue(threadId, out var existing) ||
                    File.GetLastWriteTimeUtc(path) > File.GetLastWriteTimeUtc(existing))
                {
                    next[threadId] = path;
                }
            }
        }

        _sessionPaths = next;
        _hasIndexed = true;
        _lastIndexRefresh = DateTimeOffset.UtcNow;
    }

    private async Task<ThreadCardState> ReadTailAsync(
        ThreadSummary summary,
        string path,
        CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete,
            bufferSize: 64 * 1024,
            useAsync: true);
        var length = (int)Math.Min(stream.Length, _tailByteLimit);
        if (length == 0)
        {
            return EmptyState(summary);
        }

        var startsMidFile = stream.Length > length;
        stream.Seek(-length, SeekOrigin.End);
        var bytes = new byte[length];
        await stream.ReadExactlyAsync(bytes, cancellationToken);
        var content = Encoding.UTF8.GetString(bytes);
        if (startsMidFile)
        {
            var firstLineEnd = content.IndexOf('\n');
            if (firstLineEnd < 0)
            {
                return EmptyState(summary);
            }

            content = content[(firstLineEnd + 1)..];
        }

        var messages = new List<ChatMessage>();
        var latestTurnStatus = ThreadStatusKind.NotLoaded;
        foreach (var line in content.Split(
                     '\n',
                     StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            ApplyLine(line, messages, ref latestTurnStatus);
        }

        var status = latestTurnStatus == ThreadStatusKind.NotLoaded
            ? summary.Status
            : latestTurnStatus;
        return new ThreadCardState(
            summary,
            messages,
            status,
            LatestTurnStatus: latestTurnStatus);
    }

    private static void ApplyLine(
        string line,
        List<ChatMessage> messages,
        ref ThreadStatusKind latestTurnStatus)
    {
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (!root.TryGetProperty("payload", out var payload))
            {
                return;
            }

            var rootType = GetString(root, "type");
            var payloadType = GetString(payload, "type");
            if (rootType == "event_msg")
            {
                latestTurnStatus = payloadType switch
                {
                    "task_started" => ThreadStatusKind.Running,
                    "task_complete" => ThreadStatusKind.Completed,
                    "turn_aborted" => ThreadStatusKind.Interrupted,
                    _ => latestTurnStatus
                };
                return;
            }

            if (rootType != "response_item" || payloadType != "message")
            {
                return;
            }

            var role = GetString(payload, "role") switch
            {
                "user" => ChatRole.User,
                "assistant" => ChatRole.Assistant,
                _ => (ChatRole?)null
            };
            if (role is null)
            {
                return;
            }

            var text = ExtractMessageText(payload);
            if (string.IsNullOrWhiteSpace(text))
            {
                return;
            }

            var id = GetString(payload, "id");
            if (string.IsNullOrWhiteSpace(id))
            {
                id = $"session-message-{messages.Count}";
            }

            messages.Add(new ChatMessage(id, role.Value, text));
            if (messages.Count > 64)
            {
                messages.RemoveAt(0);
            }
        }
        catch (JsonException)
        {
        }
    }

    private static string ExtractMessageText(JsonElement payload)
    {
        if (!payload.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        return string.Join(
            "\n",
            content.EnumerateArray()
                .Where(item =>
                    GetString(item, "type") is "input_text" or "output_text")
                .Select(item => GetString(item, "text"))
                .Where(text => !string.IsNullOrWhiteSpace(text)));
    }

    private static string? TryGetThreadId(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path);
        if (name.Length < 36)
        {
            return null;
        }

        var candidate = name[^36..];
        return Guid.TryParse(candidate, out _)
            ? candidate
            : null;
    }

    private static ThreadCardState EmptyState(ThreadSummary summary) =>
        new(
            summary,
            [],
            summary.Status,
            LatestTurnStatus: ThreadStatusKind.NotLoaded);

    private static string GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    private static string GetDefaultSessionsRoot()
    {
        var codexHome = Environment.GetEnvironmentVariable("CODEX_HOME");
        if (string.IsNullOrWhiteSpace(codexHome))
        {
            codexHome = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".codex");
        }

        return Path.Combine(codexHome, "sessions");
    }
}
