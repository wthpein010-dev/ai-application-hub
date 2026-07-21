using System.Runtime.CompilerServices;
using System.Threading.Channels;
using CodexThreadWorkbench.Infrastructure;

namespace CodexThreadWorkbench.Tests.Infrastructure;

internal sealed class FakeJsonLineTransport : IJsonLineTransport
{
    private readonly Channel<string> _incoming = Channel.CreateUnbounded<string>();
    private readonly Channel<string> _outgoing = Channel.CreateUnbounded<string>();

    public ValueTask WriteLineAsync(string line, CancellationToken cancellationToken = default) =>
        _outgoing.Writer.WriteAsync(line, cancellationToken);

    public async IAsyncEnumerable<string> ReadLinesAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await foreach (var line in _incoming.Reader.ReadAllAsync(cancellationToken))
        {
            yield return line;
        }
    }

    public ValueTask<string> ReadWrittenAsync(CancellationToken cancellationToken = default) =>
        _outgoing.Reader.ReadAsync(cancellationToken);

    public void EnqueueIncoming(string line) => _incoming.Writer.TryWrite(line);

    public ValueTask DisposeAsync()
    {
        _incoming.Writer.TryComplete();
        _outgoing.Writer.TryComplete();
        return ValueTask.CompletedTask;
    }
}
