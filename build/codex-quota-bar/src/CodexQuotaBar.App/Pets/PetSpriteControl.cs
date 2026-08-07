using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using CodexQuotaBar.Core.Pets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace CodexQuotaBar.App.Pets;

public sealed class PetSpriteControl : Control, IDisposable
{
    private const int CellWidth = 192;
    private const int CellHeight = 208;

    private readonly DispatcherTimer _timer;
    private LoadedPet? _pet;
    private PetAnimationState _state;
    private int _frame;
    private int _disposed;
    private int _loadGeneration;

    public PetSpriteControl()
    {
        _timer = new DispatcherTimer(DispatcherPriority.Render)
        {
            Interval = TimeSpan.FromMilliseconds(180),
        };
        _timer.Tick += OnTimerTick;
    }

    public void SetPet(PetAsset? pet)
    {
        if (pet is not null && _pet?.Matches(pet) == true)
        {
            return;
        }

        var replacement = pet is null ? null : LoadedPet.Create(pet);
        _timer.Stop();
        var previous = _pet;
        _pet = replacement;
        _frame = 0;
        if (replacement is not null)
        {
            _loadGeneration++;
            ScheduleNextFrame();
        }

        previous?.Dispose();
        InvalidateVisual();
    }

    public void SetAnimation(PetAnimationState state)
    {
        if (_state == state)
        {
            return;
        }

        _state = state;
        if (_pet?.Format == PetAssetFormat.CodexWebpAtlas)
        {
            _frame = 0;
        }

        ScheduleNextFrame();
        InvalidateVisual();
    }

    public override void Render(DrawingContext context)
    {
        base.Render(context);
        if (_pet is null || Bounds.Width <= 0 || Bounds.Height <= 0)
        {
            return;
        }

        if (_pet.Format == PetAssetFormat.CodexWebpAtlas)
        {
            var definition = PetAnimationDefinition.For(_state);
            var frame = Math.Min(_frame, definition.Durations.Count - 1);
            var source = new Rect(
                frame * CellWidth,
                definition.Row * CellHeight,
                CellWidth,
                CellHeight);
            context.DrawImage(_pet.Atlas!, source, new Rect(Bounds.Size));
            return;
        }

        var bitmap = _pet.AnimatedFrames[Math.Min(_frame, _pet.AnimatedFrames.Count - 1)];
        var sourceRect = new Rect(
            0,
            0,
            bitmap.PixelSize.Width,
            bitmap.PixelSize.Height);
        context.DrawImage(bitmap, sourceRect, AspectFit(sourceRect.Size, Bounds.Size));
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
        {
            return;
        }

        _timer.Stop();
        _timer.Tick -= OnTimerTick;
        _pet?.Dispose();
        _pet = null;
    }

    private void OnTimerTick(object? sender, EventArgs args)
    {
        AdvanceFrame();
        ScheduleNextFrame();
        InvalidateVisual();
    }

    private void ScheduleNextFrame()
    {
        if (_pet is null)
        {
            _timer.Stop();
            return;
        }

        _frame %= CurrentFrameCount;
        _timer.Interval = CurrentFrameDuration;
        _timer.Start();
    }

    private int CurrentFrameCount => _pet?.Format == PetAssetFormat.AnimatedGif
        ? _pet.AnimatedFrames.Count
        : PetAnimationDefinition.For(_state).Durations.Count;

    private TimeSpan CurrentFrameDuration => _pet?.Format == PetAssetFormat.AnimatedGif
        ? _pet.AnimatedDurations[_frame]
        : PetAnimationDefinition.For(_state).Durations[_frame];

    private void AdvanceFrame() => _frame = (_frame + 1) % CurrentFrameCount;

    private static Rect AspectFit(Size source, Size bounds)
    {
        var scale = Math.Min(bounds.Width / source.Width, bounds.Height / source.Height);
        var width = source.Width * scale;
        var height = source.Height * scale;
        return new Rect(
            (bounds.Width - width) / 2,
            (bounds.Height - height) / 2,
            width,
            height);
    }

