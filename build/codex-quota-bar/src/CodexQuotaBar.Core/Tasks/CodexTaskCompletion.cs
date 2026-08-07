namespace CodexQuotaBar.Core.Tasks;

public sealed record CodexTaskCompletion(
    string TurnId,
    string WorkspaceName,
    string Summary,
    TimeSpan? Duration,
    DateTimeOffset CompletedAt);
