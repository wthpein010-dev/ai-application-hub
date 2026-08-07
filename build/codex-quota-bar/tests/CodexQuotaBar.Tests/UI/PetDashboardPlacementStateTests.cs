using Avalonia;
using CodexQuotaBar.App.Views;

namespace CodexQuotaBar.Tests.UI;

public sealed class PetDashboardPlacementStateTests
{
    [Fact]
    public void Placement_state_keeps_one_visible_anchor_across_dpi_changes()
    {
        var anchor = new PixelPoint(1000, 1500);
        var state = new PetDashboardPlacementState(anchor);
        var workingArea = new PixelRect(0, 0, 4000, 3000);

        var one = state.Calculate(workingArea, sideContentVisible: false, scaling: 1);
        var oneAndAHalf = state.Calculate(workingArea, sideContentVisible: false, scaling: 1.5);
        var two = state.Calculate(workingArea, sideContentVisible: false, scaling: 2);

        Assert.Equal(anchor, state.PetScreenPosition);
        Assert.Equal(anchor, TopLeft(one.PetScreenRect));
        Assert.Equal(anchor, TopLeft(oneAndAHalf.PetScreenRect));
        Assert.Equal(anchor, TopLeft(two.PetScreenRect));
    }

    [Fact]
    public void Placement_state_uses_drag_deltas_on_the_visible_anchor()
    {
        var state = new PetDashboardPlacementState(new PixelPoint(200, 300));

        state.MoveBy(17, -9);

        Assert.Equal(new PixelPoint(217, 291), state.PetScreenPosition);
    }

    [Fact]
    public void Placement_state_retains_resolved_side_through_close_and_reopen()
    {
        var state = new PetDashboardPlacementState(
            new PixelPoint(408, 124),
            PetDashboardSide.Right);
        var workingArea = new PixelRect(0, 0, 1000, 600);

        var open = state.Calculate(workingArea, sideContentVisible: true, scaling: 1);
        var closed = state.Calculate(workingArea, sideContentVisible: false, scaling: 1);
        var reopened = state.Calculate(workingArea, sideContentVisible: true, scaling: 1);

        Assert.Equal(PetDashboardSide.Right, state.PreferredSide);
        Assert.Equal(open.PetScreenRect, closed.PetScreenRect);
        Assert.Equal(open.PetScreenRect, reopened.PetScreenRect);
    }

    private static PixelPoint TopLeft(PixelRect rect) => new(rect.X, rect.Y);
}
