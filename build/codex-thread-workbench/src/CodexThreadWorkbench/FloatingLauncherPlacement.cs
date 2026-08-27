using Avalonia;

namespace CodexThreadWorkbench;

public sealed class FloatingLauncherPlacement(int edgeMargin = 16)
{
    private readonly int _edgeMargin = Math.Max(0, edgeMargin);

    public PixelPoint ResolveInitial(
        PixelRect workingArea,
        PixelSize windowSize,
        double? savedLeft,
        double? savedTop)
    {
        var defaultPosition = new PixelPoint(
            workingArea.Right - windowSize.Width - _edgeMargin,
            workingArea.Y + ((workingArea.Height - windowSize.Height) / 2));
        var requested = savedLeft is not null && savedTop is not null &&
                        double.IsFinite(savedLeft.Value) &&
                        double.IsFinite(savedTop.Value)
            ? new PixelPoint(
                (int)Math.Round(savedLeft.Value),
                (int)Math.Round(savedTop.Value))
            : defaultPosition;
        return ResolveSnapped(workingArea, requested, windowSize);
    }

    public PixelPoint ResolveInitialAcrossDisplays(
        IReadOnlyList<PixelRect> workingAreas,
        PixelRect primaryWorkingArea,
        PixelSize windowSize,
        double? savedLeft,
        double? savedTop)
    {
        if (savedLeft is null || savedTop is null ||
            !double.IsFinite(savedLeft.Value) ||
            !double.IsFinite(savedTop.Value))
        {
            return ResolveInitial(
                primaryWorkingArea,
                windowSize,
                savedLeft: null,
                savedTop: null);
        }

        var saved = new PixelPoint(
            (int)Math.Round(savedLeft.Value),
            (int)Math.Round(savedTop.Value));
        var center = new PixelPoint(
            saved.X + (windowSize.Width / 2),
            saved.Y + (windowSize.Height / 2));
        var target = workingAreas
            .Where(area => area.Width > 0 && area.Height > 0)
            .OrderBy(area => DistanceSquaredToArea(center, area))
            .FirstOrDefault();
        if (target.Width <= 0 || target.Height <= 0)
        {
            target = primaryWorkingArea;
        }

        return ResolveInitial(
            target,
            windowSize,
            savedLeft,
            savedTop);
    }

    public PixelPoint ResolveSnapped(
        PixelRect workingArea,
        PixelPoint requested,
        PixelSize windowSize)
    {
        var left = workingArea.X + _edgeMargin;
        var right = Math.Max(
            left,
            workingArea.Right - windowSize.Width - _edgeMargin);
        var top = workingArea.Y + _edgeMargin;
        var bottom = Math.Max(
            top,
            workingArea.Bottom - windowSize.Height - _edgeMargin);
        var snappedX = Math.Abs(requested.X - left) <= Math.Abs(requested.X - right)
            ? left
            : right;
        return new PixelPoint(
            snappedX,
            Math.Clamp(requested.Y, top, bottom));
    }

    private static long DistanceSquaredToArea(PixelPoint point, PixelRect area)
    {
        var closestX = Math.Clamp(point.X, area.X, area.Right);
        var closestY = Math.Clamp(point.Y, area.Y, area.Bottom);
        var deltaX = (long)point.X - closestX;
        var deltaY = (long)point.Y - closestY;
        return (deltaX * deltaX) + (deltaY * deltaY);
    }
}
