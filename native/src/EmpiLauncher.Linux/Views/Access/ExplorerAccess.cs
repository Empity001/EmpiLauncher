using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;
using Path = Avalonia.Controls.Shapes.Path;
using Visual = Avalonia.Visual;
using static EmpiLauncher.Linux.Views.Scene;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// Explorer: the era's desktop. Maintenance and coming soon are its dialogs over a greyed Jugar; retired is a cursor of the time that
/// right-clicks Jugar, picks Eliminar from the usual menu, says Sí, watches "Eliminando..." and Jugar goes into the Recycle Bin, which
/// fills; back is the same cursor opening the Recycle Bin (menus, toolbar, address, task pane, the list in details), right-clicking
/// Jugar, Restaurar, "Moviendo...", and Jugar flies back to its place while the bin empties.
/// </summary>
internal static class ExplorerAccess
{
    public static Func<Scene, Task>? For(string state) => state switch { "maint" => Maint, "soon" => Soon, "retired" => Retired, "back" => Back, _ => null };

    private const string Tahoma = "Tahoma, Segoe UI";
    private static readonly Color Beige = C("#ece9d8"), Frame = C("#0055ea"), Select = C("#316ac5"), Line = C("#d6d2c2");

    // ---- the era's parts ------------------------------------------------------------------------------------------------------

    private static TextBlock T(string text, double size = 11, Color? ink = null, bool bold = false)
        => new() { Text = text, FontFamily = new FontFamily(Tahoma), FontSize = size, Foreground = new SolidColorBrush(ink ?? Colors.Black), FontWeight = bold ? FontWeight.Bold : FontWeight.Normal, TextWrapping = TextWrapping.NoWrap };

    private static LinearGradientBrush Vertical(params (string Hex, double At)[] stops)
    {
        var b = new LinearGradientBrush { StartPoint = Rp.Abs(new Point(0, 0)), EndPoint = Rp.Abs(new Point(0, 1)) };
        foreach (var (hex, at) in stops) b.GradientStops.Add(new GradientStop(C(hex), at));
        return b;
    }

