using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Imaging;

namespace CodexQuotaBar.App.Tray;

public static class IconFactory
{
    public static WindowIcon Create()
    {
        using var bitmap = new RenderTargetBitmap(new PixelSize(32, 32), new Vector(96, 96));
        using (var context = bitmap.CreateDrawingContext())
        {
            context.DrawRectangle(
                new SolidColorBrush(Color.Parse("#172129")),
                null,
                new Rect(0, 0, 32, 32),
                radiusX: 7,
                radiusY: 7);
            context.DrawRectangle(
                new SolidColorBrush(Color.Parse("#34414A")),
                null,
                new Rect(6, 8, 20, 5),
                radiusX: 2,
                radiusY: 2);
            context.DrawRectangle(
                new SolidColorBrush(Color.Parse("#46C6A3")),
                null,
                new Rect(6, 8, 14, 5),
                radiusX: 2,
                radiusY: 2);
            context.DrawRectangle(
                new SolidColorBrush(Color.Parse("#34414A")),
                null,
                new Rect(6, 19, 20, 5),
                radiusX: 2,
                radiusY: 2);
            context.DrawRectangle(
                new SolidColorBrush(Color.Parse("#F06D55")),
                null,
                new Rect(6, 19, 20, 5),
                radiusX: 2,
                radiusY: 2);
        }

        return new WindowIcon(bitmap);
    }
}
