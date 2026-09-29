using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// REMEMBER: an old crayon drawing, the kind a little niece gives you. A washed sky in hatched strokes, a pink cloud ribbon, a scribbled
/// sun, two hills with a yellow rim of light and little flowers, on paper that has faded at the corners and been folded once.
///
/// What is in it is real: a little house on the hill builds itself part by part as the modpack really downloads (walls, roofs, windows, the
/// door, the chimney and its smoke, each landing with a small drop), a stick figure beside it carries the player's name, and a child's
/// handwriting says which modpack it is, its mods and its version (or "construyendo... 45%"). The modpack's own text sits on a sheet of
/// paper taped over the drawing. Its lines boil like a hand-drawn animation, birds cross the sky, and a click leaves a crayon doodle that
/// fades like an old memory. It arrives coloured in with big crayon zigzags, left to right.
///
/// The painting is made once per window size (strokes grouped by colour and width, so it is a few dozen drawing calls, not twenty thousand)
/// and kept as a picture; only the house, the figure, the words, the birds and the doodles move, about six frames a second like a flipbook.
/// </summary>
internal sealed class RememberField : StyleField
{
    public override double ArriveSeconds => 2.2;
    protected override double AmbientMs => 166;
    protected override double InteractiveMs => 50;

    private const string Hand = "Ink Free, Segoe Print, Comic Sans MS";
    private static readonly Color InkC = Color.FromRgb(0x2b, 0x26, 0x20);
    private static readonly Color Paper = Color.FromRgb(0xf4, 0xec, 0xda);

    private static double Hash(double n) { var x = Math.Sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.Floor(x); }

    private BitmapSource? _painting;
    private readonly DispatcherTimer _repaint = new() { Interval = TimeSpan.FromMilliseconds(300) };

    public RememberField()
    {
        _repaint.Tick += (_, _) => { _repaint.Stop(); Paint(); InvalidateBase(); };
    }

    private double Hill(double x) => H * 0.62 - 90 * Math.Sin(x / W * Math.PI * 0.9 + 0.25) + 18 * Math.Sin(x / 90);

    // a resize repaints once the size has settled; until then the old picture is stretched
    protected override void Resized() { if (_painting == null) { Paint(); InvalidateBase(); } else { _repaint.Stop(); _repaint.Start(); } }

    protected override void RenderBase(DrawingContext dc)
    {
        if (_painting == null) Paint();
        if (_painting != null) dc.DrawImage(_painting, new Rect(-6, -6, W + 12, H + 12));
    }

    // ---- the painting ------------------------------------------------------------------------------------------------------

    /// <summary>Crayon strokes collected by colour, strength and width, then drawn as one shape each.</summary>
    private sealed class Strokes
    {
        private readonly Dictionary<(Color, int, int), StreamGeometryContext> _open = [];
        private readonly Dictionary<(Color, int, int), StreamGeometry> _shapes = [];
        public void Add(Color c, double alpha, double width, Point a, Point b)
        {
            var key = (c, Math.Clamp((int)(alpha * 5), 0, 4), Math.Clamp((int)((width - 0.8) / 0.6), 0, 2));
            if (!_open.TryGetValue(key, out var g)) { var s = new StreamGeometry(); g = s.Open(); _open[key] = g; _shapes[key] = s; }
            g.BeginFigure(a, false, false); g.LineTo(b, true, false);
        }
        public void Arc(Color c, double alpha, double width, Point center, double r, double from, double sweep)
        {
            var key = (c, Math.Clamp((int)(alpha * 5), 0, 4), Math.Clamp((int)((width - 0.8) / 0.6), 0, 2));
            if (!_open.TryGetValue(key, out var g)) { var s = new StreamGeometry(); g = s.Open(); _open[key] = g; _shapes[key] = s; }
            var p0 = new Point(center.X + Math.Cos(from) * r, center.Y + Math.Sin(from) * r);
            var p1 = new Point(center.X + Math.Cos(from + sweep) * r, center.Y + Math.Sin(from + sweep) * r);
            g.BeginFigure(p0, false, false); g.ArcTo(p1, new Size(r, r), 0, sweep > Math.PI, SweepDirection.Clockwise, true, false);
        }
        public void Draw(DrawingContext dc)
        {
            foreach (var g in _open.Values) g.Close();
            foreach (var ((c, a, w), shape) in _shapes)
            {
                shape.Freeze();
                var pen = new Pen(Frozen(Color.FromArgb((byte)(255 * (0.18 + a * 0.18)), c.R, c.G, c.B)), 0.9 + w * 0.7) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                pen.Freeze();
                dc.DrawGeometry(null, pen, shape);
            }
            _open.Clear(); _shapes.Clear();
        }
    }

