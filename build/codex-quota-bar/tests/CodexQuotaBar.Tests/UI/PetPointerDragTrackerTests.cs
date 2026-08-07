using Avalonia;
using CodexQuotaBar.App.Views;

namespace CodexQuotaBar.Tests.UI;

public sealed class PetPointerDragTrackerTests
{
    [Fact]
    public void Release_distinguishes_a_click_from_a_drag()
    {
        var tracker = new PetPointerDragTracker();
        tracker.Press(new PixelPoint(100, 100), new PixelPoint(300, 400));

        Assert.Null(tracker.Move(new PixelPoint(102, 103), isLeftButtonPressed: true));
        Assert.True(tracker.Release());

        tracker.Press(new PixelPoint(100, 100), new PixelPoint(300, 400));
        Assert.Equal(
            new PixelPoint(304, 400),
            tracker.Move(new PixelPoint(104, 100), isLeftButtonPressed: true));
        Assert.False(tracker.Release());
    }

    [Fact]
    public void Capture_loss_clears_pressed_and_dragged_state()
    {
        var tracker = new PetPointerDragTracker();
        tracker.Press(new PixelPoint(100, 100), new PixelPoint(300, 400));
        Assert.NotNull(tracker.Move(new PixelPoint(110, 100), isLeftButtonPressed: true));

        tracker.Cancel();

        Assert.False(tracker.IsPressed);
        Assert.False(tracker.HasDragged);
        Assert.Null(tracker.Move(new PixelPoint(120, 100), isLeftButtonPressed: true));
        Assert.False(tracker.Release());
    }

    [Fact]
    public void Move_without_left_button_cancels_the_drag()
    {
        var tracker = new PetPointerDragTracker();
        tracker.Press(new PixelPoint(100, 100), new PixelPoint(300, 400));

        Assert.Null(tracker.Move(new PixelPoint(110, 100), isLeftButtonPressed: false));

        Assert.False(tracker.IsPressed);
        Assert.False(tracker.HasDragged);
        Assert.Null(tracker.Move(new PixelPoint(120, 100), isLeftButtonPressed: true));
    }
}
