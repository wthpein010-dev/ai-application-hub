using CodexThreadWorkbench.Codex;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Confirmation;

public interface IConfirmationThreadReader
{
    Task<ThreadCardState> ReadThreadAsync(
        ThreadSummary summary,
        CancellationToken cancellationToken = default);
}

internal sealed class ClientConfirmationThreadReader(
    ICodexThreadClient client) : IConfirmationThreadReader
{
    public Task<ThreadCardState> ReadThreadAsync(
        ThreadSummary summary,
        CancellationToken cancellationToken = default) =>
        client.ReadThreadAsync(summary.Id, cancellationToken);
}
