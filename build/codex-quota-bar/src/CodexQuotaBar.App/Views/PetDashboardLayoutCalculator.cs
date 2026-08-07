using Avalonia;

namespace CodexQuotaBar.App.Views;

public enum PetDashboardSide
{
    Left,
    Right,
}

public sealed record PetDashboardLayout(
    PixelPoint WindowPosition,
    Size WindowSize,
    PetDashboardSide Side,
    bool SideContentAvailable,
    bool SideContentAllocated,
    PixelRect PetScreenRect,
    PixelRect QuotaStripScreenRect,
    PixelRect? SideLaneScreenRect,
    PixelRect? NotificationScreenRect,
    PixelRect? DetailsScreenRect);

public static class PetDashboardLayoutCalculator
{
    public const double PetColumnWidth = 168;
    public const double SideLaneWidth = 224;
    public const double SideGap = 10;
    public const double DashboardHeight = 200;
    public static readonly Rect QuotaStripRect = new(0, 0, 168, 72);
    public static readonly Rect PetRect = new(24, 66, 120, 130);

    private static readonly Rect SideLaneRect = new(0, 0, 224, 184);
    private static readonly Rect NotificationRect = new(0, 0, 224, 82);
    private static readonly Rect DetailsRect = new(0, 92, 224, 84);

    public static PetDashboardLayout Calculate(
        PixelRect workingArea,
        PixelPoint petScreenPosition,
        bool sideContentVisible,
        double scaling,
        PetDashboardSide? preferredSide = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(scaling);

        var petColumnWidth = ToExtent(PetColumnWidth, scaling);
        var dashboardHeight = ToExtent(DashboardHeight, scaling);
        var sideLaneWidth = ToExtent(SideLaneWidth, scaling);
        var sideGap = ToExtent(SideGap, scaling);
        var sideWidth = sideLaneWidth + sideGap;
        EnsureCompactDashboardFits(workingArea, petColumnWidth, dashboardHeight);

        var requestedPetColumnPosition = new PixelPoint(
            petScreenPosition.X - ToOffset(PetRect.X, scaling),
            petScreenPosition.Y - ToOffset(PetRect.Y, scaling));
        var clampedPetColumnPosition = ClampCompactPetColumnPosition(
            workingArea,
            requestedPetColumnPosition,
            petColumnWidth,
            dashboardHeight);
        var leftFits = clampedPetColumnPosition.X - sideWidth >= workingArea.X;
        var rightFits = clampedPetColumnPosition.X + petColumnWidth + sideWidth <= workingArea.Right;
        var side = ResolveSide(
            workingArea,
            clampedPetColumnPosition,
            petColumnWidth,
            preferredSide,
            leftFits,
            rightFits);
        var sideContentAvailable = leftFits || rightFits;
        var sideContentAllocated = sideContentVisible && sideContentAvailable;

        var sideLanePosition = side == PetDashboardSide.Left
            ? new PixelPoint(clampedPetColumnPosition.X - sideWidth, clampedPetColumnPosition.Y)
            : new PixelPoint(clampedPetColumnPosition.X + petColumnWidth + sideGap, clampedPetColumnPosition.Y);

        return new PetDashboardLayout(
            clampedPetColumnPosition,
            new Size(PetColumnWidth, DashboardHeight),
            side,
            sideContentAvailable,
            sideContentAllocated,
            Translate(clampedPetColumnPosition, PetRect, scaling),
            Translate(clampedPetColumnPosition, QuotaStripRect, scaling),
            sideContentAllocated ? Translate(sideLanePosition, SideLaneRect, scaling) : null,
            sideContentAllocated ? Translate(sideLanePosition, NotificationRect, scaling) : null,
            sideContentAllocated ? Translate(sideLanePosition, DetailsRect, scaling) : null);
    }

    private static PetDashboardSide ResolveSide(
        PixelRect workingArea,
        PixelPoint petColumnPosition,
        int petColumnWidth,
        PetDashboardSide? preferredSide,
        bool leftFits,
        bool rightFits)
    {
        if (preferredSide == PetDashboardSide.Left && leftFits
            || preferredSide == PetDashboardSide.Right && rightFits)
        {
            return preferredSide.Value;
        }

        if (leftFits != rightFits)
        {
            return leftFits ? PetDashboardSide.Left : PetDashboardSide.Right;
        }

        if (preferredSide is { } preferred)
        {
            return preferred;
        }

        var leftAvailable = petColumnPosition.X - workingArea.X;
        var rightAvailable = workingArea.Right - (petColumnPosition.X + petColumnWidth);
        return leftAvailable > rightAvailable ? PetDashboardSide.Left : PetDashboardSide.Right;
    }

    private static PixelPoint ClampCompactPetColumnPosition(
        PixelRect workingArea,
        PixelPoint position,
        int petColumnWidth,
        int dashboardHeight)
    {
        var maximumX = workingArea.Right - petColumnWidth;
        var maximumY = workingArea.Bottom - dashboardHeight;

        return new PixelPoint(
            Math.Clamp(position.X, workingArea.X, maximumX),
            Math.Clamp(position.Y, workingArea.Y, maximumY));
    }

    private static PixelRect Translate(PixelPoint origin, Rect logicalRect, double scaling) =>
        new(
            origin.X + ToOffset(logicalRect.X, scaling),
            origin.Y + ToOffset(logicalRect.Y, scaling),
            ToExtent(logicalRect.Width, scaling),
            ToExtent(logicalRect.Height, scaling));

    private static void EnsureCompactDashboardFits(PixelRect workingArea, int petColumnWidth, int dashboardHeight)
    {
        if (workingArea.Width < petColumnWidth || workingArea.Height < dashboardHeight)
        {
            throw new ArgumentException("The working area cannot contain the compact pet dashboard.", nameof(workingArea));
        }
    }

    private static int ToOffset(double logicalOffset, double scaling)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(logicalOffset);
        return (int)Math.Round(logicalOffset * scaling, MidpointRounding.AwayFromZero);
    }

    private static int ToExtent(double logicalExtent, double scaling) =>
        Math.Max(1, (int)Math.Ceiling(logicalExtent * scaling));
}
