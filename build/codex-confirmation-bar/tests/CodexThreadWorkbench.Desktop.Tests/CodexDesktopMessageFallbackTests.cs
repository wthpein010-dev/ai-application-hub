using CodexThreadWorkbench.Presentation;

namespace CodexThreadWorkbench.Desktop.Tests;

public sealed class CodexDesktopMessageFallbackTests
{
    [Fact]
    public async Task SendAsync_OpensExactThreadPromptBeforeSubmitting()
    {
        var order = new List<string>();
        var launcher = new RecordingLauncher(order);
        var submitter = new RecordingSubmitter(order);
        var fallback = new CodexDesktopMessageFallback(launcher, submitter);

        await fallback.SendAsync(
            "019f7444-4d4d-7771-9864-0043606d7f78",
            ConfirmationOverlayViewModel.ConfirmationMessage);

        Assert.Equal(
            [
                "open:codex://threads/019f7444-4d4d-7771-9864-0043606d7f78?prompt=%E7%A1%AE%E8%AE%A4%EF%BC%8C%E7%BB%A7%E7%BB%AD%E5%BC%80%E5%A7%8B%E5%81%9A%EF%BC%8C%E5%AE%8C%E6%88%90%E5%89%8D%E4%B8%8D%E8%A6%81%E5%81%9C%E3%80%82",
                "submit"
            ],
            order);
    }

    private sealed class RecordingLauncher(List<string> order) : ICodexDeepLinkLauncher
    {
        public Task OpenAsync(
            string deepLink,
            CancellationToken cancellationToken = default)
        {
            order.Add($"open:{deepLink}");
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingSubmitter(List<string> order) : ICodexForegroundSubmitter
    {
        public Task SubmitAsync(CancellationToken cancellationToken = default)
        {
            order.Add("submit");
            return Task.CompletedTask;
        }
    }
}
