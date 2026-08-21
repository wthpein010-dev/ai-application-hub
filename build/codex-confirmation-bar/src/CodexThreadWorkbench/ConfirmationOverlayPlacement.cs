using Avalonia;

namespace CodexThreadWorkbench;

public sealed class ConfirmationOverlayPlacement
{
    private const int TopMargin = 8;

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
}
