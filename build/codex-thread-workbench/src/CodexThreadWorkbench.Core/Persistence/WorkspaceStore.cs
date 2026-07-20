using System.IO;
using System.Text.Json;

namespace CodexThreadWorkbench.Persistence;

public sealed class WorkspaceStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly string _path;
    private readonly SemaphoreSlim _saveGate = new(1, 1);

    public WorkspaceStore(string? path = null)
    {
        _path = path ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CodexThreadWorkbench",
            "workspace.json");
    }

    public async Task<WorkspaceSettings> LoadAsync(
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_path))
        {
            return new WorkspaceSettings();
        }

        try
        {
            await using var stream = new FileStream(
                _path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                bufferSize: 4096,
                useAsync: true);
            return await JsonSerializer.DeserializeAsync<WorkspaceSettings>(
                       stream,
                       SerializerOptions,
                       cancellationToken)
                   ?? new WorkspaceSettings();
        }
        catch (JsonException)
        {
            return new WorkspaceSettings();
        }
        catch (IOException)
        {
            return new WorkspaceSettings();
        }
        catch (UnauthorizedAccessException)
        {
            return new WorkspaceSettings();
        }
    }

    public async Task SaveAsync(
        WorkspaceSettings settings,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(settings);
        var snapshot = CreateSnapshot(settings);
        await _saveGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var directory = Path.GetDirectoryName(_path)
                            ?? throw new InvalidOperationException("工作台设置路径无效。");
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
                    snapshot,
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

    private static WorkspaceSettings CreateSnapshot(WorkspaceSettings settings) => new()
    {
        OpenThreadIds = [.. settings.OpenThreadIds],
        MinimizedThreadIds = [.. settings.MinimizedThreadIds],
        WindowLeft = settings.WindowLeft,
        WindowTop = settings.WindowTop,
        WindowWidth = settings.WindowWidth,
        WindowHeight = settings.WindowHeight,
        IsFullScreen = settings.IsFullScreen
    };
}
