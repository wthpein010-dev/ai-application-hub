using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;

namespace CodexThreadWorkbench.Infrastructure;

public sealed class ProcessJsonLineTransport : IJsonLineTransport
{
    private readonly Process _process;
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private bool _disposed;

    private ProcessJsonLineTransport(Process process)
    {
        _process = process;
    }

    public event Action<string>? StandardErrorReceived;

    public event Action<int>? ProcessExited;

    public static ProcessJsonLineTransport Start(string codexPath)
    {
        var startInfo = CreateStartInfo(codexPath);

        var process = Process.Start(startInfo)
                      ?? throw new InvalidOperationException("无法启动 Codex app-server。");
        var transport = new ProcessJsonLineTransport(process);
        _ = transport.DrainStandardErrorAsync();
        _ = transport.ObserveExitAsync();
        return transport;
    }

    private static ProcessStartInfo CreateStartInfo(string codexPath)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = codexPath,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        startInfo.ArgumentList.Add("app-server");
        startInfo.ArgumentList.Add("--listen");
        startInfo.ArgumentList.Add("stdio://");
        return startInfo;
    }

    public async ValueTask WriteLineAsync(
        string line,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            await _process.StandardInput.WriteLineAsync(line.AsMemory(), cancellationToken);
            await _process.StandardInput.FlushAsync(cancellationToken);
        }
        finally
        {
            _writeGate.Release();
        }
    }

    public async IAsyncEnumerable<string> ReadLinesAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await _process.StandardOutput.ReadLineAsync(cancellationToken);
            if (line is null)
            {
                yield break;
            }

            if (!string.IsNullOrWhiteSpace(line))
            {
                yield return line;
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        try
        {
            _process.StandardInput.Close();
            if (!_process.HasExited)
            {
                _process.Kill(entireProcessTree: true);
                await _process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(3));
            }
        }
        catch (InvalidOperationException)
        {
        }
        catch (TimeoutException)
        {
        }
        finally
        {
            _writeGate.Dispose();
            _process.Dispose();
        }
    }

    private async Task DrainStandardErrorAsync()
    {
        try
        {
            while (await _process.StandardError.ReadLineAsync() is { } line)
            {
                StandardErrorReceived?.Invoke(line);
            }
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private async Task ObserveExitAsync()
    {
        try
        {
            await _process.WaitForExitAsync();
            ProcessExited?.Invoke(_process.ExitCode);
        }
        catch (ObjectDisposedException)
        {
        }
    }
}
