using System.Text.Json;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Quota;

namespace CodexQuotaBar.Tests.Quota;

public sealed class QuotaProjectorTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 16, 10, 0, 0, TimeSpan.FromHours(8));

    [Fact]
    public void Project_prefers_multi_bucket_data_and_keeps_reset_credits()
    {
        var result = Deserialize("""
            {
              "rateLimits": {
                "limitId": "legacy",
                "primary": { "usedPercent": 90, "resetsAt": 1784681394, "windowDurationMins": 10080 }
              },
              "rateLimitsByLimitId": {
                "codex_bengalfox": {
                  "limitId": "codex_bengalfox",
                  "limitName": "GPT-5.3-Codex-Spark",
                  "primary": { "usedPercent": 0, "resetsAt": 1784770939, "windowDurationMins": 10080 }
                },
                "codex": {
                  "limitId": "codex",
                  "primary": { "usedPercent": 33, "resetsAt": 1784681394, "windowDurationMins": 10080 }
                }
              },
              "rateLimitResetCredits": { "availableCount": 5 }
            }
            """);

        var snapshot = QuotaProjector.Project(result, Now);

        Assert.Equal(5, snapshot.AvailableResetCredits);
        Assert.Collection(
            snapshot.Buckets,
            codex =>
            {
                Assert.Equal("codex", codex.Id);
                Assert.Equal("Codex", codex.DisplayName);
                Assert.Equal(67, codex.RemainingPercent);
                Assert.Equal(QuotaTone.Healthy, codex.Tone);
                Assert.Equal(QuotaWindowKind.Primary, codex.WindowKind);
            },
            spark =>
            {
                Assert.Equal("codex_bengalfox", spark.Id);
                Assert.Equal("GPT-5.3-Codex-Spark", spark.DisplayName);
                Assert.Equal(100, spark.RemainingPercent);
            });
    }

    [Theory]
    [InlineData(84, 16, QuotaTone.Warning)]
    [InlineData(90, 10, QuotaTone.Warning)]
    [InlineData(91, 9, QuotaTone.Critical)]
    [InlineData(130, 0, QuotaTone.Critical)]
    [InlineData(-5, 100, QuotaTone.Healthy)]
    public void Project_clamps_percentages_and_assigns_tones(int usedPercent, int remaining, QuotaTone tone)
    {
        var result = Deserialize($$"""
            {
              "rateLimits": {
                "limitId": "codex",
                "primary": { "usedPercent": {{usedPercent}}, "resetsAt": null, "windowDurationMins": 300 }
              }
            }
            """);

        var bucket = Assert.Single(QuotaProjector.Project(result, Now).Buckets);

        Assert.Equal(remaining, bucket.RemainingPercent);
        Assert.Equal(tone, bucket.Tone);
    }

    [Fact]
    public void Project_falls_back_to_legacy_and_projects_secondary_window()
    {
        var result = Deserialize("""
            {
              "rateLimits": {
                "limitId": "codex",
                "limitName": null,
                "primary": { "usedPercent": 20, "resetsAt": 1784681394, "windowDurationMins": 300 },
                "secondary": { "usedPercent": 40, "resetsAt": 1785000000, "windowDurationMins": 10080 }
              }
            }
            """);

        var snapshot = QuotaProjector.Project(result, Now);

        Assert.Collection(
            snapshot.Buckets,
            primary =>
            {
                Assert.Equal(QuotaWindowKind.Primary, primary.WindowKind);
                Assert.Equal("Codex", primary.DisplayName);
            },
            secondary =>
            {
                Assert.Equal(QuotaWindowKind.Secondary, secondary.WindowKind);
                Assert.Equal("Codex 长周期", secondary.DisplayName);
                Assert.Equal(60, secondary.RemainingPercent);
            });
    }

    [Fact]
    public void Project_skips_buckets_without_windows()
    {
        var result = Deserialize("""
            {
              "rateLimitsByLimitId": {
                "broken": { "limitId": "broken", "primary": null, "secondary": null },
                "healthy": { "limitId": "healthy", "primary": { "usedPercent": 25 } }
              },
              "rateLimits": null
            }
            """);

        var bucket = Assert.Single(QuotaProjector.Project(result, Now).Buckets);

        Assert.Equal("healthy", bucket.Id);
    }

    private static GetAccountRateLimitsResult Deserialize(string json) =>
        JsonSerializer.Deserialize<GetAccountRateLimitsResult>(json, RateLimitJson.Options)
        ?? throw new InvalidOperationException("Test payload failed to deserialize.");
}
