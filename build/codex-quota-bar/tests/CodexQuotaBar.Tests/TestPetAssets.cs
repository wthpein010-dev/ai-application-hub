using System.Buffers.Binary;
using SkiaSharp;

namespace CodexQuotaBar.Tests;

internal static class TestPetAssets
{
    private static readonly Lazy<byte[]> s_validWebpAtlas = new(CreateValidWebpAtlas);
    private static readonly Lazy<byte[]> s_codecReadableCorruptWebp =
        new(CreateCodecReadableCorruptWebp);
    private static readonly Lazy<byte[]> s_oversizedWebp = new(CreateOversizedWebp);

    public static byte[] ValidWebpAtlas => s_validWebpAtlas.Value;

    public static byte[] CodecReadableCorruptWebp => s_codecReadableCorruptWebp.Value;

    public static byte[] OversizedWebp => s_oversizedWebp.Value;

    public static byte[] SignedButCorruptWebp =>
        [.. "RIFF"u8, 4, 0, 0, 0, .. "WEBP"u8];

    private static byte[] CreateValidWebpAtlas()
    {
        using var bitmap = new SKBitmap(1536, 1872);
        bitmap.Erase(SKColors.Transparent);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Webp, 100);
        return data.ToArray();
    }

    private static byte[] CreateCodecReadableCorruptWebp()
    {
        using var bitmap = new SKBitmap(64, 64);
        for (var y = 0; y < bitmap.Height; y++)
        {
            for (var x = 0; x < bitmap.Width; x++)
            {
                bitmap.SetPixel(
                    x,
                    y,
                    new SKColor(
                        (byte)((x * 17) % 256),
                        (byte)((y * 29) % 256),
                        (byte)(((x + y) * 11) % 256),
                        byte.MaxValue));
            }
        }

        using var pixmap = bitmap.PeekPixels();
        using var encoded = pixmap.Encode(
            new SKWebpEncoderOptions(SKWebpEncoderCompression.Lossless, 100));
        var bytes = encoded.ToArray();
        CorruptCompressedPayload(bytes);
        return bytes;
    }

    private static byte[] CreateOversizedWebp()
    {
        using var bitmap = new SKBitmap(8193, 1);
        bitmap.Erase(SKColors.Transparent);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Webp, 100);
        return data.ToArray();
    }

    private static void CorruptCompressedPayload(byte[] bytes)
    {
        for (var offset = 12; offset + 8 <= bytes.Length;)
        {
            var chunkSize = checked((int)BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset + 4, 4)));
            var payloadOffset = offset + 8;
            if (payloadOffset + chunkSize > bytes.Length)
            {
                throw new InvalidOperationException("Generated WebP chunk extends past the encoded data.");
            }

            var chunk = bytes.AsSpan(offset, 4);
            var preservedHeaderLength = chunk.SequenceEqual("VP8L"u8)
                ? 5
                : chunk.SequenceEqual("VP8 "u8)
                    ? 10
                    : 0;
            if (preservedHeaderLength > 0)
            {
                if (chunkSize <= preservedHeaderLength)
                {
                    throw new InvalidOperationException("Generated WebP payload is too small to corrupt.");
                }

                bytes.AsSpan(
                    payloadOffset + preservedHeaderLength,
                    chunkSize - preservedHeaderLength).Fill(byte.MaxValue);
                return;
            }

            offset = payloadOffset + chunkSize + (chunkSize & 1);
        }

        throw new InvalidOperationException("Generated WebP has no VP8 payload.");
    }
}
