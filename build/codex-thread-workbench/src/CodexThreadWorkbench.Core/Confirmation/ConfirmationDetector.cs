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
    private static readonly Regex UserResponseRequestPattern = new(
        @"(?:请|请你|麻烦(?:你)?|需要你|等你)\s*" +
        @"(?:审核|审查|审阅|校对|确认|批准|选择|回复|答复|告知|提供|说明)" +
        @"[^。！!\r\n]{0,80}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex DirectConfirmationPromptPattern = new(
        @"(?:^|[。！!；;，,:：\r\n])\s*(?:(?:[-*+]|\d+[.)])\s+)?[*_]*" +
        @"(?:(?:接下来|下一步|现在|然后|接着)\s*)?" +
        @"(?:(?:你|您)\s*确认|确认(?:这(?:个|份|版)|一下))[^。！!\r\n]{0,80}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex UserQuestionPattern = new(
        @"(?<question>[^。！!；;\r\n]{1,240}(?:？|\?))",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex UserChoicePromptPattern = new(
        @"(?:你|您)(?:想|希望|要|更倾向于|偏好)[^。！!\r\n]{0,120}" +
        @"(?:还是|或(?:者)?|or)[^。！!\r\n]{0,120}\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex EnglishUserResponseRequestPattern = new(
        @"(?:^|[。！!；;，,:：\r\n])\s*(?:" +
        @"please\s+(?:review|approve|confirm|choose|select|reply|respond|provide|" +
        @"specify|share|clarify|describe|explain|decide|pick)\b|" +
        @"(?:review|approve|confirm)\s+(?!(?:is|was|were|are|has|have|had|already|" +
        @"completed|complete|finished|sent|passed|done|successful(?:ly)?)\b|" +
        @"(?:results?|summary|report|status)\s+(?:is|was|were|are|has|have|had)\b)\S+|" +
        @"(?:choose|select|pick|decide)\b|" +
        @"(?:provide|specify|share|clarify|describe|explain)\s+\S|" +
        @"(?:reply|respond)\s+(?:with|yes|no|confirm(?:ation)?\b|to\s+" +
        @"(?![^。！!？?\r\n]*(?:\b(?:is|was|were|are|has|have|had)\s+" +
        @"(?:sent|delivered|completed|posted|finished)\b)))|" +
        @"(?:tell\s+me|let\s+me\s+know)\b)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex EnglishUserInputNeededPattern = new(
        @"(?:^|[。！!；;，,:：\r\n])\s*(?:(?:(?:we|i)\s+)?" +
        @"(?:need|require|await|wait\s+for)|(?:(?:we|i)\s+are\s+)?awaiting)\s+(?:your\s+)?" +
        @"(?:approval|confirmation|input|choice|decision|response|reply)\b|" +
        @"(?:^|[。！!；;，,:：\r\n])\s*(?:we|i)\s+need\s+you\s+to\s+" +
        @"(?:review|approve|confirm|choose|select|reply|respond|provide|specify)\b|" +
        @"(?:^|[。！!；;，,:：\r\n])\s*(?:your\s+)?" +
        @"(?:approval|confirmation|input|choice|decision|response|reply)\s+" +
        @"(?:is\s+)?(?:required|needed)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex UrlPattern = new(
        @"(?:https?|file)://[^\s]+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex QuotedExamplePattern = new(
        @"(?:“[^”\r\n]*”|‘[^’\r\n]*’|""[^""\r\n]*""|'[^'\r\n]*')",
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
        "漏检",
        "报告",
        "原文",
        "引用",
        "日志",
        "内容",
        "输出",
        "记录",
        "文本",
        "消息",
        "提示词"
    ];
    private static readonly Regex EnglishQuotedExampleContextPattern = new(
        @"\b(?:report|original(?:\s+text)?|quoted(?:\s+text)?|example|test(?:\s+case)?|" +
        @"log(?:\s+output)?|output|content|message|prompt|reply)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex ReportedLinePattern = new(
        @"^[ \t]*(?:(?:>[ \t]*)+|[-*+][ \t]+|\d+[.)][ \t]+)?" +
        @"(?:报告(?:原文|内容|结果|示例|回复|文本|消息|如下)?|" +
        @"测试(?:报告(?:如下)?|用例|示例)?|检测(?:结果|报告|示例)?|日志(?:输出|内容)?|输出|记录|" +
        @"(?:以下是)?(?:原文|引用|示例|文案|用例|规则|回复|内容|文本|消息|提示词)|" +
        @"report(?:[ \t]+(?:original(?:[ \t]+text)?|content|result|example|reply|text|message|below))?|" +
        @"test(?:[ \t]+(?:case|report|example))?|log(?:[ \t]+output)?|output|record|" +
        @"original(?:[ \t]+text)?|quoted(?:[ \t]+text)?|example|copy|rule|reply|content|text|message|prompt)" +
        @"[ \t]*[：:][ \t]*[^\r\n]*(?:\r?\n|$)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Multiline);
    // A normal test report ends at a paragraph/heading boundary. Explicit original
    // text and examples below remain opaque, including their internal paragraphs.
    private static readonly Regex TestReportBlockPattern = new(
        @"^[ \t]*(?:测试报告(?:如下)?|test[ \t]+report)[ \t]*[：:][ \t]*" +
        @"[^\r\n]*(?:\r?\n(?![ \t]*(?:\r?$|#{1,6}[ \t]))[^\r\n]+)*",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Multiline);
    private static readonly Regex ReportedExampleBlockPattern = new(
        @"^[ \t]*(?:(?:>[ \t]*)+|[-*+][ \t]+|\d+[.)][ \t]+)?" +
        @"(?:报告(?:原文|内容|示例|回复|文本|消息|如下)|测试(?:用例|示例)?|" +
        @"检测(?:报告|示例)?|日志(?:输出|内容)?|输出|记录|" +
        @"(?:以下是)?(?:原文|引用|示例|文案|用例|规则|回复|内容|文本|消息|提示词)|" +
        @"report[ \t]+(?:original(?:[ \t]+text)?|content|example|reply|text|message|below)|" +
        @"test(?:[ \t]+(?:case|example))?|log(?:[ \t]+output)?|output|record|" +
        @"original(?:[ \t]+text)?|quoted(?:[ \t]+text)?|example|copy|rule|reply|content|text|message|prompt)" +
        @"[ \t]*[：:][ \t]*(?:[^\r\n]+(?:\r?\n|$)|\r?\n[\s\S]*\z|$)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Multiline);
    private static readonly Regex ReportedQuestionContextPattern = new(
        @"(?:如下|原文|引用|示例|文案|用例|规则|回复|内容|输出|日志|记录|" +
        @"文本|消息|提示词)\s*[：:]?\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex ReportedQuestionPattern = new(
        @"(?:如下|原文|引用|示例|文案|用例|规则|回复|内容|输出|日志|记录|" +
        @"文本|消息|提示词)\s*[：:]\s*[^。！!；;\r\n]*[？?]",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly string[] UserActionSignals =
    [
        "请确认",
        "回复确认",
        "如果你确认",
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
        "下回继续时",
        "等待继续"
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
            state.Summary.IsSubAgent ||
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

        if (!RequestsUserAction(lastMessage.Text))
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
        var actionableText = RemoveNonActionableText(value);
        return ContainsAny(actionableText, UserActionSignals) ||
               ContainsAny(actionableText, DeferredContinuationSignals) ||
               ConfirmationQuestionPattern.IsMatch(actionableText) ||
               NeedConfirmationPromptPattern.IsMatch(actionableText) ||
               ProposalApprovalQuestionPattern.IsMatch(actionableText) ||
               IsImmediateActionQuestion(actionableText) ||
               ImplementationStartQuestionPattern.IsMatch(actionableText) ||
               DeferredImplementationPromptPattern.IsMatch(actionableText) ||
               UserResponseRequestPattern.IsMatch(actionableText) ||
               DirectConfirmationPromptPattern.IsMatch(actionableText) ||
               UserChoicePromptPattern.IsMatch(actionableText) ||
               EnglishUserResponseRequestPattern.IsMatch(actionableText) ||
               EnglishUserInputNeededPattern.IsMatch(actionableText) ||
               ContainsUserDirectedQuestion(actionableText);
    }

    private static string RemoveNonActionableText(string value)
    {
        var textWithoutUrls = UrlPattern.Replace(
            ConfirmationMessageContent.RemoveDocumentContent(value), string.Empty);
        var textWithoutReportedExamples = ReportedExampleBlockPattern.Replace(
            TestReportBlockPattern.Replace(textWithoutUrls, string.Empty),
            string.Empty);
        var textWithoutReportedLines = ReportedLinePattern.Replace(
            textWithoutReportedExamples,
            string.Empty);
        return QuotedExamplePattern.Replace(
            textWithoutReportedLines,
            match => IsQuotedExample(textWithoutReportedLines, match.Index)
                ? string.Empty
                : match.Value);
    }

    private static bool ContainsUserDirectedQuestion(string value)
    {
        foreach (Match match in UserQuestionPattern.Matches(value))
        {
            // An answered question or a question embedded in a delivered report is not
            // an outstanding request. Explicit requests are handled independently above.
            var remainder = value[(match.Index + match.Length)..]
                .Trim(' ', '\t', '\r', '\n', '*', '_', '”', '’', '\'', '"');
            if (!ReportedQuestionPattern.IsMatch(match.Value) &&
                !IsReportedQuestion(value, match.Index) &&
                remainder.Length == 0)
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsReportedQuestion(string value, int questionIndex)
    {
        var contextStart = questionIndex == 0
            ? 0
            : value.LastIndexOfAny(['。', '！', '!', '；', ';'], questionIndex - 1) + 1;
        return ReportedQuestionContextPattern.IsMatch(
            value[contextStart..questionIndex]);
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
        var line = value[lineStart..lineEnd];
        return ContainsAny(line, QuotedExampleContextSignals) ||
               EnglishQuotedExampleContextPattern.IsMatch(line);
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
