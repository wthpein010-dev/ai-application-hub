using System.Text;

namespace CodexQuotaBar.Core.Logging;

public sealed class RollingFileLogger : IDisposable
{
    private static readonly UTF8Encoding Utf8WithoutBom = new(encoderShouldEmitUTF8Identifier: false);
    private readonly object _gate = new();
    private readonly string _path;
    private readonly long _maxBytes;
    private readonly int _retainedFiles;
    private int _disposed;

    public RollingFileLogger(
        string directory,
        string fileName = "quota-bar.log",
        long maxBytes = 2 * 1024 * 1024,
        int retainedFiles = 3)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxBytes);
        ArgumentOutOfRangeException.ThrowIfNegative(retainedFiles);

        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, fileName);
        _maxBytes = maxBytes;
        _retainedFiles = retainedFiles;
    }

    public void Write(string eventName, string? summary = null)
    {
        ObjectDisposedException.ThrowIf(Volatile.Read(ref _disposed) != 0, this);
        ArgumentException.ThrowIfNullOrWhiteSpace(eventName);

        var safeEvent = SingleLine(eventName);
        var safeSummary = SingleLine(summary ?? string.Empty);
        var line = $"{DateTimeOffset.UtcNow:O} [{safeEvent}] {safeSummary}{Environment.NewLine}";
        var bytes = Utf8WithoutBom.GetByteCount(line);

        lock (_gate)
        {
            if (File.Exists(_path) && new FileInfo(_path).Length + bytes > _maxBytes)
            {
                Rotate();
            }

            File.AppendAllText(_path, line, Utf8WithoutBom);
        }
    }

    public void Dispose() => Interlocked.Exchange(ref _disposed, 1);

    private void Rotate()
    {
        if (_retainedFiles == 0)
        {
            File.Delete(_path);
            return;
        }

        var oldest = $"{_path}.{_retainedFiles}";
        if (File.Exists(oldest))
        {
            File.Delete(oldest);
        }

        for (var index = _retainedFiles - 1; index >= 1; index--)
        {
            var source = $"{_path}.{index}";
            if (File.Exists(source))
            {
                File.Move(source, $"{_path}.{index + 1}");
            }
        }

        File.Move(_path, $"{_path}.1");
    }

    private static string SingleLine(string value) => value
        .Replace('\r', ' ')
        .Replace('\n', ' ');
}
