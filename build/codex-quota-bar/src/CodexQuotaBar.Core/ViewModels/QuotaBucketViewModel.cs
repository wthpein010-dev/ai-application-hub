using CommunityToolkit.Mvvm.ComponentModel;
using CodexQuotaBar.Core.Quota;

namespace CodexQuotaBar.Core.ViewModels;

public sealed partial class QuotaBucketViewModel : ObservableObject
{
    private readonly DateTimeOffset? _resetsAt;

    public QuotaBucketViewModel(QuotaBucket bucket, DateTimeOffset now)
    {
        Id = bucket.Id;
        DisplayName = bucket.DisplayName;
        RemainingPercent = bucket.RemainingPercent;
        Tone = bucket.Tone;
        WindowKind = bucket.WindowKind;
        _resetsAt = bucket.ResetsAt;
        ResetText = FormatResetText(_resetsAt, now);
    }

    public string Id { get; }
    public string DisplayName { get; }
    public int RemainingPercent { get; }
    public QuotaTone Tone { get; }
    public QuotaWindowKind WindowKind { get; }

    [ObservableProperty]
    private string _resetText = string.Empty;

    public void RefreshCountdown(DateTimeOffset now) => ResetText = FormatResetText(_resetsAt, now);

    private static string FormatResetText(DateTimeOffset? resetsAt, DateTimeOffset now)
    {
        if (resetsAt is null)
        {
            return "重置时间未知";
        }

        var remaining = resetsAt.Value - now;
        if (remaining <= TimeSpan.Zero)
        {
            return "即将重置";
        }

        if (remaining.TotalDays >= 1)
        {
            return $"{(int)remaining.TotalDays}天{remaining.Hours}小时后重置";
        }

        if (remaining.TotalHours >= 1)
        {
            return $"{(int)remaining.TotalHours}小时后重置";
        }

        return $"{Math.Max(1, (int)Math.Ceiling(remaining.TotalMinutes))}分钟后重置";
    }
}
