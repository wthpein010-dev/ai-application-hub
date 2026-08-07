using System.Buffers.Binary;
using System.Text.Json;
using System.Windows.Input;
using Avalonia.Controls;
using CodexQuotaBar.App.Pets;
using CodexQuotaBar.App.Tray;
using CodexQuotaBar.Core.Platform;
using CodexQuotaBar.Core.Pets;
using CodexQuotaBar.Core.Protocol;
using CodexQuotaBar.Core.Quota;
using CodexQuotaBar.Core.Settings;
using CodexQuotaBar.Core.ViewModels;
using SkiaSharp;

namespace CodexQuotaBar.Tests.Pets;

public sealed class CodexPetProviderTests
{
    [Avalonia.Headless.XUnit.AvaloniaFact]
    public async Task Desktop_provider_factory_uses_the_embedded_fallback_without_codex_selection()
    {
        using var fixture = PetFixture.CreateEmpty();
        var provider = DesktopPetProviderFactory.Create(
            fixture.CodexHome,
            () => null,
            BundledPetResource.Open);

        var pet = await provider.FindAsync();

        Assert.Equal("bundled-suit-hamster", pet?.Id);
        Assert.Equal(PetAssetSource.BundledFallback, pet?.Source);
    }

    [Avalonia.Headless.XUnit.AvaloniaFact]
    public async Task Desktop_provider_factory_does_not_open_fallback_when_codex_pet_is_valid()
    {
        using var fixture = PetFixture.Custom("tea-mist-mouse", ValidWebpAtlas);
        var fallbackOpenCount = 0;
        var provider = DesktopPetProviderFactory.Create(
            fixture.CodexHome,
            () => null,
            () =>
            {
                fallbackOpenCount++;
                return BundledPetResource.Open();
            });

        var pet = await provider.FindAsync();

        Assert.Equal(PetAssetSource.Codex, pet?.Source);
        Assert.Equal(0, fallbackOpenCount);
    }

    [Fact]
    public async Task Provider_resolves_a_custom_pet_inside_its_directory()
    {
        using var fixture = PetFixture.Custom("tea-mist-mouse", ValidWebpAtlas);
        var provider = new CodexPetProvider(fixture.CodexHome, () => null);

        var pet = await provider.FindAsync();

        Assert.Equal("tea-mist-mouse", pet?.Id);
        Assert.Equal("Tea Mist Mouse", pet?.DisplayName);
        Assert.Equal(ValidWebpAtlas, pet?.Payload);
    }

    [Fact]
    public async Task Provider_resolves_a_built_in_pet_from_app_asar()
    {
        using var fixture = PetFixture.BuiltIn("fireball", ValidWebpAtlas);
        var provider = new CodexPetProvider(fixture.CodexHome, () => fixture.AsarPath);

        var pet = await provider.FindAsync();

        Assert.Equal("fireball", pet?.Id);
        Assert.Equal(ValidWebpAtlas, pet?.Payload);
    }

    [Fact]
    public async Task Provider_rejects_custom_manifest_path_traversal()
    {
        using var fixture = PetFixture.CustomWithSpritePath("unsafe", "../outside.webp");
        var provider = new CodexPetProvider(fixture.CodexHome, () => null);

        Assert.Null(await provider.FindAsync());
    }

    [Fact]
    public async Task Provider_rejects_a_truncated_bitmap_with_valid_webp_metadata()
    {
        var truncated = ValidWebpAtlas[..(ValidWebpAtlas.Length / 2)];
        using var fixture = PetFixture.Custom("truncated", truncated);
        var provider = new CodexPetProvider(fixture.CodexHome, () => null);

        Assert.Null(await provider.FindAsync());
    }

    [Fact]
    public async Task Provider_rejects_codec_readable_webp_when_full_pixel_decode_fails()
    {
        var corrupt = TestPetAssets.CodecReadableCorruptWebp;
        using (var stream = new SKMemoryStream(corrupt))
        using (var codec = SKCodec.Create(stream))
        {
            Assert.NotNull(codec);
            Assert.True(codec.Info.Width > 0);
            Assert.True(codec.Info.Height > 0);
            var pixels = new byte[codec.Info.BytesSize];
            Assert.NotEqual(SKCodecResult.Success, codec.GetPixels(codec.Info, pixels));
        }

        using var fixture = PetFixture.Custom("payload-corrupt", corrupt);
        var provider = new CodexPetProvider(fixture.CodexHome, () => null);

        Assert.Null(await provider.FindAsync());
    }

    [Fact]
    public async Task Provider_rejects_decodable_bitmap_over_dimension_limit()
    {
        using var fixture = PetFixture.Custom("oversized", TestPetAssets.OversizedWebp);
        var provider = new CodexPetProvider(fixture.CodexHome, () => null);

        Assert.Null(await provider.FindAsync());
    }

    [Avalonia.Headless.XUnit.AvaloniaFact]
    public async Task Corrupt_signed_bitmap_is_not_available_to_view_model_or_tray()
    {
        using var fixture = PetFixture.Custom("corrupt", TestPetAssets.SignedButCorruptWebp);
        var provider = new CodexPetProvider(fixture.CodexHome, () => null);
        var settingsStore = new JsonSettingsStore(Path.Combine(fixture.Root, "settings"));
        await settingsStore.SaveAsync(AppSettings.Default with { PetEnabled = true });
        using var viewModel = new MainWindowViewModel(
            new StubQuotaSource(),
            provider,
            settingsStore,
            new StubPlatformServices(fixture.Root),
            TimeProvider.System,
            () => { });

        await viewModel.InitializeAsync();
        var command = new NoOpCommand();
        var menu = TrayMenuFactory.Create(
            command,
            command,
            command,
            command,
            command,
            command,
            command,
            command,
            alwaysOnTop: true,
            launchAtLogin: true,
            viewModel.PetAvailable,
            viewModel.PetEnabled,
            viewModel.TaskNotificationsEnabled);
        var headers = menu.Items.OfType<NativeMenuItem>()
            .Where(item => item is not NativeMenuItemSeparator)
            .Select(item => item.Header)
            .ToArray();

        Assert.False(viewModel.PetAvailable);
        Assert.False(viewModel.PetEnabled);
        Assert.DoesNotContain("桌宠", headers);
        Assert.DoesNotContain("任务完成提示", headers);
    }

