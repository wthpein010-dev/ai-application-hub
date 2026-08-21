using System.Text;
using System.Text.Json;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Codex;

public static class ThreadProjection
{
    public static ThreadSummary FromThread(JsonElement thread)
    {
        var id = GetString(thread, "id");
        var preview = GetString(thread, "preview");
        var explicitName = GetString(thread, "name");
        var title = string.IsNullOrWhiteSpace(explicitName)
            ? FirstMeaningfulLine(preview)
            : explicitName.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            title = "未命名线程";
        }

        if (title.Length > 72)
        {
            title = title[..69] + "…";
        }

        var updatedAt = thread.TryGetProperty("updatedAt", out var updated) &&
                        updated.TryGetInt64(out var seconds)
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : DateTimeOffset.MinValue;
        var status = thread.TryGetProperty("status", out var statusElement)
            ? MapThreadStatus(statusElement)
            : ThreadStatusKind.NotLoaded;

        return new ThreadSummary(
            id,
            title,
            preview,
            GetString(thread, "cwd"),
            updatedAt,
            status);
    }

    public static IReadOnlyList<ChatMessage> MessagesFromThread(
        JsonElement thread,
        int maxMessages = 80)
    {
        if (maxMessages <= 0 ||
            !thread.TryGetProperty("turns", out var turns) ||
            turns.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var messages = new List<ChatMessage>();
        foreach (var turn in turns.EnumerateArray())
        {
            if (!turn.TryGetProperty("items", out var items) ||
                items.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var item in items.EnumerateArray())
            {
                var type = GetString(item, "type");
                if (type == "userMessage")
                {
                    var text = ExtractUserText(item);
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        messages.Add(new ChatMessage(
                            GetString(item, "id"),
                            ChatRole.User,
                            text));
                    }
                }
                else if (type == "agentMessage")
                {
                    var text = GetString(item, "text");
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        messages.Add(new ChatMessage(
                            GetString(item, "id"),
                            ChatRole.Assistant,
                            text));
                    }
                }
            }
        }

        return messages.Count <= maxMessages
            ? messages
            : messages[^maxMessages..];
    }

    public static ThreadStatusKind MapThreadStatus(JsonElement status)
    {
        var type = GetString(status, "type");
        return type switch
        {
            "active" => ThreadStatusKind.Running,
            "idle" => ThreadStatusKind.Idle,
            "systemError" => ThreadStatusKind.Error,
            _ => ThreadStatusKind.NotLoaded
        };
    }

    private static string ExtractUserText(JsonElement item)
    {
        if (!item.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        foreach (var input in content.EnumerateArray())
        {
            if (GetString(input, "type") != "text")
            {
                continue;
            }

            var text = GetString(input, "text");
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.Append(text);
        }

        return builder.ToString();
    }

    private static string FirstMeaningfulLine(string value) =>
        value.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .FirstOrDefault(line => line.Length > 0) ?? string.Empty;

    private static string GetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return string.Empty;
        }

        return property.ValueKind == JsonValueKind.String
            ? property.GetString() ?? string.Empty
            : property.ToString();
    }
}
