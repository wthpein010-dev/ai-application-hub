using Avalonia;
using CodexQuotaBar.App.Views;

namespace CodexQuotaBar.Tests.UI;

public sealed class PetDashboardLayoutCalculatorTests
{
    public static IEnumerable<object[]> EdgeGeometryCases =>
    [
        [1d, 402, 200, new PixelRect(0, 0, 168, 72), new PixelRect(24, 66, 120, 130), new PixelRect(178, 0, 224, 184), new PixelRect(178, 0, 224, 82), new PixelRect(178, 92, 224, 84), new PixelRect(234, 0, 168, 72), new PixelRect(258, 66, 120, 130), new PixelRect(0, 0, 224, 184), new PixelRect(0, 0, 224, 82), new PixelRect(0, 92, 224, 84)],
        [1.5d, 603, 300, new PixelRect(0, 0, 252, 108), new PixelRect(36, 99, 180, 195), new PixelRect(267, 0, 336, 276), new PixelRect(267, 0, 336, 123), new PixelRect(267, 138, 336, 126), new PixelRect(351, 0, 252, 108), new PixelRect(387, 99, 180, 195), new PixelRect(0, 0, 336, 276), new PixelRect(0, 0, 336, 123), new PixelRect(0, 138, 336, 126)],
        [2d, 804, 400, new PixelRect(0, 0, 336, 144), new PixelRect(48, 132, 240, 260), new PixelRect(356, 0, 448, 368), new PixelRect(356, 0, 448, 164), new PixelRect(356, 184, 448, 168), new PixelRect(468, 0, 336, 144), new PixelRect(516, 132, 240, 260), new PixelRect(0, 0, 448, 368), new PixelRect(0, 0, 448, 164), new PixelRect(0, 184, 448, 168)],
    ];