    internal int FrameIndexForTest => _frame;

    internal int LoadedFrameCountForTest => _pet?.Format == PetAssetFormat.AnimatedGif
        ? _pet.AnimatedFrames.Count
        : _pet is null
            ? 0
            : 1;

    internal TimeSpan CurrentFrameDurationForTest =>
        _pet is null ? TimeSpan.Zero : CurrentFrameDuration;

    internal int LoadGenerationForTest => _loadGeneration;

    internal void AdvanceFrameForTest() => AdvanceFrame();

    private sealed class LoadedPet : IDisposable
    {
        private LoadedPet(
            PetAsset asset,
            byte[] payloadHash,
            Bitmap? atlas,
            IReadOnlyList<Bitmap> animatedFrames,
            IReadOnlyList<TimeSpan> animatedDurations)
        {
            Id = asset.Id;
            Format = asset.Format;
            Source = asset.Source;
            PayloadHash = payloadHash;
            Atlas = atlas;
            AnimatedFrames = animatedFrames;
            AnimatedDurations = animatedDurations;
        }

        public string Id { get; }

        public PetAssetFormat Format { get; }

        public PetAssetSource Source { get; }

        public byte[] PayloadHash { get; }

        public Bitmap? Atlas { get; }

        public IReadOnlyList<Bitmap> AnimatedFrames { get; }

        public IReadOnlyList<TimeSpan> AnimatedDurations { get; }

        public static LoadedPet Create(PetAsset asset)
        {
            var hash = SHA256.HashData(asset.Payload);
            if (asset.Format == PetAssetFormat.CodexWebpAtlas)
            {
                using var stream = new MemoryStream(asset.Payload, writable: false);
                return new LoadedPet(
                    asset,
                    hash,
                    new Bitmap(stream),
                    [],
                    []);
            }

            var decoded = AnimatedGifDecoder.Decode(asset.Payload);
            var frames = new List<Bitmap>(decoded.Count);
            try
            {
                foreach (var frame in decoded.Frames)
                {
                    frames.Add(CreateBitmap(
                        decoded.Width,
                        decoded.Height,
                        frame.RgbaPixels));
                }

                return new LoadedPet(
                    asset,
                    hash,
                    null,
                    frames,
                    decoded.Frames.Select(frame => frame.Duration).ToArray());
            }
            catch
            {
                foreach (var frame in frames)
                {
                    frame.Dispose();
                }

                throw;
            }
        }

        public bool Matches(PetAsset asset) =>
            string.Equals(Id, asset.Id, StringComparison.Ordinal)
            && Format == asset.Format
            && Source == asset.Source
            && PayloadHash.AsSpan().SequenceEqual(SHA256.HashData(asset.Payload));

        public void Dispose()
        {
            Atlas?.Dispose();
            foreach (var frame in AnimatedFrames)
            {
                frame.Dispose();
            }
        }

        private static Bitmap CreateBitmap(int width, int height, byte[] rgbaPixels)
        {
            var bitmap = new WriteableBitmap(
                new PixelSize(width, height),
                new Vector(96, 96),
                PixelFormat.Rgba8888,
                AlphaFormat.Premul);
            using var framebuffer = bitmap.Lock();
            var sourceRowBytes = checked(width * 4);
            if (framebuffer.RowBytes == sourceRowBytes)
            {
                Marshal.Copy(rgbaPixels, 0, framebuffer.Address, rgbaPixels.Length);
                return bitmap;
            }

            for (var row = 0; row < height; row++)
            {
                Marshal.Copy(
                    rgbaPixels,
                    row * sourceRowBytes,
                    framebuffer.Address + (row * framebuffer.RowBytes),
                    sourceRowBytes);
            }

            return bitmap;
        }
    }
}
