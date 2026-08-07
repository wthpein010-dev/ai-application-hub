using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Media;
using CodexQuotaBar.Core.Quota;

namespace CodexQuotaBar.App.Converters;

public sealed class QuotaToneBrushConverter : IValueConverter
{
    private static readonly SolidColorBrush Healthy = new(Color.Parse("#1F8A70"));
    private static readonly SolidColorBrush Warning = new(Color.Parse("#E0A02B"));
    private static readonly SolidColorBrush Critical = new(Color.Parse("#D04B3D"));

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value switch
        {
            QuotaTone.Warning => Warning,
            QuotaTone.Critical => Critical,
            _ => Healthy,
        };

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
