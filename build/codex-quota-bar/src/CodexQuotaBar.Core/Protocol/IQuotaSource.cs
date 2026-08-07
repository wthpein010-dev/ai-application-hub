using CodexQuotaBar.Core.Quota;

namespace CodexQuotaBar.Core.Protocol;

public interface IQuotaSource : IAsyncDisposable
{
    event EventHandler<QuotaSnapshot>? SnapshotUpdated;
    event EventHandler? ConnectionStateChanged;

    CodexConnectionState ConnectionState { get; }
    QuotaSnapshot? LastSnapshot { get; }

    Task StartAsync(CancellationToken cancellationToken = default);
    Task RefreshAsync(CancellationToken cancellationToken = default);
}
