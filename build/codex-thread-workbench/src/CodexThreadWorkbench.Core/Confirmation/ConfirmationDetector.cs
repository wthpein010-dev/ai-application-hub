using CodexThreadWorkbench.Models;
using System.Text.RegularExpressions;

namespace CodexThreadWorkbench.Confirmation;

public sealed class ConfirmationDetector
{
    private static readonly Regex ConfirmationQuestionPattern = new(
        @"确认[^。！!\r\n]{0,24}(?:吗|么|？|\?)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex NeedConfirmationPromptPattern = new(
        @"(?<!不)需要确认\s*[：:]",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex ProposalApprovalQuestionPattern = new(
        @"(?:(?:可以|可行|合适|行得通|没问题|行)(?:吗|么|呢)?|行不行)[？?]\s*$|" +
        @"(?:可以|可行|合适|行得通|没问题|行)(?:吗|么|呢)\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex ImmediateActionQuestionPattern = new(
        @"(?:^|[。！!；;，,:：\r\n])\s*(?:" +
        @"(?:要不要|是否要)" + ImmediateActionModifierPattern +
        ImmediateActionObjectPattern + ImmediateActionVerbPattern +
        @"[^。！!；;\r\n？?]{0,20}[？?]|" +
        @"(?:要|需要)" + ImmediateActionModifierPattern +
        ImmediateActionObjectPattern + ImmediateActionVerbPattern +
        @"[^。！!；;\r\n？?]{0,20}(?:吗|么)[？?]?" +
        @")\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private const string ImmediateActionModifierPattern =
        @"(?:(?:我|现在|马上|立即|直接|就|先|再|重新|帮你|为你)\s*)*";
    private const string ImmediateActionObjectPattern =
        @"(?:(?:把|将|在|到)[^。！!；;\r\n？?]{1,12})?";
    private const string ImmediateActionVerbPattern =
        @"(?:打开|启动|开始|继续|生成|执行|制作|开发|实现|构建|发布|运行|" +
        @"展示|预览|写入|处理|修改|创建|导出|播放|安装|更新|切换|提交|" +
        @"发送|下载|上传|保存|做)";
    private static readonly Regex ImplementationStartQuestionPattern = new(
        @"(?:按|照|依照|按照)[^。！!\r\n]{0,32}(?:开始|直接|着手)" +
        @"[^。！!\r\n？?]{0,16}(?:吗|么|呢)[？?]?\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex DeferredImplementationPromptPattern = new(
        @"(?<!已)(?<!已经)(?:确认|认可|同意)[^。！!\r\n]{0,32}(?:后|之后)" +
        @"[，,\s]*(?:我)?(?:立即|马上|随即|就|会|将|再)" +
        @"[^。！!\r\n]{0,12}(?:开始|实现|开发|制作|构建|写入|处理|修改|执行)" +
        @"[^。！!\r\n]{0,32}[。！!]?\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex QuotedExamplePattern = new(
        @"“[^”\r\n]*”",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly string[] QuotedExampleContextSignals =
    [
        "补充",
        "覆盖",
        "用例",
        "测试",
        "检测",
        "识别",
        "规则",
        "表达",
        "关键词",
        "文案",
        "误报",
        "漏检"
    ];
    private static readonly Regex ReportedQuestionContextPattern = new(
        @"(?:如下|原文|引用|示例|文案|用例|规则|回复|内容|输出|日志|记录|" +
        @"文本|消息|提示词)\s*[：:]?\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
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

    private static readonly string[] DeferredContinuationSignals =
    [
        "下次继续时",
        "下回继续时"
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
            !RequestsUserAction(lastMessage.Text))
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

    private static bool RequestsUserAction(string value)
    {
        var actionableText = QuotedExamplePattern.Replace(
            value,
            match => IsQuotedExample(value, match.Index)
                ? string.Empty
                : match.Value);
        return ContainsAny(actionableText, UserActionSignals) ||
               ContainsAny(actionableText, DeferredContinuationSignals) ||
               ConfirmationQuestionPattern.IsMatch(actionableText) ||
               NeedConfirmationPromptPattern.IsMatch(actionableText) ||
               ProposalApprovalQuestionPattern.IsMatch(actionableText) ||
               IsImmediateActionQuestion(actionableText) ||
               ImplementationStartQuestionPattern.IsMatch(actionableText) ||
               DeferredImplementationPromptPattern.IsMatch(actionableText);
    }

    private static bool IsImmediateActionQuestion(string value)
    {
        var match = ImmediateActionQuestionPattern.Match(value);
        if (!match.Success)
        {
            return false;
        }

        var contextStart = match.Index == 0
            ? 0
            : value.LastIndexOfAny(
                ['。', '！', '!', '；', ';', '\r', '\n'],
                match.Index - 1) + 1;
        var context = value[contextStart..match.Index];
        return !ReportedQuestionContextPattern.IsMatch(context);
    }

    private static bool IsQuotedExample(string value, int matchIndex)
    {
        var lineStart = value.LastIndexOf('\n', matchIndex);
        lineStart = lineStart < 0 ? 0 : lineStart + 1;
        var lineEnd = value.IndexOf('\n', matchIndex);
        lineEnd = lineEnd < 0 ? value.Length : lineEnd;
        return ContainsAny(
            value[lineStart..lineEnd],
            QuotedExampleContextSignals);
    }

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
