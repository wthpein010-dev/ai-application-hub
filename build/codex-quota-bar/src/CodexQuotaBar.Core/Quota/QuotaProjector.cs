using System.Globalization;
using CodexQuotaBar.Core.Protocol;

namespace CodexQuotaBar.Core.Quota;

public static class QuotaProjector
{
    public static QuotaSnapshot Project(GetAccountRateLimitsResult result, DateTimeOffset refreshedAt)
    {
        ArgumentNullException.ThrowIfNull(result);

        var sources = SelectSources(result)
            .Select(source => new
            {
                Id = source.Snapshot.LimitId ?? source.DictionaryKey ?? "unknown",
                Snapshot = source.Snapshot,
                DisplayName = DisplayName(source.Snapshot.LimitId ?? source.DictionaryKey, source.Snapshot.LimitName),
            })
            .Where(source => source.Snapshot.Primary is not null || source.Snapshot.Secondary is not null)
            .OrderBy(source => string.Equals(source.Id, "codex", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenBy(source => source.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(source => source.Id, StringComparer.OrdinalIgnoreCase);

        var buckets = new List<QuotaBucket>();
        foreach (var source in sources)
        {
            if (source.Snapshot.Primary is { } primary)
            {
                buckets.Add(ProjectWindow(source.Id, source.DisplayName, QuotaWindowKind.Primary, primary));
            }

            if (source.Snapshot.Secondary is { } secondary)
            {
                buckets.Add(ProjectWindow(
                    source.Id,
                    $"{source.DisplayName} 长周期",
                    QuotaWindowKind.Secondary,
                    secondary));
            }
        }

        return new QuotaSnapshot(
            buckets,
            result.RateLimitResetCredits?.AvailableCount,
            refreshedAt);
    }

    private static IEnumerable<(string? DictionaryKey, RateLimitSnapshot Snapshot)> SelectSources(
        GetAccountRateLimitsResult result)
    {
        if (result.RateLimitsByLimitId is { Count: > 0 })
        {
            return result.RateLimitsByLimitId.Select(pair => ((string?)pair.Key, pair.Value));
        }

        return result.RateLimits is null
            ? []
            : [(result.RateLimits.LimitId, result.RateLimits)];
    }

    private static QuotaBucket ProjectWindow(
        string id,
        string displayName,
        QuotaWindowKind kind,
        RateLimitWindow window)
    {
        var remaining = Math.Clamp(100 - window.UsedPercent, 0, 100);
        var tone = remaining < 10
            ? QuotaTone.Critical
            : remaining <= 20 ? QuotaTone.Warning : QuotaTone.Healthy;

        return new QuotaBucket(
            id,
            displayName,
            remaining,
            tone,
            kind,
            window.ResetsAt is { } timestamp ? DateTimeOffset.FromUnixTimeSeconds(timestamp) : null,
            window.WindowDurationMins is { } minutes ? TimeSpan.FromMinutes(minutes) : null);
    }

    private static string DisplayName(string? id, string? serverName)
    {
        if (!string.IsNullOrWhiteSpace(serverName))
        {
            return serverName.Trim();
        }

        if (string.Equals(id, "codex", StringComparison.OrdinalIgnoreCase))
        {
            return "Codex";
        }

        if (string.IsNullOrWhiteSpace(id))
        {
            return "未知额度";
        }

        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(id.Replace('_', ' '));
    }
}
