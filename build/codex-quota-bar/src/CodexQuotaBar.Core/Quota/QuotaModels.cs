namespace CodexQuotaBar.Core.Quota;

public enum QuotaTone
{
    Healthy,
    Warning,
    Critical,
}

public enum QuotaWindowKind
{
    Primary,
    Secondary,
}

public sealed record QuotaBucket(
    string Id,
    string DisplayName,
    int RemainingPercent,
    QuotaTone Tone,
    QuotaWindowKind WindowKind,
    DateTimeOffset? ResetsAt,
    TimeSpan? WindowDuration);

public sealed record QuotaSnapshot(
    IReadOnlyList<QuotaBucket> Buckets,
    int? AvailableResetCredits,
    DateTimeOffset RefreshedAt);
