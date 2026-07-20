namespace CodexThreadWorkbench.Models;

public sealed record ThreadCardState(
    ThreadSummary Summary,
    IReadOnlyList<ChatMessage> Messages,
    ThreadStatusKind Status,
    string? ActiveTurnId = null,
    string? ErrorMessage = null);
