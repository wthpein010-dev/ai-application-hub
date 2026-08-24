namespace CodexThreadWorkbench.Confirmation;

public interface IConfirmationMessageFallback
{
    Task SendAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default);
}
