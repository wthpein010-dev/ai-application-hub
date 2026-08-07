using CodexQuotaBar.Core.Platform;
using Microsoft.Win32;

namespace CodexQuotaBar.App.Platform;

public sealed class WindowsPlatformServices : IPlatformServices
{
    private const string StartupRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string StartupApprovalRegistryPath =
        @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    private const string StartupValueName = "CodexQuotaBar";
    private readonly string _appExecutablePath;
    private readonly string _localAppData;

    public WindowsPlatformServices(string? appExecutablePath = null, string? localAppData = null)
    {
        _appExecutablePath = appExecutablePath ?? Environment.ProcessPath
            ?? throw new InvalidOperationException("The application executable path is unavailable.");
        _localAppData = localAppData ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        SettingsDirectory = Path.Combine(_localAppData, "CodexQuotaBar");
        LogsDirectory = Path.Combine(SettingsDirectory, "logs");
    }

    public string SettingsDirectory { get; }
    public string LogsDirectory { get; }

    public Task<string?> FindCodexExecutableAsync(
        string? explicitOverride,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = CodexExecutableDiscovery.FindFirstExisting(
            explicitOverride,
            KnownCandidates(),
            Environment.GetEnvironmentVariable("PATH"),
            "codex.exe");
        return Task.FromResult(result);
    }

    public Task<bool> GetLaunchAtLoginAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!OperatingSystem.IsWindows())
        {
            return Task.FromResult(false);
        }

        using var key = Registry.CurrentUser.OpenSubKey(StartupRegistryPath, writable: false);
        var commandMatches = key?.GetValue(StartupValueName) is string value
            && string.Equals(value, BuildStartupCommand(_appExecutablePath), StringComparison.Ordinal);
        using var approvalKey = Registry.CurrentUser.OpenSubKey(StartupApprovalRegistryPath, writable: false);
        var approvalState = approvalKey?.GetValue(StartupValueName) as byte[];
        return Task.FromResult(commandMatches && IsStartupApproved(approvalState));
    }

    public Task SetLaunchAtLoginAsync(bool enabled, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!OperatingSystem.IsWindows())
        {
            return Task.CompletedTask;
        }

        using var key = Registry.CurrentUser.CreateSubKey(StartupRegistryPath, writable: true);
        using var approvalKey = Registry.CurrentUser.OpenSubKey(StartupApprovalRegistryPath, writable: true);
        if (enabled)
        {
            key.SetValue(StartupValueName, BuildStartupCommand(_appExecutablePath), RegistryValueKind.String);
            if (!IsStartupApproved(approvalKey?.GetValue(StartupValueName) as byte[]))
            {
                approvalKey?.DeleteValue(StartupValueName, throwOnMissingValue: false);
            }
        }
        else
        {
            key.DeleteValue(StartupValueName, throwOnMissingValue: false);
            approvalKey?.DeleteValue(StartupValueName, throwOnMissingValue: false);
        }

        return Task.CompletedTask;
    }

    public static string BuildStartupCommand(string executablePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(executablePath);
        return $"\"{executablePath.Trim().Trim('"')}\"";
    }

    public static bool IsStartupApproved(byte[]? approvalState) =>
        approvalState is not { Length: > 0 } || approvalState[0] == 0x02;

    private IEnumerable<string> KnownCandidates()
    {
        var userRuntime = Path.Combine(_localAppData, "OpenAI", "Codex", "bin");
        if (Directory.Exists(userRuntime))
        {
            foreach (var candidate in Directory.EnumerateFiles(userRuntime, "codex.exe", SearchOption.AllDirectories))
            {
                yield return candidate;
            }
        }

        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        yield return Path.Combine(programFiles, "OpenAI Codex", "resources", "codex.exe");
    }
}
