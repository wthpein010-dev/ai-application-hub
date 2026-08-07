using System.Text.Json;
using CodexQuotaBar.Core.Settings;

namespace CodexQuotaBar.Tests.Settings;

public sealed class JsonSettingsStoreTests
{
    [Fact]
    public async Task Missing_file_returns_safe_defaults()
    {
        using var directory = new TemporaryDirectory();
        var store = new JsonSettingsStore(directory.Path);

        var settings = await store.LoadAsync();

        Assert.True(settings.AlwaysOnTop);
        Assert.True(settings.LaunchAtLogin);
        Assert.False(settings.IsCollapsed);
        Assert.Equal(30, settings.RefreshSeconds);
    }

    [Fact]
    public async Task Saved_settings_round_trip_all_user_preferences()
    {
        using var directory = new TemporaryDirectory();
        var store = new JsonSettingsStore(directory.Path);
        var expected = new AppSettings(
            IsCollapsed: true,
            AlwaysOnTop: false,
            LaunchAtLogin: false,
            RefreshSeconds: 45,
            Placement: new WindowPlacement("display-2", 120.5, 80.25, IsPetAnchor: true),
            CodexExecutableOverride: "/custom/codex");

        await store.SaveAsync(expected);
        var actual = await store.LoadAsync();

        Assert.Equal(expected, actual);
    }

    [Fact]
    public async Task Saved_settings_round_trip_pet_preference()
    {
        using var directory = new TemporaryDirectory();
        var store = new JsonSettingsStore(directory.Path);
        var expected = AppSettings.Default with { PetEnabled = true };

        await store.SaveAsync(expected);

        Assert.True((await store.LoadAsync()).PetEnabled);
    }

    [Fact]
    public async Task Saved_settings_round_trip_task_notification_preference()
    {
        using var directory = new TemporaryDirectory();
        var store = new JsonSettingsStore(directory.Path);

        await store.SaveAsync(AppSettings.Default with { TaskNotificationsEnabled = false });

        Assert.False((await store.LoadAsync()).TaskNotificationsEnabled);
    }

    [Fact]
    public async Task Legacy_settings_without_task_notification_preference_enable_notifications()
    {
        using var directory = new TemporaryDirectory();
        var store = new JsonSettingsStore(directory.Path);
        await File.WriteAllTextAsync(store.SettingsPath, """
            { "petEnabled": true }
            """);

        var settings = await store.LoadAsync();

        Assert.True(settings.PetEnabled);
        Assert.True(settings.TaskNotificationsEnabled);
    }

    [Fact]
    public async Task Malformed_settings_are_preserved_and_defaults_are_returned()
    {
        using var directory = new TemporaryDirectory();
        var path = Path.Combine(directory.Path, "settings.json");
        await File.WriteAllTextAsync(path, "{ definitely not json }");
        var store = new JsonSettingsStore(directory.Path);

        var settings = await store.LoadAsync();

        Assert.Equal(AppSettings.Default, settings);
        Assert.True(File.Exists($"{path}.invalid"));
        Assert.False(File.Exists(path));
    }

    [Fact]
    public async Task Concurrent_saves_leave_a_complete_json_document()
    {
        using var directory = new TemporaryDirectory();
        var store = new JsonSettingsStore(directory.Path);

        await Task.WhenAll(Enumerable.Range(1, 20).Select(index =>
            store.SaveAsync(new AppSettings(RefreshSeconds: index))));

        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(store.SettingsPath));
        Assert.InRange(document.RootElement.GetProperty("refreshSeconds").GetInt32(), 1, 20);
        Assert.False(File.Exists($"{store.SettingsPath}.tmp"));
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"quota-settings-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose() => Directory.Delete(Path, recursive: true);
    }
}
