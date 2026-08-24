using CodexThreadWorkbench.Confirmation;
using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class MacCodexForegroundSubmitterTests
{
    [Fact]
    public async Task DeepLinkLauncher_UsesUsrBinOpenWithTheExactLink()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(0, string.Empty, string.Empty));
        var launcher = new MacCodexDeepLinkLauncher(runner);
        const string deepLink =
            "codex://threads/thread-123?prompt=%E7%A1%AE%E8%AE%A4";

        await launcher.OpenAsync(deepLink);

        var request = Assert.Single(runner.Requests);
        Assert.Equal("/usr/bin/open", request.FileName);
        Assert.Equal([deepLink], request.Arguments);
    }

    [Fact]
    public async Task SubmitAsync_AllowsReturnOnlyAfterTheOpenAiAppIsVerified()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(0, "OK:com.openai.chat\n", string.Empty));
        var submitter = new MacCodexForegroundSubmitter(runner);

        await submitter.SubmitAsync();

        var request = Assert.Single(runner.Requests);
        Assert.Equal("/usr/bin/osascript", request.FileName);
        Assert.Contains(request.Arguments, argument => argument.Contains("com.openai"));
        Assert.Contains(request.Arguments, argument => argument.Contains("key code 36"));
        Assert.Contains(request.Arguments, argument => argument.Contains("ChatGPT"));
        Assert.Contains(request.Arguments, argument => argument.Contains("Codex"));
    }

    [Fact]
    public async Task SubmitAsync_RequiresTheSameOpenAiAppToRemainForegroundAfterPrefillSettles()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(0, "OK:com.openai.chat\n", string.Empty));
        var submitter = new MacCodexForegroundSubmitter(runner);

        await submitter.SubmitAsync();

        var request = Assert.Single(runner.Requests);
        var script = Assert.Single(request.Arguments, argument => argument.Contains("key code 36"));
        Assert.Contains("set initialBundleId to frontBundleId", script);
        Assert.Contains("delay 0.75", script);
        Assert.Contains("settledBundleId is initialBundleId", script);
        Assert.True(
            script.IndexOf("delay 0.75", StringComparison.Ordinal) <
            script.IndexOf("key code 36", StringComparison.Ordinal));
    }

    [Fact]
    public async Task SubmitAsync_PreservesTheTaskWhenAccessibilityIsDenied()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(
                1,
                string.Empty,
                "System Events got an error: osascript is not allowed assistive access."));
        var submitter = new MacCodexForegroundSubmitter(runner);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => submitter.SubmitAsync());

        Assert.Contains("辅助功能", error.Message);
        Assert.Contains("消息没有提交", error.Message);
    }

    [Fact]
    public async Task SubmitAsync_PreservesTheTaskWhenTheOpenAiAppNeverTakesFocus()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(0, "TIMEOUT\n", string.Empty));
        var submitter = new MacCodexForegroundSubmitter(runner);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => submitter.SubmitAsync());

        Assert.Contains("等待 Codex 桌面窗口超时", error.Message);
        Assert.Contains("消息没有提交", error.Message);
    }

    [Fact]
    public async Task SubmitAsync_RejectsAnUnverifiedSuccessMarker()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(0, "OK:com.example.fake\n", string.Empty));
        var submitter = new MacCodexForegroundSubmitter(runner);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => submitter.SubmitAsync());

        Assert.Contains("未能验证 OpenAI 桌面应用", error.Message);
        Assert.Contains("消息没有提交", error.Message);
    }

    [Fact]
    public async Task Factory_MacFallbackOpensBeforeSubmitting()
    {
        var runner = new RecordingProcessRunner(
            new PlatformProcessResult(0, string.Empty, string.Empty),
            new PlatformProcessResult(0, "OK:com.openai.chat\n", string.Empty));
        var fallback = Assert.IsAssignableFrom<IConfirmationMessageFallback>(
            CodexDesktopMessageFallbackFactory.Create(
                CodexDesktopPlatform.MacOS,
                runner));

        await fallback.SendAsync(
            "thread-123",
            ConfirmationOverlayViewModel.ConfirmationMessage);

        Assert.Collection(
            runner.Requests,
            request => Assert.Equal("/usr/bin/open", request.FileName),
            request => Assert.Equal("/usr/bin/osascript", request.FileName));
    }

    private sealed class RecordingProcessRunner(
        params PlatformProcessResult[] results) : IPlatformProcessRunner
    {
        private readonly Queue<PlatformProcessResult> _results = new(results);

        public List<PlatformProcessRequest> Requests { get; } = [];

        public Task<PlatformProcessResult> RunAsync(
            PlatformProcessRequest request,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Requests.Add(request);
            return Task.FromResult(_results.Dequeue());
        }
    }
}
