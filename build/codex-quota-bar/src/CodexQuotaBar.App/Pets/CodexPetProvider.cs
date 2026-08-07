using System.Text.Json;
using CodexQuotaBar.Core.Pets;
using SkiaSharp;
using Tomlyn;
using Tomlyn.Model;

namespace CodexQuotaBar.App.Pets;

public sealed class CodexPetProvider(
    string codexHome,
    Func<string?> locateAsar,
    Action<string>? diagnostic = null) : IPetProvider
{
    private const string CustomPrefix = "custom:";
    private const int MaxDecodedDimension = 8192;
    private const long MaxDecodedPixels = 16_777_216;
    private static readonly JsonSerializerOptions ManifestJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<PetAsset?> FindAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            var configPath = Path.Combine(codexHome, "config.toml");
            if (!File.Exists(configPath))
            {
                return null;
            }

            var configText = await File.ReadAllTextAsync(configPath, cancellationToken)
                .ConfigureAwait(false);
            var config = TomlSerializer.Deserialize<TomlTable>(configText);
            if (config is null)
            {
                return null;
            }

            if (config["desktop"] is not TomlTable desktop
                || desktop["selected-avatar-id"] is not string selectedId
                || string.IsNullOrWhiteSpace(selectedId))
            {
                return null;
            }

            return selectedId.StartsWith(CustomPrefix, StringComparison.Ordinal)
                ? await LoadCustomAsync(
                    selectedId[CustomPrefix.Length..],
                    cancellationToken).ConfigureAwait(false)
                : LoadBuiltIn(selectedId);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            diagnostic?.Invoke($"Unable to load selected Codex pet: {exception.Message}");
            return null;
        }
    }

    private async Task<PetAsset?> LoadCustomAsync(
        string selectedId,
        CancellationToken cancellationToken)
    {
        var petsRoot = Path.GetFullPath(Path.Combine(codexHome, "pets"));
        var petDirectory = Path.GetFullPath(Path.Combine(petsRoot, selectedId));
        if (!IsContainedBy(petsRoot, petDirectory))
        {
            return null;
        }

        var manifestPath = Path.Combine(petDirectory, "pet.json");
        if (!File.Exists(manifestPath))
        {
            return null;
        }

        await using var manifestStream = File.OpenRead(manifestPath);
        var manifest = await JsonSerializer.DeserializeAsync<PetManifest>(
            manifestStream,
            ManifestJsonOptions,
            cancellationToken: cancellationToken).ConfigureAwait(false);
        if (manifest is null
            || string.IsNullOrWhiteSpace(manifest.Id)
            || string.IsNullOrWhiteSpace(manifest.DisplayName)
            || string.IsNullOrWhiteSpace(manifest.SpritesheetPath))
        {
            return null;
        }

        var atlasPath = Path.GetFullPath(Path.Combine(petDirectory, manifest.SpritesheetPath));
        if (!IsContainedBy(petDirectory, atlasPath) || !File.Exists(atlasPath))
        {
            return null;
        }

        var bytes = await File.ReadAllBytesAsync(atlasPath, cancellationToken).ConfigureAwait(false);
        return IsDecodableWebp(bytes)
            ? new PetAsset(
                manifest.Id,
                manifest.DisplayName,
                bytes,
                PetAssetFormat.CodexWebpAtlas,
                PetAssetSource.Codex)
            : null;
    }

    private PetAsset? LoadBuiltIn(string selectedId)
    {
        var asarPath = locateAsar();
        if (string.IsNullOrWhiteSpace(asarPath) || !File.Exists(asarPath))
        {
            return null;
        }

        var filePrefix = $"{selectedId}-spritesheet-";
        var bytes = AsarArchiveReader.ReadFirst(
            asarPath,
            path =>
            {
                var fileName = Path.GetFileName(path);
                return fileName.StartsWith(filePrefix, StringComparison.OrdinalIgnoreCase)
                    && fileName.EndsWith(".webp", StringComparison.OrdinalIgnoreCase);
            });
        return bytes is not null && IsDecodableWebp(bytes)
            ? new PetAsset(
                selectedId,
                ToDisplayName(selectedId),
                bytes,
                PetAssetFormat.CodexWebpAtlas,
                PetAssetSource.Codex)
            : null;
    }

    private static bool IsContainedBy(string parent, string candidate)
    {
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var parentWithSeparator = Path.TrimEndingDirectorySeparator(parent)
            + Path.DirectorySeparatorChar;
        return candidate.StartsWith(parentWithSeparator, comparison);
    }

    private static bool IsWebp(ReadOnlySpan<byte> bytes) =>
        bytes.Length >= 12
        && bytes[..4].SequenceEqual("RIFF"u8)
        && bytes.Slice(8, 4).SequenceEqual("WEBP"u8);

    private static bool IsDecodableWebp(byte[] bytes)
    {
        if (!IsWebp(bytes))
        {
            return false;
        }

        try
        {
            using var stream = new SKMemoryStream(bytes);
            using var codec = SKCodec.Create(stream);
            if (codec is null
                || codec.Info.Width <= 0
                || codec.Info.Height <= 0
                || codec.Info.Width > MaxDecodedDimension
                || codec.Info.Height > MaxDecodedDimension
                || (long)codec.Info.Width * codec.Info.Height > MaxDecodedPixels)
            {
                return false;
            }

            var outputInfo = new SKImageInfo(
                codec.Info.Width,
                codec.Info.Height,
                SKColorType.Rgba8888,
                SKAlphaType.Premul);
            using var bitmap = new SKBitmap(outputInfo);
            var pixels = bitmap.GetPixels();
            return pixels != IntPtr.Zero
                && codec.GetPixels(outputInfo, pixels) == SKCodecResult.Success;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static string ToDisplayName(string id)
    {
        var words = id.Split(['-', '_'], StringSplitOptions.RemoveEmptyEntries);
        return string.Join(
            ' ',
            words.Select(word => char.ToUpperInvariant(word[0]) + word[1..]));
    }

    private sealed record PetManifest(
        string Id,
        string DisplayName,
        string SpritesheetPath);
}
