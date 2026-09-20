using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using EmpiLauncher.App.Themes;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The rectangular seal laid over the Play button when a modpack is closed for maintenance or not out yet: longer than tall, with room
/// around its words, crooked by a few degrees, and stamped down (it drops, lands, and the button under it gives a little).
/// Its colour is the one of the state unless that would disappear against the modpack's accent: then it is cream.
/// </summary>
internal static class Stamp
{
    public static readonly Color Red = Color.FromRgb(0xff, 0x5a, 0x4d);
    public static readonly Color Amber = Color.FromRgb(0xf5, 0xa5, 0x24);
    public static readonly Color Cream = Color.FromRgb(0xf1, 0xef, 0xe8);

    private static double Lin(byte c) { var v = c / 255.0; return v <= 0.03928 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4); }
    private static double Lum(Color c) => 0.2126 * Lin(c.R) + 0.7152 * Lin(c.G) + 0.0722 * Lin(c.B);
    private static double Contrast(Color a, Color b) { var x = Lum(a) + 0.05; var y = Lum(b) + 0.05; return x > y ? x / y : y / x; }

    /// <summary>The colour of the state, or cream when the state's colour would blend into the modpack's accent.</summary>
    public static Color Pick(Color state, Color accent) => Contrast(state, accent) >= 1.8 ? state : Cream;

    public static (FrameworkElement Frame, TextBlock? Sub) Make(string title, string? sub, Color ink)
    {
        var brush = new SolidColorBrush(ink);
        var words = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
        words.Children.Add(new TextBlock { Text = title, FontFamily = (FontFamily)Application.Current.FindResource("DisplayFont"), FontWeight = FontWeights.Bold, FontSize = 19, Foreground = brush, HorizontalAlignment = HorizontalAlignment.Center, TextWrapping = TextWrapping.NoWrap });
        TextBlock? line = null;
        if (!string.IsNullOrWhiteSpace(sub))
            words.Children.Add(line = new TextBlock { Text = sub, FontFamily = (FontFamily)Application.Current.FindResource("MonoFont"), FontSize = 11, Foreground = brush, HorizontalAlignment = HorizontalAlignment.Center, TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap, MaxWidth = 250, Margin = new Thickness(0, 3, 0, 0) });
        var inner = new Border { Background = new SolidColorBrush(Color.FromArgb(0xf2, 0x0b, 0x0b, 0x0c)), BorderBrush = brush, BorderThickness = new Thickness(3), Padding = new Thickness(30, 7, 30, 7), Child = words };
        var frame = new Border { BorderBrush = brush, BorderThickness = new Thickness(1.5), Padding = new Thickness(3), Child = inner, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, IsHitTestVisible = false };
        frame.RenderTransformOrigin = new Point(0.5, 0.5);
        frame.RenderTransform = new TransformGroup { Children = { new ScaleTransform(1, 1), new RotateTransform(-4) } };
        System.Windows.Automation.AutomationProperties.SetName(frame, sub is { Length: > 0 } ? $"{title}. {sub}" : title);
        return (frame, line);
    }

    /// <summary>Drops onto its place (240 ms, faster at the end like a thing falling), settles with a small overshoot, and calls <paramref name="landed"/> at the impact.</summary>
    public static void Slam(FrameworkElement stamp, Action landed)
    {
        if (stamp.RenderTransform is not TransformGroup { Children: [ScaleTransform scale, _] }) return;
        if (!Motion.Enabled) { stamp.Opacity = 1; return; }
        stamp.Opacity = 0;
        stamp.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, new Duration(TimeSpan.FromMilliseconds(70))));
        DoubleAnimationUsingKeyFrames Frames() => new()
        {
            KeyFrames =
            {
                new EasingDoubleKeyFrame(1.9, KeyTime.FromTimeSpan(TimeSpan.Zero)),
                new EasingDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(240)), new PowerEase { Power = 3, EasingMode = EasingMode.EaseIn }),
                new EasingDoubleKeyFrame(1.035, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(310)), Motion.Out),
                new EasingDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(400)), Motion.Out)
            }
        };
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, Frames());
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, Frames());
        var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(240) };
        timer.Tick += (_, _) => { timer.Stop(); landed(); };
        timer.Start();
    }

    /// <summary>The button under the seal gives a little when it lands.</summary>
    public static void Squash(FrameworkElement target)
    {
        if (!Motion.Enabled) return;
        target.RenderTransformOrigin = new Point(0.5, 0.5);
        var scale = target.RenderTransform as ScaleTransform;
        if (scale == null || scale.IsFrozen) { scale = new ScaleTransform(1, 1); target.RenderTransform = scale; }
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, new DoubleAnimation(0.9, 1, new Duration(TimeSpan.FromMilliseconds(170))) { EasingFunction = Motion.Out });
    }
}