    private void Paint()
    {
        if (W < 50 || H < 50) return;
        var rnd = new Random(11);
        double R() => rnd.NextDouble();
        var visual = new DrawingVisual();
        using (var g = visual.RenderOpen())
        {
            g.DrawRectangle(Frozen(Color.FromRgb(0xef, 0xe4, 0xcd)), null, new Rect(0, 0, W, H));
            // a first wash of colour under the crayon, like watercolour on the paper
            var wash = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
            wash.GradientStops.Add(new GradientStop(Color.FromArgb(217, 46, 78, 170), 0)); wash.GradientStops.Add(new GradientStop(Color.FromArgb(191, 110, 140, 215), 0.55)); wash.GradientStops.Add(new GradientStop(Color.FromArgb(179, 235, 160, 190), 1));
            g.DrawRectangle(wash, null, new Rect(0, 0, W, H * 0.7));

            var strokes = new Strokes();
            void Hatch(double x0, double y0, double x1, double y1, Color c, double density, double ang, double len, double alpha, Func<double, double, bool>? inside = null)
            {
                var n = (int)((x1 - x0) * (y1 - y0) / 1000 * density);
                for (var i = 0; i < n; i++)
                {
                    var x = x0 + R() * (x1 - x0); var y = y0 + R() * (y1 - y0);
                    if (inside != null && !inside(x, y)) continue;
                    var a = ang + (R() - 0.5) * 0.35; var l = len * (0.6 + R() * 0.8);
                    strokes.Add(c, alpha * (0.5 + R() * 0.5), 0.8 + R() * 1.6, new Point(x, y), new Point(x + Math.Cos(a) * l, y + Math.Sin(a) * l));
                }
            }
            // the sky: blue fading to pink near the hill, all in strokes
            for (var band = 0; band < 14; band++)
            {
                var y0 = band * H * 0.05; var k = band / 13.0;
                Hatch(0, y0, W, y0 + H * 0.07, Color.FromRgb((byte)(58 + k * 170), (byte)(88 + k * 70), (byte)(176 - k * 20)), 7, -1.05, 24, 0.7);
            }
            // a wavy pink cloud ribbon with a yellow edge
            double Ribbon(double x) => H * 0.16 + 38 * Math.Sin(x / 210 + 0.6) + 16 * Math.Sin(x / 70);
            Hatch(0, H * 0.02, W, H * 0.34, Color.FromRgb(0xf2, 0xa2, 0xbf), 4.2, -0.15, 30, 0.6, (x, y) => y > Ribbon(x) - 34 && y < Ribbon(x) + 22);
            strokes.Draw(g);
            g.DrawGeometry(null, new Pen(Frozen(Color.FromArgb(204, 0xf6, 0xd3, 0x6a)), 2.2), Line(x => Ribbon(x) + 22, 8));
            // the sun, scribbled in circles, and its rays
            var sx = W * 0.72; var sy = H * 0.11;   // high and away from the house, so the handwriting beside it reads
            for (var i = 0; i < 220; i++) strokes.Arc(Color.FromRgb(0xf0, 0x7a, 0x3a), 0.4, 1.5, new Point(sx + (R() - 0.5) * 6, sy + (R() - 0.5) * 6), 2 + R() * 44, R() * Math.Tau, 1.2 + R() * 1.5);
            strokes.Draw(g);
            var ray = new Pen(Frozen(Color.FromArgb(179, 0xf5, 0xb6, 0x40)), 2.4) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            for (var i = 0; i < 12; i++) { var a = i / 12.0 * Math.Tau; g.DrawLine(ray, new Point(sx + Math.Cos(a) * 58, sy + Math.Sin(a) * 58), new Point(sx + Math.Cos(a) * 80, sy + Math.Sin(a) * 80)); }
            // the far hill and the near one, a yellow rim where the light touches it
            double Far(double x) => Hill(x) - 60 + 30 * Math.Sin(x / 160);
            g.DrawGeometry(Frozen(Color.FromArgb(217, 52, 140, 110)), null, Ground(Far));
            g.DrawGeometry(Frozen(Color.FromArgb(235, 24, 82, 52)), null, Ground(Hill));
            Hatch(0, H * 0.3, W, H, Color.FromRgb(0x3f, 0x9a, 0x7a), 5, -0.9, 18, 0.55, (x, y) => y > Far(x));
            Hatch(0, H * 0.35, W, H, Color.FromRgb(0x1e, 0x5a, 0x3c), 7, -0.7, 20, 0.65, (x, y) => y > Hill(x));
            Hatch(0, H * 0.35, W, H, Color.FromRgb(0x2f, 0x7a, 0x42), 3.5, 0.9, 16, 0.4, (x, y) => y > Hill(x) + 8);
            strokes.Draw(g);
            g.DrawGeometry(null, new Pen(Frozen(Color.FromArgb(217, 0xf2, 0xc9, 0x4c)), 4) { LineJoin = PenLineJoin.Round }, Line(x => Hill(x) + 2, 6));
            // little flowers
            Color[] petals = [Color.FromRgb(0xf5, 0x8a, 0xb2), Color.FromRgb(0xff, 0xf1, 0xa8), Color.FromRgb(0xf3, 0x6b, 0x4f)];
            for (var i = 0; i < 26; i++)
            {
                var x = Hash(i) * W; var y = Hill(x) + 30 + Hash(i + 9) * 180;
                var petal = Frozen(petals[i % 3]);
                for (var k = 0; k < 5; k++) { var a = k / 5.0 * Math.Tau; g.DrawEllipse(petal, null, new Point(x + Math.Cos(a) * 4, y + Math.Sin(a) * 4), 3, 3); }
            }
            // paper age: dust, a fold, faded corners
            for (var i = 0; i < 700; i++) g.DrawRectangle(Frozen(Color.FromArgb((byte)(25 + R() * 64), 255, 248, 230)), null, new Rect(R() * W, R() * H, 1 + R() * 2, 1));
            g.DrawLine(new Pen(Frozen(Color.FromArgb(89, 255, 245, 225)), 1.5), new Point(W * 0.5, 0), new Point(W * 0.52, H));
            var age = new RadialGradientBrush { Center = new Point(0.5, 0.5), GradientOrigin = new Point(0.5, 0.5), RadiusX = 0.75, RadiusY = 0.75 };
            age.GradientStops.Add(new GradientStop(Color.FromArgb(0, 240, 225, 190), 0.4)); age.GradientStops.Add(new GradientStop(Color.FromArgb(89, 120, 90, 50), 1));
            g.DrawRectangle(age, null, new Rect(0, 0, W, H));
            g.DrawRectangle(Frozen(Color.FromArgb(31, 255, 236, 200)), null, new Rect(0, 0, W, H));
        }
        var dpi = VisualTreeHelper.GetDpi(this);
        var bitmap = new RenderTargetBitmap((int)Math.Ceiling(W * dpi.DpiScaleX), (int)Math.Ceiling(H * dpi.DpiScaleY), dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        _painting = bitmap;
    }

    private Geometry Line(Func<double, double> y, double step)
    {
        var s = new StreamGeometry();
        using (var g = s.Open()) { g.BeginFigure(new Point(0, y(0)), false, false); for (var x = step; x <= W + step; x += step) g.LineTo(new Point(x, y(x)), true, true); }
        s.Freeze(); return s;
    }

    private Geometry Ground(Func<double, double> y)
    {
        var s = new StreamGeometry();
        using (var g = s.Open()) { g.BeginFigure(new Point(0, H), true, true); for (var x = 0.0; x <= W + 8; x += 8) g.LineTo(new Point(x, y(x)), false, false); g.LineTo(new Point(W, H), false, false); }
        s.Freeze(); return s;
    }

    // ---- what moves --------------------------------------------------------------------------------------------------------

    private sealed record Part(double At, string Kind, double X, double Y, double Wd, double Ht, Color C);
    private static readonly Part[] Parts =
    [
        new(0.0, "wall", -58, -120, 84, 120, Color.FromRgb(0xc9, 0x57, 0x3a)), new(0.25, "wall", 22, -150, 70, 150, Color.FromRgb(0xb5, 0x4a, 0x33)),
        new(0.45, "roof", -66, -120, 100, 46, Color.FromRgb(0x7a, 0x2e, 0x24)), new(0.55, "roof", 16, -150, 82, 40, Color.FromRgb(0x8c, 0x33, 0x26)),
        new(0.65, "win", -42, -96, 18, 20, default), new(0.7, "win", -8, -96, 18, 20, default), new(0.72, "win", 38, -126, 16, 20, default),
        new(0.75, "win", 62, -126, 16, 20, default), new(0.78, "win", 38, -86, 16, 20, default), new(0.8, "win", 62, -86, 16, 20, default),
        new(0.85, "door", -24, -44, 22, 44, default), new(0.92, "chim", 64, -188, 12, 30, Color.FromRgb(0x6a, 0x3a, 0x2a))
    ];
    private static readonly Pen PlanPen = DashedPen();
    private static Pen DashedPen() { var p = new Pen(new SolidColorBrush(Color.FromArgb(120, 0x3a, 0x24, 0x18)), 1.4) { DashStyle = new DashStyle([4, 3], 0) }; p.Freeze(); return p; }
    private readonly Dictionary<int, double> _shownAt = [];
    private bool _wasBusy;

    private sealed record Doodle(double X, double Y, double T0, int Kind, Color C);
    private readonly List<Doodle> _doodles = [];
    private readonly HashSet<Click> _drawn = [];

    private double Wob(double n, double k) => (Hash(n + k * 7.3) - 0.5) * 2;

    protected override void Render(DrawingContext dc, double dt)
    {
        var l = Launcher.Instance;
        var game = l.Game;
        var busy = game.Busy;
        // downloading: built as far as the download has got; otherwise whole if the modpack is installed, only the pencil plan if not
        var built = busy ? Math.Clamp(game.Percent / 100.0, 0, 1) : l.Pack is { Installed: false } ? -1 : 1;
        if (busy && !_wasBusy) _shownAt.Clear();   // a download starts: the house starts again from its first wall
        _wasBusy = busy;
        var frame = Math.Floor(T * 6);

        // the painting leans a little away from the pointer, like paper held in the hand
        MoveBase(-(Pointer.X / Math.Max(1, W) - 0.5) * PointerAmp * 6, -(Pointer.Y / Math.Max(1, H) - 0.5) * PointerAmp * 4);

        // arriving: coloured in with big crayon zigzags, left to right
        var arriving = Reveal < 1;
        if (arriving)
        {
            const int total = 22; var upto = Reveal * total;
            var zig = new StreamGeometry();
            using (var g = zig.Open())
            {
                for (var k = 0; k <= Math.Floor(upto); k++)
                {
                    var x = -60 + k * (W + 120) / total; var frac = k == (int)Math.Floor(upto) ? upto - k : 1;
                    double y0 = k % 2 == 1 ? H + 60 : -60, y1 = k % 2 == 1 ? -60 : H + 60;
                    var nx = x + (W + 120) / total * 0.9;
                    if (k == 0) g.BeginFigure(new Point(x, y0), false, false);
                    g.LineTo(new Point(x + (nx - x) * frac, y0 + (y1 - y0) * frac), true, true);
                }
            }
            var clip = zig.GetWidenedPathGeometry(new Pen(Brushes.Black, 120) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round, LineJoin = PenLineJoin.Round });
            clip.Freeze();
            ClipBase(clip);
            dc.PushClip(clip);
        }
        else ClipBase(null);

        // a click leaves a crayon doodle that fades like an old memory
        Color[] doodleInk = [Color.FromRgb(0xe2, 0x57, 0x4c), Color.FromRgb(0x3d, 0x6f, 0xd1), Color.FromRgb(0xf2, 0xb5, 0x3a), Color.FromRgb(0x44, 0xa3, 0x6b)];
        foreach (var c in Clicks)
        {
            if (!_drawn.Add(c) || T - c.T0 > 0.2) continue;
            _doodles.Add(new Doodle(c.X, c.Y, T, (int)(Hash(c.T0) * 3), doodleInk[(int)(Hash(c.T0 + 1) * 4)]));
            if (_doodles.Count > 10) _doodles.RemoveAt(0);
        }
        _drawn.RemoveWhere(c => !Clicks.Contains(c));

        DrawNote(dc);

        // birds drifting across
        var bird = P(Color.FromRgb(0x2d, 0x2a, 0x3a), 1.8);
        for (var i = 0; i < 4; i++)
        {
            var x = (T * (14 + i * 5) + Hash(i) * W) % (W + 100) - 50; var y = H * (0.1 + Hash(i + 3) * 0.18) + Math.Sin(T + i) * 6; var f = Math.Sin(T * 5 + i) * 4;
            var s = new StreamGeometry();
            using (var g = s.Open()) { g.BeginFigure(new Point(x - 8, y - f), false, false); g.QuadraticBezierTo(new Point(x - 4, y - 5), new Point(x, y), true, true); g.QuadraticBezierTo(new Point(x + 4, y - 5), new Point(x + 8, y - f), true, true); }
            dc.DrawGeometry(null, bird, s);
        }

        // the house, the figure and the words stand in the room the interface leaves, on the hill
        var textRight = Quiet.Where(r => r.Left > W * 0.18).Select(r => r.Right).DefaultIfEmpty(0).Max();
        var hx = Math.Clamp(Math.Max(W * 0.8, textRight + 170), 180, W - 150);
        DrawHouse(dc, hx, built, frame);
        DrawFigure(dc, hx, frame, l.Account?.DisplayName ?? "tú", textRight);
        DrawCaption(dc, hx, l, busy, game.Percent);

        for (var i = _doodles.Count - 1; i >= 0; i--)
        {
            var d = _doodles[i]; var age = T - d.T0;
            if (age > 3) { _doodles.RemoveAt(i); continue; }
            var draw = Math.Min(1, age / 0.5); var fade = Math.Min(1, (3 - age) / 1);
            var s = new StreamGeometry();
            using (var g = s.Open())
            {
                const int n = 60;
                for (var k = 0; k <= n * draw; k++)
                {
                    var u = k / (double)n; double x, y;
                    if (d.Kind == 0) { var a = u * Math.Tau * 3; var r = 4 + u * 26; x = d.X + Math.Cos(a) * r; y = d.Y + Math.Sin(a) * r; }
                    else if (d.Kind == 1) { var a = u * Math.Tau; var r = 22 * (k % 2 == 1 ? 0.45 : 1) + 2 * Math.Sin(u * 30); x = d.X + Math.Cos(a - Math.PI / 2) * r; y = d.Y + Math.Sin(a - Math.PI / 2) * r; }
                    else { var a = u * Math.Tau; x = d.X + 16 * Math.Pow(Math.Sin(a), 3); y = d.Y - (13 * Math.Cos(a) - 5 * Math.Cos(2 * a) - 2 * Math.Cos(3 * a) - Math.Cos(4 * a)) * 1.2; }
                    if (k == 0) g.BeginFigure(new Point(x, y), false, false); else g.LineTo(new Point(x, y), true, true);
                }
            }
            dc.DrawGeometry(null, new Pen(B(Alpha(d.C, fade * 0.9)), 3) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round, LineJoin = PenLineJoin.Round }, s);
        }

