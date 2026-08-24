namespace CodexThreadWorkbench;

public sealed class MacCodexDeepLinkLauncher(
    IPlatformProcessRunner processRunner) : ICodexDeepLinkLauncher
{
    private static readonly TimeSpan OpenTimeout = TimeSpan.FromSeconds(5);

    public async Task OpenAsync(
        string deepLink,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(deepLink);
        var result = await processRunner.RunAsync(
            new PlatformProcessRequest(
                "/usr/bin/open",
                [deepLink],
                OpenTimeout),
            cancellationToken);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(
                "无法打开 Codex 对应任务，消息没有提交。" +
                FormatDetail(result.StandardError));
        }
    }

    private static string FormatDetail(string value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : $" {value.Trim()}";
}

public sealed class MacCodexForegroundSubmitter(
    IPlatformProcessRunner processRunner) : ICodexForegroundSubmitter
{
    private static readonly TimeSpan SubmissionTimeout = TimeSpan.FromSeconds(8);
    private const string TimeoutMarker = "TIMEOUT";
    private const string VerifiedPrefix = "OK:com.openai.";
    private const string SubmissionScript = """
        set deadline to (current date) + 6
        repeat
            tell application "System Events"
                set frontProcess to first application process whose frontmost is true
                set frontName to name of frontProcess
                try
                    set frontBundleId to bundle identifier of frontProcess
                on error
                    set frontBundleId to ""
                end try
            end tell
            if (frontName is "ChatGPT" or frontName is "Codex") and frontBundleId starts with "com.openai." then
                set initialBundleId to frontBundleId
                delay 0.75
                tell application "System Events"
                    set settledProcess to first application process whose frontmost is true
                    set settledName to name of settledProcess
                    try
                        set settledBundleId to bundle identifier of settledProcess
                    on error
                        set settledBundleId to ""
                    end try
                end tell
                if (settledName is "ChatGPT" or settledName is "Codex") and settledBundleId is initialBundleId and settledBundleId starts with "com.openai." then
                    tell application "System Events" to key code 36
                    return "OK:" & settledBundleId
                end if
            end if
            if (current date) is greater than deadline then
                return "TIMEOUT"
            end if
            delay 0.05
        end repeat
        """;

    public async Task SubmitAsync(CancellationToken cancellationToken = default)
    {
        var result = await processRunner.RunAsync(
            new PlatformProcessRequest(
                "/usr/bin/osascript",
                ["-e", SubmissionScript],
                SubmissionTimeout),
            cancellationToken);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(
                "无法提交消息；请在系统设置 → 隐私与安全性 → 辅助功能中允许" +
                "“Codex 待确认悬浮助手”后重试。消息没有提交。" +
                FormatDetail(result.StandardError));
        }

        var marker = result.StandardOutput.Trim();
        if (string.Equals(marker, TimeoutMarker, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "等待 Codex 桌面窗口超时，消息没有提交。请确认 Codex 已安装后重试。");
        }

        if (!marker.StartsWith(VerifiedPrefix, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "未能验证 OpenAI 桌面应用，消息没有提交。请重试。");
        }
    }

    private static string FormatDetail(string value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : $" {value.Trim()}";
}
