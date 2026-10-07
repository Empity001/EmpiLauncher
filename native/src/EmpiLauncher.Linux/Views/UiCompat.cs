using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>The builders the Settings tabs are made of (the same names and shapes as the Windows interface), so every tab looks and behaves the same.</summary>
public static partial class Ui
{
    public static IBrush Res(string key) => Pal.Find(key) ?? Pal.Paper;

    /// <summary>Text in one of the four voices: DisplayText, LabelText, CaptionText or BodyText.</summary>
    /// <summary>A text block in one of the four voices (DisplayText, LabelText, CaptionText, BodyText), as the style in use writes it.</summary>
    public static TextBlock Voice(string style)
    {
        switch (style)
        {
            case "DisplayText": return new TextBlock { FontFamily = Pal.Display, FontWeight = Look.DisplayWeight, FontStyle = Look.DisplayStyle, FontSize = 14, Foreground = Pal.Paper, TextTrimming = TextTrimming.CharacterEllipsis };
            case "LabelText":
                var label = new TextBlock { FontFamily = Look.LabelBody ? Pal.BodyFont : Pal.Mono, FontSize = Look.LabelSize, FontWeight = Look.LabelWeight, Foreground = Pal.Paper2 };
                if (Look.LabelSmallCaps) label.FontFeatures = FontFeatureCollection.Parse("+smcp,+c2sc");
                return label;
            case "CaptionText": return new TextBlock { FontFamily = Look.CaptionBody ? Pal.BodyFont : Pal.Mono, FontSize = Look.CaptionSize, FontStyle = Look.CaptionStyle, Foreground = Pal.Paper3, TextWrapping = TextWrapping.Wrap };
            default: return new TextBlock { FontFamily = Pal.BodyFont, FontSize = 14, Foreground = Pal.Paper, TextWrapping = TextWrapping.Wrap };
        }
    }

