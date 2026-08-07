using CodexQuotaBar.App.Pets;

namespace CodexQuotaBar.Tests.Pets;

public sealed class AnimatedGifDecoderTests
{
    [Fact]
    public void Decode_preserves_every_bundled_frame_duration_and_transparent_corner()
    {
        var bytes = File.ReadAllBytes(BundledAssetPath);

        var frames = AnimatedGifDecoder.Decode(bytes);

        Assert.Equal(133, frames.Width);
        Assert.Equal(142, frames.Height);
        Assert.Equal(62, frames.Count);
        Assert.All(
            frames.Frames,
            frame => Assert.Equal(TimeSpan.FromMilliseconds(30), frame.Duration));
        Assert.Equal(0, frames.GetAlpha(frameIndex: 0, x: 0, y: 0));
        Assert.Equal(0, frames.GetAlpha(frameIndex: 61, x: 132, y: 141));
    }

    [Fact]
    public void Decode_produces_independent_complete_frame_buffers()
    {
        var frames = AnimatedGifDecoder.Decode(File.ReadAllBytes(BundledAssetPath));

        Assert.All(
            frames.Frames,
            frame => Assert.Equal(133 * 142 * 4, frame.RgbaPixels.Length));
        Assert.Equal(62, frames.Frames.Select(frame => frame.RgbaPixels).Distinct().Count());
        Assert.Contains(
            frames.Frames.Skip(1),
            frame => !frame.RgbaPixels.AsSpan().SequenceEqual(frames.Frames[0].RgbaPixels));
    }

    [Theory]
    [InlineData(new byte[] { 1, 2, 3 })]
    [InlineData(new byte[] { 71, 73, 70, 56, 57, 97 })]
    public void Decode_rejects_corrupt_or_incomplete_gif(byte[] bytes)
    {
        Assert.Throws<InvalidDataException>(() => AnimatedGifDecoder.Decode(bytes));
    }

    [Fact]
    public void Decode_rejects_a_partially_truncated_bundled_gif()
    {
        var bytes = File.ReadAllBytes(BundledAssetPath);

        Assert.Throws<InvalidDataException>(
            () => AnimatedGifDecoder.Decode(bytes[..(bytes.Length / 2)]));
    }

    private static string BundledAssetPath =>
        Path.Combine(AppContext.BaseDirectory, "Assets", "Pets", "suit-hamster.gif");
}
