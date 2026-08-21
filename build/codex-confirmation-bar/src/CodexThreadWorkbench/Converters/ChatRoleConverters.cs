using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Media;
using CodexThreadWorkbench.Models;

namespace CodexThreadWorkbench.Converters;

public sealed class ChatRoleVisibilityConverter : IValueConverter
{
    public object Convert(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture) =>
        value is ChatRole role &&
        parameter is string requestedRole &&
        Enum.TryParse<ChatRole>(requestedRole, ignoreCase: true, out var parsedRole) &&
        role == parsedRole;

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