    /// <summary>Text in one of the four voices: DisplayText, LabelText, CaptionText or BodyText.</summary>
    public static TextBlock Text(string text, string style = "BodyText", IBrush? ink = null, double? size = null)
    {
        var t = Voice(style);
        t.Text = text;
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
            body.Children.Add(Text(title.ToUpperInvariant(), "LabelText"));
            if (hint != null) { var h = Text(hint, "CaptionText"); h.Margin = new Thickness(0, 6, 0, 0); body.Children.Add(h); }
            body.Children.Add(new Border { Height = 8 });
        }
        var card = Module(body, Look.ModulePadding);
        card.Margin = new Thickness(0, 0, 0, 14);
        return card;
    }

    // which folding sections are open: kept only while the launcher runs, so they open closed again on the next start
    private static readonly Dictionary<string, bool> Folds = new();

    /// <summary>A module card whose heading opens and closes it (closed at first); it stays the way the player left it while the launcher runs.</summary>
    public static Border Fold(string key, string title, out StackPanel body, string? hint = null)
    {
        var inner = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        if (hint != null) inner.Children.Add(Text(hint, "CaptionText"));
        inner.Children.Add(new Border { Height = 8 });
        body = inner;

        var open = Folds.TryGetValue(key, out var o) ? o : Environment.GetEnvironmentVariable("EMPI_FOLDS") == "open";
        var turn = new RotateTransform(open ? 180 : 0);
        var chevron = new Avalonia.Controls.Shapes.Path
        {
            Data = Icons.Chevron, Stroke = Pal.Paper2, StrokeThickness = 1.6, StrokeLineCap = PenLineCap.Round, StrokeJoin = PenLineJoin.Round, Width = 16, Height = 16,
            Stretch = Stretch.None, VerticalAlignment = VerticalAlignment.Center, RenderTransformOrigin = RelativePoint.Center, RenderTransform = turn
        };
        var head = new Grid { Background = Brushes.Transparent, ColumnDefinitions = { new ColumnDefinition(1, GridUnitType.Star), new ColumnDefinition(GridLength.Auto) } };
        var label = Text(title.ToUpperInvariant(), "LabelText");
        label.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(label);
        Grid.SetColumn(chevron, 1);
        head.Children.Add(chevron);
        var toggle = new Button { Content = head, Padding = new Thickness(0), Margin = new Thickness(0, -4), MinHeight = 28, Background = Brushes.Transparent, BorderThickness = new Thickness(0), Cursor = new Cursor(StandardCursorType.Hand), HorizontalContentAlignment = HorizontalAlignment.Stretch, HorizontalAlignment = HorizontalAlignment.Stretch };
        Avalonia.Automation.AutomationProperties.SetName(toggle, title);
        inner.IsVisible = open;
        toggle.Click += (_, _) =>
        {
            open = !open;
            Folds[key] = open;
            inner.IsVisible = open;
            if (!Motion.Enabled) { turn.Angle = open ? 180 : 0; return; }
            Motion.Animate(turn, RotateTransform.AngleProperty, turn.Angle, open ? 180 : 0, 200, 0, Motion.Out);
            if (open) Motion.Animate(inner, Visual.OpacityProperty, 0, 1, 180, 0, Motion.Out);
        };

        var card = new StackPanel();
        card.Children.Add(toggle);
        card.Children.Add(inner);
        var module = Module(card, Look.ModulePadding);
        module.Margin = new Thickness(0, 0, 0, 14);
        return module;
    }

    /// <summary>Label and explanation on the left, the control on the right.</summary>
    public static Grid Row(string title, string? hint, Control control, double controlWidth = 0)
    {
        var grid = new Grid { Margin = new Thickness(0, 8), ColumnDefinitions = { new ColumnDefinition(1, GridUnitType.Star), new ColumnDefinition(GridLength.Auto) } };
        var left = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 20, 0) };
        left.Children.Add(Text(title, "BodyText"));
        if (hint != null) { var h = Text(hint, "CaptionText"); h.Margin = new Thickness(0, 3, 0, 0); left.Children.Add(h); }
        grid.Children.Add(left);
        if (controlWidth > 0) control.Width = controlWidth;
        control.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(control, 1);
        grid.Children.Add(control);
        return grid;
    }

    public static ToggleButton Switch(bool value, Action<bool> changed, string automationName)
    {
        var toggle = new ToggleButton { Classes = { "switch" }, IsChecked = value };
        Avalonia.Automation.AutomationProperties.SetName(toggle, automationName);
        toggle.Click += (_, _) => changed(toggle.IsChecked == true);
        return toggle;
    }

    /// <summary>A text box that reports its value when the player leaves it or presses Enter.</summary>
    public static TextBox Box(string value, Action<string> committed, string automationName, Func<string, bool>? isValid = null)
    {
        var box = new TextBox { Classes = { "input" }, Text = value, FontFamily = Pal.Mono, CornerRadius = new CornerRadius(Pal.RadiusInput) };
        Avalonia.Automation.AutomationProperties.SetName(box, automationName);
        void Commit()
        {
            if (isValid != null && !isValid(box.Text ?? "")) return;
            committed(box.Text ?? "");
        }
        if (isValid != null)
            box.TextChanged += (_, _) => box.Foreground = isValid(box.Text ?? "") ? Pal.Paper : Pal.Danger;
        box.LostFocus += (_, _) => Commit();
        box.KeyDown += (_, e) => { if (e.Key == Key.Enter) { Commit(); box.Focusable = false; box.Focusable = true; } };
        return box;
    }

    public static string AccessName(string text) => text;

    /// <summary>A pill button in one of the styles of the Windows interface (GhostButton, PaperButton, PrimaryButton, DangerButton).</summary>
    public static Button Act(string label, Action click, string style = "GhostButton", double padX = 16)
    {
        var kind = style switch { "PaperButton" => Kind.Paper, "PrimaryButton" => Kind.Primary, "DangerButton" => Kind.Danger, "IconButton" => Kind.Icon, _ => Kind.Ghost };
        return Btn(label, kind, click, new Thickness(padX, 8), 12.5);
    }

    /// <summary>Rounds a border into a pill (the style's pill radius).</summary>
    public static void MakePill(Border border) => border.CornerRadius = Pal.PillRadius;

    public static Border Divider() => new() { Height = 1, Background = Pal.Hair, Margin = new Thickness(0, 6) };

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

/// <summary>The small formatters the Windows views call Fmt.</summary>
internal static class Fmt
{
    public static string Bytes(double? value) => Ui.Bytes(value);
    public static Border Pill(string text, IBrush? ink = null, IBrush? fill = null) => Ui.Pill(text, ink, fill);
    public static IBrush Res(string key) => Ui.Res(key);
    public static string AccountKind(EmpiLauncher.Ipc.AccountSummary account) => Ui.AccountKind(account);
}

public static partial class Ui
{
    /// <summary>Dresses an existing control in one of the Windows interface's style names.</summary>
    public static void Restyle(Control control, string style)
    {
        switch (control)
        {
            case Button button:
                Style(button, style switch { "PaperButton" => Kind.Paper, "PrimaryButton" => Kind.Primary, "DangerButton" => Kind.Danger, "IconButton" => Kind.Icon, _ => Kind.Ghost });
                break;
            case TextBlock text:
                var voice = Voice(style);
                text.FontFamily = voice.FontFamily; text.FontSize = voice.FontSize; text.FontWeight = voice.FontWeight; text.Foreground = voice.Foreground; text.TextWrapping = voice.TextWrapping;
                break;
        }
    }
}

