namespace CodexQuotaBar.Core.Platform;

public interface IPlatformServices
{
    string SettingsDirectory { get; }
    string LogsDirectory { get; }

    Task<string?> FindCodexExecutableAsync(
        string? explicitOverride,
        CancellationToken cancellationToken = default);

    Task<bool> GetLaunchAtLoginAsync(CancellationToken cancellationToken = default);

    Task SetLaunchAtLoginAsync(bool enabled, CancellationToken cancellationToken = default);
}
