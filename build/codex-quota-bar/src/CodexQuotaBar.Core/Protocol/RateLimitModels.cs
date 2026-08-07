using System.Text.Json;
using System.Text.Json.Serialization;

namespace CodexQuotaBar.Core.Protocol;

public static class RateLimitJson
{
    public static JsonSerializerOptions Options { get; } = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}

public sealed record GetAccountRateLimitsResult
{
    [JsonPropertyName("rateLimits")]
    public RateLimitSnapshot? RateLimits { get; init; }

    [JsonPropertyName("rateLimitsByLimitId")]
    public Dictionary<string, RateLimitSnapshot>? RateLimitsByLimitId { get; init; }

    [JsonPropertyName("rateLimitResetCredits")]
    public RateLimitResetCreditsSummary? RateLimitResetCredits { get; init; }
}

public sealed record RateLimitSnapshot
{
    [JsonPropertyName("limitId")]
    public string? LimitId { get; init; }

    [JsonPropertyName("limitName")]
    public string? LimitName { get; init; }

    [JsonPropertyName("primary")]
    public RateLimitWindow? Primary { get; init; }

    [JsonPropertyName("secondary")]
    public RateLimitWindow? Secondary { get; init; }
}

public sealed record RateLimitWindow
{
    [JsonPropertyName("usedPercent")]
    public int UsedPercent { get; init; }

    [JsonPropertyName("resetsAt")]
    public long? ResetsAt { get; init; }

    [JsonPropertyName("windowDurationMins")]
    public long? WindowDurationMins { get; init; }
}

public sealed record RateLimitResetCreditsSummary
{
    [JsonPropertyName("availableCount")]
    public int AvailableCount { get; init; }
}
