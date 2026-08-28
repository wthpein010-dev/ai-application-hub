using CodexThreadWorkbench.Persistence;

namespace CodexThreadWorkbench.Tests.Persistence;

public sealed class ConfirmationAutomationSettingsStoreTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "CodexThreadWorkbench.AutoConfirmation.Tests",
        Guid.NewGuid().ToString("N"));
    private readonly string _path;

    public ConfirmationAutomationSettingsStoreTests()
    {
        _path = Path.Combine(_directory, "confirmation-automation.json");
    }

    [Fact]
    public async Task MissingSettings_DefaultsToDisabled()
    {
        var store = new ConfirmationAutomationSettingsStore(_path);

        Assert.False(await store.LoadEnabledAsync());
    }

    [Fact]
    public async Task CorruptSettings_PropagateTheReadFailure()
    {
        var store = new ConfirmationAutomationSettingsStore(_path);

        Directory.CreateDirectory(_directory);
        await File.WriteAllTextAsync(_path, "{broken");

        await Assert.ThrowsAsync<System.Text.Json.JsonException>(
            () => store.LoadEnabledAsync());
    }

    [Fact]
    public async Task SaveEnabledAsync_RoundTripsBothStates()
    {
        var store = new ConfirmationAutomationSettingsStore(_path);

        await store.SaveEnabledAsync(true);
        Assert.True(await store.LoadEnabledAsync());

        await store.SaveEnabledAsync(false);
        Assert.False(await store.LoadEnabledAsync());
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
