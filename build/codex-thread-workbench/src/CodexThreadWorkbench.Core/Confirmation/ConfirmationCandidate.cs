namespace CodexThreadWorkbench.Confirmation;

public sealed record ConfirmationCandidate(
    string ThreadId,
    string Title,
    string MessageId,
    string RequestPreview,
    DateTimeOffset UpdatedAt);
