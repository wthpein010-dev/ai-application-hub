namespace CodexThreadWorkbench.Confirmation;

public interface IConfirmationMessageFallback
{
    Task SendAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default);

    async Task<bool> SendIfCurrentAsync(
        string threadId,
        string text,
        Func<CancellationToken, Task<bool>> isCurrentAsync,
        CancellationToken cancellationToken = default)
    {
        await SendAsync(threadId, text, cancellationToken);
        return true;
    }
}
