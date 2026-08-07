using CodexQuotaBar.App.Pets;
using CodexQuotaBar.Core.Pets;

namespace CodexQuotaBar.Tests.Pets;

public sealed class BundledPetProviderTests
{
    [Fact]
    public async Task FindAsync_returns_the_validated_bundled_hamster()
    {
        var provider = new BundledPetProvider(OpenBundledAsset);

        var pet = await provider.FindAsync();

        Assert.NotNull(pet);
        Assert.Equal("bundled-suit-hamster", pet.Id);
        Assert.Equal("西装仓鼠", pet.DisplayName);
        Assert.Equal(PetAssetFormat.AnimatedGif, pet.Format);
        Assert.Equal(PetAssetSource.BundledFallback, pet.Source);
        Assert.Equal(
            "A3E00783DC4A6C2C0656CF3E79915D214AF2DAEA8BCE8C75EB99616F3BDE3BE8",
            Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(pet.Payload)));
    }

    [Fact]
    public async Task FindAsync_rejects_a_corrupt_resource_with_safe_diagnostic()
    {
        var diagnostics = new List<string>();
        var provider = new BundledPetProvider(
            () => new MemoryStream([1, 2, 3]),
            diagnostics.Add);

        var pet = await provider.FindAsync();

        Assert.Null(pet);
        var diagnostic = Assert.Single(diagnostics);
        Assert.Equal("Bundled pet resource could not be decoded.", diagnostic);
    }

    [Fact]
    public async Task FindAsync_returns_null_when_the_resource_is_missing()
    {
        var diagnostics = new List<string>();
        var provider = new BundledPetProvider(
            () => throw new FileNotFoundException("private resource location"),
            diagnostics.Add);

        var pet = await provider.FindAsync();

        Assert.Null(pet);
        Assert.Equal("Bundled pet resource could not be loaded.", Assert.Single(diagnostics));
    }

    [Fact]
    public async Task FindAsync_propagates_requested_cancellation()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var provider = new BundledPetProvider(OpenBundledAsset);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => provider.FindAsync(cancellation.Token));
    }

    private static Stream OpenBundledAsset() => File.OpenRead(
        Path.Combine(AppContext.BaseDirectory, "Assets", "Pets", "suit-hamster.gif"));
}
