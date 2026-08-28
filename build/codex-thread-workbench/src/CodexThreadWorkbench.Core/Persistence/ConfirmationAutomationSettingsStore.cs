using System.Text.Json;

namespace CodexThreadWorkbench.Persistence;

public interface IConfirmationAutomationSettingsStore
{
    Task<bool> LoadEnabledAsync(CancellationToken cancellationToken = default);

    Task SaveEnabledAsync(
        bool value,
        CancellationToken cancellationToken = default);
}

public sealed class ConfirmationAutomationSettingsStore :
    IConfirmationAutomationSettingsStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly string _path;
    private readonly SemaphoreSlim _saveGate = new(1, 1);

    public ConfirmationAutomationSettingsStore(string? path = null)
    {
        _path = path ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CodexThreadWorkbench",
            "confirmation-automation.json");
    }

    public async Task<bool> LoadEnabledAsync(
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_path))
        {
            return false;
        }

        await using var stream = new FileStream(
            _path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 4096,
            useAsync: true);
        var settings = await JsonSerializer.DeserializeAsync<Settings>(
            stream,
            SerializerOptions,
            cancellationToken);
        return settings?.AutoConfirmEnabled == true;
    }

    public async Task SaveEnabledAsync(
        bool value,
        CancellationToken cancellationToken = default)
    {
        await _saveGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var directory = Path.GetDirectoryName(_path)
                            ?? throw new InvalidOperationException(
                                "自动确认设置路径无效。");
            Directory.CreateDirectory(directory);
            var temporaryPath = _path + ".tmp";
            await using (var stream = new FileStream(
                             temporaryPath,
                             FileMode.Create,
                             FileAccess.Write,
                             FileShare.None,
                             bufferSize: 4096,
                             useAsync: true))
            {
                await JsonSerializer.SerializeAsync(
                    stream,
                    new Settings { AutoConfirmEnabled = value },
                    SerializerOptions,
                    cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }

            File.Move(temporaryPath, _path, overwrite: true);
        }
        finally
        {
            _saveGate.Release();
        }
    }

    private sealed class Settings
    {
        public bool AutoConfirmEnabled { get; set; }
    }
}
