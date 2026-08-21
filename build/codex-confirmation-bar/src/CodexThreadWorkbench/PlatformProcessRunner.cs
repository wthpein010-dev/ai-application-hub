using System.Diagnostics;

namespace CodexThreadWorkbench;

public sealed record PlatformProcessRequest(
    string FileName,
    IReadOnlyList<string> Arguments,
    TimeSpan Timeout);

public sealed record PlatformProcessResult(
    int ExitCode,
    string StandardOutput,
    string StandardError);

public interface IPlatformProcessRunner
{
    Task<PlatformProcessResult> RunAsync(
        PlatformProcessRequest request,
        CancellationToken cancellationToken = default);
}

public sealed class PlatformProcessRunner : IPlatformProcessRunner
{
    public async Task<PlatformProcessResult> RunAsync(
        PlatformProcessRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(request.FileName);
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(
            request.Timeout,
            TimeSpan.Zero);

        var startInfo = new ProcessStartInfo
        {
            FileName = request.FileName,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var argument in request.Arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        if (!process.Start())
        {
            throw new InvalidOperationException(
                $"无法启动系统命令：{request.FileName}");
        }

        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken);
        timeout.CancelAfter(request.Timeout);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            TryKill(process);
            throw new TimeoutException(
                $"系统命令执行超时：{request.FileName}");
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }

        return new PlatformProcessResult(
            process.ExitCode,
            await outputTask,
            await errorTask);
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (InvalidOperationException)
        {
        }
    }
}
