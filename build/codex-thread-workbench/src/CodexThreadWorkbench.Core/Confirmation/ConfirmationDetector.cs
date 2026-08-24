using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Confirmation;

public sealed class ConfirmationDetector
{
    private static readonly string[] UserActionSignals =
    [
        "请确认",
        "回复确认",
        "如果你确认",
        "你确认",
        "确认这个",
        "如果认可",
        "请审阅",
        "是否按",
        "等你确认",
        "等待确认",
        "需要我继续吗",
        "是否继续",
        "要我继续吗",
        "要不要继续",
        "请选择",
        "请提供",
        "请告诉我",
        "请回复",
        "需要你确认",
        "需要你选择",
        "需要你提供",
        "please confirm",
        "reply confirm",
        "please review",
        "please choose",
        "please select",
        "please provide",
        "please reply",
        "should i continue",
        "shall i continue",
        "would you like me to continue",
        "do you want me to continue",
        "need your confirmation",
        "need your input",
        "need your choice"
    ];

    public ConfirmationCandidate? Detect(ThreadCardState state)
    {
        if (state.Status is not (
                ThreadStatusKind.Idle or
                ThreadStatusKind.Completed or
                ThreadStatusKind.Interrupted) ||
            state.LatestTurnStatus is not (
                ThreadStatusKind.Completed or
                ThreadStatusKind.Interrupted) ||
            IsAutomationThread(state.Summary))
        {
            return null;
        }

        var lastMessage = state.Messages.LastOrDefault();
        if (lastMessage is null ||
            lastMessage.Role != ChatRole.Assistant)
        {
            return null;
        }

        if (state.LatestTurnStatus != ThreadStatusKind.Interrupted &&
            !ContainsAny(lastMessage.Text, UserActionSignals))
        {
            return null;
        }

        return new ConfirmationCandidate(
            state.Summary.Id,
            state.Summary.Title,
            lastMessage.Id,
            CreatePreview(lastMessage.Text),
            state.Summary.UpdatedAt);
    }

    private static bool ContainsAny(string value, IEnumerable<string> signals) =>
        signals.Any(signal => value.Contains(signal, StringComparison.OrdinalIgnoreCase));

    private static bool IsAutomationThread(ThreadSummary summary)
    {
        var directoryName = summary.WorkingDirectory
            .TrimEnd('\\', '/')
            .Split('\\', '/')
            .LastOrDefault();
        return string.Equals(
                   directoryName,
                   "自动化",
                   StringComparison.OrdinalIgnoreCase) ||
               summary.Preview.TrimStart().StartsWith(
                   "Automation:",
                   StringComparison.OrdinalIgnoreCase);
    }

    private static string CreatePreview(string value)
    {
        var normalized = string.Join(
            ' ',
            value.Split(
                (char[]?)null,
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        return normalized.Length <= 140
            ? normalized
            : normalized[..139] + "…";
    }
}
