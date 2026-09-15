using System.Text;
using System.Text.RegularExpressions;

namespace CodexThreadWorkbench.Confirmation;

internal static class ConfirmationMessageContent
{
    private static readonly Regex Heading = new(
        @"^(?:(?<level>#{1,6})\s+(?<title>.+)|\*\*(?<title>[^*]+)\*\*\s*[：:]?)$",
        RegexOptions.CultureInvariant);
    private static readonly Regex DocumentQuestionSection = new(
        @"面试(?:题|问题)|(?:考试|测试|练习)题|题库|问卷|常见问题|问答示例|问题示例|" +
        @"(?:可以|可)(?:直接)?问的问题|\b(?:FAQ|interview questions|sample questions|questionnaire)\b",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex InlineCode = new(@"`+[^`\r\n]*`+", RegexOptions.CultureInvariant);
    private static readonly Regex AnsweredQuestion = new(
        @"[^。！!？?\r\n]*[？?][\s*_'“”]*" +
        @"(?=(?:Yes|No|With fixes|Not yet|Answer\s*:|Reasoning\s*:)\b|" +
        @"(?:是|不是|已完成|没有|答案|回答)[，。！!：:\s])",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex NarratedRequest = new(
        @"(?:需要|要求|等待)(?:你|您)(?:确认|选择|回复|审核|批准|提供)" +
        @"[^。！!？?；;，,\r\n]{0,80}的(?:任务|消息|内容|请求|会话|线程|问题)" +
        @"(?=(?:仍|还|都|就|才)?(?:会|将|能|可以|支持|显示|进入|提醒|触发|出现|保留))",
        RegexOptions.CultureInvariant);
    private static readonly Regex NegatedRequest = new(
        @"(?:不再需要|不需要|无需|不用|不必|请勿|不要)(?:再)?(?:你|您)?(?:再)?" +
        @"(?:回复确认|确认|回复|选择|审核|审阅|批准|提供)" +
        @"(?:(?!(?:但|不过|然而|可是|而是|请|麻烦))[^。！!？?；;，,\r\n])*",
        RegexOptions.CultureInvariant);

    public static string RemoveDocumentContent(string value)
    {
        var result = new StringBuilder();
        char? fence = null;
        var skippedHeadingLevel = 0;
        foreach (var rawLine in value.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.StartsWith("```", StringComparison.Ordinal) ||
                line.StartsWith("~~~", StringComparison.Ordinal))
            {
                if (fence is null)
                {
                    fence = line[0];
                }
                else if (fence == line[0])
                {
                    fence = null;
                }

                result.AppendLine();
                continue;
            }

            if (fence is not null || line.StartsWith('>'))
            {
                continue;
            }

            var heading = Heading.Match(line);
            if (heading.Success)
            {
                var level = heading.Groups["level"].Success
                    ? heading.Groups["level"].Length
                    : 1;
                if (skippedHeadingLevel != 0 && level <= skippedHeadingLevel)
                {
                    skippedHeadingLevel = 0;
                }

                if (DocumentQuestionSection.IsMatch(heading.Groups["title"].Value))
                {
                    skippedHeadingLevel = skippedHeadingLevel == 0
                        ? level
                        : skippedHeadingLevel;
                }
            }

            if (skippedHeadingLevel == 0)
            {
                result.AppendLine(InlineCode.Replace(rawLine, string.Empty));
            }
        }

        // A description of which tasks need input, or an explicit no-input statement,
        // must not become a request merely because it contains the same action words.
        var actionableText = NarratedRequest.Replace(result.ToString(), string.Empty);
        actionableText = NegatedRequest.Replace(actionableText, string.Empty);
        return AnsweredQuestion.Replace(actionableText, string.Empty);
    }
}
