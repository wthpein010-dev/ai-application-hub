namespace CodexThreadWorkbench;

internal sealed class DesktopInstanceLock : IDisposable
{
    private readonly Mutex _mutex;
    private bool _isHeld = true;

    private DesktopInstanceLock(Mutex mutex)
    {
        _mutex = mutex;
    }

    public static IDisposable? TryAcquire(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        var mutex = new Mutex(
            initiallyOwned: true,
            name,
            out var createdNew);
        try
        {
            if (!createdNew)
            {
                mutex.Dispose();
                return null;
            }

            return new DesktopInstanceLock(mutex);
        }
        catch
        {
            mutex.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        if (!_isHeld)
        {
            return;
        }

        _isHeld = false;
        _mutex.ReleaseMutex();
        _mutex.Dispose();
    }
}
