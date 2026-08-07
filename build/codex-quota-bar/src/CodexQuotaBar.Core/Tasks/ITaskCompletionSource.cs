namespace CodexQuotaBar.Core.Tasks;

public interface ITaskCompletionSource : IAsyncDisposable
{
    event EventHandler<CodexTaskCompletion>? TaskCompleted;

    Task StartAsync(CancellationToken cancellationToken = default);
}
