using System.Runtime.ExceptionServices;

namespace CodexThreadWorkbench.Presentation;

public sealed class WorkbenchSession : IAsyncDisposable
{
    private readonly IAsyncDisposable[] _resources;
    private readonly object _disposeGate = new();
    private Task? _disposeTask;

    public WorkbenchSession(
        IAsyncDisposable overlayViewModel,
        IAsyncDisposable monitor,
        IAsyncDisposable client)
    {
        _resources = [overlayViewModel, monitor, client];
    }

    public WorkbenchSession(
        IAsyncDisposable overlayViewModel,
        IAsyncDisposable monitor,
        IAsyncDisposable mainViewModel,
        IAsyncDisposable client)
    {
        _resources = [overlayViewModel, monitor, mainViewModel, client];
    }

    public ValueTask DisposeAsync()
    {
        lock (_disposeGate)
        {
            _disposeTask ??= DisposeCoreAsync();
            return new ValueTask(_disposeTask);
        }
    }

    private async Task DisposeCoreAsync()
    {
        Exception? firstError = null;
        foreach (var resource in _resources)
        {
            try
            {
                await resource.DisposeAsync();
            }
            catch (Exception error)
            {
                firstError ??= error;
            }
        }

        if (firstError is not null)
        {
            ExceptionDispatchInfo.Capture(firstError).Throw();
        }
    }
}