/// <summary>WPF's DrawingGroup vocabulary (shapes with a fill and a pen) over Avalonia's, for the little pictures of each style.</summary>
internal static class Dgx
{
    public static GeometryDrawing Gd(IBrush? fill, IPen? pen, Geometry geometry) => new() { Brush = fill, Pen = pen, Geometry = geometry };
    public static Geometry Eg(Point center, double rx, double ry) => new EllipseGeometry(new Rect(center.X - rx, center.Y - ry, rx * 2, ry * 2));

    public static Geometry Rg(Rect rect, double rx = 0, double ry = 0)
    {
        if (rx <= 0 && ry <= 0) return new RectangleGeometry(rect);
        rx = Math.Min(rx, rect.Width / 2); ry = Math.Min(ry <= 0 ? rx : ry, rect.Height / 2);
        var g = new StreamGeometry();
        using (var c = g.Open())
        {
            c.BeginFigure(new Point(rect.Left + rx, rect.Top), true);
            c.LineTo(new Point(rect.Right - rx, rect.Top));
            c.ArcTo(new Point(rect.Right, rect.Top + ry), new Size(rx, ry), 0, false, SweepDirection.Clockwise);
            c.LineTo(new Point(rect.Right, rect.Bottom - ry));
            c.ArcTo(new Point(rect.Right - rx, rect.Bottom), new Size(rx, ry), 0, false, SweepDirection.Clockwise);
            c.LineTo(new Point(rect.Left + rx, rect.Bottom));
            c.ArcTo(new Point(rect.Left, rect.Bottom - ry), new Size(rx, ry), 0, false, SweepDirection.Clockwise);
            c.LineTo(new Point(rect.Left, rect.Top + ry));
            c.ArcTo(new Point(rect.Left + rx, rect.Top), new Size(rx, ry), 0, false, SweepDirection.Clockwise);
            c.EndFigure(true);
        }
        return g;
    }

    public static Geometry Polygon(IEnumerable<Point> points, bool closed = true)
    {
        var list = points.ToList();
        var g = new StreamGeometry();
        using (var c = g.Open())
        {
            c.BeginFigure(list[0], closed);
            foreach (var p in list.Skip(1)) c.LineTo(p);
            c.EndFigure(closed);
        }
        return g;
    }

    public static Geometry Bezier(Point from, Point c1, Point c2, Point to)
    {
        var g = new StreamGeometry();
        using (var c = g.Open()) { c.BeginFigure(from, false); c.CubicBezierTo(c1, c2, to); c.EndFigure(false); }
        return g;
    }

    /// <summary>Part of a circle, from the top, clockwise: <paramref name="share"/> of the way round.</summary>
    public static Geometry ArcShare(double cx, double cy, double r, double share)
    {
        var a = share * Math.Tau - Math.PI / 2;
        var g = new StreamGeometry();
        using (var c = g.Open()) { c.BeginFigure(new Point(cx, cy - r), false); c.ArcTo(new Point(cx + Math.Cos(a) * r, cy + Math.Sin(a) * r), new Size(r, r), 0, share > 0.5, SweepDirection.Clockwise); c.EndFigure(false); }
        return g;
    }
}

/// <summary>Dates in Spanish. The launcher runs without ICU (invariant globalization), so the month names are written here.</summary>
internal static class Spanish
{
    private static readonly string[] Months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    private static readonly string[] Short = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

    public static string Month(int month) => Months[month - 1];
    public static string ShortMonth(int month) => Short[month - 1];

    /// <summary>A .NET date format, with MMMM and MMM written in Spanish (other pieces as usual).</summary>
    public static string Format(DateTime t, string format)
    {
        var parts = format.Split('\'');
        for (var i = 0; i < parts.Length; i += 2)   // even pieces are outside quotes
            parts[i] = parts[i].Replace("MMMM", "'" + Month(t.Month) + "'").Replace("MMM", "'" + ShortMonth(t.Month) + "'");
        // the pieces that were quoted stay quoted: join with the quote again
        var rebuilt = string.Join("'", parts);
        return t.ToString(rebuilt, System.Globalization.CultureInfo.InvariantCulture);
    }

    public static string Format(DateTimeOffset t, string format) => Format(t.DateTime, format);
}
