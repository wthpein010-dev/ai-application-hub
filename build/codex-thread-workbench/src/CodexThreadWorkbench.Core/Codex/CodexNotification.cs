using System.Text.Json;

namespace CodexThreadWorkbench.Codex;

public enum CodexNotificationKind
{
    ThreadStatusChanged,
    TurnStarted,
    TurnCompleted,
    AgentMessageDelta,
    ItemStarted,
    ItemCompleted,
    ThreadNameUpdated,
    ThreadArchived,
    Error,
    Other
}

public sealed record CodexNotification(
    CodexNotificationKind Kind,
    string ThreadId,
    JsonElement Payload,
    string? TurnId = null,
    string? ItemId = null);

public sealed record CodexApprovalRequest(
    JsonElement RequestId,
    string ThreadId,
    string Method,
    string Description);
