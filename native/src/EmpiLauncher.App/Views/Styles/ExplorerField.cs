using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// EXPLORER: an old desktop gone liminal. A deep blue sky with drifting clouds, an endless checkered floor walked slowly into, a corridor of
/// classic dialog boxes on both sides with early-3D props (a glossy sphere, a turning torus, a yellow cube, a column), a blue screen far at
/// the end, desktop icons down the right edge and now and then a VHS tracking band rolling down.
///
/// The interface lives in it the old way: the modpack's text sits in a grey window with a navy title bar that carries the modpack's name
/// (the window is drawn around wherever the text is), a grey menu bar runs along the top, and one desktop icon is the modpack itself. What
/// happens is real: while something downloads a "Copiando..." window shows the true progress and how much is left, and a click pops a
/// dialog (some are the modpack's own facts). It arrives as a window zooming open out of the "Explorer" icon, outline rectangles trailing.
/// No real logo of any company is drawn.
/// </summary>
internal sealed class ExplorerField : StyleField
{
    public override double ArriveSeconds => 1.3;
    public override double Ease(double raw) => raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.Pow(-2 * raw + 2, 3) / 2;
    protected override double AmbientMs => 100;

    private const string Ui = "Tahoma, Verdana, Segoe UI";
    private static readonly Typeface Face = new(new FontFamily(Ui), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
    private static readonly Typeface Bold = new(new FontFamily(Ui), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
    private static readonly SolidColorBrush Grey = Frozen(Color.FromRgb(0xc0, 0xc0, 0xc0));
    private static readonly SolidColorBrush White = Frozen(Colors.White);
    private static readonly SolidColorBrush Black = Frozen(Colors.Black);
    private static readonly SolidColorBrush Shade = Frozen(Color.FromRgb(0x80, 0x80, 0x80));
    private static readonly SolidColorBrush Light = Frozen(Color.FromRgb(0xdf, 0xdf, 0xdf));
    private static readonly SolidColorBrush Navy = Frozen(Color.FromRgb(0, 0, 0x80));
    private static readonly SolidColorBrush Floor = Frozen(Color.FromRgb(0xe9, 0xe6, 0xde));
    private static readonly SolidColorBrush Tile = Frozen(Color.FromRgb(0x14, 0x14, 0x14));
    private static readonly LinearGradientBrush TitleBar = Gradient(Color.FromRgb(0, 0, 0x80), Color.FromRgb(0x10, 0x84, 0xd0), horizontal: true);

    private static double Hash(double n) { var x = Math.Sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.Floor(x); }

    private static LinearGradientBrush Gradient(Color a, Color b, bool horizontal)
    {
        var g = new LinearGradientBrush(a, b, horizontal ? new Point(0, 0.5) : new Point(0.5, 0), horizontal ? new Point(1, 0.5) : new Point(0.5, 1));
        g.Freeze();
        return g;
    }

    // ---- sprites, drawn once (at twice the size, so they stay crisp when the corridor brings them close) --------------------

    private sealed record Sprite(BitmapSource Image, double W, double H);

    private static Sprite Draw(double w, double h, Action<DrawingContext> draw)
    {
        const double s = 2;
        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen()) { dc.PushTransform(new ScaleTransform(s, s)); draw(dc); dc.Pop(); }
        var bitmap = new RenderTargetBitmap((int)Math.Ceiling(w * s), (int)Math.Ceiling(h * s), 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        return new Sprite(bitmap, w, h);
    }

    // the screen's pixels per point while drawing live (sprites are drawn at 1)
    private static double _dip = 1.0;

    private static FormattedText Words(string text, Typeface face, double size, Brush brush, double maxWidth = 0)
    {
        var t = new FormattedText(text, CultureInfo.GetCultureInfo("es-ES"), FlowDirection.LeftToRight, face, size, brush, _dip);
        if (maxWidth > 0) t.MaxTextWidth = maxWidth;
        return t;
    }

    /// <summary>The classic raised (or pressed) edge: white and light grey on top and left, black and dark grey on the bottom and right.</summary>
    private static void Bevel(DrawingContext g, double x, double y, double w, double h, bool pressed = false, bool fill = true)
    {
        if (fill) g.DrawRectangle(Grey, null, new Rect(x, y, w, h));
        g.DrawRectangle(pressed ? Black : White, null, new Rect(x, y, w - 1, 1)); g.DrawRectangle(pressed ? Black : White, null, new Rect(x, y, 1, h - 1));
        g.DrawRectangle(pressed ? White : Black, null, new Rect(x, y + h - 1, w, 1)); g.DrawRectangle(pressed ? White : Black, null, new Rect(x + w - 1, y, 1, h));
        g.DrawRectangle(pressed ? Shade : Light, null, new Rect(x + 1, y + 1, w - 3, 1)); g.DrawRectangle(pressed ? Shade : Light, null, new Rect(x + 1, y + 1, 1, h - 3));
        g.DrawRectangle(pressed ? Light : Shade, null, new Rect(x + 1, y + h - 2, w - 2, 1)); g.DrawRectangle(pressed ? Light : Shade, null, new Rect(x + w - 2, y + 1, 1, h - 2));
    }

    /// <summary>The glossy blue of the era's title bars, from its light top edge to its deep bottom.</summary>
    private static readonly LinearGradientBrush Luna = LunaGradient();
    private static LinearGradientBrush LunaGradient()
    {
        var g = new LinearGradientBrush { StartPoint = new Point(0.5, 0), EndPoint = new Point(0.5, 1) };
        foreach (var (hex, at) in new[] { ("#0a5fef", 0.0), ("#3d95ff", 0.05), ("#2a8bff", 0.09), ("#0c70fb", 0.14), ("#0359e8", 0.3), ("#0253e0", 0.55), ("#0460f2", 0.72), ("#0a6cfd", 0.84), ("#0355df", 0.93), ("#0041b0", 1.0) })
            g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(hex), at));
        g.Freeze();
        return g;
    }
    private static readonly SolidColorBrush Frame = Frozen(Color.FromRgb(0x00, 0x55, 0xea));
    private static readonly SolidColorBrush Beige = Frozen(Color.FromRgb(0xec, 0xe9, 0xd8));
    private static readonly SolidColorBrush TitleShadow = Frozen(Color.FromRgb(0x0a, 0x1e, 0x6e));
    private static readonly LinearGradientBrush CaptionBlue = Gradient(Color.FromRgb(0x7a, 0xa6, 0xfb), Color.FromRgb(0x1c, 0x52, 0xcd), horizontal: false);
    private static readonly LinearGradientBrush CaptionRed = Gradient(Color.FromRgb(0xea, 0xa0, 0x8a), Color.FromRgb(0xbd, 0x3a, 0x1e), horizontal: false);
    private static readonly LinearGradientBrush ButtonFace = Gradient(Colors.White, Color.FromRgb(0xd6, 0xd0, 0xc5), horizontal: false);
    private static readonly LinearGradientBrush Green = Gradient(Color.FromRgb(0x5c, 0xd0, 0x5c), Color.FromRgb(0x1f, 0x9a, 0x1f), horizontal: false);