    private static byte[] ValidWebpAtlas => TestPetAssets.ValidWebpAtlas;

    private sealed class StubQuotaSource : IQuotaSource
    {
        public event EventHandler<QuotaSnapshot>? SnapshotUpdated
        {
            add { }
            remove { }
        }

        public event EventHandler? ConnectionStateChanged
        {
            add { }
            remove { }
        }

        public CodexConnectionState ConnectionState => CodexConnectionState.Stopped;

        public QuotaSnapshot? LastSnapshot => null;

        public Task StartAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task RefreshAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class StubPlatformServices(string directory) : IPlatformServices
    {
        public string SettingsDirectory => directory;

        public string LogsDirectory => directory;

        public Task<string?> FindCodexExecutableAsync(
            string? explicitOverride,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(explicitOverride ?? "codex");

        public Task<bool> GetLaunchAtLoginAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(true);

        public Task SetLaunchAtLoginAsync(
            bool enabled,
            CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class NoOpCommand : ICommand
    {
        public event EventHandler? CanExecuteChanged
        {
            add { }
            remove { }
        }

        public bool CanExecute(object? parameter) => true;

        public void Execute(object? parameter)
        {
        }
    }

    private sealed class PetFixture : IDisposable
    {
        private PetFixture(string root)
        {
            Root = root;
            CodexHome = Path.Combine(root, ".codex");
            Directory.CreateDirectory(CodexHome);
        }

        public string Root { get; }
        public string CodexHome { get; }
        public string? AsarPath { get; private set; }

        public static PetFixture Custom(string id, byte[] atlasBytes)
        {
            var fixture = Create();
            fixture.WriteSelection($"custom:{id}");
            var petDirectory = Path.Combine(fixture.CodexHome, "pets", id);
            Directory.CreateDirectory(petDirectory);
            File.WriteAllBytes(Path.Combine(petDirectory, "spritesheet.webp"), atlasBytes);
            File.WriteAllText(
                Path.Combine(petDirectory, "pet.json"),
                JsonSerializer.Serialize(new
                {
                    id,
                    displayName = "Tea Mist Mouse",
                    spritesheetPath = "spritesheet.webp",
                }));
            return fixture;
        }

        public static PetFixture CreateEmpty() => Create();

        public static PetFixture CustomWithSpritePath(string id, string spritePath)
        {
            var fixture = Create();
            fixture.WriteSelection($"custom:{id}");
            var petDirectory = Path.Combine(fixture.CodexHome, "pets", id);
            Directory.CreateDirectory(petDirectory);
            File.WriteAllText(
                Path.Combine(petDirectory, "pet.json"),
                JsonSerializer.Serialize(new
                {
                    id,
                    displayName = "Unsafe",
                    spritesheetPath = spritePath,
                }));
            File.WriteAllBytes(Path.Combine(fixture.CodexHome, "pets", "outside.webp"), ValidWebpAtlas);
            return fixture;
        }

        public static PetFixture BuiltIn(string id, byte[] atlasBytes)
        {
            var fixture = Create();
            fixture.WriteSelection(id);
            fixture.AsarPath = Path.Combine(fixture.Root, "app.asar");
            WriteAsar(
                fixture.AsarPath,
                $"webview/assets/{id}-spritesheet-v5.webp",
                atlasBytes);
            return fixture;
        }

        public void Dispose() => Directory.Delete(Root, recursive: true);

        private static PetFixture Create() => new(Path.Combine(
            Path.GetTempPath(),
            $"codex-quota-bar-pet-{Guid.NewGuid():N}"));

        private void WriteSelection(string id)
        {
            File.WriteAllText(
                Path.Combine(CodexHome, "config.toml"),
                $"[desktop]{Environment.NewLine}selected-avatar-id = \"{id}\"{Environment.NewLine}");
        }

        private static void WriteAsar(string path, string entryPath, byte[] bytes)
        {
            var segments = entryPath.Split('/');
            object entry = new Dictionary<string, object?>
            {
                ["size"] = bytes.LongLength,
                ["offset"] = "0",
            };
            for (var index = segments.Length - 1; index >= 0; index--)
            {
                entry = new Dictionary<string, object?>
                {
                    ["files"] = new Dictionary<string, object?> { [segments[index]] = entry },
                };
            }

            var json = JsonSerializer.SerializeToUtf8Bytes(entry);
            var headerLength = (8 + json.Length + 1 + 3) & ~3;
            var header = new byte[headerLength];
            BinaryPrimitives.WriteUInt32LittleEndian(header, checked((uint)(headerLength - 4)));
            BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(4), checked((uint)json.Length));
            json.CopyTo(header.AsSpan(8));

            using var stream = File.Create(path);
            Span<byte> sizePickle = stackalloc byte[8];
            BinaryPrimitives.WriteUInt32LittleEndian(sizePickle, 4);
            BinaryPrimitives.WriteUInt32LittleEndian(sizePickle[4..], checked((uint)headerLength));
            stream.Write(sizePickle);
            stream.Write(header);
            stream.Write(bytes);
        }
    }
}
