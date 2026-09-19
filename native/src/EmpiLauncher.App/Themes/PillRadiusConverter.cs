using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace EmpiLauncher.App.Themes;

/// <summary>A pill is a border whose corner radius is half its height. WPF does not clamp a huge radius into a pill (it draws an ellipse), so bind it.</summary>
public sealed class PillRadiusConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        new CornerRadius(value is double height && !double.IsNaN(height) ? height / 2 : 0);

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
}