        if (arriving) dc.Pop();
    }

    /// <summary>A sheet of paper taped over the drawing, under the modpack's text, so it reads on the colours.</summary>
    private Rect? _note;
    private void DrawNote(DrawingContext dc)
    {
        var text = Quiet.Where(r => r.Width > 4 && r.Height > 4).ToList();
        if (text.Count == 0) { _note = null; return; }
        var want = new Rect(new Point(text.Min(r => r.Left) - 22, text.Min(r => r.Top) - 18), new Point(text.Max(r => r.Right) + 22, text.Max(r => r.Bottom) + 18));
        if (_note is not { } n || Math.Abs(n.Left - want.Left) > 400) _note = want;
        else { const double k = 0.35; _note = new Rect(new Point(n.Left + (want.Left - n.Left) * k, n.Top + (want.Top - n.Top) * k), new Point(n.Right + (want.Right - n.Right) * k, n.Bottom + (want.Bottom - n.Bottom) * k)); }
        var box = _note.Value;
        dc.PushTransform(new RotateTransform(-1.1, box.X + box.Width / 2, box.Y + box.Height / 2));
        dc.DrawRectangle(B(Color.FromArgb(56, 60, 40, 15)), null, new Rect(box.X + 4, box.Y + 7, box.Width, box.Height));
        // the edges are a little uneven, like paper cut by hand
        var sheet = new StreamGeometry();
        using (var g = sheet.Open())
        {
            g.BeginFigure(new Point(box.X, box.Y + 2), true, true);
            for (var x = box.X + 24; x < box.Right; x += 24) g.LineTo(new Point(x, box.Y + (Hash(x) - 0.5) * 3), false, false);
            g.LineTo(new Point(box.Right, box.Y), false, false);
            for (var y = box.Y + 24; y < box.Bottom; y += 24) g.LineTo(new Point(box.Right + (Hash(y) - 0.5) * 3, y), false, false);
            g.LineTo(new Point(box.Right - 2, box.Bottom), false, false);
            for (var x = box.Right - 24; x > box.X; x -= 24) g.LineTo(new Point(x, box.Bottom + (Hash(x + 7) - 0.5) * 3), false, false);
            g.LineTo(new Point(box.X, box.Bottom - 1), false, false);
        }
        sheet.Freeze();
        dc.DrawGeometry(B(Paper), null, sheet);
        // a strip of tape across the top
        dc.PushTransform(new RotateTransform(-4, box.X + box.Width * 0.45, box.Y));
        dc.DrawRectangle(B(Color.FromArgb(191, 235, 225, 190)), null, new Rect(box.X + box.Width * 0.45 - 45, box.Y - 11, 90, 24));
        dc.Pop();
        dc.Pop();
    }

    private void DrawHouse(DrawingContext dc, double hx, double built, double frame)
    {
        var baseY = Hill(hx) + 6;
        var ink = P(Color.FromRgb(0x3a, 0x24, 0x18), 2.2);
        var courses = P(Color.FromArgb(64, 60, 20, 10), 1);
        dc.PushTransform(new TranslateTransform(hx, baseY));
        // the plan: the walls and roofs still to come, sketched lightly in pencil
        var plan = PlanPen;
        foreach (var pt in Parts)
        {
            if (built >= pt.At || pt.Kind is not ("wall" or "roof")) continue;
            if (pt.Kind == "wall") dc.DrawRectangle(null, plan, new Rect(pt.X, pt.Y, pt.Wd, pt.Ht));
            else { dc.DrawLine(plan, new Point(pt.X, pt.Y), new Point(pt.X + pt.Wd / 2, pt.Y - pt.Ht)); dc.DrawLine(plan, new Point(pt.X + pt.Wd / 2, pt.Y - pt.Ht), new Point(pt.X + pt.Wd, pt.Y)); }
        }
        for (var i = 0; i < Parts.Length; i++)
        {
            var pt = Parts[i];
            if (built < pt.At) { _shownAt.Remove(i); continue; }
            if (!_shownAt.TryGetValue(i, out var at)) _shownAt[i] = at = T;
            var drop = Math.Max(0, 1 - (T - at) / 0.35);
            double J(double k) => Wob(frame * 13 + i, k) * 1.4;   // the line boils like a hand-drawn animation
            dc.PushTransform(new TranslateTransform(0, -drop * 40));
            dc.PushOpacity(1 - drop * 0.6);
            var s = new StreamGeometry();
            switch (pt.Kind)
            {
                case "wall" or "chim":
                    using (var g = s.Open()) { g.BeginFigure(new Point(pt.X + J(1), pt.Y + J(2)), true, true); g.PolyLineTo([new Point(pt.X + pt.Wd + J(3), pt.Y + J(4)), new Point(pt.X + pt.Wd + J(5), pt.Y + pt.Ht), new Point(pt.X + J(6), pt.Y + pt.Ht)], true, true); }
                    dc.DrawGeometry(B(pt.C), ink, s);
                    for (var k = 0; k < 10; k++) { var yy = pt.Y + 8 + k * 11; if (yy > pt.Y + pt.Ht - 4) break; dc.DrawLine(courses, new Point(pt.X + 4, yy + J(k)), new Point(pt.X + pt.Wd - 4, yy + J(k + 1))); }
                    break;
                case "roof":
                    using (var g = s.Open()) { g.BeginFigure(new Point(pt.X + J(1), pt.Y + J(2)), true, true); g.PolyLineTo([new Point(pt.X + pt.Wd / 2 + J(3), pt.Y - pt.Ht + J(4)), new Point(pt.X + pt.Wd + J(5), pt.Y + J(6))], true, true); }
                    dc.DrawGeometry(B(pt.C), ink, s);
                    break;
                case "win":
                    var lit = 0.55 + 0.45 * Math.Sin(T * 0.7 + i);
                    dc.DrawRoundedRectangle(B(Color.FromArgb(242, 255, (byte)(200 + 30 * lit), (byte)(120 + 40 * lit))), ink, new Rect(pt.X + J(1), pt.Y + J(2), pt.Wd, pt.Ht), 5, 5);
                    dc.DrawLine(ink, new Point(pt.X + pt.Wd / 2, pt.Y + 2), new Point(pt.X + pt.Wd / 2, pt.Y + pt.Ht));
                    break;
                default:   // the door
                    dc.DrawRoundedRectangle(B(Color.FromRgb(0x5a, 0x33, 0x22)), ink, new Rect(pt.X + J(1), pt.Y, pt.Wd, pt.Ht), 8, 8);
                    dc.DrawEllipse(B(Color.FromRgb(0xf2, 0xc9, 0x4c)), null, new Point(pt.X + pt.Wd - 6, pt.Y + pt.Ht / 2), 2, 2);
                    break;
            }
            dc.Pop(); dc.Pop();
        }
        if (built >= 0.92)
            for (var k = 0; k < 5; k++)
            {
                var a = (T * 0.25 + k / 5.0) % 1;
                dc.DrawEllipse(B(Alpha(Color.FromRgb(240, 236, 228), 0.5 * (1 - a))), null, new Point(70 + Math.Sin(a * 6 + k) * 10 + a * 30, -196 - a * 110), 8 + a * 16, 8 + a * 16);
            }
        dc.Pop();
    }

    /// <summary>A stick figure next to the house: the player, with their name written by a child. It moves to the other side if the text is there.</summary>
    private void DrawFigure(DrawingContext dc, double hx, double frame, string name, double textRight)
    {
        var fx = hx - 110 > textRight + 30 ? hx - 110 : hx + 120;
        var fy = Hill(fx) + 4;
        double J(double k) => Wob(frame * 5, k) * 1.2;
        var ink = P(InkC, 2.4);
        dc.DrawEllipse(null, ink, new Point(fx + J(1), fy - 58), 9, 9);
        var body = new StreamGeometry();
        using (var g = body.Open())
        {
            g.BeginFigure(new Point(fx, fy - 49), false, false); g.LineTo(new Point(fx + J(2), fy - 20), true, true);
            g.BeginFigure(new Point(fx - 14 + J(3), fy - 38), false, false); g.LineTo(new Point(fx + 14 + J(4), fy - 42 + Math.Sin(T * 3) * 3), true, true);
            g.BeginFigure(new Point(fx, fy - 20), false, false); g.LineTo(new Point(fx - 9 + J(5), fy), true, true);
            g.BeginFigure(new Point(fx, fy - 20), false, false); g.LineTo(new Point(fx + 9 + J(6), fy), true, true);
        }
        dc.DrawGeometry(null, ink, body);
        var label = Text(name, Hand, 22, InkC, FontWeights.Bold);
        dc.DrawText(label, new Point(fx - 6 - label.Width / 2, fy - 104));
    }

    /// <summary>Handwriting beside the house: the modpack, its mods and version, or how far the building (the download) has got.</summary>
    private void DrawCaption(DrawingContext dc, double hx, Launcher l, bool busy, int percent)
    {
        var pack = l.Selected;
        if (pack == null) return;
        var first = Text(busy ? $"construyendo... {percent}%" : pack.Name, Hand, 24, InkC, FontWeights.Bold);
        var second = Text(pack.Mods > 0 ? $"{pack.Mods} mods, versión {pack.Version}" : $"versión {pack.Version}", Hand, 18, Color.FromRgb(0x5a, 0x4a, 0x3a));
        var x = Math.Min(hx + 50, W - 24 - Math.Max(first.Width, second.Width));
        var y = Hill(hx) - 250;
        dc.PushTransform(new RotateTransform(-4.5, x, y));
        dc.DrawText(first, new Point(x, y));
        dc.DrawText(second, new Point(x, y + 30));
        // an arrow down to the house
        var arrow = P(InkC, 2);
        var s = new StreamGeometry();
        using (var g = s.Open())
        {
            g.BeginFigure(new Point(x + 10, y + 58), false, false); g.QuadraticBezierTo(new Point(x - 10, y + 80), new Point(x - 8, y + 118), true, true);
            g.BeginFigure(new Point(x - 8, y + 118), false, false); g.LineTo(new Point(x - 15, y + 106), true, true);
            g.BeginFigure(new Point(x - 8, y + 118), false, false); g.LineTo(new Point(x + 2, y + 108), true, true);
        }
        dc.DrawGeometry(null, arrow, s);
        dc.Pop();
    }
}