    private static Border Cap(string kind)
    {
        var red = kind == "x";
        var mark = kind switch
        {
            "x" => (Control)new Path { Data = Geo("M5,5 L13,13 M13,5 L5,13"), Stroke = Brushes.White, StrokeThickness = 2 },
            "_" => new Rectangle { Width = 7, Height = 2, Fill = Brushes.White, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 3, 4) },
            _ => new Rectangle { Width = 9, Height = 8, Stroke = Brushes.White, StrokeThickness = 1.5 }
        };
        return new Border
        {
            Width = 19, Height = 19, CornerRadius = new CornerRadius(3), BorderBrush = Brushes.White, BorderThickness = new Thickness(1), Margin = new Thickness(2, 0, 0, 0),
            Background = red ? Vertical(("#e59a86", 0), ("#bd3a1e", 1)) : Vertical(("#7aa6fb", 0), ("#1c52cd", 1)), Child = mark
        };
    }

    private sealed class XpWindow
    {
        public Border Root = null!;
        public List<Border> Pushes = [];
        public Border Close = null!;
    }

    private static Border Push(string label, bool isDefault) => new()
    {
        MinWidth = 75, Padding = new Thickness(10, 3, 10, 3), Margin = new Thickness(6, 0, 0, 0), CornerRadius = new CornerRadius(3), BorderBrush = Br("#003c74"), BorderThickness = new Thickness(1),
        Background = Vertical(("#ffffff", 0), ("#d6d0c5", 1)), Child = new TextBlock { Text = label, FontFamily = new FontFamily(Tahoma), FontSize = 11, HorizontalAlignment = HorizontalAlignment.Center }
    };

    /// <summary>A window of the era: glossy blue title with its buttons, a beige body with a blue frame.</summary>
    private static XpWindow Window(string title, Control body, double width, string[]? buttons = null, bool allCaps = false, Control? titleIcon = null, Thickness? pad = null)
    {
        var w = new XpWindow();
        var caps = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        if (allCaps) { caps.Children.Add(Cap("_")); caps.Children.Add(Cap("[]")); }
        w.Close = Cap("x"); caps.Children.Add(w.Close);
        var titleText = new TextBlock { Text = title, FontFamily = new FontFamily(Tahoma), FontSize = 11.5, FontWeight = FontWeight.Bold, Foreground = Brushes.White, VerticalAlignment = VerticalAlignment.Center, Effect = new DropShadowEffect { OffsetX = 0.71, OffsetY = 0.71, Color = C("#0a1e6e"), BlurRadius = 0 } };
        var head = new DockPanel { Margin = new Thickness(7, 0, 3, 0) };
        DockPanel.SetDock(caps, Dock.Right); head.Children.Add(caps);
        var left = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        if (titleIcon != null) { left.Children.Add(titleIcon); ((Control)titleIcon).Margin = new Thickness(0, 0, 6, 0); }
        left.Children.Add(titleText);
        head.Children.Add(left);
        var titleBar = new Border { Height = 24, CornerRadius = new CornerRadius(7, 7, 0, 0), Background = Vertical(("#0a5fef", 0), ("#3d95ff", 0.05), ("#0c70fb", 0.14), ("#0359e8", 0.3), ("#0460f2", 0.72), ("#0041b0", 1)), Child = head };
        var content = new StackPanel();
        content.Children.Add(body);
        if (buttons != null)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 10, 0, 0) };
            for (var i = 0; i < buttons.Length; i++) { var p = Push(buttons[i], i == 0); w.Pushes.Add(p); row.Children.Add(p); }
            content.Children.Add(row);
        }
        var frame = new Border { Background = new SolidColorBrush(Beige), BorderBrush = new SolidColorBrush(Frame), BorderThickness = new Thickness(3, 0, 3, 3), Padding = pad ?? new Thickness(12, 10, 12, 12), Child = content };
        w.Root = new Border { Width = width, Child = new StackPanel { Children = { titleBar, frame } }, Effect = new DropShadowEffect { OffsetX = 2.83, OffsetY = 2.83, BlurRadius = 0, Opacity = 0.25 } };
        return w;
    }

    private static StackPanel Message(Control icon, string text)
    {
        var msg = new TextBlock { Text = text, FontFamily = new FontFamily(Tahoma), FontSize = 11, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(10, 0, 0, 0), MaxWidth = 250 };
        return new StackPanel { Orientation = Orientation.Horizontal, Children = { icon, msg } };
    }

    private static Canvas Icon(string kind)
    {
        var c = new Canvas { Width = 32, Height = 32 };
        switch (kind)
        {
            case "warn":
                c.Children.Add(PathOf("M16,2 L30,28 L2,28 Z", Br("#f7d23e"), Br("#9a7a00"), 1.2));
                c.Children.Add(PathOf("M14.6,10 L17.4,10 L17.4,20 L14.6,20 Z", Br("#111111"), null));
                c.Children.Add(new Ellipse { Width = 3.4, Height = 3.4, Fill = Br("#111111"), Margin = new Thickness(14.3, 22.3, 0, 0) });
                break;
            case "info":
                c.Children.Add(new Ellipse { Width = 28, Height = 28, Fill = Br("#2e6fd8"), Stroke = Br("#123f8c"), Margin = new Thickness(2, 2, 0, 0) });
                c.Children.Add(PathOf("M14.5,13 L17.5,13 L17.5,23 L14.5,23 Z", Brushes.White, null));
                c.Children.Add(new Ellipse { Width = 4, Height = 4, Fill = Brushes.White, Margin = new Thickness(14, 7, 0, 0) });
                break;
        }
        return c;
    }

    /// <summary>The Recycle Bin, empty or with papers sticking out.</summary>
    private static Canvas Bin(bool full, double size = 32)
    {
        var c = new Canvas { Width = 32, Height = 32, RenderTransform = new ScaleTransform(size / 32, size / 32) };
        if (full)
        {
            c.Children.Add(PathOf("M11,9 L7,1.5 L15,3 Z", Br("#f4f1e6"), Br("#8a8a8a"), 0.7));
            c.Children.Add(PathOf("M15,8 L19,0.5 L24,6 Z", Brushes.White, Br("#8a8a8a"), 0.7));
            c.Children.Add(PathOf("M18,9 L27,4 L25,10 Z", Br("#e8e4d4"), Br("#8a8a8a"), 0.7));
        }
        c.Children.Add(PathOf("M7,8 L25,8 L23,30 L9,30 Z", Br("#d8d8d8"), Br("#555555"), 1));
        var lid = new Rectangle { Width = 22, Height = 4, Fill = Br("#9a9a9a") };
        Canvas.SetLeft(lid, full ? 4 : 5); Canvas.SetTop(lid, full ? 3.5 : 5);
        if (full) lid.RenderTransform = new RotateTransform(-14, 12, 2.5);
        c.Children.Add(lid);
        c.Children.Add(PathOf("M12,12 L13,27 M16,12 L16,27 M20,12 L19,27", null, Br("#9a9a9a"), 0.8));
        return size == 32 ? c : new Canvas { Width = size, Height = size, Children = { c } };
    }

    private static Canvas Folder()
    {
        var c = new Canvas { Width = 32, Height = 32 };
        c.Children.Add(PathOf("M3.5,9.5 L28.5,9.5 L28.5,27.5 L3.5,27.5 Z", Br("#e8c33a"), Br("#8a6a00"), 1));
        c.Children.Add(PathOf("M3,6 L14,6 L14,11 L3,11 Z", Br("#f7dc6a"), null));
        c.Children.Add(PathOf("M7,12 L25,12 L25,15 L7,15 Z", Brushes.White, null));
        return c;
    }

    /// <summary>Jugar as a file in the bin: a green tile with its triangle and the shortcut arrow.</summary>
    private static Canvas PlayFile(double size = 32)
    {
        var c = new Canvas { Width = 32, Height = 32 };
        c.Children.Add(new Rectangle { Width = 26, Height = 26, RadiusX = 4, RadiusY = 4, Fill = Vertical(("#7ddc4f", 0), ("#2c8a1c", 1)), Stroke = Br("#1d5e12"), Margin = new Thickness(3, 3, 0, 0) });
        c.Children.Add(PathOf("M12,9.5 L22.5,16 L12,22.5 Z", Brushes.White, null));
        c.Children.Add(new Rectangle { Width = 10, Height = 10, Fill = Brushes.White, Stroke = Br("#7a7a7a"), Margin = new Thickness(1.5, 20.5, 0, 0) });
        c.Children.Add(PathOf("M4,28 Q4,23.5 8.5,23.5 M6.8,22 L8.8,23.5 L6.8,25", null, Br("#1c52cd"), 1.4));
        if (size == 32) return c;
        c.RenderTransform = new ScaleTransform(size / 32, size / 32);
        return new Canvas { Width = size, Height = size, Children = { c } };
    }

    // ---- the cursor -------------------------------------------------------------------------------------------------------------

    private sealed class Cursor
    {
        public Canvas El = null!;
        public double X, Y;
    }

    private static Cursor NewCursor(Scene s, double x, double y)
    {
        var el = new Canvas { Width = 14, Height = 22, Effect = new DropShadowEffect { OffsetX = 0.71, OffsetY = 0.71, BlurRadius = 0, Opacity = 0.25 } };
        el.Children.Add(PathOf("M1,1 L1,17 L5,13.4 L8,20.5 L10.6,19.4 L7.6,12.4 L12.6,12.4 Z", Brushes.White, Brushes.Black, 1.1));
        s.Add(el, x, y, 90);
        Xf.Of(el, 0, 0);
        return new Cursor { El = el, X = x, Y = y };
    }

    private static async Task MoveTo(Scene s, Cursor c, double x, double y, double ms = 650)
    {
        double x0 = c.X, y0 = c.Y;
        s.Anim(ms, t => Move(c.El, Lerp(x0, x, t), Lerp(y0, y, t)), 0, Ease.Bezier(0.45, 0.05, 0.25, 1));
        c.X = x; c.Y = y;
        await s.Sleep(ms);
    }

    private static async Task Click(Scene s, Cursor c)
    {
        var xf = Xf.Of(c.El, 0, 0);
        s.Anim(160, t => xf.S = Keys(t, 1, 0.86, 1));
        await s.Sleep(180);
    }

    // ---- right-click menus ------------------------------------------------------------------------------------------------------

    private sealed class Menu
    {
        public Border Root = null!;
        public List<(string Name, Border Row, TextBlock Text)> Items = [];
    }

    private static Menu OpenMenu(Scene s, string[] items, double x, double y)
    {
        var m = new Menu();
        var list = new StackPanel();
        foreach (var it in items)
        {
            if (it == "-") { list.Children.Add(new Border { Height = 1, Background = Br("#aca899"), Margin = new Thickness(2, 3, 2, 3) }); continue; }
            var name = it.TrimStart('*').TrimEnd('>');
            var text = new TextBlock { Text = name, FontFamily = new FontFamily(Tahoma), FontSize = 11, FontWeight = it.StartsWith('*') ? FontWeight.Bold : FontWeight.Normal, VerticalAlignment = VerticalAlignment.Center };
            var dock = new DockPanel();
            if (it.EndsWith('>')) { var arrow = PathOf("M0,0 L4,4 L0,8 Z", Brushes.Black, null); arrow.VerticalAlignment = VerticalAlignment.Center; DockPanel.SetDock(arrow, Dock.Right); dock.Children.Add(arrow); }
            dock.Children.Add(text);
            var row = new Border { Padding = new Thickness(24, 3, 26, 3), Child = dock };
            list.Children.Add(row);
            m.Items.Add((name, row, text));
        }
        m.Root = new Border { MinWidth = 176, Background = Brushes.White, BorderBrush = Br("#8a867a"), BorderThickness = new Thickness(1), Padding = new Thickness(2), Child = list, Effect = new DropShadowEffect { OffsetX = 1.41, OffsetY = 1.41, BlurRadius = 3, Opacity = 0.35 } };
        m.Root.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        var size = m.Root.DesiredSize;
        // it opens right and down from the pointer, and flips left or up when there is no room, as XP did
        if (x + size.Width > s.W - 4) x -= size.Width;
        if (y + size.Height > s.H - 4) y -= size.Height;
        s.Add(m.Root, x, y, 80);
        var clip = new RectangleGeometry(new Rect(0, 0, size.Width, 0));
        m.Root.Clip = clip;
        s.Anim(140, t => { m.Root.Opacity = t; clip.Rect = new Rect(0, 0, size.Width, size.Height * t); if (t >= 1) m.Root.Clip = null; }, 0, Ease.CssOut);
        m.Root.UpdateLayout();
        return m;
    }

    private static void Hot(Menu m, int index)
    {
        for (var i = 0; i < m.Items.Count; i++)
        {
            m.Items[i].Row.Background = i == index ? new SolidColorBrush(Select) : null;
            m.Items[i].Text.Foreground = i == index ? Brushes.White : Brushes.Black;
        }
    }

    private static Rect Where(Scene s, Control el) => (el.TranslatePoint(new Point(0, 0), s.Stage) is { } o ? new Rect(o, el.Bounds.Size) : new Rect(0, 0, el.Bounds.Width, el.Bounds.Height));

    /// <summary>Walks the pointer through the menu's items to one, lighting each on the way, and clicks it.</summary>
    private static async Task Pick(Scene s, Cursor c, Menu m, string name)
    {
        var target = m.Items.FindIndex(i => i.Name == name);
        var top = Where(s, m.Root).Top;
        var start = c.Y < top + 10 ? 0 : m.Items.Count - 1;
        var step = start <= target ? 1 : -1;
        for (var i = start; i != target + step; i += step)
        {
            var r = Where(s, m.Items[i].Row);
            Hot(m, i);
            await MoveTo(s, c, r.X + 60, r.Y + r.Height / 2 - 4, i == start ? 260 : 90);
        }
        await s.Sleep(160);
        await Click(s, c);
        Hot(m, target);
        await s.Sleep(80);
    }

    // ---- the desktop's Recycle Bin, and the era's zoom and progress windows ----------------------------------------------------------

    private sealed class BinIcon
    {
        public StackPanel Root = null!;
        public Border Pic = null!;
        public Border Label = null!;
    }

    private static Point BinSpot(Scene s) => new(s.W - 84, 166);   // where ExplorerField draws it (IconSpot(1))

    private static BinIcon DesktopBin(Scene s, bool full)
    {
        var b = new BinIcon();
        b.Pic = new Border { Width = 32, Height = 32, Child = Bin(full) };
        b.Label = new Border { Margin = new Thickness(0, 4, 0, 0), Padding = new Thickness(2, 0, 2, 0), IsVisible = false, Child = T("Papelera", 11, Colors.White) };
        b.Root = new StackPanel { Width = 90, Children = { b.Pic, b.Label } };
        b.Pic.HorizontalAlignment = HorizontalAlignment.Center; b.Label.HorizontalAlignment = HorizontalAlignment.Center;
        var spot = BinSpot(s);
        s.Add(b.Root, spot.X - 29, spot.Y, 30);
        return b;
    }

    private static void SetBin(Scene s, BinIcon b, bool full)
    {
        b.Pic.Child = Bin(full);
        var x = Xf.Of(b.Pic);
        s.Anim(260, t => x.S = Keys(t, 1, 1.18, 1));
    }

    private static void SelectBin(BinIcon b, bool on)
    {
        b.Pic.Opacity = on ? 0.65 : 1;
        b.Pic.Background = on ? new SolidColorBrush(Color.FromArgb(120, 49, 106, 197)) : null;
        b.Label.Background = on ? Br("#0b246a") : null;
        b.Label.IsVisible = on;
    }

    private static async Task Zoom(Scene s, Rect from, Rect to, double ms = 320)
    {
        var z = s.Add(new Border { BorderBrush = new SolidColorBrush(Color.FromArgb(217, 40, 40, 40)), BorderThickness = new Thickness(2), Width = from.Width, Height = from.Height }, from.X, from.Y, 85);
        s.Anim(ms, t => { Move(z, Lerp(from.X, to.X, t), Lerp(from.Y, to.Y, t)); z.Width = Math.Max(2, Lerp(from.Width, to.Width, t)); z.Height = Math.Max(2, Lerp(from.Height, to.Height, t)); }, 0, Ease.Linear);
        await s.Sleep(ms);
        s.Remove(z);
    }

    private static async Task Flying(Scene s, string title, Control fromPic, Control toPic, double x, double y)
    {
        var lane = new Grid { Height = 40 };
        lane.Children.Add(new Border { HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top, Child = fromPic });
        lane.Children.Add(new Border { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 4, 6, 0), Child = toPic });
        var stripes = new LinearGradientBrush { StartPoint = Rp.Abs(new Point(0, 0)), EndPoint = Rp.Abs(new Point(9, 0)), SpreadMethod = GradientSpreadMethod.Repeat };
        foreach (var (c, at) in new[] { ("#3fbf3f", 0.0), ("#3fbf3f", 0.78), ("#00000000", 0.78), ("#00000000", 1.0) }) stripes.GradientStops.Add(new GradientStop(C(c), at));
        var fill = new Rectangle { Fill = stripes, Width = 0, HorizontalAlignment = HorizontalAlignment.Left };
        var bar = new Border { Height = 14, BorderBrush = Br("#7f9db9"), BorderThickness = new Thickness(1), Background = Brushes.White, Padding = new Thickness(1), Child = fill, Margin = new Thickness(0, 4, 0, 0) };
        var body = new StackPanel { Children = { lane, T("Jugar"), bar } };
        var win = Window(title, body, 300, ["Cancelar"]);
        s.Add(win.Root, x, y, 70);
        var wx = Xf.Of(win.Root);
        s.Anim(180, t => { win.Root.Opacity = t; wx.S = Lerp(0.7, 1, t); });
        win.Root.UpdateLayout();
        var laneAt = Where(s, lane);
        for (var k = 0; k < 3; k++)
        {
            var sheet = new Border { Width = 12, Height = 15, Background = Brushes.White, BorderBrush = Br("#8a8a8a"), BorderThickness = new Thickness(1), Opacity = 0 };
            s.Add(sheet, laneAt.X + 34, laneAt.Y + 14, 75);
            var sx = Xf.Of(sheet);
            s.Anim(900, t =>
            {
                sx.X = KeysAt(t, (0, 0), (0.5, 95), (0.9, 200), (1, 204));
                sx.Y = KeysAt(t, (0, 0), (0.5, -22), (0.9, 0), (1, 3));
                sx.R = KeysAt(t, (0, 0), (0.5, -120), (0.9, -240), (1, -250));
                sheet.Opacity = KeysAt(t, (0, 0), (0.1, 1), (0.9, 1), (1, 0));
            }, k * 300, Ease.Linear, 2);
        }
        s.Anim(1700, t => fill.Width = (bar.Bounds.Width - 4) * t, 0, Ease.Steps(14));
        await s.Sleep(1800);
        s.FadeOut(win.Root, 120);
        await s.Sleep(130);
        s.Remove(win.Root);
    }

    // ---- the effects ------------------------------------------------------------------------------------------------------------

    private static void Grey(Scene s)
    {
        var box = s.Play();
        s.Anim(300, t => { box.Grey = t; box.Light.Opacity = 0.08 * t; });
    }

    private static Task Maint(Scene s)
    {
        Grey(s);
        var text = s.Say.Until is { } u ? $"El servidor está en mantenimiento.\nVuelve {s.Say.Sentence(u)}." : "El servidor está en mantenimiento.\nVuelve pronto.";
        var win = Window("Empi Launcher", Message(Icon("warn"), text), 250, ["Aceptar"]);
        s.Add(win.Root, s.Cx - 125, s.P.Y - 118, 40);
        var x = Xf.Of(win.Root);
        s.Anim(220, t => { win.Root.Opacity = t; x.S = Lerp(0.6, 1, t); }, 0, Ease.CssOut);
        return Task.CompletedTask;
    }

    private static Task Soon(Scene s)
    {
        Grey(s);
        var days = s.Say.From is { } f ? Math.Max(0, (int)Math.Ceiling((f - DateTimeOffset.Now).TotalDays)) : 0;
        var left = s.Say.From == null ? "Tiempo restante: poquito" : days <= 1 ? $"Tiempo restante: {Math.Max(1, (int)Math.Ceiling((s.Say.From.Value - DateTimeOffset.Now).TotalHours))} horas" : $"Tiempo restante: {days} días";
        var stripes = new LinearGradientBrush { StartPoint = Rp.Abs(new Point(0, 0)), EndPoint = Rp.Abs(new Point(9, 0)), SpreadMethod = GradientSpreadMethod.Repeat };
        foreach (var (c, at) in new[] { ("#3fbf3f", 0.0), ("#3fbf3f", 0.78), ("#00000000", 0.78), ("#00000000", 1.0) }) stripes.GradientStops.Add(new GradientStop(C(c), at));
        var fill = new Rectangle { Fill = stripes, Width = 0, HorizontalAlignment = HorizontalAlignment.Left };
        var bar = new Border { Height = 14, Width = 196, BorderBrush = Br("#7f9db9"), BorderThickness = new Thickness(1), Background = Brushes.White, Padding = new Thickness(1), Child = fill, Margin = new Thickness(0, 6, 0, 0) };
        var info = new StackPanel { Margin = new Thickness(10, 0, 0, 0), Children = { T(left), bar } };
        var body = new StackPanel { Orientation = Orientation.Horizontal, Children = { Icon("info"), info } };
        var win = Window($"Preparando {s.Say.PackName}...", body, 280, ["Cancelar"]);
        s.Add(win.Root, s.Cx - 140, s.P.Y - 126, 40);
        var x = Xf.Of(win.Root);
        s.Anim(220, t => { win.Root.Opacity = t; x.S = Lerp(0.6, 1, t); });
        s.Anim(2600, t => fill.Width = 192 * 0.46 * t, 300, Ease.Steps(12));
        return Task.CompletedTask;
    }

    private static async Task Retired(Scene s)
    {
        // the cursor comes in, right-clicks Jugar, and sends it to the Recycle Bin, as one did then
        var bin = DesktopBin(s, false);
        var c = NewCursor(s, s.W - 120, s.H + 10);
        await s.Sleep(300);
        await MoveTo(s, c, s.P.X + 150, s.Cy - 4, 800);
        await s.Sleep(200);
        await Click(s, c);
        var sel = new Grid { Width = s.P.Width, Height = s.P.Height };
        sel.Children.Add(new Border { Background = new SolidColorBrush(Color.FromArgb(107, 49, 106, 197)), CornerRadius = s.Radius });
        sel.Children.Add(new Rectangle { Margin = new Thickness(3), Stroke = Brushes.White, StrokeThickness = 1, StrokeDashArray = [1, 2] });
        s.Add(sel, s.P.X, s.P.Y, 12);
        var m = OpenMenu(s, ["*Abrir", "Ejecutar como...", "-", "Enviar a>", "-", "Cortar", "Copiar", "-", "Crear acceso directo", "Eliminar", "Cambiar nombre", "-", "Propiedades"], c.X + 2, c.Y + 2);
        await s.Sleep(350);
        await Pick(s, c, m, "Eliminar");
        s.Remove(m.Root);
        var ask = Window("Confirmar la eliminación del archivo", Message(Bin(false), "¿Está seguro de que desea enviar 'Jugar' a la Papelera de reciclaje?"), 330, ["Sí", "No"]);
        s.Add(ask.Root, s.W / 2 - 165, s.H / 2 - 20, 60);
        var ax = Xf.Of(ask.Root);
        s.Anim(160, t => { ask.Root.Opacity = t; ax.S = Lerp(0.7, 1, t); });
        ask.Root.UpdateLayout();
        await s.Sleep(500);
        var yes = Where(s, ask.Pushes[0]);
        await MoveTo(s, c, yes.X + yes.Width * 0.4, yes.Y + yes.Height * 0.45, 600);
        await Click(s, c);
        ask.Pushes[0].Background = Vertical(("#d6d0c5", 0), ("#ffffff", 1));
        await s.Sleep(120);
        s.Remove(ask.Root);
        await Flying(s, "Eliminando...", Folder(), Bin(false), s.W / 2 - 150, s.H / 2 - 20);
        s.Remove(sel);
        var spot = BinSpot(s);
        await Zoom(s, s.P, new Rect(spot.X, spot.Y, 32, 32));
        s.HidePlay();
        SetBin(s, bin, true);
        await MoveTo(s, c, s.W * 0.8, s.H * 0.75, 700);
        s.FadeOut(c.El, 300);
    }

    private static async Task Back(Scene s)
    {
        // the same cursor right-clicks the Recycle Bin and opens it, picks Jugar, right-clicks it, Restaurar, and Jugar comes back out of it
        s.HidePlay();
        var bin = DesktopBin(s, true);
        var c = NewCursor(s, s.W * 0.68, s.H * 0.74);
        var spot = BinSpot(s);
        await s.Sleep(400);
        await MoveTo(s, c, spot.X + 18, spot.Y + 18, 900);
        await Click(s, c);
        SelectBin(bin, true);
        var m = OpenMenu(s, ["*Abrir", "Explorar", "-", "Vaciar Papelera de reciclaje", "-", "Crear acceso directo", "-", "Propiedades"], c.X + 2, c.Y + 2);
        await s.Sleep(350);
        await Pick(s, c, m, "Abrir");
        s.Remove(m.Root);
        var win = RecycleWindow(s);
        double ww = 640, wh = 330, wx0 = Math.Max(8, s.W / 2 - 330), wy0 = Math.Max(60, s.H / 2 - 200);
        await Zoom(s, new Rect(spot.X, spot.Y, 32, 32), new Rect(wx0, wy0, ww, wh), 260);
        s.Add(win.Root, wx0, wy0, 50);
        s.FadeIn(win.Root, 60);
        win.Root.UpdateLayout();
        SelectBin(bin, false);
        await s.Sleep(450);
        var name = Where(s, win.Name);
        await MoveTo(s, c, name.X + name.Width * 0.55, name.Y + name.Height * 0.55, 800);
        await Click(s, c);
        win.Row.Background = new SolidColorBrush(Select);
        foreach (var t in win.RowTexts) t.Foreground = Brushes.White;
        win.Task.Text = "Restaurar este elemento"; win.Count.Text = "1 objeto seleccionado";
        await s.Sleep(380);
        await Click(s, c);   // and a right-click on it
        var m2 = OpenMenu(s, ["*Restaurar", "-", "Cortar", "-", "Eliminar", "-", "Propiedades"], c.X + 2, c.Y + 2);
        await s.Sleep(320);
        await Pick(s, c, m2, "Restaurar");
        s.Remove(m2.Root);
        var from = Where(s, win.Row);
        await Flying(s, "Moviendo...", Bin(true), Folder(), wx0 + 300, wy0 + 150);
        win.Row.IsVisible = false;
        SetBin(s, bin, false);
        win.Task.Text = "Restaurar todos los elementos"; win.Count.Text = "0 objetos"; win.Bytes.Text = "0 bytes";
        await Zoom(s, from, s.P);
        var box = s.Play(); box.IsVisible = true;
        s.Anim(400, t => box.Light.Opacity = 0.5 * (1 - t));
        var close = Where(s, win.Close);
        await MoveTo(s, c, close.X + close.Width * 0.4, close.Y + close.Height * 0.4, 600);
        await Click(s, c);
        s.Remove(win.Root);
        await Zoom(s, new Rect(wx0, wy0, ww, wh), new Rect(wx0 + ww / 2, wy0 + wh / 2, 2, 2), 150);
        await MoveTo(s, c, s.W * 0.8, s.H * 0.75, 600);
        s.FadeOut(c.El, 300);
        await s.Sleep(320);
        s.Remove(bin.Root);
        s.RestorePlay();
    }

    // ---- the Recycle Bin's window ------------------------------------------------------------------------------------------------

    private sealed class RecycleBin
    {
        public Border Root = null!, Row = null!, Close = null!;
        public Control Name = null!;
        public List<TextBlock> RowTexts = [];
        public TextBlock Task = null!, Count = null!, Bytes = null!;
    }

    private static RecycleBin RecycleWindow(Scene s)
    {
        var r = new RecycleBin();
        Control Tool(Control pic, string label = "", bool dim = false)
        {
            var p = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(6, 2, 6, 2), Opacity = dim ? 0.45 : 1, VerticalAlignment = VerticalAlignment.Center };
            p.Children.Add(pic);
            if (label.Length > 0) { var t = T(label); t.Margin = new Thickness(4, 0, 0, 0); t.VerticalAlignment = VerticalAlignment.Center; p.Children.Add(t); }
            return p;
        }
        Border Sep() => new() { Width = 1, Background = Br("#c5c2b2"), Margin = new Thickness(3, 2, 3, 2), BorderBrush = Brushes.White, BorderThickness = new Thickness(0, 0, 1, 0) };
        Canvas Arrow(bool back)
        {
            var c = new Canvas { Width = 20, Height = 20 };
            c.Children.Add(new Ellipse { Width = 17, Height = 17, Fill = Br("#3fae2f"), Stroke = Br("#236b17"), Margin = new Thickness(1.5, 1.5, 0, 0) });
            c.Children.Add(new Path { Data = Geo(back ? "M11.8,5.2 L7,10 L11.8,14.8" : "M8.2,5.2 L13,10 L8.2,14.8"), Stroke = Brushes.White, StrokeThickness = 2.4, StrokeLineCap = PenLineCap.Round, StrokeJoin = PenLineJoin.Round });
            return c;
        }
        Canvas Pic(params (string Data, string? Fill, string? Stroke, double W)[] parts)
        {
            var c = new Canvas { Width = 20, Height = 20 };
            foreach (var (d, f, st, w) in parts) c.Children.Add(PathOf(d, f == null ? null : Br(f), st == null ? null : Br(st), w));
            return c;
        }

        // menu, toolbar, address
        var menu = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(6, 3, 6, 3) };
        foreach (var m in new[] { "Archivo", "Edición", "Ver", "Favoritos", "Herramientas", "Ayuda" }) { var t = T(m); t.Margin = new Thickness(0, 0, 13, 0); menu.Children.Add(t); }
        var tools = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(4, 3, 4, 3) };
        tools.Children.Add(Tool(Arrow(true), "Atrás", true));
        tools.Children.Add(Tool(Arrow(false), "", true));
        tools.Children.Add(Tool(Pic(("M2,8 L17,8 L17,17 L2,17 Z", "#e8c33a", "#8a6a00", 1), ("M10,14 V3.5 M6.2,7.2 L10,3.5 L13.8,7.2", null, "#2c8a1c", 2.2))));
        tools.Children.Add(Sep());
        tools.Children.Add(Tool(Pic(("M7.5,2.5 A5,5 0 1 1 7.49,2.5 Z", "#e3f1ff", "#35599a", 1.6), ("M11.3,11.3 L16,16", null, "#8a6a00", 2.6)), "Búsqueda"));
        tools.Children.Add(Tool(Pic(("M1.5,6 L13.5,6 L13.5,15 L1.5,15 Z", "#e8c33a", "#8a6a00", 1), ("M4.5,3.5 L16.5,3.5 L16.5,12.5 L4.5,12.5 Z", "#f7dc6a", "#8a6a00", 1)), "Carpetas"));
        tools.Children.Add(Sep());
        tools.Children.Add(Tool(Pic(("M2,3 L5,3 L5,6 L2,6 Z M2,7.5 L5,7.5 L5,10.5 L2,10.5 Z M2,12 L5,12 L5,15 L2,15 Z", "#35599a", null, 0), ("M7,4 L16,4 M7,8.5 L16,8.5 M7,13 L16,13", null, "#35599a", 1.6))));
        tools.Children.Add(Sep());
        tools.Children.Add(Tool(Pic(("M3.5,3.5 L12.5,12.5 M12.5,3.5 L3.5,12.5", null, "#d8321c", 2.8))));
        var address = new DockPanel { Margin = new Thickness(6, 3, 6, 3) };
        var go = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(6, 0, 0, 0) };
        go.Children.Add(new Border { Width = 14, Height = 14, CornerRadius = new CornerRadius(3), Background = Br("#3fae2f"), Child = new TextBlock { Text = "➔", Foreground = Brushes.White, FontSize = 9, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } });
        var goText = T("Ir"); goText.Margin = new Thickness(3, 0, 0, 0); go.Children.Add(goText);
        DockPanel.SetDock(go, Dock.Right);
        var dirLabel = T("Dirección", 11, C("#6d6a5f")); dirLabel.Margin = new Thickness(0, 0, 6, 0); dirLabel.VerticalAlignment = VerticalAlignment.Center;
        DockPanel.SetDock(dirLabel, Dock.Left);
        var field = new Border { Background = Brushes.White, BorderBrush = Br("#7f9db9"), BorderThickness = new Thickness(1), Padding = new Thickness(4, 1, 4, 1), Child = new StackPanel { Orientation = Orientation.Horizontal, Children = { Bin(false, 16), new TextBlock { Text = "Papelera de reciclaje", FontFamily = new FontFamily(Tahoma), FontSize = 11, Margin = new Thickness(5, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center } } } };
        address.Children.Add(go); address.Children.Add(dirLabel); address.Children.Add(field);

        // the task pane
        Border Card(string title, bool open, params Control[] body)
        {
            var chevron = new Border { Width = 15, Height = 15, CornerRadius = new CornerRadius(8), Background = Brushes.White, BorderBrush = Br("#aebde8"), BorderThickness = new Thickness(1), Child = new TextBlock { Text = open ? "︿" : "﹀", FontSize = 8, FontWeight = FontWeight.Bold, Foreground = Br("#215dc6"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center } };
            var head = new DockPanel { Margin = new Thickness(9, 4, 6, 4) };
            DockPanel.SetDock(chevron, Dock.Right); head.Children.Add(chevron);
            head.Children.Add(T(title, 11, C("#215dc6"), true));
            var headBox = new Border { CornerRadius = new CornerRadius(4, 4, 0, 0), Background = Gr.Linear(Colors.White, C("#c6d3f7"), 0), Child = head };
            var card = new StackPanel { Margin = new Thickness(0, 0, 0, 10), Children = { headBox } };
            if (open)
            {
                var list = new StackPanel { Margin = new Thickness(9, 7, 9, 7) };
                foreach (var b in body) { ((Control)b).Margin = new Thickness(0, 0, 0, 6); list.Children.Add(b); }
                card.Children.Add(new Border { Background = Br("#d6dff7"), Child = list });
            }
            return new Border { Child = card };
        }
        TextBlock TaskText(string t) => new() { Text = t, FontFamily = new FontFamily(Tahoma), FontSize = 11, Foreground = Br("#215dc6"), TextWrapping = TextWrapping.Wrap };
        r.Task = TaskText("Restaurar todos los elementos");
        var pane = new StackPanel { Width = 168, Background = Gr.Linear(C("#7ba2e7"), C("#6375d6"), 90) };
        var paneInner = new StackPanel { Margin = new Thickness(9, 10, 9, 10), Children = { Card("Tareas de la Papelera", true, TaskText("Vaciar la Papelera de reciclaje"), r.Task), Card("Otros sitios", false), Card("Detalles", false) } };
        pane.Children.Add(paneInner);

        // the list, in details
        var widths = new[] { 1.25, 1.35, 1.1, 0.55, 1.0 };
        Grid Columns()
        {
            var g = new Grid();
            foreach (var w in widths) g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(w, GridUnitType.Star) });
            return g;
        }
        var header = Columns();
        var titles = new[] { "Nombre", "Ubicación original", "Fecha de eliminación", "Tamaño", "Tipo" };
        for (var i = 0; i < titles.Length; i++)
        {
            var h = new Border { BorderBrush = new SolidColorBrush(Line), BorderThickness = new Thickness(0, 0, 1, 1), Background = Vertical(("#ffffff", 0), ("#ebeadb", 1)), Padding = new Thickness(6, 3, 6, 3), Child = T(titles[i]), ClipToBounds = true };
            Grid.SetColumn(h, i); header.Children.Add(h);
        }
        var row = Columns();
        var nameCell = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(6, 2, 6, 2) };
        nameCell.Children.Add(PlayFile(16));
        var nameText = T("Jugar"); nameText.Margin = new Thickness(5, 0, 0, 0); nameText.VerticalAlignment = VerticalAlignment.Center; nameCell.Children.Add(nameText);
        r.RowTexts.Add(nameText);
        Grid.SetColumn(nameCell, 0); row.Children.Add(nameCell);
        var cells = new[] { "C:\\Empi Launcher", $"hoy {DateTime.Now:HH:mm}", "1 KB", "Acceso directo" };
        for (var i = 0; i < cells.Length; i++)
        {
            var t = T(cells[i]); t.Margin = new Thickness(6, 2, 6, 2); t.TextTrimming = TextTrimming.CharacterEllipsis; t.VerticalAlignment = VerticalAlignment.Center;
            if (i == 2) t.HorizontalAlignment = HorizontalAlignment.Right;
            Grid.SetColumn(t, i + 1); row.Children.Add(t); r.RowTexts.Add(t);
        }
        r.Row = new Border { Margin = new Thickness(0, 2, 0, 0), Child = row };
        r.Name = nameCell;
        var files = new StackPanel { Background = Brushes.White, Children = { header, r.Row } };

        var main = new DockPanel { Height = 330 - 24 - 3 - 22 - 30 - 26 - 22 };
        DockPanel.SetDock(pane, Dock.Left);
        main.Children.Add(pane); main.Children.Add(new Border { Background = Brushes.White, Child = files });

        r.Count = T("1 objeto"); r.Count.Margin = new Thickness(6, 2, 6, 2);
        r.Bytes = T("1 KB"); r.Bytes.Margin = new Thickness(6, 2, 6, 2);
        var status = new DockPanel { Background = new SolidColorBrush(Beige) };
        var bytesBox = new Border { Width = 110, BorderBrush = new SolidColorBrush(Line), BorderThickness = new Thickness(1, 0, 0, 0), Child = r.Bytes };
        DockPanel.SetDock(bytesBox, Dock.Right); status.Children.Add(bytesBox); status.Children.Add(r.Count);

        Border Ruled(Control child) => new() { BorderBrush = new SolidColorBrush(Line), BorderThickness = new Thickness(0, 0, 0, 1), Child = child };
        var body = new StackPanel { Children = { Ruled(menu), Ruled(tools), Ruled(address), main, new Border { BorderBrush = new SolidColorBrush(Line), BorderThickness = new Thickness(0, 1, 0, 0), Child = status } } };
        var win = Window("Papelera de reciclaje", body, 640, null, allCaps: true, titleIcon: Bin(false, 16), pad: new Thickness(0));
        r.Root = win.Root;
        r.Close = win.Close;
        return r;
    }
}