    /// <summary>A title bar: the glossy blue, its text in white with the dark shadow of the time, and the three caption buttons on the right.</summary>
    private static void Title(DrawingContext g, double x, double y, double w, string title, double h = 24)
    {
        g.DrawRectangle(Luna, null, new Rect(x, y, w, h));
        var shadow = Words(title, Bold, 11.5, TitleShadow, Math.Max(10, w - 90)); shadow.MaxLineCount = 1; shadow.Trimming = TextTrimming.CharacterEllipsis;
        var t = Words(title, Bold, 11.5, White, Math.Max(10, w - 90)); t.MaxLineCount = 1; t.Trimming = TextTrimming.CharacterEllipsis;
        var ty = y + (h - t.Height) / 2;
        g.DrawText(shadow, new Point(x + 7, ty + 1)); g.DrawText(t, new Point(x + 6, ty));
        var bs = Math.Min(19, h - 5); var by = y + (h - bs) / 2;
        for (var k = 0; k < 3; k++) Caption(g, x + w - 4 - (3 - k) * (bs + 2), by, bs, k);
    }

    /// <summary>One caption button: 0 minimise, 1 maximise, 2 close (the red one).</summary>
    private static void Caption(DrawingContext g, double x, double y, double s, int kind)
    {
        g.DrawRoundedRectangle(kind == 2 ? CaptionRed : CaptionBlue, new Pen(White, 1), new Rect(x + 0.5, y + 0.5, s - 1, s - 1), 3, 3);
        var mark = new Pen(White, Math.Max(1.4, s / 11)) { StartLineCap = PenLineCap.Square, EndLineCap = PenLineCap.Square };
        double cx = x + s / 2, cy = y + s / 2, r = s * 0.22;
        switch (kind)
        {
            case 0: g.DrawRectangle(White, null, new Rect(cx - r, cy + r - 1, r * 1.3, Math.Max(2, s / 9))); break;
            case 1: g.DrawRectangle(null, mark, new Rect(cx - r, cy - r, r * 2, r * 2)); g.DrawRectangle(White, null, new Rect(cx - r, cy - r, r * 2, Math.Max(2, s / 9))); break;
            default: g.DrawLine(mark, new Point(cx - r, cy - r), new Point(cx + r, cy + r)); g.DrawLine(mark, new Point(cx + r, cy - r), new Point(cx - r, cy + r)); break;
        }
    }

    /// <summary>A window of the era: a blue frame rounded at the top, its title bar, and a beige body; the caller draws inside the body.</summary>
    private static Rect Window(DrawingContext g, Rect box, string title, double titleH = 24)
    {
        var shape = new GeometryGroup { FillRule = FillRule.Nonzero };   // the two shapes overlap: both must count as inside
        shape.Children.Add(new RectangleGeometry(box, 7, 7));
        shape.Children.Add(new RectangleGeometry(new Rect(box.X, box.Y + box.Height / 2, box.Width, box.Height / 2)));
        shape.Freeze();
        g.PushClip(shape);
        g.DrawRectangle(Frame, null, box);
        Title(g, box.X, box.Y, box.Width, title, titleH);
        var body = new Rect(box.X + 3, box.Y + titleH, Math.Max(0, box.Width - 6), Math.Max(0, box.Height - titleH - 3));
        g.DrawRectangle(Beige, null, body);
        g.Pop();
        return body;
    }

