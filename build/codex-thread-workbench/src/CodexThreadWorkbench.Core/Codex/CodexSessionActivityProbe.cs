using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Codex;

public sealed class CodexSessionActivityProbe
{
    private readonly string _sessionsRoot;
    private readonly ConcurrentDictionary<string, SessionCursor> _cursors =
        new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _scanGate = new(1, 1);

    public CodexSessionActivityProbe(string? sessionsRoot = null)
    {
        _sessionsRoot = sessionsRoot ?? GetDefaultSessionsRoot();
    }

    public async Task<ThreadStatusKind?> GetLatestStatusAsync(
        string threadId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(threadId) || !Directory.Exists(_sessionsRoot))
        {
            return null;
        }

        await _scanGate.WaitAsync(cancellationToken);
        try
        {
            if (!_cursors.TryGetValue(threadId, out var cursor))
            {
                var path = FindSessionPath(threadId);
                if (path is null)
                {
                    return null;
                }

                cursor = _cursors.GetOrAdd(threadId, _ => new SessionCursor(path));
            }

            return await cursor.ReadLatestStatusAsync(cancellationToken);
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
        finally
        {
            _scanGate.Release();
        }
    }

    private string? FindSessionPath(string threadId) =>
        Directory.EnumerateFiles(
                _sessionsRoot,
                $"*{threadId}*.jsonl",
                SearchOption.AllDirectories)
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .FirstOrDefault();

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

    private sealed class SessionCursor(string path)
    {
        private long _offset;
        private ThreadStatusKind? _latestStatus;

        public async Task<ThreadStatusKind?> ReadLatestStatusAsync(
            CancellationToken cancellationToken)
        {
            await using var stream = new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete,
                bufferSize: 64 * 1024,
                useAsync: true);
            if (stream.Length < _offset)
            {
                _offset = 0;
                _latestStatus = null;
            }

            stream.Seek(_offset, SeekOrigin.Begin);
            using var appended = new MemoryStream();
            await stream.CopyToAsync(appended, cancellationToken);
            var length = checked((int)appended.Length);
            if (length == 0)
            {
                return _latestStatus;
            }

            var bytes = appended.GetBuffer();
            var completeLength = FindCompleteLineLength(bytes, length);
            if (completeLength == 0)
            {
                return _latestStatus;
            }

            var content = Encoding.UTF8.GetString(bytes, 0, completeLength);
            foreach (var line in content.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                ApplyBoundary(line.TrimEnd('\r'));
            }

            _offset += completeLength;
            return _latestStatus;
        }

        private static int FindCompleteLineLength(byte[] bytes, int length)
        {
            for (var index = length - 1; index >= 0; index--)
            {
                if (bytes[index] == (byte)'\n')
                {
                    return index + 1;
                }
            }

            return 0;
        }

        private void ApplyBoundary(string line)
        {
            if (!line.Contains("task_started", StringComparison.Ordinal) &&
                !line.Contains("task_complete", StringComparison.Ordinal) &&
                !line.Contains("turn_aborted", StringComparison.Ordinal))
            {
                return;
            }

            try
            {
                using var document = JsonDocument.Parse(line);
                var root = document.RootElement;
                if (GetString(root, "type") != "event_msg" ||
                    !root.TryGetProperty("payload", out var payload))
                {
                    return;
                }

                _latestStatus = GetString(payload, "type") switch
                {
                    "task_started" => ThreadStatusKind.Running,
                    "task_complete" => ThreadStatusKind.Completed,
                    "turn_aborted" => ThreadStatusKind.Interrupted,
                    _ => _latestStatus
                };
            }
            catch (JsonException)
            {
            }
        }

        private static string GetString(JsonElement element, string propertyName) =>
            element.TryGetProperty(propertyName, out var value) &&
            value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? string.Empty
                : string.Empty;
    }
}
