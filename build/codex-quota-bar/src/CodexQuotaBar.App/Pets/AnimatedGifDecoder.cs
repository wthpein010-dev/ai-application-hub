using System.Runtime.InteropServices;
using SkiaSharp;

namespace CodexQuotaBar.App.Pets;

public sealed record AnimatedGifFrame(byte[] RgbaPixels, TimeSpan Duration);

public sealed class AnimatedGifFrames
{
    public AnimatedGifFrames(
        int width,
        int height,
        IReadOnlyList<AnimatedGifFrame> frames)
    {
        Width = width;
        Height = height;
        Frames = frames;
    }

    public int Width { get; }

    public int Height { get; }

    public IReadOnlyList<AnimatedGifFrame> Frames { get; }

    public int Count => Frames.Count;

    public byte GetAlpha(int frameIndex, int x, int y)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(frameIndex);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(frameIndex, Frames.Count);
        ArgumentOutOfRangeException.ThrowIfNegative(x);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(x, Width);
        ArgumentOutOfRangeException.ThrowIfNegative(y);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(y, Height);
        return Frames[frameIndex].RgbaPixels[((y * Width) + x) * 4 + 3];
    }
}

public static class AnimatedGifDecoder
{
    private const int MaxDimension = 8192;
    private const int MaxFrameCount = 256;
    private const long MaxPixelsPerFrame = 16_777_216;
    private const long MaxDecodedBytes = 128L * 1024 * 1024;

    public static AnimatedGifFrames Decode(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (bytes.Length < 14
            || !bytes.AsSpan(0, 3).SequenceEqual("GIF"u8)
            || bytes[^1] != 0x3B)
        {
            throw new InvalidDataException("The GIF file is incomplete.");
        }

        try
        {
            using var stream = new SKMemoryStream(bytes);
            using var codec = SKCodec.Create(stream);
            if (codec is null || codec.EncodedFormat != SKEncodedImageFormat.Gif)
            {
                throw new InvalidDataException("The pet resource is not a GIF.");
            }

            var info = codec.Info;
            var frameInfos = codec.FrameInfo;
            ValidateBounds(info.Width, info.Height, frameInfos.Length);
            var outputInfo = new SKImageInfo(
                info.Width,
                info.Height,
                SKColorType.Rgba8888,
                SKAlphaType.Premul);
            var expectedRowBytes = checked(info.Width * 4);
            var expectedFrameBytes = checked(expectedRowBytes * info.Height);
            var frames = new AnimatedGifFrame[frameInfos.Length];

            for (var frameIndex = 0; frameIndex < frameInfos.Length; frameIndex++)
            {
                if (!frameInfos[frameIndex].FullyRecieved
                    || frameInfos[frameIndex].Duration <= 0)
                {
                    throw new InvalidDataException("The GIF contains an incomplete frame.");
                }

                using var bitmap = new SKBitmap(outputInfo);
                bitmap.Erase(SKColors.Transparent);
                var result = codec.GetPixels(
                    outputInfo,
                    bitmap.GetPixels(),
                    bitmap.RowBytes,
                    new SKCodecOptions(frameIndex, -1));
                if (result != SKCodecResult.Success)
                {
                    throw new InvalidDataException(
                        $"GIF frame {frameIndex} could not be decoded completely.");
                }

                var rgbaPixels = new byte[expectedFrameBytes];
                CopyPixels(bitmap, rgbaPixels, expectedRowBytes);
                frames[frameIndex] = new AnimatedGifFrame(
                    rgbaPixels,
                    TimeSpan.FromMilliseconds(frameInfos[frameIndex].Duration));
            }

            return new AnimatedGifFrames(info.Width, info.Height, frames);
        }
        catch (InvalidDataException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new InvalidDataException("The GIF could not be decoded.", exception);
        }
    }

    private static void ValidateBounds(int width, int height, int frameCount)
    {
        var pixels = (long)width * height;
        var decodedBytes = pixels * 4 * frameCount;
        if (width <= 0
            || height <= 0
            || width > MaxDimension
            || height > MaxDimension
            || pixels > MaxPixelsPerFrame
            || frameCount <= 0
            || frameCount > MaxFrameCount
            || decodedBytes > MaxDecodedBytes)
        {
            throw new InvalidDataException("The GIF dimensions or frame count exceed limits.");
        }
    }

    private static void CopyPixels(SKBitmap bitmap, byte[] destination, int rowBytes)
    {
        if (bitmap.RowBytes == rowBytes)
        {
            Marshal.Copy(bitmap.GetPixels(), destination, 0, destination.Length);
            return;
        }

        for (var row = 0; row < bitmap.Height; row++)
        {
            Marshal.Copy(
                bitmap.GetPixels() + (row * bitmap.RowBytes),
                destination,
                row * rowBytes,
                rowBytes);
        }
    }
}
