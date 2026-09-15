using Avalonia;

namespace CodexThreadWorkbench;

public sealed class ConfirmationOverlayPlacement
{
    public bool IsManuallyPositioned { get; private set; }

    public void MarkManuallyPositioned() => IsManuallyPositioned = true;

    public PixelPoint ResolveForShow(
        PixelRect workingArea,
        PixelPoint currentPosition,
        PixelSize windowSize)
    {
        if (!IsManuallyPositioned)
        {
            return new PixelPoint(
                workingArea.X,
                workingArea.Y + Math.Max(0, (workingArea.Height - windowSize.Height) / 2));
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
        int visibleWidth)
    {
        var maximumY = Math.Max(
            workingArea.Y,
            workingArea.Bottom - windowSize.Height);
        var clampedVisibleWidth = Math.Clamp(
            visibleWidth,
            1,
            windowSize.Width);
        return new PixelPoint(
            workingArea.X - windowSize.Width + clampedVisibleWidth,
            Math.Clamp(expandedPosition.Y, workingArea.Y, maximumY));
    }
}
