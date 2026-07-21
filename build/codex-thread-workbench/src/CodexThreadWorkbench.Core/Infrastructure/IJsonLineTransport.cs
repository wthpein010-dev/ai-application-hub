using System.Runtime.CompilerServices;

namespace CodexThreadWorkbench.Infrastructure;

public interface IJsonLineTransport : IAsyncDisposable
{
    ValueTask WriteLineAsync(string line, CancellationToken cancellationToken = default);

    IAsyncEnumerable<string> ReadLinesAsync(CancellationToken cancellationToken = default);
}
