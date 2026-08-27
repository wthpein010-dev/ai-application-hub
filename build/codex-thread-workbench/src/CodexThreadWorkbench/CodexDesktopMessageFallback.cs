using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using CodexThreadWorkbench.Confirmation;

namespace CodexThreadWorkbench;

public interface ICodexDeepLinkLauncher
{
    Task OpenAsync(
        string deepLink,
        CancellationToken cancellationToken = default);
}

public interface ICodexForegroundSubmitter
{
    Task SubmitAsync(CancellationToken cancellationToken = default);

    async Task<bool> SubmitIfCurrentAsync(
        Func<CancellationToken, Task<bool>> isCurrentAsync,
        CancellationToken cancellationToken = default)
    {
        await SubmitAsync(cancellationToken);
        return true;
    }
}

public interface IWindowsCodexDesktopAutomation
{
    nint GetForegroundWindow();

    nint FindCodexDesktopWindow();

    bool IsCodexDesktopWindow(nint window);

    bool SetForegroundWindow(nint window);

    void SendEnter();
}

public sealed class CodexDesktopMessageFallback(
    ICodexDeepLinkLauncher? launcher = null,
    ICodexForegroundSubmitter? submitter = null) : IConfirmationMessageFallback
{
    private readonly ICodexDeepLinkLauncher _launcher =
        launcher ?? new ShellCodexDeepLinkLauncher();
    private readonly ICodexForegroundSubmitter _submitter =
        submitter ?? new WindowsCodexForegroundSubmitter();

    public async Task SendAsync(
        string threadId,
        string text,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(threadId);
        ArgumentException.ThrowIfNullOrWhiteSpace(text);
        var deepLink = $"codex://threads/{Uri.EscapeDataString(threadId)}" +
                       $"?prompt={Uri.EscapeDataString(text)}";
        await _launcher.OpenAsync(deepLink, cancellationToken);
        await _submitter.SubmitAsync(cancellationToken);
    }

    public async Task<bool> SendIfCurrentAsync(
        string threadId,
        string text,
        Func<CancellationToken, Task<bool>> isCurrentAsync,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(threadId);
        ArgumentException.ThrowIfNullOrWhiteSpace(text);
        ArgumentNullException.ThrowIfNull(isCurrentAsync);
        var deepLink = $"codex://threads/{Uri.EscapeDataString(threadId)}" +
                       $"?prompt={Uri.EscapeDataString(text)}";
        await _launcher.OpenAsync(deepLink, cancellationToken);
        return await _submitter.SubmitIfCurrentAsync(
            isCurrentAsync,
            cancellationToken);
    }
}

public sealed class ShellCodexDeepLinkLauncher : ICodexDeepLinkLauncher
{
    public Task OpenAsync(
        string deepLink,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var process = Process.Start(new ProcessStartInfo
        {
            FileName = deepLink,
            UseShellExecute = true
        });
        process?.Dispose();
        return Task.CompletedTask;
    }
}

public enum CodexDesktopPlatform
{
    Unsupported,
    Windows,
    MacOS
}

public static class CodexDesktopMessageFallbackFactory
{
    public static IConfirmationMessageFallback? CreateCurrent() =>
        Create(DetectCurrent());

    public static IConfirmationMessageFallback? Create(
        CodexDesktopPlatform platform,
        IPlatformProcessRunner? processRunner = null)
    {
        if (platform == CodexDesktopPlatform.Windows)
        {
            return new CodexDesktopMessageFallback(
                new ShellCodexDeepLinkLauncher(),
                new WindowsCodexForegroundSubmitter());
        }

        if (platform == CodexDesktopPlatform.MacOS)
        {
            processRunner ??= new PlatformProcessRunner();
            return new CodexDesktopMessageFallback(
                new MacCodexDeepLinkLauncher(processRunner),
                new MacCodexForegroundSubmitter(processRunner));
        }

        return null;
    }

    private static CodexDesktopPlatform DetectCurrent()
    {
        if (OperatingSystem.IsWindows())
        {
            return CodexDesktopPlatform.Windows;
        }

        return OperatingSystem.IsMacOS()
            ? CodexDesktopPlatform.MacOS
            : CodexDesktopPlatform.Unsupported;
    }
}

public sealed class WindowsCodexForegroundSubmitter : ICodexForegroundSubmitter
{
    private const ushort EnterKey = 0x0D;
    private const uint InputKeyboard = 1;
    private const uint KeyEventKeyUp = 0x0002;
    private static readonly TimeSpan FocusTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan WarmPrefillSettleDelay =
        TimeSpan.FromMilliseconds(350);
    private static readonly TimeSpan ColdPrefillSettleDelay =
        TimeSpan.FromMilliseconds(750);
    private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(100);
    private readonly IWindowsCodexDesktopAutomation _automation;
    private readonly TimeProvider _timeProvider;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;