    /// <summary>A push button of the era: the same rounded corners all around, a dark blue outline and a light face.</summary>
    private static void Push(DrawingContext g, Rect r, string label, bool isDefault)
    {
        g.DrawRoundedRectangle(ButtonFace, new Pen(Frozen(Color.FromRgb(0x00, 0x3c, 0x74)), 1), r, 3, 3);
        if (isDefault) g.DrawRoundedRectangle(null, new Pen(Frozen(Color.FromRgb(0x9c, 0xb8, 0xf0)), 1.5), new Rect(r.X + 1.5, r.Y + 1.5, r.Width - 3, r.Height - 3), 2, 2);
        var t = Words(label, Face, 11, Black);
        g.DrawText(t, new Point(r.X + r.Width / 2 - t.Width / 2, r.Y + r.Height / 2 - t.Height / 2));
    }

    private static void Icon(DrawingContext g, string kind, double x, double y)
    {
        var c = new Point(x + 16, y + 16);
        switch (kind)
        {
            case "error":
                g.DrawEllipse(Frozen(Color.FromRgb(0xe0, 0, 0)), null, c, 15, 15);
                var cross = new Pen(White, 3.5);
                g.DrawLine(cross, new Point(x + 10, y + 10), new Point(x + 22, y + 22)); g.DrawLine(cross, new Point(x + 22, y + 10), new Point(x + 10, y + 22));
                break;
            case "warn":
                var tri = new StreamGeometry();
                using (var s = tri.Open()) { s.BeginFigure(new Point(x + 16, y + 2), true, true); s.PolyLineTo([new Point(x + 31, y + 29), new Point(x + 1, y + 29)], true, false); }
                g.DrawGeometry(Frozen(Color.FromRgb(0xff, 0xd8, 0)), new Pen(Black, 1.2), tri);
                var bang = Words("!", Bold, 18, Black); g.DrawText(bang, new Point(x + 16 - bang.Width / 2, y + 8));
                break;
            default:
                g.DrawEllipse(White, new Pen(Frozen(Color.FromRgb(0x1b, 0x3f, 0xbf)), 1.5), c, 14, 14);
                var mark = Words(kind == "ask" ? "?" : "i", new Typeface(new FontFamily("Georgia"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal), 20, Frozen(Color.FromRgb(0x1b, 0x3f, 0xbf)));
                g.DrawText(mark, new Point(x + 16 - mark.Width / 2, y + 16 - mark.Height / 2));
                break;
        }
    }

    private static Sprite Dialog(string title, string text, string[] buttons, string kind, double w = 300, double h = 126, bool bar = false) => Draw(w, h, g =>
    {
        var body = Window(g, new Rect(0, 0, w, h), title);
        Icon(g, kind, body.X + 11, body.Y + 10);
        g.DrawText(Words(text, Face, 11, Black, w - 72), new Point(body.X + 55, body.Y + 12));
        for (var k = 0; k < buttons.Length; k++)
        {
            const double bw = 75;
            var bx = w - 12 - (buttons.Length - k) * (bw + 8) + 8; var by = h - 33;
            Push(g, new Rect(bx, by, bw, 23), buttons[k], k == 0);
        }
    });

    private readonly Sprite[] _dialogs;
    private readonly Sprite _bsod, _cloud, _sphere, _torus, _cube, _column;
    private Sprite? _packDialog;
    private string? _packFor;

    // the corridor: dialog billboards on both sides and four props, looping
    private readonly (int Side, double Off, double Y0, double Z0, int Img, double Size)[] _billboards;
    private readonly (int Img, double Wz, double Wx, double Wd, double Ht, double Y0)[] _props = [(0, 5, -1.55, 1.2, 1.2, 0), (1, 17, 1.6, 1.5, 1.65, 0.7), (2, 29, -1.7, 1.1, 1.1, 0), (3, 41, 1.9, 0.55, 2.9, 0)];
    private const double Loop = 48, Focal = 520, CamH = 1.6;
    private double _walk, _camX;

    private sealed record Popup(double X, double Y, Sprite Img, double T0);
    private readonly List<Popup> _popups = [];
    private readonly HashSet<Click> _opened = [];

    public ExplorerField()
    {
        _dialogs =
        [
            Dialog("Empi Launcher", "¿Seguro que quieres dejar de jugar?", ["Sí", "Sí"], "warn"),
            Dialog("Aviso", "Este modpack se ve mejor con la ventana maximizada.", ["Aceptar"], "info"),
            Dialog("Error", "El mod \"nostalgia.jar\" dejó de responder.", ["Cerrar", "Depurar"], "error"),
            Dialog("Actualización crítica", "Hay una versión nueva de tus recuerdos. ¿Instalar ahora?", ["Más tarde", "Instalar"], "info"),
            Dialog("Buscar", "¿Quieres buscar el cofre que te robaron?", ["Sí", "No"], "ask")
        ];
        _bsod = Draw(360, 210, g =>
        {
            g.DrawRectangle(Frozen(Color.FromRgb(0, 0, 0xaa)), null, new Rect(0, 0, 360, 210));
            g.DrawRectangle(Frozen(Color.FromRgb(0xaa, 0xaa, 0xaa)), null, new Rect(128, 22, 104, 14));
            var mono = new Typeface(new FontFamily("Cascadia Mono, Consolas"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
            var head = Words("EMPI LAUNCHER", mono, 11, Frozen(Color.FromRgb(0, 0, 0xaa)));
            g.DrawText(head, new Point(180 - head.Width / 2, 22));
            string[] lines = ["Se produjo una excepcion fatal 0E en", "0028:C0FFEE en el modpack de siempre.", "", "*  Presiona cualquier tecla para seguir", "   jugando.", "*  Presiona CTRL+ALT+SUPR para volver", "   a 2003.", "", "        Presiona una tecla _"];
            var normal = new Typeface(new FontFamily("Cascadia Mono, Consolas"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
            for (var i = 0; i < lines.Length; i++) g.DrawText(Words(lines[i], normal, 11, White), new Point(24, 50 + i * 16));
        });
        _cloud = Draw(260, 120, g =>
        {
            for (var i = 0; i < 18; i++)
            {
                var x = 40 + Hash(i) * 180; var y = 50 + (Hash(i + 30) - 0.5) * 40 - Math.Sin((x - 40) / 180 * Math.PI) * 18; var r = 22 + Hash(i + 60) * 26;
                var puff = new RadialGradientBrush(Color.FromArgb(217, 255, 255, 255), Color.FromArgb(0, 255, 255, 255));
                g.DrawEllipse(puff, null, new Point(x, y), r, r);
            }
        });
        _sphere = Draw(200, 200, g =>
        {
            var shine = new RadialGradientBrush { GradientOrigin = new Point(0.36, 0.31), Center = new Point(0.5, 0.5), RadiusX = 0.5, RadiusY = 0.5 };
            shine.GradientStops.Add(new GradientStop(Color.FromRgb(0xff, 0xe0, 0xf1), 0)); shine.GradientStops.Add(new GradientStop(Color.FromRgb(0xff, 0x5f, 0xb0), 0.18));
            shine.GradientStops.Add(new GradientStop(Color.FromRgb(0xc3, 0x10, 0x6c), 0.6)); shine.GradientStops.Add(new GradientStop(Color.FromRgb(0x3d, 0, 0x21), 1));
            g.DrawEllipse(shine, null, new Point(100, 100), 98, 98);
        });
        _torus = Draw(220, 240, g =>
        {
            g.PushTransform(new RotateTransform(-12.6, 110, 120));
            var body = new LinearGradientBrush(Color.FromRgb(0xff, 0xc0, 0x8a), Color.FromRgb(0x5a, 0x18, 0), new Point(0, 0), new Point(1, 1));
            body.GradientStops.Insert(1, new GradientStop(Color.FromRgb(0xff, 0x6a, 0x1f), 0.35));
            g.DrawEllipse(null, new Pen(body, 42), new Point(110, 120), 76, 92);
            g.Pop();
        });
        _cube = Draw(180, 180, g =>
        {
            void Face2(Color c, params Point[] p) { var s = new StreamGeometry(); using (var o = s.Open()) { o.BeginFigure(p[0], true, true); o.PolyLineTo(p[1..], false, false); } g.DrawGeometry(Frozen(c), null, s); }
            Face2(Color.FromRgb(0xff, 0xf3, 0x8a), new(20, 50), new(100, 20), new(165, 45), new(85, 78));
            Face2(Color.FromRgb(0xf2, 0xcf, 0), new(20, 50), new(85, 78), new(85, 172), new(20, 140));
            Face2(Color.FromRgb(0xa8, 0x8a, 0), new(85, 78), new(165, 45), new(165, 138), new(85, 172));
        });
        _column = Draw(90, 300, g =>
        {
            var marble = new LinearGradientBrush { StartPoint = new Point(0, 0.5), EndPoint = new Point(1, 0.5) };
            marble.GradientStops.Add(new GradientStop(Color.FromRgb(0x1d, 0x4d, 0x52), 0)); marble.GradientStops.Add(new GradientStop(Color.FromRgb(0x8f, 0xd0, 0xc8), 0.45)); marble.GradientStops.Add(new GradientStop(Color.FromRgb(0x1d, 0x4d, 0x52), 1));
            g.DrawRectangle(marble, null, new Rect(15, 22, 60, 258));
            g.DrawRectangle(Frozen(Color.FromRgb(0x7f, 0xb3, 0xad)), null, new Rect(4, 6, 82, 16));
            g.DrawRectangle(Frozen(Color.FromRgb(0xb8, 0xe0, 0xda)), null, new Rect(0, 0, 90, 8));
            g.DrawRectangle(Frozen(Color.FromRgb(0x4c, 0x8a, 0x85)), null, new Rect(6, 280, 78, 20));
        });
        _billboards = Enumerable.Range(0, 14).Select(i => (i % 2 == 1 ? 1 : -1, 1.9 + Hash(i) * 2.6, 0.35 + Hash(i + 40) * 1.5, i * 3.4 + Hash(i + 70) * 1.5, i % 5, 2.3 + Hash(i + 9) * 0.6)).ToArray();
    }

    protected override void Resized() => InvalidateBase();

    /// <summary>The sky, and the blue screen far away at the end of the corridor.</summary>
    protected override void RenderBase(DrawingContext dc)
    {
        var hor = H * 0.5;
        var sky = new LinearGradientBrush { StartPoint = new Point(0.5, 0), EndPoint = new Point(0.5, 1) };
        sky.GradientStops.Add(new GradientStop(Color.FromRgb(0x0d, 0x36, 0xb8), 0)); sky.GradientStops.Add(new GradientStop(Color.FromRgb(0x3f, 0x7f, 0xe6), 0.55)); sky.GradientStops.Add(new GradientStop(Color.FromRgb(0xb9, 0xd6, 0xff), 1));
        sky.Freeze();
        dc.DrawRectangle(sky, null, new Rect(0, 0, W, hor + 2));
    }

    private Point Project(double x, double y, double z) => new(W * 0.66 + (x - _camX) * Focal / z, H * 0.5 + (CamH - y) * Focal / z);

    protected override void Render(DrawingContext dc, double dt)
    {
        var l = Launcher.Instance;
        var pack = l.Selected;
        _dip = VisualTreeHelper.GetDpi(this).PixelsPerDip;
        _walk += dt * 0.9;
        _camX += ((Pointer.X / Math.Max(1, W) - 0.5) * 1.4 * PointerAmp - _camX) * Math.Min(1, dt * 2.4);
        var hor = H * 0.5;
        var vpx = W * 0.66;

        if (pack != null && pack.Id != _packFor)
        {
            _packFor = pack.Id;
            _packDialog = Dialog(pack.Name, $"{pack.Name}: Minecraft {pack.MinecraftVersion}{(pack.Mods > 0 ? $" con {pack.Mods} mods" : "")}. ¿Abrir el juego ahora?", ["Aceptar", "Cancelar"], "info");
        }

        // a click pops a classic dialog where it was; clicks in a row cascade
        foreach (var c in Clicks)
        {
            if (!_opened.Add(c) || T - c.T0 > 0.2) continue;
            var img = c.Accent || _packDialog == null || Hash(c.T0 * 3) >= 0.4 ? _dialogs[(int)(Hash(c.T0 * 7) * _dialogs.Length)] : _packDialog;
            var x = c.X - 40; var y = c.Y - 20;
            if (_popups.Count > 0 && T - _popups[^1].T0 < 0.7) { x = _popups[^1].X + 16; y = _popups[^1].Y + 16; }
            _popups.Add(new Popup(Math.Clamp(x, 8, W - img.W - 8), Math.Clamp(y, 60, H - img.H - 8), img, T));
            if (_popups.Count > 14) _popups.RemoveAt(0);
        }
        _opened.RemoveWhere(c => !Clicks.Contains(c));

        // arriving: the window zooms open out of the "Explorer" icon
        var icon = IconSpot(2);
        Rect At(double p) => new(icon.X * (1 - p), icon.Y * (1 - p), 32 + (W - 32) * p, 32 + (H - 32) * p);
        var arriving = Reveal < 1;
        if (arriving) { var r = new RectangleGeometry(At(Reveal)); r.Freeze(); ClipBase(r); dc.PushClip(r); }
        else ClipBase(null);

        // clouds
        for (var i = 0; i < 8; i++)
        {
            var sc = 0.6 + Hash(i + 3) * 0.9; var span = W + 400;
            var x = ((Hash(i) * span + T * (6 + Hash(i + 5) * 8)) % span) - 200 - _camX * 40 * sc;
            var y = 30 + Hash(i + 11) * Math.Max(10, hor - 150);
            dc.PushOpacity(0.55 + 0.35 * Hash(i + 17));
            dc.DrawImage(_cloud.Image, new Rect(x, y, _cloud.W * sc * 1.4, _cloud.H * sc * 1.4));
            dc.Pop();
        }
        var bw = 250.0; var bh = bw * _bsod.H / _bsod.W;
        dc.PushOpacity(0.8); dc.DrawImage(_bsod.Image, new Rect(vpx - bw / 2 - _camX * 6, hor - bh - 4, bw, bh)); dc.Pop();

        // the endless checkered floor: the dark tiles over a light ground
        dc.DrawRectangle(Floor, null, new Rect(0, hor, W, H - hor));
        var floor = new StreamGeometry();
        using (var g = floor.Open())
        {
            var fr = _walk % 1; var zBase = (int)Math.Floor(_walk);
            for (var k = 0; k < 34; k++)
            {
                double z0 = Math.Max(0.35, k + 1 - fr), z1 = k + 2 - fr;
                var xmin = (int)Math.Floor(_camX + (0 - vpx) * z1 / Focal) - 1; var xmax = (int)Math.Ceiling(_camX + (W - vpx) * z1 / Focal) + 1;
                for (var c = xmin; c < xmax; c++)
                {
                    if (((c + k + zBase) & 1) == 0) continue;
                    var a = Project(c, 0, z0); var b = Project(c + 1, 0, z0); var cc = Project(c + 1, 0, z1); var d = Project(c, 0, z1);
                    g.BeginFigure(a, true, true); g.PolyLineTo([b, cc, d], false, false);
                }
            }
        }
        floor.Freeze();
        dc.DrawGeometry(Tile, null, floor);
        var fog = new LinearGradientBrush(Color.FromArgb(242, 190, 212, 245), Color.FromArgb(0, 190, 212, 245), 90);
        dc.DrawRectangle(fog, null, new Rect(0, hor, W, 150));

        // the corridor, far to near
        var items = new List<(double Z, int Kind, int Index)>();
        for (var i = 0; i < _billboards.Length; i++) items.Add((((_billboards[i].Z0 - _walk) % Loop + Loop) % Loop + 1.2, 0, i));
        for (var i = 0; i < _props.Length; i++) items.Add((((_props[i].Wz - _walk) % Loop + Loop) % Loop + 1.2, 1, i));
        foreach (var (z, kind, i) in items.OrderByDescending(it => it.Z))
        {
            var fogA = Math.Clamp((44 - z) / 14, 0, 1) * Math.Min(1, (z - 1.2) / 1.2);
            if (fogA <= 0.01) continue;
            if (kind == 0)
            {
                var b = _billboards[i]; var img = _dialogs[b.Img]; var wW = b.Size; var wH = wW * img.H / img.W;
                var p0 = Project(b.Side * b.Off - (b.Side < 0 ? wW : 0), b.Y0, z); var p1 = Project(b.Side * b.Off + (b.Side < 0 ? 0 : wW), b.Y0 + wH, z);
                var box = new Rect(p0.X, p1.Y, Math.Max(1, p1.X - p0.X), Math.Max(1, p0.Y - p1.Y));
                var a = fogA * (1 - 0.6 * QuietAt(box.X + box.Width / 2, box.Y + box.Height / 2, 40));
                dc.PushOpacity(a); dc.DrawImage(img.Image, box); dc.Pop();
            }
            else
            {
                var p = _props[i]; var img = p.Img switch { 0 => _sphere, 1 => _torus, 2 => _cube, _ => _column };
                var foot = Project(p.Wx, 0, z); var sc = Focal / z;
                dc.PushOpacity(fogA * 0.35); dc.DrawEllipse(Black, null, new Point(foot.X + p.Wd * sc * 0.15, foot.Y), p.Wd * sc * 0.6, p.Wd * sc * 0.14); dc.Pop();
                var bob = p.Y0 > 0 ? Math.Sin(T * 1.2 + p.Wz) * 0.08 : 0;
                var top = Project(p.Wx, p.Y0 + p.Ht + bob, z).Y;
                double h = p.Ht * sc, w = p.Wd * sc;
                dc.PushOpacity(fogA);
                if (p.Img == 1)
                {
                    var turn = Math.Cos(T * 0.8) * 0.8 + (Math.Cos(T * 0.8) >= 0 ? 0.2 : -0.2);
                    dc.PushTransform(new ScaleTransform(turn, 1, foot.X, top + h / 2));
                    dc.DrawImage(img.Image, new Rect(foot.X - w / 2, top, w, h));
                    dc.Pop();
                }
                else dc.DrawImage(img.Image, new Rect(foot.X - w / 2, top, w, h));
                dc.Pop();
            }
        }

        DrawChrome(dc, l);
        DrawIcons(dc, pack?.Name);
        DrawCopy(dc, l);

        // popups
        _popups.RemoveAll(p => T - p.T0 > 3.2);
        foreach (var p in _popups)
        {
            var age = T - p.T0; var inn = Math.Min(1, age / 0.12); var outA = Math.Clamp((3.2 - age) / 0.4, 0, 1);
            var sc = 0.92 + 0.08 * (1 - Math.Pow(1 - inn, 3));
            dc.PushOpacity(Math.Min(inn, outA));
            dc.PushTransform(new ScaleTransform(sc, sc, p.X + p.Img.W / 2, p.Y + p.Img.H / 2));
            dc.DrawRectangle(B(Color.FromArgb(90, 0, 0, 0)), null, new Rect(p.X + 4, p.Y + 4, p.Img.W, p.Img.H));
            dc.DrawImage(p.Img.Image, new Rect(p.X, p.Y, p.Img.W, p.Img.H));
            dc.Pop(); dc.Pop();
        }

        // VHS: now and then a tracking band rolls down the picture
        var cycle = T % 6.5;
        if (cycle < 2.2)
        {
            var by = cycle / 2.2 * (H + 60) - 30;
            dc.DrawRectangle(B(Color.FromArgb(20, 255, 255, 255)), null, new Rect(0, by, W, 26));
            for (var k = 0; k < 4; k++)
            {
                var y = Math.Round(by + k * 7); var dx = (Hash(Math.Floor(T * 20) + k) - 0.5) * 22;
                dc.DrawRectangle(B(Color.FromArgb(28, 255, 255, 255)), null, new Rect(Math.Max(0, dx), y, W, 2));
            }
        }

        if (arriving)
        {
            dc.Pop();
            // outline rectangles trailing the opening window
            for (var k = 1; k <= 5; k++)
            {
                var r = At(Math.Max(0, Reveal - k * 0.06));
                dc.DrawRectangle(null, P(Color.FromArgb(204, 0, 0, 0), 1), new Rect(r.X + 0.5, r.Y + 0.5, r.Width, r.Height));
                dc.DrawRectangle(null, new Pen(White, 1) { DashStyle = new DashStyle([2, 2], 0) }, new Rect(r.X + 0.5, r.Y + 0.5, r.Width, r.Height));
            }
        }
    }

    /// <summary>
    /// The glossy title bar along the top, and a window of the era (with the modpack's name as its title) around wherever the interface's
    /// text is. Text that sits right under the title bar (the Ajustes header) gets a plain beige panel instead, like a toolbar.
    /// </summary>
    private Rect? _window;
    private bool _panel;
    private void DrawChrome(DrawingContext dc, Launcher l)
    {
        dc.DrawRectangle(Luna, null, new Rect(0, 0, W, 52));
        dc.DrawRectangle(Frozen(Color.FromRgb(0x00, 0x30, 0x92)), null, new Rect(0, 51, W, 1));
        var text = Quiet.Where(r => r.Width > 4 && r.Height > 4).ToList();
        if (text.Count == 0) { _window = null; return; }
        _panel = text.Min(r => r.Top) - 34 < 58;
        var want = _panel
            ? new Rect(new Point(text.Min(r => r.Left) - 12, text.Min(r => r.Top) - 8), new Point(text.Max(r => r.Right) + 12, text.Max(r => r.Bottom) + 8))
            : new Rect(new Point(text.Min(r => r.Left) - 16, text.Min(r => r.Top) - 34), new Point(text.Max(r => r.Right) + 16, text.Max(r => r.Bottom) + 14));
        // the window follows the text smoothly when it grows or moves (another modpack, the download panel)
        if (_window is not { } w || Math.Abs(w.Left - want.Left) > 400) _window = want;
        else
        {
            const double k = 0.35;
            _window = new Rect(new Point(w.Left + (want.Left - w.Left) * k, w.Top + (want.Top - w.Top) * k), new Point(w.Right + (want.Right - w.Right) * k, w.Bottom + (want.Bottom - w.Bottom) * k));
        }
        var box = _window.Value;
        if (_panel)
        {
            dc.DrawRoundedRectangle(Beige, P(Color.FromRgb(0x7f, 0x9d, 0xb9), 1), box, 4, 4);
            return;
        }
        dc.DrawRoundedRectangle(B(Color.FromArgb(70, 0, 0, 0)), null, new Rect(box.X + 5, box.Y + 6, box.Width, box.Height), 7, 7);
        Window(dc, box, l.Host?.Name ?? "Empi Launcher", 28);
    }


    private Point IconSpot(int index) => new(W - 84, 70 + index * 96);

    /// <summary>Desktop icons down the right edge (drawn simply, no real logo); the last one is the modpack. The one under the pointer is selected the old way.</summary>
    private void DrawIcons(DrawingContext dc, string? packName)
    {
        if (_window is { } win && win.Right > W - 110) return;   // no room beside the window: the icons step aside
        string[] labels = ["Mi PC", "Papelera", "Explorer", packName ?? "Modpack"];
        for (var i = 0; i < labels.Length; i++)
        {
            var at = IconSpot(i);
            if (at.Y + 60 > (Next?.Top ?? H) - 20) break;
            var hot = PointerAmp > 0.3 && Math.Abs(Pointer.X - (at.X + 16)) < 36 && Pointer.Y > at.Y - 4 && Pointer.Y < at.Y + 50;
            if (hot) dc.DrawRectangle(B(Color.FromArgb(140, 0, 0, 0x80)), null, new Rect(at.X, at.Y, 32, 32));
            DrawIconPicture(dc, i, at.X, at.Y);
            var label = Words(labels[i], Face, 11, White, 90); label.MaxLineCount = 2; label.Trimming = TextTrimming.CharacterEllipsis; label.TextAlignment = TextAlignment.Center;
            var lx = at.X + 16 - 45;
            if (hot) dc.DrawRectangle(Navy, null, new Rect(at.X + 16 - Math.Min(90, label.Width) / 2 - 2, at.Y + 36, Math.Min(90, label.Width) + 4, label.Height + 1));
            var shadow = Words(labels[i], Face, 11, B(Color.FromArgb(180, 0, 0, 0)), 90); shadow.MaxLineCount = 2; shadow.Trimming = TextTrimming.CharacterEllipsis; shadow.TextAlignment = TextAlignment.Center;
            dc.DrawText(shadow, new Point(lx + 1, at.Y + 38));
            dc.DrawText(label, new Point(lx, at.Y + 37));
        }
    }

    private void DrawIconPicture(DrawingContext g, int i, double x, double y)
    {
        switch (i)
        {
            case 0:   // a computer
                Bevel(g, x + 3, y + 2, 26, 20);
                g.DrawRectangle(Frozen(Color.FromRgb(0x1b, 0x3f, 0xbf)), null, new Rect(x + 6, y + 5, 20, 14));
                g.DrawRectangle(Grey, null, new Rect(x + 10, y + 22, 12, 3));
                Bevel(g, x + 5, y + 25, 22, 6);
                break;
            case 1:   // a bin
                var bin = new StreamGeometry();
                using (var s = bin.Open()) { s.BeginFigure(new Point(x + 7, y + 8), true, true); s.PolyLineTo([new Point(x + 25, y + 8), new Point(x + 23, y + 30), new Point(x + 9, y + 30)], true, false); }
                g.DrawGeometry(B(Color.FromRgb(0xd8, 0xd8, 0xd8)), P(Color.FromRgb(0x55, 0x55, 0x55), 1), bin);
                g.DrawRectangle(B(Color.FromRgb(0x9a, 0x9a, 0x9a)), null, new Rect(x + 5, y + 5, 22, 4));
                break;
            case 2:   // a folder
                g.DrawRectangle(B(Color.FromRgb(0xe8, 0xc3, 0x3a)), P(Color.FromRgb(0x8a, 0x6a, 0), 1), new Rect(x + 3.5, y + 9.5, 25, 18));
                g.DrawRectangle(B(Color.FromRgb(0xf7, 0xdc, 0x6a)), null, new Rect(x + 3, y + 6, 11, 5));
                g.DrawRectangle(White, null, new Rect(x + 7, y + 12, 18, 3));
                break;
            default:  // the modpack: a little chest
                g.DrawRectangle(B(Color.FromRgb(0x6b, 0x4a, 0x2b)), null, new Rect(x + 4, y + 11, 24, 17));
                g.DrawRectangle(B(Color.FromRgb(0x8a, 0x64, 0x40)), null, new Rect(x + 4, y + 11, 24, 5));
                g.DrawRectangle(B(Accent), null, new Rect(x + 14, y + 15, 4, 3));
                break;
        }
    }

    /// <summary>While something downloads, the old "Copiando..." window with the real progress, what it is doing and how much is left.</summary>
    private void DrawCopy(DrawingContext dc, Launcher l)
    {
        var game = l.Game;
        if (!game.Busy) return;
        const double w = 320, h = 138;
        var x = W - w - 40; var y = Math.Max(80, (Next?.Top ?? H) - h - 40);
        if (_window is { } win && x < win.Right + 10) { x = Math.Min(W - w - 12, win.Right + 12); if (x + w > W - 8) { x = win.Left + 20; y = Math.Max(win.Bottom + 12, 70); } }
        dc.DrawRoundedRectangle(B(Color.FromArgb(70, 0, 0, 0)), null, new Rect(x + 4, y + 5, w, h), 7, 7);
        Window(dc, new Rect(x, y, w, h), game.Mode == "java" ? "Instalando Java..." : "Copiando...");
        // two sheets of paper flying from one folder to the other
        var fly = T * 0.8 % 1;
        DrawIconPicture(dc, 2, x + 14, y + 30); DrawIconPicture(dc, 2, x + w - 48, y + 30);
        var px = x + 44 + (w - 110) * fly; var py = y + 38 - Math.Sin(fly * Math.PI) * 10;
        dc.DrawRectangle(White, P(Colors.Black, 0.6), new Rect(px, py, 10, 13));
        var line = Words(game.Text.Length > 0 ? game.Text : "Preparando...", Face, 11, Black, w - 28); line.MaxLineCount = 1; line.Trimming = TextTrimming.CharacterEllipsis;
        dc.DrawText(line, new Point(x + 14, y + 66));
        dc.DrawRoundedRectangle(White, P(Color.FromRgb(0x7f, 0x9d, 0xb9), 1), new Rect(x + 14.5, y + 84.5, w - 29, 15), 3, 3);
        var blocks = (int)Math.Floor(Math.Clamp(game.Percent / 100.0, 0, 1) * ((w - 34) / 9));
        for (var k = 0; k < blocks; k++) dc.DrawRectangle(Green, null, new Rect(x + 17 + k * 9, y + 87, 7, 10));
        var left = game.Total is > 0 && game.Received is { } got ? $"Quedan {Math.Max(0, (game.Total.Value - got) / 1048576):0} MB" + (game.BytesPerSecond is > 0 ? $"  ({game.BytesPerSecond.Value / 1048576:0.0} MB/s)" : "") : $"{game.Percent} % completado";
        dc.DrawText(Words(left, Face, 11, Black, w - 28), new Point(x + 14, y + 108));
    }
}
