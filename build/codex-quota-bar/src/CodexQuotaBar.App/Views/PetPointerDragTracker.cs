using Avalonia;

namespace CodexQuotaBar.App.Views;

public sealed class PetPointerDragTracker
{
    private PixelPoint _pressScreenPosition;
    private PixelPoint _pressPetScreenPosition;

    public bool IsPressed { get; private set; }

    public bool HasDragged { get; private set; }

    public void Press(PixelPoint pointerScreenPosition, PixelPoint petScreenPosition)
    {
        _pressScreenPosition = pointerScreenPosition;
        _pressPetScreenPosition = petScreenPosition;
        IsPressed = true;
        HasDragged = false;
    }

    public PixelPoint? Move(PixelPoint pointerScreenPosition, bool isLeftButtonPressed)
    {
        if (!IsPressed)
        {
            return null;
        }

        if (!isLeftButtonPressed)
        {
            Cancel();
            return null;
        }

        var deltaX = pointerScreenPosition.X - _pressScreenPosition.X;
        var deltaY = pointerScreenPosition.Y - _pressScreenPosition.Y;
        if (Math.Abs(deltaX) > 3 || Math.Abs(deltaY) > 3)
        {
            HasDragged = true;
        }

        return HasDragged
            ? new PixelPoint(
                _pressPetScreenPosition.X + deltaX,
                _pressPetScreenPosition.Y + deltaY)
            : null;
    }

    public bool Release()
    {
        if (!IsPressed)
        {
            return false;
        }

        var wasClick = !HasDragged;
        Reset();
        return wasClick;
    }

    public void Cancel() => Reset();

    private void Reset()
    {
        IsPressed = false;
        HasDragged = false;
    }
}
