using Avalonia;

namespace CodexThreadWorkbench;

public sealed class ConfirmationOverlayPlacement
{
    private const int TopMargin = 8;

    public bool IsManuallyPositioned { get; private set; }

    public void MarkManuallyPositioned() => IsManuallyPositioned = true;

    public PixelSize ResolvePixelSize(Size logicalSize, double renderScaling)
    {
        var scale = double.IsFinite(renderScaling) && renderScaling > 0
            ? renderScaling
            : 1;
        return new PixelSize(
            Math.Max(1, (int)Math.Ceiling(logicalSize.Width * scale)),
            Math.Max(1, (int)Math.Ceiling(logicalSize.Height * scale)));
    }

    public PixelPoint ResolveForShow(
        PixelRect workingArea,
        PixelPoint currentPosition,
        PixelSize windowSize)
    {
        if (!IsManuallyPositioned)
        {
            return new PixelPoint(
                workingArea.X + ((workingArea.Width - windowSize.Width) / 2),
                workingArea.Y + TopMargin);
        }

        var maximumX = Math.Max(
            workingArea.X,
            workingArea.Right - windowSize.Width);
        var maximumY = Math.Max(
            workingArea.Y,
            workingArea.Bottom - windowSize.Height);
        return new PixelPoint(
            Math.Clamp(currentPosition.X, workingArea.X, maximumX),
            Math.Clamp(currentPosition.Y, workingArea.Y, maximumY));
    }

    public PixelPoint ResolveRetracted(
        PixelRect workingArea,
        PixelPoint expandedPosition,
        PixelSize windowSize,
        int visibleHeight)
    {
        var maximumX = Math.Max(
            workingArea.X,
            workingArea.Right - windowSize.Width);
        var clampedVisibleHeight = Math.Clamp(
            visibleHeight,
            1,
            windowSize.Height);
        return new PixelPoint(
            Math.Clamp(expandedPosition.X, workingArea.X, maximumX),
            workingArea.Y - windowSize.Height + clampedVisibleHeight);
    }
}
