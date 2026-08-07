using System.Text.Json;
using CodexQuotaBar.Core.Tasks;

namespace CodexQuotaBar.App.Tasks;

public static class CodexSessionEventParser
{
    public static CodexTaskCompletion? Parse(string line, string workspaceName)
    {
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var type) || type.GetString() != "event_msg" ||
                !root.TryGetProperty("payload", out var payload) ||
                !payload.TryGetProperty("type", out var payloadType) || payloadType.GetString() != "task_complete" ||
                !payload.TryGetProperty("turn_id", out var turnIdElement))
            {
                return null;
            }

            var turnId = turnIdElement.GetString();
            if (string.IsNullOrWhiteSpace(turnId))
            {
                return null;
            }

            var summary = payload.TryGetProperty("last_agent_message", out var messageElement)
                ? NormalizeSummary(messageElement.GetString() ?? string.Empty)
                : string.Empty;
            TimeSpan? duration = null;
            if (payload.TryGetProperty("duration_ms", out var durationElement) &&
                durationElement.TryGetDouble(out var durationMs) &&
                double.IsFinite(durationMs) && durationMs >= 0 &&
                durationMs <= TimeSpan.MaxValue.TotalMilliseconds)
            {
                try
                {
                    duration = TimeSpan.FromMilliseconds(durationMs);
                }
                catch (OverflowException)
                {
                    duration = null;
                }
            }

            var completedAt = root.TryGetProperty("timestamp", out var timestampElement) &&
                              DateTimeOffset.TryParse(timestampElement.GetString(), out var timestamp)
                ? timestamp
                : DateTimeOffset.UtcNow;

            return new CodexTaskCompletion(turnId, workspaceName, summary, duration, completedAt);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    private static string NormalizeSummary(string summary)
    {
        var normalized = string.Join(' ', summary.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Length > 120 ? normalized[..120] : normalized;
    }
}
