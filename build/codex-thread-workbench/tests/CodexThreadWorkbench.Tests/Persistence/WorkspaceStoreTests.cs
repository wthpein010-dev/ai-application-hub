using CodexThreadWorkbench.Persistence;

namespace CodexThreadWorkbench.Tests.Persistence;

public sealed class WorkspaceStoreTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "CodexThreadWorkbench.Tests",
        Guid.NewGuid().ToString("N"));
    private readonly string _path;

    public WorkspaceStoreTests()
    {
        _path = Path.Combine(_directory, "workspace.json");
    }

    [Fact]
    public async Task SaveAndLoadAsync_RoundTripsWorkspaceOnly()
    {
        var store = new WorkspaceStore(_path);
        var expected = new WorkspaceSettings
        {
            OpenThreadIds = ["thread-1", "thread-2"],
            MinimizedThreadIds = ["thread-2"],
            WindowLeft = 110,
            WindowTop = 80,
            WindowWidth = 1420,
            WindowHeight = 920,
            IsFullScreen = true
        };

        await store.SaveAsync(expected);
        var actual = await store.LoadAsync();

        Assert.Equal(expected.OpenThreadIds, actual.OpenThreadIds);
        Assert.Equal(expected.MinimizedThreadIds, actual.MinimizedThreadIds);
        Assert.Equal(expected.WindowLeft, actual.WindowLeft);
        Assert.Equal(expected.WindowTop, actual.WindowTop);
        Assert.Equal(expected.WindowWidth, actual.WindowWidth);
        Assert.Equal(expected.WindowHeight, actual.WindowHeight);
        Assert.True(actual.IsFullScreen);
    }

    [Fact]
    public async Task LoadAsync_CorruptFile_ReturnsDefaults()
    {
        Directory.CreateDirectory(_directory);
        await File.WriteAllTextAsync(_path, "{broken");
        var store = new WorkspaceStore(_path);

        var settings = await store.LoadAsync();

        Assert.Empty(settings.OpenThreadIds);
        Assert.Empty(settings.MinimizedThreadIds);
        Assert.False(settings.IsFullScreen);
        Assert.True(settings.WindowWidth >= 900);
    }

    [Fact]
    public async Task LoadAsync_MissingFile_ReturnsDefaults()
    {
        var settings = await new WorkspaceStore(_path).LoadAsync();

        Assert.Empty(settings.OpenThreadIds);
        Assert.Equal(1280, settings.WindowWidth);
        Assert.Equal(800, settings.WindowHeight);
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
