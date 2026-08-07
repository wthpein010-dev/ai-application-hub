using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;

namespace CodexQuotaBar.Core.Protocol;

public sealed class CodexProcessSessionFactory(Action<string>? diagnostic = null) : ICodexSessionFactory
{
    private readonly Action<string>? _diagnostic = diagnostic;

    public Task<ICodexSession> StartAsync(string executablePath, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(executablePath);
        cancellationToken.ThrowIfCancellationRequested();

        var startInfo = new ProcessStartInfo
        {
            FileName = executablePath,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        startInfo.ArgumentList.Add("app-server");
        startInfo.ArgumentList.Add("--stdio");

        Process? process;
        try
        {
            process = Process.Start(startInfo);
        }
        catch (Win32Exception exception) when (exception.NativeErrorCode is 2 or 3)
        {
            throw new FileNotFoundException($"Codex executable was not found: {executablePath}", executablePath, exception);
        }

        if (process is null)
        {
            throw new InvalidOperationException("Codex app-server process could not be started.");
        }

        ICodexSession session = new CodexProcessSession(process, _diagnostic);
        return Task.FromResult(session);
    }

    private sealed class CodexProcessSession : ICodexSession
    {
        private readonly Process _process;
        private readonly JsonLineRpcClient _rpc;
        private readonly Task _completion;
        private readonly Task _stderrLoop;
        private readonly Action<string>? _diagnostic;
        private int _disposed;

        public CodexProcessSession(Process process, Action<string>? diagnostic)
        {
            _process = process;
            _diagnostic = diagnostic;
            _rpc = new JsonLineRpcClient(process.StandardOutput, process.StandardInput, diagnostic);
            _rpc.NotificationReceived += ForwardNotification;
            _rpc.Start();
            _completion = process.WaitForExitAsync();
            _stderrLoop = ReadStandardErrorAsync();
        }

        public event EventHandler<RpcNotification>? NotificationReceived;

        public Task Completion => _completion;

        public Task<JsonElement> SendRequestAsync(
            string method,
            object? parameters,
            CancellationToken cancellationToken = default) =>
            _rpc.SendRequestAsync(method, parameters, cancellationToken);

        public Task SendNotificationAsync(
            string method,
            object? parameters,
            CancellationToken cancellationToken = default) =>
            _rpc.SendNotificationAsync(method, parameters, cancellationToken);

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0)
            {
                return;
            }

            _rpc.NotificationReceived -= ForwardNotification;
            try
            {
                _process.StandardInput.Close();
            }
            catch (InvalidOperationException)
            {
            }

            if (!_process.HasExited)
            {
                var exited = await Task.WhenAny(_completion, Task.Delay(TimeSpan.FromSeconds(1))).ConfigureAwait(false);
                if (!ReferenceEquals(exited, _completion) && !_process.HasExited)
                {
                    _process.Kill(entireProcessTree: true);
                }
            }

            try
            {
                await _completion.ConfigureAwait(false);
                await _stderrLoop.ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is InvalidOperationException or IOException)
            {
                _diagnostic?.Invoke($"Codex process shutdown warning: {exception.Message}");
            }

            await _rpc.DisposeAsync().ConfigureAwait(false);
            _process.Dispose();
        }

        private async Task ReadStandardErrorAsync()
        {
            while (await _process.StandardError.ReadLineAsync().ConfigureAwait(false) is { } line)
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    _diagnostic?.Invoke($"Codex app server: {line}");
                }
            }
        }

        private void ForwardNotification(object? sender, RpcNotification notification) =>
            NotificationReceived?.Invoke(this, notification);
    }
}
