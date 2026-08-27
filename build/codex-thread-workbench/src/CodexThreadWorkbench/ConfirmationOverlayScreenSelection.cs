using Avalonia;

namespace CodexThreadWorkbench;

public static class ConfirmationOverlayScreenSelection
{
    public static PixelRect ResolveWorkingArea(
        PixelRect currentWorkingArea,
        IEnumerable<PixelRect> availableWorkingAreas)
    {
        var selectedWorkingArea = currentWorkingArea;
        var hasSelection = false;
        foreach (var workingArea in availableWorkingAreas)
        {
            if (!hasSelection ||
                workingArea.X < selectedWorkingArea.X ||
                (workingArea.X == selectedWorkingArea.X &&
                 workingArea.Y < selectedWorkingArea.Y))
            {
                selectedWorkingArea = workingArea;
                hasSelection = true;
            }
        }

        return selectedWorkingArea;
    }
}
