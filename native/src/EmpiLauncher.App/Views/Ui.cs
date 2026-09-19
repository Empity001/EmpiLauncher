using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;

namespace EmpiLauncher.App.Views;

/// <summary>Small builders for the rows the Settings tabs are made of, so every tab looks and behaves the same.</summary>
internal static class Ui
{
    private static Style S(string key) => (Style)Application.Current.FindResource(key);
    public static Brush Res(string key) => (Brush)Application.Current.FindResource(key);

    public static TextBlock Text(string text, string style = "BodyText", Brush? ink = null, double? size = null)
    {
        var t = new TextBlock { Text = text, Style = S(style) };
        if (ink != null) t.Foreground = ink;
        if (size != null) t.FontSize = size.Value;
        return t;
    }

    /// <summary>A module card with an optional heading. Add rows to <paramref name="body"/>.</summary>
    public static Border Section(string? title, out StackPanel body, string? hint = null)
    {
        body = new StackPanel();
        if (title != null)
        {
            body.Children.Add(new TextBlock { Text = title.ToUpperInvariant(), Style = S("LabelText") });
            if (hint != null) body.Children.Add(new TextBlock { Text = hint, Style = S("CaptionText"), Margin = new Thickness(0, 6, 0, 0) });
            body.Children.Add(new Border { Height = 8 });
        }
        return new Border { Style = S("Module"), Margin = new Thickness(0, 0, 0, 14), Child = body };
    }

    /// <summary>Label and explanation on the left, the control on the right.</summary>
    public static Grid Row(string title, string? hint, FrameworkElement control, double controlWidth = 0)
    {
        var grid = new Grid { Margin = new Thickness(0, 8, 0, 8) };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var left = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 20, 0) };
        left.Children.Add(new TextBlock { Text = title, Style = S("BodyText") });
        if (hint != null) left.Children.Add(new TextBlock { Text = hint, Style = S("CaptionText"), Margin = new Thickness(0, 3, 0, 0) });
        grid.Children.Add(left);
        if (controlWidth > 0) control.Width = controlWidth;
        control.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(control, 1);
        grid.Children.Add(control);
        return grid;
    }

    public static ToggleButton Switch(bool value, Action<bool> changed, string automationName)
    {
        var toggle = new ToggleButton { Style = S("Switch"), IsChecked = value };
        System.Windows.Automation.AutomationProperties.SetName(toggle, automationName);
        toggle.Click += (_, _) => changed(toggle.IsChecked == true);
        return toggle;
    }

    /// <summary>A text box that reports its value when the player leaves it or presses Enter.</summary>
    public static TextBox Box(string value, Action<string> committed, string automationName, Func<string, bool>? isValid = null)
    {
        var box = new TextBox { Style = S("InputBox"), Text = value };
        System.Windows.Automation.AutomationProperties.SetName(box, automationName);
        var normalBorder = box.BorderBrush;
        void Commit()
        {
            if (isValid != null && !isValid(box.Text)) return;
            committed(box.Text);
        }
        if (isValid != null)
        {
            box.TextChanged += (_, _) => box.Tag = isValid(box.Text) ? null : "invalid";
            box.LostKeyboardFocus += (_, _) => { if (box.Tag as string == "invalid") box.Foreground = (Brush)Application.Current.FindResource("DangerBrush"); else box.SetResourceReference(Control.ForegroundProperty, "PaperBrush"); };
        }
        box.LostKeyboardFocus += (_, _) => Commit();
        box.KeyDown += (_, e) => { if (e.Key == System.Windows.Input.Key.Enter) { Commit(); System.Windows.Input.Keyboard.ClearFocus(); } };
        return box;
    }

    public static Button Button(string label, Action click, string style = "GhostButton", double padX = 16)
    {
        var b = new Button { Content = label, Style = S(style), Padding = new Thickness(padX, 8, padX, 8), FontSize = 12.5 };
        b.Click += (_, _) => click();
        return b;
    }

    /// <summary>Rounds a border into a pill (radius = half its height); see PillRadiusConverter for why 999 is not enough.</summary>
    public static void MakePill(Border border) =>
        border.SetBinding(Border.CornerRadiusProperty, new System.Windows.Data.Binding("ActualHeight")
        {
            RelativeSource = System.Windows.Data.RelativeSource.Self,
            Converter = new EmpiLauncher.App.Themes.PillRadiusConverter()
        });

    public static Border Divider() => new() { Height = 1, Background = (Brush)Application.Current.FindResource("HairBrush"), Margin = new Thickness(0, 6, 0, 6) };

    /// <summary>Runs <paramref name="action"/> once the caller stops calling for <paramref name="delayMs"/>: sliders save without a write per pixel.</summary>
    public sealed class Debounce
    {
        private readonly DispatcherTimer _timer;
        private Action? _pending;
        public Debounce(int delayMs = 450)
        {
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(delayMs) };
            _timer.Tick += (_, _) => { _timer.Stop(); var a = _pending; _pending = null; a?.Invoke(); };
        }
        public void Run(Action action) { _pending = action; _timer.Stop(); _timer.Start(); }
        public void Flush() { if (_pending != null) { _timer.Stop(); var a = _pending; _pending = null; a(); } }
    }
}
