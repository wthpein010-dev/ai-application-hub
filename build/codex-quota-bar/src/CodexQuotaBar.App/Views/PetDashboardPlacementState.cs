using Avalonia;

namespace CodexQuotaBar.App.Views;

public sealed class PetDashboardPlacementState
{
    public PetDashboardPlacementState(
        PixelPoint petScreenPosition,
        PetDashboardSide? preferredSide = null)
    {
        PetScreenPosition = petScreenPosition;
        PreferredSide = preferredSide;
    }

    public PixelPoint PetScreenPosition { get; private set; }

    public PetDashboardSide? PreferredSide { get; private set; }

    public PetDashboardLayout Calculate(
        PixelRect workingArea,
        bool sideContentVisible,
        double scaling)
    {
        var layout = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            PetScreenPosition,
            sideContentVisible,
            scaling,
            PreferredSide);
        PetScreenPosition = new PixelPoint(layout.PetScreenRect.X, layout.PetScreenRect.Y);
        PreferredSide = layout.Side;
        return layout;
    }

    public void SetPetScreenPosition(PixelPoint position) => PetScreenPosition = position;

    public void MoveBy(int deltaX, int deltaY) =>
        PetScreenPosition = new PixelPoint(
            PetScreenPosition.X + deltaX,
            PetScreenPosition.Y + deltaY);
}
