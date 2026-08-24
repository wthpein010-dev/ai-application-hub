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
    private static readonly TimeSpan FocusTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan PrefillSettleDelay = TimeSpan.FromMilliseconds(350);

    public async Task SubmitAsync(CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("Codex 桌面提交兜底仅支持 Windows。");
        }

        var startedAt = Stopwatch.GetTimestamp();
        nint codexWindow = 0;
        while (Stopwatch.GetElapsedTime(startedAt) < FocusTimeout)
        {
            cancellationToken.ThrowIfCancellationRequested();
            codexWindow = GetForegroundWindow();
            if (IsCodexDesktopWindow(codexWindow))
            {
                await Task.Delay(PrefillSettleDelay, cancellationToken);
                if (codexWindow == GetForegroundWindow() &&
                    IsCodexDesktopWindow(codexWindow))
                {
                    SendEnter();
                    return;
                }
            }
            else
            {
                var discovered = FindCodexDesktopWindow();
                if (discovered != 0)
                {
                    SetForegroundWindow(discovered);
                }
            }

            await Task.Delay(50, cancellationToken);
        }

        throw new InvalidOperationException(
            "未能确认 Codex 桌面窗口已打开，消息没有提交。");
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