    public WindowsCodexForegroundSubmitter(
        IWindowsCodexDesktopAutomation? automation = null,
        TimeProvider? timeProvider = null,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
    {
        _automation = automation ?? new NativeWindowsCodexDesktopAutomation();
        _timeProvider = timeProvider ?? TimeProvider.System;
        _delay = delay ?? Task.Delay;
    }

    public async Task SubmitAsync(CancellationToken cancellationToken = default)
    {
        await SubmitIfCurrentAsync(
            _ => Task.FromResult(true),
            cancellationToken);
    }

    public async Task<bool> SubmitIfCurrentAsync(
        Func<CancellationToken, Task<bool>> isCurrentAsync,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(isCurrentAsync);
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Codex 桌面提交兜底仅支持 Windows。");
        }

        var startedAt = _timeProvider.GetTimestamp();
        var requiresColdSettle = !_automation.IsCodexDesktopWindow(
            _automation.GetForegroundWindow());
        nint codexWindow = 0;
        while (_timeProvider.GetElapsedTime(startedAt) < FocusTimeout)
        {
            cancellationToken.ThrowIfCancellationRequested();
            codexWindow = _automation.GetForegroundWindow();
            if (_automation.IsCodexDesktopWindow(codexWindow))
            {
                await _delay(
                    requiresColdSettle
                        ? ColdPrefillSettleDelay
                        : WarmPrefillSettleDelay,
                    cancellationToken);
                if (codexWindow == _automation.GetForegroundWindow() &&
                    _automation.IsCodexDesktopWindow(codexWindow))
                {
                    if (!await isCurrentAsync(cancellationToken))
                    {
                        return false;
                    }

                    if (codexWindow == _automation.GetForegroundWindow() &&
                        _automation.IsCodexDesktopWindow(codexWindow))
                    {
                        _automation.SendEnter();
                        return true;
                    }
                }
            }
            else
            {
                var discovered = _automation.FindCodexDesktopWindow();
                if (discovered != 0)
                {
                    _automation.SetForegroundWindow(discovered);
                }
            }

            await _delay(PollInterval, cancellationToken);
        }

        throw new InvalidOperationException(
            "未能确认 Codex 桌面窗口已打开，消息没有提交。");
    }

    private sealed class NativeWindowsCodexDesktopAutomation :
        IWindowsCodexDesktopAutomation
    {
        public nint GetForegroundWindow() =>
            WindowsCodexForegroundSubmitter.GetForegroundWindow();

        public nint FindCodexDesktopWindow() =>
            WindowsCodexForegroundSubmitter.FindCodexDesktopWindow();

        public bool IsCodexDesktopWindow(nint window) =>
            WindowsCodexForegroundSubmitter.IsCodexDesktopWindow(window);

        public bool SetForegroundWindow(nint window) =>
            WindowsCodexForegroundSubmitter.SetForegroundWindow(window);

        public void SendEnter() =>
            WindowsCodexForegroundSubmitter.SendEnter();
    }

    private static nint FindCodexDesktopWindow()
    {
        foreach (var process in Process.GetProcessesByName("ChatGPT"))
        {
            using (process)
            {
                if (process.MainWindowHandle != 0 && IsCodexDesktopProcess(process))
                {
                    return process.MainWindowHandle;
                }
            }
        }

        return 0;
    }

    private static bool IsCodexDesktopWindow(nint window)
    {
        if (window == 0)
        {
            return false;
        }

        GetWindowThreadProcessId(window, out var processId);
        if (processId == 0)
        {
            return false;
        }

        try
        {
            using var process = Process.GetProcessById((int)processId);
            return IsCodexDesktopProcess(process);
        }
        catch (ArgumentException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private static bool IsCodexDesktopProcess(Process process)
    {
        if (!string.Equals(
                process.ProcessName,
                "ChatGPT",
                StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        try
        {
            var path = process.MainModule?.FileName ?? string.Empty;
            return path.Contains(
                "OpenAI.Codex_",
                StringComparison.OrdinalIgnoreCase);
        }
        catch (Win32Exception)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private static void SendEnter()
    {
        var inputs = new[]
        {
            Input.Keyboard(EnterKey, 0),
            Input.Keyboard(EnterKey, KeyEventKeyUp)
        };
        var sent = SendInput(
            (uint)inputs.Length,
            inputs,
            Marshal.SizeOf<Input>());
        if (sent != inputs.Length)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "无法向 Codex 提交消息。");
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Data;

        public static Input Keyboard(ushort virtualKey, uint flags) =>
            new()
            {
                Type = InputKeyboard,
                Data = new InputUnion
                {
                    Keyboard = new KeyboardInput
                    {
                        VirtualKey = virtualKey,
                        Flags = flags
                    }
                }
            };
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)]
        public MouseInput Mouse;

        [FieldOffset(0)]
        public KeyboardInput Keyboard;

        [FieldOffset(0)]
        public HardwareInput Hardware;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X;
        public int Y;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public nuint ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public nuint ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HardwareInput
    {
        public uint Message;
        public ushort ParameterLow;
        public ushort ParameterHigh;
    }

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(
        nint window,
        out uint processId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(nint window);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(
        uint inputCount,
        [In] Input[] inputs,
        int inputSize);
}
