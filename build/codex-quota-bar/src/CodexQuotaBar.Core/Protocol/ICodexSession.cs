using System.Text.Json;

namespace CodexQuotaBar.Core.Protocol;

public interface ICodexSession : IAsyncDisposable
{
    event EventHandler<RpcNotification>? NotificationReceived;

    Task Completion { get; }

    Task<JsonElement> SendRequestAsync(
        string method,
        object? parameters,
        CancellationToken cancellationToken = default);

    Task SendNotificationAsync(
        string method,
        object? parameters,
        CancellationToken cancellationToken = default);
}

public interface ICodexSessionFactory
{
    Task<ICodexSession> StartAsync(string executablePath, CancellationToken cancellationToken);
}
