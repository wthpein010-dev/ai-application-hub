using CodexQuotaBar.Core.Tasks;

namespace CodexQuotaBar.App.Tasks;

public sealed class DesktopTaskCompletionSourceRegistration : IAsyncDisposable
{
    private int _disposed;

    public DesktopTaskCompletionSourceRegistration(ITaskCompletionSource source)
    {
        Source = source ?? throw new ArgumentNullException(nameof(source));
    }

    public ITaskCompletionSource Source { get; }

    public static DesktopTaskCompletionSourceRegistration Create(
        string codexHome,
        TimeProvider? timeProvider = null,
        Action<string>? diagnostic = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(codexHome);
        var watcher = new CodexSessionCompletionWatcher(
            Path.Combine(codexHome, "sessions"),
            timeProvider,
            diagnostic);
        return new DesktopTaskCompletionSourceRegistration(watcher);
    }

    public ValueTask DisposeAsync() =>
        Interlocked.Exchange(ref _disposed, 1) == 0
            ? Source.DisposeAsync()
            : ValueTask.CompletedTask;
}
