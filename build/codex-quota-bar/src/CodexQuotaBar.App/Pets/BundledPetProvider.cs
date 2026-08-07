using CodexQuotaBar.Core.Pets;
using System.Security.Cryptography;

namespace CodexQuotaBar.App.Pets;

public sealed class BundledPetProvider(
    Func<Stream> openResource,
    Action<string>? diagnostic = null) : IPetProvider
{
    private const int MaxEncodedBytes = 8 * 1024 * 1024;
    private static readonly byte[] ExpectedSha256 = Convert.FromHexString(
        "A3E00783DC4A6C2C0656CF3E79915D214AF2DAEA8BCE8C75EB99616F3BDE3BE8");

    public async Task<PetAsset?> FindAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        byte[] bytes;
        try
        {
            await using var stream = openResource();
            bytes = await ReadBoundedAsync(stream, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            diagnostic?.Invoke("Bundled pet resource could not be loaded.");
            return null;
        }

        try
        {
            if (!SHA256.HashData(bytes).AsSpan().SequenceEqual(ExpectedSha256))
            {
                throw new InvalidDataException("Bundled pet resource hash mismatch.");
            }

            return new PetAsset(
                "bundled-suit-hamster",
                "西装仓鼠",
                bytes,
                PetAssetFormat.AnimatedGif,
                PetAssetSource.BundledFallback);
        }
        catch (Exception)
        {
            diagnostic?.Invoke("Bundled pet resource could not be decoded.");
            return null;
        }
    }

    private static async Task<byte[]> ReadBoundedAsync(
        Stream stream,
        CancellationToken cancellationToken)
    {
        if (stream.CanSeek && stream.Length > MaxEncodedBytes)
        {
            throw new InvalidDataException("Bundled pet resource is too large.");
        }

        using var output = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var count = await stream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (count == 0)
            {
                return output.ToArray();
            }

            if (output.Length + count > MaxEncodedBytes)
            {
                throw new InvalidDataException("Bundled pet resource is too large.");
            }

            output.Write(buffer, 0, count);
        }
    }
}
