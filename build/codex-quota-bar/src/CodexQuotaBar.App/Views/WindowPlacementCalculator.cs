using Avalonia;

namespace CodexQuotaBar.App.Views;

public static class WindowPlacementCalculator
{
    public static PixelPoint TopRight(
        PixelRect workingArea,
        double logicalWidth,
        double logicalHeight,
        double scaling,
        int margin)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(margin);
        var width = ToPixels(logicalWidth, scaling);
        var candidate = new PixelPoint(workingArea.Right - width - margin, workingArea.Y + margin);
        return Clamp(candidate, workingArea, logicalWidth, logicalHeight, scaling);
    }

    public static PixelPoint Clamp(
        PixelPoint point,
        PixelRect workingArea,
        double logicalWidth,
        double logicalHeight,
        double scaling)
    {
        var width = ToPixels(logicalWidth, scaling);
        var height = ToPixels(logicalHeight, scaling);
        return new PixelPoint(
            Math.Clamp(point.X, workingArea.X, Math.Max(workingArea.X, workingArea.Right - width)),
            Math.Clamp(point.Y, workingArea.Y, Math.Max(workingArea.Y, workingArea.Bottom - height)));
    }

    private static int ToPixels(double logicalSize, double scaling)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(logicalSize);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(scaling);
        return Math.Max(1, (int)Math.Ceiling(logicalSize * scaling));
    }
}