    [Fact]
    public void Right_edge_opens_side_content_to_the_left_without_moving_the_pet()
    {
        var compact = PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, 1920, 1080),
            petScreenPosition: new PixelPoint(1768, 164),
            sideContentVisible: false,
            scaling: 1);
        var expanded = PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, 1920, 1080),
            petScreenPosition: new PixelPoint(1768, 164),
            sideContentVisible: true,
            scaling: 1);

        Assert.Equal(PetDashboardSide.Left, expanded.Side);
        Assert.Equal(compact.PetScreenRect, expanded.PetScreenRect);
        Assert.True(expanded.SideContentAllocated);
        Assert.False(expanded.QuotaStripScreenRect.Intersects(expanded.NotificationScreenRect!.Value));
        Assert.False(expanded.NotificationScreenRect.Value.Intersects(expanded.DetailsScreenRect!.Value));
    }

    [Fact]
    public void Left_edge_opens_side_content_to_the_right_without_moving_the_pet()
    {
        var compact = PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, 1920, 1080),
            petScreenPosition: new PixelPoint(8, 164),
            sideContentVisible: false,
            scaling: 1);
        var expanded = PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, 1920, 1080),
            petScreenPosition: new PixelPoint(8, 164),
            sideContentVisible: true,
            scaling: 1);

        Assert.Equal(PetDashboardSide.Right, expanded.Side);
        Assert.Equal(compact.PetScreenRect, expanded.PetScreenRect);
        Assert.True(expanded.SideContentAllocated);
        Assert.False(expanded.QuotaStripScreenRect.Intersects(expanded.NotificationScreenRect!.Value));
        Assert.False(expanded.NotificationScreenRect.Value.Intersects(expanded.DetailsScreenRect!.Value));
    }

    [Theory]
    [MemberData(nameof(EdgeGeometryCases))]
    public void Expanded_dashboard_uses_exact_physical_geometry_at_both_screen_edges(
        double scaling,
        int width,
        int height,
        PixelRect rightQuota,
        PixelRect rightPet,
        PixelRect rightSideLane,
        PixelRect rightNotification,
        PixelRect rightDetails,
        PixelRect leftQuota,
        PixelRect leftPet,
        PixelRect leftSideLane,
        PixelRect leftNotification,
        PixelRect leftDetails)
    {
        var workingArea = new PixelRect(0, 0, width, height);
        var right = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            petScreenPosition: new PixelPoint(rightPet.X, rightPet.Y),
            sideContentVisible: true,
            scaling);
        var left = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            petScreenPosition: new PixelPoint(leftPet.X, leftPet.Y),
            sideContentVisible: true,
            scaling);

        Assert.Equal(PetDashboardSide.Right, right.Side);
        Assert.Equal(PetDashboardSide.Left, left.Side);
        Assert.True(right.SideContentAvailable);
        Assert.True(left.SideContentAvailable);
        Assert.True(right.SideContentAllocated);
        Assert.True(left.SideContentAllocated);
        Assert.Equal(rightQuota, right.QuotaStripScreenRect);
        Assert.Equal(rightPet, right.PetScreenRect);
        Assert.Equal(rightSideLane, right.SideLaneScreenRect);
        Assert.Equal(rightNotification, right.NotificationScreenRect);
        Assert.Equal(rightDetails, right.DetailsScreenRect);
        Assert.Equal(leftQuota, left.QuotaStripScreenRect);
        Assert.Equal(leftPet, left.PetScreenRect);
        Assert.Equal(leftSideLane, left.SideLaneScreenRect);
        Assert.Equal(leftNotification, left.NotificationScreenRect);
        Assert.Equal(leftDetails, left.DetailsScreenRect);
        AssertVisibleGeometry(workingArea, right);
        AssertVisibleGeometry(workingArea, left);
    }

    [Fact]
    public void Constrained_expanded_request_degrades_to_compact_geometry_without_moving_the_pet()
    {
        var workingArea = new PixelRect(100, 50, 200, 264);
        var compact = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            petScreenPosition: new PixelPoint(158, 174),
            sideContentVisible: false,
            scaling: 1);
        var constrainedExpanded = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            petScreenPosition: new PixelPoint(158, 174),
            sideContentVisible: true,
            scaling: 1);

        Assert.Equal(compact.PetScreenRect, constrainedExpanded.PetScreenRect);
        Assert.Equal(new Size(168, 200), constrainedExpanded.WindowSize);
        Assert.False(constrainedExpanded.SideContentAvailable);
        Assert.False(constrainedExpanded.SideContentAllocated);
        Assert.Null(constrainedExpanded.SideLaneScreenRect);
        Assert.Null(constrainedExpanded.NotificationScreenRect);
        Assert.Null(constrainedExpanded.DetailsScreenRect);
        AssertInside(workingArea, constrainedExpanded.PetScreenRect);
        AssertInside(workingArea, constrainedExpanded.QuotaStripScreenRect);
    }

    [Theory]
    [InlineData(135, 264)]
    [InlineData(136, 263)]
    public void Dashboard_rejects_only_working_areas_that_cannot_contain_compact_geometry(int width, int height)
    {
        Assert.Throws<ArgumentException>(() => PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, width, height),
            petScreenPosition: new PixelPoint(8, 124),
            sideContentVisible: false,
            scaling: 1));
    }

    [Fact]
    public void Visible_pet_anchor_is_stable_across_dpi_transitions()
    {
        var workingArea = new PixelRect(0, 0, 4000, 3000);
        var anchor = new PixelPoint(1000, 1500);

        var one = PetDashboardLayoutCalculator.Calculate(workingArea, anchor, false, scaling: 1);
        var oneAndAHalf = PetDashboardLayoutCalculator.Calculate(workingArea, anchor, false, scaling: 1.5);
        var two = PetDashboardLayoutCalculator.Calculate(workingArea, anchor, false, scaling: 2);

        Assert.Equal(anchor, TopLeft(one.PetScreenRect));
        Assert.Equal(anchor, TopLeft(oneAndAHalf.PetScreenRect));
        Assert.Equal(anchor, TopLeft(two.PetScreenRect));
        Assert.Equal(new PixelPoint(976, 1434), one.WindowPosition);
        Assert.Equal(new PixelPoint(964, 1401), oneAndAHalf.WindowPosition);
        Assert.Equal(new PixelPoint(952, 1368), two.WindowPosition);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Side_content_never_changes_compact_host_bounds(bool visible)
    {
        var compact = PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, 1200, 800),
            petScreenPosition: new PixelPoint(524, 366),
            sideContentVisible: false,
            scaling: 1);
        var expanded = PetDashboardLayoutCalculator.Calculate(
            new PixelRect(0, 0, 1200, 800),
            petScreenPosition: new PixelPoint(524, 366),
            sideContentVisible: visible,
            scaling: 1);

        Assert.Equal(new Size(168, 200), compact.WindowSize);
        Assert.Equal(compact.WindowPosition, expanded.WindowPosition);
        Assert.Equal(compact.WindowSize, expanded.WindowSize);
        Assert.Equal(new PixelPoint(500, 300), compact.WindowPosition);
    }

    [Theory]
    [InlineData(1d, 190)]
    [InlineData(1.5d, 160)]
    [InlineData(2d, 130)]
    public void Adjacent_anchor_near_side_selection_midpoint_only_moves_one_pixel(
        double scaling,
        int firstAnchorX)
    {
        var workingArea = new PixelRect(0, 0, 500, 400);

        var first = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            new PixelPoint(firstAnchorX, 124),
            sideContentVisible: true,
            scaling: scaling);
        var second = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            new PixelPoint(firstAnchorX + 1, 124),
            sideContentVisible: true,
            scaling: scaling);

        var firstAnchor = TopLeft(first.PetScreenRect);
        var secondAnchor = TopLeft(second.PetScreenRect);

        Assert.Equal(PetDashboardSide.Right, first.Side);
        Assert.Equal(PetDashboardSide.Left, second.Side);
        Assert.Equal(firstAnchor.Y, secondAnchor.Y);
        Assert.Equal(1, secondAnchor.X - firstAnchor.X);
    }

    [Fact]
    public void Narrow_side_request_stays_compact_without_moving_the_pet()
    {
        var workingArea = new PixelRect(0, 0, 500, 400);
        var anchor = new PixelPoint(190, 124);

        var compact = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            anchor,
            sideContentVisible: false,
            scaling: 1,
            preferredSide: PetDashboardSide.Right);
        var requested = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            anchor,
            sideContentVisible: true,
            scaling: 1,
            preferredSide: compact.Side);

        Assert.Equal(compact.PetScreenRect, requested.PetScreenRect);
        Assert.False(requested.SideContentAvailable);
        Assert.False(requested.SideContentAllocated);
        Assert.Equal(new Size(168, 200), requested.WindowSize);
    }

    [Fact]
    public void Preferred_side_remains_stable_when_both_lanes_fit()
    {
        var workingArea = new PixelRect(0, 0, 1000, 600);
        var anchor = new PixelPoint(408, 124);

        var open = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            anchor,
            sideContentVisible: true,
            scaling: 1,
            preferredSide: PetDashboardSide.Right);
        var closed = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            anchor,
            sideContentVisible: false,
            scaling: 1,
            preferredSide: open.Side);
        var reopened = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            anchor,
            sideContentVisible: true,
            scaling: 1,
            preferredSide: closed.Side);

        Assert.Equal(PetDashboardSide.Right, open.Side);
        Assert.Equal(PetDashboardSide.Right, closed.Side);
        Assert.Equal(PetDashboardSide.Right, reopened.Side);
        Assert.Equal(open.PetScreenRect, closed.PetScreenRect);
        Assert.Equal(open.PetScreenRect, reopened.PetScreenRect);
    }

    [Fact]
    public void Lane_flips_only_when_the_preferred_side_no_longer_fits()
    {
        var workingArea = new PixelRect(0, 0, 800, 600);
        var rightAnchor = new PixelPoint(8, 124);
        var leftAnchor = new PixelPoint(672, 124);

        var right = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            rightAnchor,
            sideContentVisible: true,
            scaling: 1,
            preferredSide: PetDashboardSide.Right);
        var left = PetDashboardLayoutCalculator.Calculate(
            workingArea,
            leftAnchor,
            sideContentVisible: true,
            scaling: 1,
            preferredSide: right.Side);

        Assert.Equal(PetDashboardSide.Right, right.Side);
        Assert.Equal(new PixelPoint(24, 124), TopLeft(right.PetScreenRect));
        Assert.Equal(PetDashboardSide.Left, left.Side);
        Assert.Equal(new PixelPoint(656, 124), TopLeft(left.PetScreenRect));
    }

    private static PixelPoint TopLeft(PixelRect rect) => new(rect.X, rect.Y);

    private static void AssertInside(PixelRect outer, PixelRect inner)
    {
        Assert.InRange(inner.X, outer.X, outer.Right);
        Assert.InRange(inner.Y, outer.Y, outer.Bottom);
        Assert.InRange(inner.Right, outer.X, outer.Right);
        Assert.InRange(inner.Bottom, outer.Y, outer.Bottom);
    }

    private static void AssertVisibleGeometry(PixelRect workingArea, PetDashboardLayout layout)
    {
        AssertInside(workingArea, layout.PetScreenRect);
        AssertInside(workingArea, layout.QuotaStripScreenRect);
        AssertInside(workingArea, layout.NotificationScreenRect!.Value);
        AssertInside(workingArea, layout.DetailsScreenRect!.Value);
        Assert.False(layout.PetScreenRect.Intersects(layout.NotificationScreenRect.Value));
        Assert.False(layout.PetScreenRect.Intersects(layout.DetailsScreenRect.Value));
        Assert.False(layout.QuotaStripScreenRect.Intersects(layout.NotificationScreenRect.Value));
        Assert.False(layout.QuotaStripScreenRect.Intersects(layout.DetailsScreenRect.Value));
        Assert.False(layout.NotificationScreenRect.Value.Intersects(layout.DetailsScreenRect.Value));
    }
}
