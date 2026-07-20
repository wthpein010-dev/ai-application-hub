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
                settings,
                SerializerOptions,
                cancellationToken);
            await stream.FlushAsync(cancellationToken);
        }

        File.Move(temporaryPath, _path, overwrite: true);
    }
}
