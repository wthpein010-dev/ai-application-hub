namespace CodexThreadWorkbench;

internal sealed class DesktopInstanceLock : IDisposable
{
    private readonly Semaphore _semaphore;
    private bool _isHeld = true;

    private DesktopInstanceLock(Semaphore semaphore)
    {
        _semaphore = semaphore;
    }

    public static IDisposable? TryAcquire(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        var semaphore = new Semaphore(1, 1, name);
        try
        {
            if (!semaphore.WaitOne(0))
            {
                semaphore.Dispose();
                return null;
            }

            return new DesktopInstanceLock(semaphore);
        }
        catch
        {
            semaphore.Dispose();
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
        _semaphore.Release();
        _semaphore.Dispose();
    }
}
