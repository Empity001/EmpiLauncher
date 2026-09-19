using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using EmpiLauncher.App.Themes;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The launcher's own colour picker (the Windows one does not belong in this interface): a square for saturation and brightness, a
/// bar for the hue, the hex code, a few presets and a reset. The panel is opaque, with a firm outline and a shadow, so it stands out
/// over the field of dots instead of blending into it. It works with the mouse and with the arrow keys (Shift = bigger steps).
///
/// Changing is raised continuously while a colour is dragged (to preview it live), Committed once the player lets go, presses Enter or
/// picks a preset (to save it).
/// </summary>
internal sealed class ColorPicker : Border
{
    private const double W = 236, SvHeight = 150, HueHeight = 16;

    public event Action<string>? Changing;
    public event Action<string>? Committed;

    private readonly string _defaultHex;
    private readonly SolidColorBrush _hueBrush = new(Colors.Red);
    private readonly Border _svThumb, _hueThumb, _preview;
    private readonly TextBox _hex;
    private double _h, _s = 1, _v = 1;
    private bool _syncing;

    public ColorPicker(string startHex, string defaultHex, IEnumerable<(string Hex, string Label)> presets)
    {
        _defaultHex = defaultHex;
        Background = new SolidColorBrush(Color.FromArgb(0xFA, 0x0E, 0x0F, 0x11));
        BorderBrush = (Brush)Application.Current.FindResource("HairStrongBrush");
        BorderThickness = new Thickness(1);
        CornerRadius = new CornerRadius(18);
        Padding = new Thickness(14);
        Width = W + 28 + 2;
        Effect = new DropShadowEffect { BlurRadius = 24, ShadowDepth = 6, Direction = 270, Opacity = 0.65, Color = Colors.Black };

        var stack = new StackPanel();

        // saturation (left to right) and brightness (top to bottom) of the current hue
        var sv = new Grid { Width = W, Height = SvHeight, Cursor = Cursors.Cross, Focusable = true, Background = Brushes.Transparent, Clip = new RectangleGeometry(new Rect(0, 0, W, SvHeight), 12, 12) };
        sv.Children.Add(new Rectangle { Fill = _hueBrush });
        sv.Children.Add(new Rectangle { Fill = new LinearGradientBrush(Colors.White, Color.FromArgb(0, 255, 255, 255), 0) });
        sv.Children.Add(new Rectangle { Fill = new LinearGradientBrush(Color.FromArgb(0, 0, 0, 0), Colors.Black, 90) });
        _svThumb = Thumb(18);
        sv.Children.Add(new Canvas { IsHitTestVisible = false, Children = { _svThumb } });
        System.Windows.Automation.AutomationProperties.SetName(sv, "Saturación y brillo");
        stack.Children.Add(new Border { CornerRadius = new CornerRadius(12), BorderBrush = (Brush)Application.Current.FindResource("HairBrush"), BorderThickness = new Thickness(1), Child = sv, HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(-1, -1, 0, 0) });

        // hue
        var rainbow = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
        foreach (var (offset, color) in new[] { (0.0, "#FF0000"), (1 / 6.0, "#FFFF00"), (2 / 6.0, "#00FF00"), (3 / 6.0, "#00FFFF"), (4 / 6.0, "#0000FF"), (5 / 6.0, "#FF00FF"), (1.0, "#FF0000") })
            rainbow.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(color), offset));
        var hue = new Grid { Width = W, Height = HueHeight + 8, Margin = new Thickness(0, 14, 0, 0), Cursor = Cursors.Hand, Focusable = true, Background = Brushes.Transparent };
        var bar = new Border { Height = HueHeight, CornerRadius = new CornerRadius(HueHeight / 2), Background = rainbow, VerticalAlignment = VerticalAlignment.Center };
        hue.Children.Add(bar);
        _hueThumb = Thumb(22);
        hue.Children.Add(new Canvas { IsHitTestVisible = false, Children = { _hueThumb } });
        System.Windows.Automation.AutomationProperties.SetName(hue, "Tono");
        stack.Children.Add(hue);

        // preview, hex code and reset
        var row = new DockPanel { Margin = new Thickness(0, 14, 0, 0), LastChildFill = false };
        _preview = new Border { Width = 34, Height = 34, CornerRadius = new CornerRadius(17), BorderThickness = new Thickness(2), BorderBrush = (Brush)Application.Current.FindResource("PaperBrush") };
        row.Children.Add(_preview);
        _hex = new TextBox { Style = (Style)Application.Current.FindResource("InputBox"), Width = 104, MaxLength = 7, Margin = new Thickness(10, 0, 0, 0), Padding = new Thickness(10, 6, 10, 6), MinHeight = 34 };
        System.Windows.Automation.AutomationProperties.SetName(_hex, "Color en hexadecimal");
        row.Children.Add(_hex);
        var reset = new Button { Content = "Gris", Style = (Style)Application.Current.FindResource("GhostButton"), Padding = new Thickness(12, 6, 12, 6), FontSize = 12, Margin = new Thickness(8, 0, 0, 0), ToolTip = "Volver al color de siempre" };
        System.Windows.Automation.AutomationProperties.SetName(reset, "Volver al gris de siempre");
        DockPanel.SetDock(reset, Dock.Right);
        row.Children.Add(reset);
        stack.Children.Add(row);

        // presets
        var strip = new WrapPanel { Margin = new Thickness(0, 12, 0, 0) };
        foreach (var (hex, label) in presets)
        {
            var color = (Color)ColorConverter.ConvertFromString(hex);
            var dot = new Button
            {
                Style = (Style)Application.Current.FindResource("BareButton"), ToolTip = label, Margin = new Thickness(0, 0, 5, 6),
                Content = new Border { Width = 22, Height = 22, CornerRadius = new CornerRadius(11), Background = new SolidColorBrush(color), BorderBrush = (Brush)Application.Current.FindResource("HairStrongBrush"), BorderThickness = new Thickness(1) }
            };
            System.Windows.Automation.AutomationProperties.SetName(dot, "Color " + label);
            var chosen = hex;
            dot.Click += (_, _) => { SetColor(chosen); Committed?.Invoke(Hex()); };
            strip.Children.Add(dot);
        }
        stack.Children.Add(strip);
        Child = stack;

        // ---- behaviour ----
        Drag(sv, p => { _s = Clamp(p.X / W); _v = 1 - Clamp(p.Y / SvHeight); Refresh(); }, () => Committed?.Invoke(Hex()));
        Drag(hue, p => { _h = Clamp(p.X / W) * 360; Refresh(); }, () => Committed?.Invoke(Hex()));
        sv.KeyDown += (_, e) => Nudge(e, () => { var big = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift) ? 0.1 : 0.02; return e.Key switch { Key.Left => (-big, 0.0), Key.Right => (big, 0.0), Key.Up => (0.0, big), Key.Down => (0.0, -big), _ => (0.0, 0.0) }; }, (ds, dv) => { _s = Clamp(_s + ds); _v = Clamp(_v + dv); });
        hue.KeyDown += (_, e) => Nudge(e, () => { var big = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift) ? 10.0 : 2.0; return e.Key switch { Key.Left => (-big, 0.0), Key.Right => (big, 0.0), _ => (0.0, 0.0) }; }, (dh, _) => { _h = (_h + dh + 360) % 360; });
        _hex.TextChanged += (_, _) =>
        {
            if (_syncing || !TryParse(_hex.Text, out var color)) return;
            (_h, _s, _v) = ToHsv(color);
            Refresh(fromText: true);
        };
        _hex.KeyDown += (_, e) => { if (e.Key == Key.Enter) { Committed?.Invoke(Hex()); Keyboard.ClearFocus(); } };
        _hex.LostKeyboardFocus += (_, _) => { if (TryParse(_hex.Text, out _)) Committed?.Invoke(Hex()); else Refresh(); };
        reset.Click += (_, _) => { SetColor(_defaultHex); Committed?.Invoke(Hex()); };

        SetColor(startHex);
    }

    public void SetColor(string hex)
    {
        if (!TryParse(hex, out var color)) return;
        (_h, _s, _v) = ToHsv(color);
        Refresh();
    }

    private string Hex() { var c = FromHsv(_h, _s, _v); return $"#{c.R:x2}{c.G:x2}{c.B:x2}"; }

    private void Refresh(bool fromText = false)
    {
        var color = FromHsv(_h, _s, _v);
        _hueBrush.Color = FromHsv(_h, 1, 1);
        _preview.Background = new SolidColorBrush(color);
        Canvas.SetLeft(_svThumb, _s * W - 9); Canvas.SetTop(_svThumb, (1 - _v) * SvHeight - 9);
        _svThumb.Background = new SolidColorBrush(color);
        Canvas.SetLeft(_hueThumb, _h / 360 * W - 11); Canvas.SetTop(_hueThumb, (HueHeight + 8) / 2 - 11);
        _hueThumb.Background = new SolidColorBrush(FromHsv(_h, 1, 1));
        if (!fromText) { _syncing = true; _hex.Text = Hex(); _syncing = false; }
        Changing?.Invoke(Hex());
    }

    /// <summary>A round handle: the colour it marks, a white ring and a dark halo so it reads on any colour.</summary>
    private static Border Thumb(double size) => new()
    {
        Width = size, Height = size, CornerRadius = new CornerRadius(size / 2), BorderThickness = new Thickness(2.5), BorderBrush = Brushes.White,
        Effect = new DropShadowEffect { BlurRadius = 5, ShadowDepth = 0, Opacity = 0.8, Color = Colors.Black }
    };

    private static void Drag(UIElement element, Action<Point> apply, Action release)
    {
        element.MouseLeftButtonDown += (_, e) => { element.Focus(); element.CaptureMouse(); apply(e.GetPosition(element)); e.Handled = true; };
        element.MouseMove += (_, e) => { if (element.IsMouseCaptured) apply(e.GetPosition(element)); };
        element.MouseLeftButtonUp += (_, _) => { if (element.IsMouseCaptured) { element.ReleaseMouseCapture(); release(); } };
    }

    private void Nudge(KeyEventArgs e, Func<(double, double)> delta, Action<double, double> apply)
    {
        var (a, b) = delta();
        if (a == 0 && b == 0) return;
        apply(a, b);
        e.Handled = true;
        Refresh();
        Committed?.Invoke(Hex());
    }

    private static double Clamp(double value) => value < 0 ? 0 : value > 1 ? 1 : value;

    private static bool TryParse(string? text, out Color color)
    {
        color = default;
        if (text is not { Length: 7 } || text[0] != '#') return false;
        try { color = (Color)ColorConverter.ConvertFromString(text); return true; } catch (FormatException) { return false; }
    }

    private static (double H, double S, double V) ToHsv(Color c)
    {
        double r = c.R / 255.0, g = c.G / 255.0, b = c.B / 255.0;
        var max = Math.Max(r, Math.Max(g, b)); var min = Math.Min(r, Math.Min(g, b)); var d = max - min;
        var h = d == 0 ? 0 : max == r ? 60 * (((g - b) / d) % 6) : max == g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
        return (h < 0 ? h + 360 : h, max == 0 ? 0 : d / max, max);
    }

    private static Color FromHsv(double h, double s, double v)
    {
        var c = v * s; var x = c * (1 - Math.Abs(h / 60 % 2 - 1)); var m = v - c;
        var (r, g, b) = (int)(h / 60) switch { 0 => (c, x, 0.0), 1 => (x, c, 0.0), 2 => (0.0, c, x), 3 => (0.0, x, c), 4 => (x, 0.0, c), _ => (c, 0.0, x) };
        return Color.FromRgb((byte)Math.Round((r + m) * 255), (byte)Math.Round((g + m) * 255), (byte)Math.Round((b + m) * 255));
    }

    /// <summary>
    /// Opens the picker under an element, in a popup that closes when the player clicks elsewhere. It grows from the corner nearest the
    /// swatch (a popover comes out of what opened it) and fades in, in 160 ms, on the launcher's ease-out.
    /// </summary>
    public static Popup Show(FrameworkElement anchor, ColorPicker picker)
    {
        var host = new Border { Margin = new Thickness(6, 4, 30, 34), Child = picker };
        var popup = new Popup { AllowsTransparency = true, StaysOpen = false, Placement = PlacementMode.Bottom, PlacementTarget = anchor, Child = host, PopupAnimation = PopupAnimation.None };
        popup.Opened += (_, _) => Motion.Pop(host, new Point(0.1, 0), 160, 0.96);
        popup.IsOpen = true;
        return popup;
    }
}
