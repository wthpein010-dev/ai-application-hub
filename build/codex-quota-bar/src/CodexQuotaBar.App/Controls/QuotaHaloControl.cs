using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace CodexQuotaBar.App.Controls;

public sealed class QuotaHaloControl : Control
{
    private const double StrokeThickness = 6;
    private static readonly IBrush TrackBrush = new SolidColorBrush(Color.Parse("#5F6368"));
    private static readonly IBrush GreenBrush = new SolidColorBrush(Color.Parse("#31C48D"));
    private static readonly IBrush AmberBrush = new SolidColorBrush(Color.Parse("#F6C453"));
    private static readonly IBrush RedBrush = new SolidColorBrush(Color.Parse("#EF6A6A"));

    public static readonly StyledProperty<double> ValueProperty =
        AvaloniaProperty.Register<QuotaHaloControl, double>(nameof(Value));

    static QuotaHaloControl()
    {
        AffectsRender<QuotaHaloControl>(ValueProperty);
    }

    public double Value
    {
        get => GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public static double CalculateSweepAngle(double value) => Math.Clamp(value, 0, 100) * 3.6;

    public override void Render(DrawingContext context)
    {
        base.Render(context);

        var diameter = Math.Min(Bounds.Width, Bounds.Height) - StrokeThickness;
        if (diameter <= 0)
        {
            return;
        }

        var arcBounds = new Rect(
            Bounds.X + ((Bounds.Width - diameter) / 2),
            Bounds.Y + ((Bounds.Height - diameter) / 2),
            diameter,
            diameter);
        var pen = new Pen(TrackBrush, StrokeThickness);
        context.DrawEllipse(null, pen, arcBounds);

        var sweepAngle = CalculateSweepAngle(Value);
        if (sweepAngle <= 0)
        {
            return;
        }

        var progressPen = new Pen(BrushFor(Value), StrokeThickness) { LineCap = PenLineCap.Round };
        if (sweepAngle >= 360)
        {
            context.DrawEllipse(null, progressPen, arcBounds);
            return;
        }

        var radius = diameter / 2;
        var center = arcBounds.Center;
        var start = new Point(center.X, arcBounds.Y);
        var radians = (sweepAngle - 90) * (Math.PI / 180);
        var end = new Point(
            center.X + (radius * Math.Cos(radians)),
            center.Y + (radius * Math.Sin(radians)));

        var geometry = new StreamGeometry();
        using (var geometryContext = geometry.Open())
        {
            geometryContext.BeginFigure(start, false);
            geometryContext.ArcTo(
                end,
                new Size(radius, radius),
                0,
                sweepAngle > 180,
                SweepDirection.Clockwise,
                true);
        }

        context.DrawGeometry(null, progressPen, geometry);
    }

    private static IBrush BrushFor(double value) => value switch
    {
        >= 50 => GreenBrush,
        >= 20 => AmberBrush,
        _ => RedBrush,
    };
}
