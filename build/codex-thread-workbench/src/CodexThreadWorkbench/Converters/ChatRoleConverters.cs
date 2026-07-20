using System.Globalization;
using Avalonia;
using Avalonia.Data.Converters;
using Avalonia.Layout;
using Avalonia.Media;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Converters;

public sealed class ChatRoleToBrushConverter : IValueConverter
{
    public object Convert(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        value is ChatRole.User
            ? new SolidColorBrush(Color.Parse("#E1F2EA"))
            : new SolidColorBrush(Color.Parse("#EDF0F1"));

    public object ConvertBack(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class ChatRoleToAlignmentConverter : IValueConverter
{
    public object Convert(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        value is ChatRole.User
            ? HorizontalAlignment.Right
            : HorizontalAlignment.Left;

    public object ConvertBack(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        throw new NotSupportedException();
}

public sealed class StatusColorToBrushConverter : IValueConverter
{
    public object Convert(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        value is string color && Color.TryParse(color, out var parsed)
            ? new SolidColorBrush(parsed)
            : Brushes.Gray;

    public object ConvertBack(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        throw new NotSupportedException();
}
