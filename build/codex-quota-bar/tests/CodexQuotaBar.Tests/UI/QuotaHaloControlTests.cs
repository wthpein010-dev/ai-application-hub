using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using System.Runtime.InteropServices;
using CodexQuotaBar.App.Controls;

namespace CodexQuotaBar.Tests.UI;

public sealed class QuotaHaloControlTests
{
    private static readonly Color TrackColor = Color.Parse("#5F6368");
    private static readonly Color GreenColor = Color.Parse("#31C48D");
    private static readonly Color AmberColor = Color.Parse("#F6C453");
    private static readonly Color RedColor = Color.Parse("#EF6A6A");

    [InlineData(-5, 0)]
    [InlineData(0, 0)]
    [InlineData(50, 180)]
    [InlineData(95, 342)]
    [InlineData(120, 360)]
    [AvaloniaTheory]
    public void Halo_clamps_percentage_to_a_valid_sweep(double value, double expected)
    {
        Assert.Equal(expected, QuotaHaloControl.CalculateSweepAngle(value));
    }

    [AvaloniaFact]
    public void Value_is_a_styled_property()
    {
        var control = new QuotaHaloControl();

        control.SetValue(QuotaHaloControl.ValueProperty, 73d);

        Assert.Equal(73d, control.Value);
    }

    [AvaloniaFact]
    public void Rendered_zero_and_full_values_differ_at_the_bottom_of_the_halo()
    {
        var zero = RenderPixels(0);
        var full = RenderPixels(100);

        Assert.Equal(TrackColor, zero[50, 97]);
        Assert.Equal(GreenColor, full[50, 97]);
    }

    [AvaloniaFact]
    public void Partial_sweep_starts_at_minus_ninety_degrees_and_turns_clockwise()
    {
        var pixels = RenderPixels(50);

        Assert.Equal(GreenColor, pixels[50, 3]);
        Assert.Equal(GreenColor, pixels[97, 50]);
        Assert.Equal(TrackColor, pixels[3, 50]);
    }

    [InlineData(19, "#EF6A6A")]
    [InlineData(20, "#F6C453")]
    [InlineData(49, "#F6C453")]
    [InlineData(50, "#31C48D")]
    [AvaloniaTheory]
    public void Rendered_sweep_uses_the_expected_palette_thresholds(double value, string expected)
    {
        var pixels = RenderPixels(value);

        Assert.Equal(Color.Parse(expected), pixels[50, 3]);
    }

    [AvaloniaFact]
    public void Changing_value_invalidates_the_halo_for_a_new_render()
    {
        var control = new QuotaHaloControl();
        var window = CreateWindow(control);
        try
        {
            control.Value = 0;
            var before = CapturePixels(window);
            control.Value = 50;
            var after = CapturePixels(window);

            Assert.Equal(TrackColor, before[50, 3]);
            Assert.Equal(GreenColor, after[50, 3]);
        }
        finally
        {
            window.Close();
        }
    }

    private static Color[,] RenderPixels(double value)
    {
        var control = new QuotaHaloControl { Value = value };
        var window = CreateWindow(control);
        try
        {
            return CapturePixels(window);
        }
        finally
        {
            window.Close();
        }
    }

    private static Window CreateWindow(QuotaHaloControl control)
    {
        var window = new Window
        {
            Width = 100,
            Height = 100,
            SystemDecorations = SystemDecorations.None,
            Content = control,
        };
        window.Show();
        return window;
    }

    private static Color[,] CapturePixels(Window window)
    {
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);

        using var framebuffer = frame!.Lock();
        var pixels = new Color[100, 100];
        for (var y = 0; y < 100; y++)
        {
            for (var x = 0; x < 100; x++)
            {
                var offset = (y * framebuffer.RowBytes) + (x * 4);
                pixels[x, y] = new Color(
                    Marshal.ReadByte(framebuffer.Address, offset + 3),
                    Marshal.ReadByte(framebuffer.Address, offset),
                    Marshal.ReadByte(framebuffer.Address, offset + 1),
                    Marshal.ReadByte(framebuffer.Address, offset + 2));
            }
        }

        return pixels;
    }
}
