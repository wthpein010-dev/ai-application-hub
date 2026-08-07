using System.Text.Json;

namespace CodexQuotaBar.Core.Settings;

public sealed class JsonSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    private readonly SemaphoreSlim _gate = new(1, 1);

    public JsonSettingsStore(string settingsDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(settingsDirectory);
        SettingsDirectory = settingsDirectory;
        SettingsPath = Path.Combine(settingsDirectory, "settings.json");
    }

    public string SettingsDirectory { get; }
    public string SettingsPath { get; }

    public async Task<AppSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!File.Exists(SettingsPath))
            {
                return AppSettings.Default;
            }

            try
            {
                await using var stream = File.OpenRead(SettingsPath);
                return await JsonSerializer.DeserializeAsync<AppSettings>(stream, JsonOptions, cancellationToken)
                    .ConfigureAwait(false)
                    ?? AppSettings.Default;
            }
            catch (JsonException)
            {
                PreserveInvalidFile();
                return AppSettings.Default;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SaveAsync(AppSettings settings, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(settings);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            Directory.CreateDirectory(SettingsDirectory);
            var temporaryPath = $"{SettingsPath}.tmp";
            await using (var stream = new FileStream(
                temporaryPath,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 4096,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await JsonSerializer.SerializeAsync(stream, settings, JsonOptions, cancellationToken).ConfigureAwait(false);
                await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
            }

            File.Move(temporaryPath, SettingsPath, overwrite: true);
        }
        finally
        {
            _gate.Release();
        }
    }

    private void PreserveInvalidFile()
    {
        var invalidPath = $"{SettingsPath}.invalid";
        if (File.Exists(invalidPath))
        {
            File.Delete(invalidPath);
        }

        File.Move(SettingsPath, invalidPath);
    }
}
