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
    private const string FocusChangedMarker = "FOCUS_CHANGED";
    private const string VerifiedPrefix = "OK:com.openai.";
    private const string PrepareSubmissionScript = """
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
                    return "OK:" & settledBundleId
                end if
            end if
            if (current date) is greater than deadline then
                return "TIMEOUT"
            end if
            delay 0.05
        end repeat
        """;
    private const string SubmitPreparedMessageScript = """
        on run argv
            set expectedBundleId to item 1 of argv
            tell application "System Events"
                set frontProcess to first application process whose frontmost is true
                set frontName to name of frontProcess
                try
                    set frontBundleId to bundle identifier of frontProcess
                on error
                    set frontBundleId to ""
                end try
            end tell
            if (frontName is "ChatGPT" or frontName is "Codex") and frontBundleId is expectedBundleId and frontBundleId starts with "com.openai." then
                tell application "System Events" to key code 36
                return "OK:" & frontBundleId
            end if
            return "FOCUS_CHANGED"
        end run
        """;

    public async Task SubmitAsync(CancellationToken cancellationToken = default)
    {
        await SubmitIfCurrentAsync(
            _ => Task.FromResult(true),
            cancellationToken);
    }

    public async Task<bool> SubmitIfCurrentAsync(
        Func<CancellationToken, Task<bool>> isCurrentAsync,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(isCurrentAsync);
        var prepared = await processRunner.RunAsync(
            new PlatformProcessRequest(
                "/usr/bin/osascript",
                ["-e", PrepareSubmissionScript],
                SubmissionTimeout),
            cancellationToken);
        ValidateProcessResult(prepared);
        var marker = prepared.StandardOutput.Trim();
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

        if (!await isCurrentAsync(cancellationToken))
        {
            return false;
        }

        var bundleId = marker["OK:".Length..];
        var submitted = await processRunner.RunAsync(
            new PlatformProcessRequest(
                "/usr/bin/osascript",
                ["-e", SubmitPreparedMessageScript, bundleId],
                SubmissionTimeout),
            cancellationToken);
        ValidateProcessResult(submitted);
        var submissionMarker = submitted.StandardOutput.Trim();
        if (string.Equals(
                submissionMarker,
                FocusChangedMarker,
                StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Codex 桌面窗口在提交前失去焦点，消息没有提交。请重试。");
        }

        if (!string.Equals(submissionMarker, marker, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "未能验证 OpenAI 桌面应用，消息没有提交。请重试。");
        }

        return true;
    }

    private static void ValidateProcessResult(PlatformProcessResult result)
    {
        if (result.ExitCode == 0)
        {
            return;
        }

        throw new InvalidOperationException(
            "无法提交消息；请在系统设置 → 隐私与安全性 → 辅助功能中允许" +
            "“Codex 待确认悬浮助手”后重试。消息没有提交。" +
            FormatDetail(result.StandardError));
    }

    private static string FormatDetail(string value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : $" {value.Trim()}";
}
