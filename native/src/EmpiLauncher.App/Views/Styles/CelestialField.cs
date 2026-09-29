using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// CELESTIAL: holographic. Big soft beams of iridescent light drift across a violet-black sky, glitter flashes one point at a time, foil stars
/// float and change colour as they turn, and a click throws a small firework of stars and sparks. It arrives as a shower of shooting stars
/// from the top-right corner that leaves the new sky behind it.
///
/// What it shows is real: a constellation drawn next to the interface is the selected modpack, named, with its mods and its Minecraft (or
/// how the download is going, or that the game is running), and while a modpack downloads its stars light up one by one with the progress
/// and the glitter is lit in the same proportion.
///
/// Cost: the light beams are computed on a small bitmap (1/8 of the window) that the GPU stretches; the rest is a few hundred dots drawn
/// from brushes made once, over a base (beams and resting glitter) kept as a texture. 8 frames a second at rest, 30 while the player
/// moves or clicks.
/// </summary>
internal sealed class CelestialField : StyleField
{
    public override double ArriveSeconds => 1.7;
    // 8 frames a second at rest: measured 5.5 % of one core against 13.6 % at 12 (the glitter covers the whole window, so every frame is)
    protected override double AmbientMs => 125;
    public override double Ease(double raw) => 1 - Math.Pow(1 - raw, 1.6);

    private readonly Random _rnd = new(7);
    private double Rnd() => _rnd.NextDouble();

    private sealed record Leak(double X, double Y, double Rx, double Ry, double Rot, double Hue, double Speed, double Phase);
    private static readonly Leak[] Leaks =
    [
        new(0.78, 0.30, 360, 120, -0.95, 330, 0.07, 0), new(0.60, 0.62, 300, 95, -1.05, 20, 0.05, 2), new(0.90, 0.70, 280, 110, -0.8, 165, 0.06, 4),
        new(0.46, 0.18, 260, 80, -1.1, 270, 0.045, 1), new(0.70, 0.92, 320, 90, -0.9, 120, 0.055, 3), new(0.08, 0.85, 240, 90, -0.9, 300, 0.04, 5)
    ];

    private sealed class Glitter { public double X, Y, R, Hue, Speed, Phase, Flare; }
    private sealed class Star { public double X, Y, S, Rot, Vr, Vx, Vy, Hue, Ox, Oy; }
    private sealed class Spark { public double X, Y, Vx, Vy, Age, Life, S, Rot, Vr, Hue; public bool IsStar; }

    private readonly List<Glitter> _glitter = [];
    private readonly Star[] _stars;
    private readonly List<Spark> _sparks = [];
    private readonly HashSet<Click> _seen = [];
    private int _glitterCount = 280;

    // brushes made once: glitter in 36 hues x 16 strengths, foil gradients in 36 hues, white glints in 16 strengths
    private readonly SolidColorBrush[,] _dot = new SolidColorBrush[36, 16];
    private readonly LinearGradientBrush[] _foil = new LinearGradientBrush[36];
    private readonly Pen[] _glint = new Pen[16];
    private readonly Pen[,] _sparkPen = new Pen[36, 16];
    private static readonly Geometry UnitStar = MakeStar();

    // the light beams: a small bitmap, redrawn a few times a second
    private WriteableBitmap? _leaks;
    private int _lw, _lh;
    private byte[] _pixels = [];
    private double _leaksAt = -1;

    public CelestialField()
    {
        for (var i = 0; i < 280; i++) _glitter.Add(new Glitter { X = Rnd(), Y = Rnd(), R = 0.5 + Rnd() * 1.1, Hue = Rnd() * 360, Speed = 0.6 + Rnd() * 1.8, Phase = Rnd() * Math.Tau });
        _stars = Enumerable.Range(0, 30).Select(_ => new Star { X = Rnd(), Y = Rnd(), S = 4 + Rnd() * 8, Rot = Rnd() * Math.Tau, Vr = (Rnd() - 0.5) * 0.6, Vx = (Rnd() - 0.5) * 6, Vy = -3 - Rnd() * 7, Hue = Rnd() * 360 }).ToArray();
        for (var h = 0; h < 36; h++)
        {
            for (var a = 0; a < 16; a++)
            {
                _dot[h, a] = Frozen(Hsl(h * 10, 0.95, 0.80, (byte)(a * 17)));
                var pen = new Pen(Frozen(Hsl(h * 10, 0.95, 0.75, (byte)(a * 17))), 1.4) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                pen.Freeze(); _sparkPen[h, a] = pen;
            }
            var foil = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
            foil.GradientStops.Add(new GradientStop(Hsl(h * 10, 0.95, 0.86), 0));
            foil.GradientStops.Add(new GradientStop(Hsl(h * 10 + 60, 0.95, 0.76), 0.5));
            foil.GradientStops.Add(new GradientStop(Hsl(h * 10 + 140, 0.95, 0.82), 1));
            foil.Freeze(); _foil[h] = foil;
        }
        for (var a = 0; a < 16; a++) { var p = new Pen(Frozen(Color.FromArgb((byte)(a * 17), 255, 255, 255)), 1); p.Freeze(); _glint[a] = p; }
    }

    private static Geometry MakeStar()
    {
        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            for (var i = 0; i < 10; i++)
            {
                var a = i * Math.PI / 5 - Math.PI / 2;
                var r = i % 2 == 1 ? 0.44 : 1;
                var p = new Point(Math.Cos(a) * r, Math.Sin(a) * r);
                if (i == 0) ctx.BeginFigure(p, true, true); else ctx.LineTo(p, true, false);
            }
        }
        g.Freeze();
        return g;
    }

    private static int HueIndex(double hue) => (int)(((hue % 360) + 360) % 360 / 10) % 36;
    private static int Level(double a) => Math.Clamp((int)Math.Round(a * 15), 0, 15);

    protected override bool Thin()
    {
        if (_glitterCount <= 120) return false;
        _glitterCount -= 60;
        return true;
    }

    protected override void Render(DrawingContext dc, double dt)
    {
        var l = Launcher.Instance;
        var game = l.Game;
        var busy = game.Busy;
        var progress = busy ? Math.Clamp(game.Percent / 100.0, 0, 1) : 0;
        var intensity = 0.6;

        // a click throws a handful of stars and sparks out of it, like a small firework
        foreach (var c in Clicks)
        {
            if (!_seen.Add(c) || T - c.T0 > 0.15) continue;
            var n = (int)Math.Round(10 + 10 * c.Strength);
            for (var i = 0; i < n; i++)
            {
                var a = Rnd() * Math.Tau; var v = 90 + Rnd() * 260 * c.Strength;
                _sparks.Add(new Spark { X = c.X, Y = c.Y, Vx = Math.Cos(a) * v, Vy = Math.Sin(a) * v, Life = 0.9 + Rnd() * 0.7, IsStar = Rnd() < 0.45, S = 3 + Rnd() * 4, Rot = Rnd() * Math.Tau, Vr = (Rnd() - 0.5) * 8, Hue = Rnd() * 360 });
            }
            // too many sparks: the oldest burn out faster instead of disappearing
            for (var k = 0; k < _sparks.Count - 220; k++) _sparks[k].Life = Math.Min(_sparks[k].Life, _sparks[k].Age + 0.25);
            if (_sparks.Count > 600) _sparks.RemoveRange(0, _sparks.Count - 600);
        }
        _seen.RemoveWhere(c => !Clicks.Contains(c));

        // arriving: the shower's front runs along D; the new sky is behind it, cut by a line of star tips
        var arriving = Reveal < 1;
        double dX = -0.8, dY = 0.6, tX = 0.6, tY = 0.8;
        var span = W * 0.8 + H * 0.6;
        var front = -span * 0.86 + Reveal * span * 1.38;
        if (arriving)
        {
            if (Reveal <= 0.001) return;
            var clip = new StreamGeometry();
            using (var g = clip.Open())
            {
                var first = true;
                var i = 0;
                for (var u = -80.0; u <= W + H; u += 16, i++)
                {
                    var jag = (i % 2 == 1 ? 11 : -3) + 7 * Math.Sin(u * 0.05 + T * 8);
                    var p = new Point(dX * (front + jag) + tX * u, dY * (front + jag) + tY * u);
                    if (first) { g.BeginFigure(p, true, true); first = false; } else g.LineTo(p, false, false);
                }
                g.LineTo(new Point(dX * (front - 4000) + tX * (W + H), dY * (front - 4000) + tY * (W + H)), false, false);
                g.LineTo(new Point(dX * (front - 4000) + tX * -80, dY * (front - 4000) + tY * -80), false, false);
            }
            clip.Freeze();
            dc.PushClip(clip);
            ClipBase(clip);
        }
        else ClipBase(null);
        UpdateLeaks(intensity);

        // where the rings of clicks are, to flare the glitter they pass and shove the stars
        var rings = new List<(double X, double Y, double R, double A)>();
        foreach (var c in Clicks) { var r = (T - c.T0) * 520; if (r < 1600) rings.Add((c.X, c.Y, r, c.Weight * (1 - r / 1600))); }
        double RingAt(double x, double y)
        {
            double v = 0;
            foreach (var q in rings) { var dd = Math.Sqrt((x - q.X) * (x - q.X) + (y - q.Y) * (y - q.Y)) - q.R; if (dd > -80 && dd < 50) v += Math.Exp(-dd * dd / 900) * q.A; }
            if (arriving) { var dd = x * dX + y * dY - front; v += Math.Exp(-dd * dd / 1400) * 1.2; }
            return v;
        }

        // glitter: the resting glow of every point is in the base; here only the ones flashing now (and, while a download runs, only as
        // many as have been downloaded)
        for (var i = 0; i < _glitterCount && i < _glitter.Count; i++)
        {
            var p = _glitter[i];
            var x = p.X * W; var y = p.Y * H;
            p.Flare = Math.Max(p.Flare * Math.Pow(0.9, dt * 30), RingAt(x, y));
            var twinkle = Math.Pow(Math.Max(0, Math.Sin(T * p.Speed + p.Phase)), 8);
            var lit = !busy || (double)i / _glitterCount <= progress ? 1 : 0.25;
            if (twinkle * lit < 0.08 && p.Flare < 0.05) continue;
            var b = Math.Min(1.4, (0.2 + 0.8 * twinkle) * (0.45 + 0.55 * intensity) * lit + p.Flare) * (1 - 0.7 * QuietAt(x, y));
            if (b < 0.05) continue;
            var hue = p.Hue + T * 30 + x * 0.1;
            var r = p.R * (0.8 + 0.6 * b);
            dc.DrawEllipse(_dot[HueIndex(hue), Level(Math.Min(1, b))], null, new Point(x, y), r, r);
            if (b > 0.55) Glint(dc, x, y, 3 + 7 * (b - 0.55), Math.Min(0.9, b - 0.3));
        }

        // foil stars
        foreach (var p in _stars)
        {
            p.X += (p.Vx + 4 * Math.Sin(T * 0.4 + p.Hue)) * dt / Math.Max(1, W); p.Y += p.Vy * dt / Math.Max(1, H); p.Rot += p.Vr * dt;
            if (p.Y < -0.03) { p.Y = 1.03; p.X = Rnd(); }
            if (p.X < -0.03) p.X = 1.03; else if (p.X > 1.03) p.X = -0.03;
            var sx = p.X * W; var sy = p.Y * H;
            double push = 0;
            foreach (var q in rings)
            {
                var ddx = sx - q.X; var ddy = sy - q.Y; var d = Math.Max(1, Math.Sqrt(ddx * ddx + ddy * ddy)); var dd = d - q.R;
                if (Math.Abs(dd) < 60) { var f = Math.Exp(-dd * dd / 900) * q.A; p.Ox += ddx / d * f * 3; p.Oy += ddy / d * f * 3; push += f; }
            }
            var damp = Math.Pow(0.94, dt * 30);
            p.Ox *= damp; p.Oy *= damp; p.Rot += push * 0.2;
            var x = sx + p.Ox; var y = sy + p.Oy;
            var a = (0.45 + 0.4 * intensity) * (1 - 0.7 * QuietAt(x, y));
            if (a < 0.05) continue;
            dc.PushTransform(new MatrixTransform(Math.Cos(p.Rot) * p.S, Math.Sin(p.Rot) * p.S, -Math.Sin(p.Rot) * p.S, Math.Cos(p.Rot) * p.S, x, y));
            dc.PushOpacity(a);
            dc.DrawGeometry(_foil[HueIndex(p.Hue + p.Rot * 60 + T * 15)], null, UnitStar);
            dc.Pop(); dc.Pop();
            var shine = Math.Pow(Math.Max(0, Math.Sin(p.Rot * 2 + T)), 12);
            if (shine > 0.2) Glint(dc, x, y, p.S * 1.8 * shine, shine * a);
        }

        DrawConstellation(dc, l, busy, progress);

        // sparks from clicks
        for (var i = _sparks.Count - 1; i >= 0; i--)
        {
            var p = _sparks[i];
            p.Age += dt;
            if (p.Age > p.Life) { _sparks.RemoveAt(i); continue; }
            var drag = Math.Pow(0.12, dt);
            p.Vx *= drag; p.Vy = p.Vy * drag + 40 * dt; p.X += p.Vx * dt; p.Y += p.Vy * dt; p.Rot += p.Vr * dt;
            var f = 1 - p.Age / p.Life; var hue = p.Hue + p.Age * 200;
            if (p.IsStar)
            {
                var s = p.S * (0.6 + 0.4 * f);
                dc.PushTransform(new MatrixTransform(Math.Cos(p.Rot) * s, Math.Sin(p.Rot) * s, -Math.Sin(p.Rot) * s, Math.Cos(p.Rot) * s, p.X, p.Y));
                dc.DrawGeometry(_dot[HueIndex(hue), Level(f)], null, UnitStar);
                dc.Pop();
            }
            else dc.DrawLine(_sparkPen[HueIndex(hue), Level(f)], new Point(p.X, p.Y), new Point(p.X - p.Vx * 0.04, p.Y - p.Vy * 0.04));
        }

        if (arriving)
        {
            dc.Pop();
            // the shower itself: stars leading the front, each dragging a long streak behind it
            for (var i = 0; i < 44; i++)
            {
                var r1 = Frac(Math.Sin(i * 91.7) * 43758.5453); var r2 = Frac(Math.Sin(i * 37.3 + 4.1) * 43758.5453);
                var u = -60 + (i + r1 * 0.8) / 44 * (W + H);
                var lead = 6 + r2 * 46; var len = 70 + r1 * 140; var size = 3.5 + r2 * 5;
                var head = new Point(dX * (front + lead) + tX * u, dY * (front + lead) + tY * u);
                var tail = new Point(dX * (front + lead - len) + tX * u, dY * (front + lead - len) + tY * u);
                var hue = r1 * 360 + T * 40;
                var streak = new LinearGradientBrush { MappingMode = BrushMappingMode.Absolute, StartPoint = head, EndPoint = tail };
                streak.GradientStops.Add(new GradientStop(Hsl(hue, 0.95, 0.88, 217), 0));
                streak.GradientStops.Add(new GradientStop(Hsl(hue + 40, 0.95, 0.80, 90), 0.35));
                streak.GradientStops.Add(new GradientStop(Colors.Transparent, 1));
                dc.DrawLine(new Pen(streak, 1.5 + r2 * 3.5) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round }, head, tail);
                var rot = T * 3 + i;
                dc.PushTransform(new MatrixTransform(Math.Cos(rot) * size, Math.Sin(rot) * size, -Math.Sin(rot) * size, Math.Cos(rot) * size, head.X, head.Y));
                dc.DrawGeometry(_dot[HueIndex(hue), 15], null, UnitStar);
                dc.Pop();
                var tw = Math.Pow(Math.Max(0, Math.Sin(T * 11 + i * 2.3)), 4);
                if (tw > 0.2) Glint(dc, head.X, head.Y, size * 2.2 * tw, tw);
            }
        }
    }

    private static double Frac(double v) => v - Math.Floor(v);

    private void Glint(DrawingContext dc, double x, double y, double len, double a)
    {
        var pen = _glint[Level(a)];
        dc.DrawLine(pen, new Point(x - len, y), new Point(x + len, y));
        dc.DrawLine(pen, new Point(x, y - len), new Point(x, y + len));
    }

    // ---- the light beams ------------------------------------------------------------------------------------------------------

    protected override void Resized() { _leaks = null; }
    protected override void AccentChanged() { _leaksAt = -1; }

    /// <summary>The base: the light beams, and every glitter point at its resting glow (in its own colour, still).</summary>
    protected override void RenderBase(DrawingContext dc)
    {
        if (_leaks != null) dc.DrawImage(_leaks, new Rect(-4, -4, W + 8, H + 8));
        for (var i = 0; i < _glitterCount && i < _glitter.Count; i++)
        {
            var p = _glitter[i];
            var x = p.X * W; var y = p.Y * H;
            var b = 0.156 * (1 - 0.7 * QuietAt(x, y));
            if (b < 0.05) continue;
            dc.DrawEllipse(_dot[HueIndex(p.Hue + x * 0.1), Level(b)], null, new Point(x, y), p.R * 0.9, p.R * 0.9);
        }
    }

    private void UpdateLeaks(double intensity)
    {
        var lw = Math.Max(16, (int)Math.Ceiling(W / 8)); var lh = Math.Max(12, (int)Math.Ceiling(H / 8));
        if (_leaks == null || lw != _lw || lh != _lh)
        {
            _lw = lw; _lh = lh;
            _leaks = new WriteableBitmap(lw, lh, 96, 96, PixelFormats.Bgr32, null);
            _pixels = new byte[lw * lh * 4];
            _leaksAt = -1;
            InvalidateBase();
        }
        // they drift slowly: five times a second is enough
        if (T - _leaksAt > 0.2 || _leaksAt < 0)
        {
            _leaksAt = T;
            ComputeLeaks(intensity);
            _leaks.WritePixels(new Int32Rect(0, 0, _lw, _lh), _pixels, _lw * 4, 0);
        }
    }

    private void ComputeLeaks(double intensity)
    {
        // sky, then each beam added on top (light adds up), as the preview's "lighter" blending
        var sx = W / _lw; var sy = H / _lh;
        var beams = new (double X, double Y, double Cos, double Sin, double Rx, double Ry, Color C0, Color C1, double A)[Leaks.Length];
        for (var i = 0; i < Leaks.Length; i++)
        {
            var L = Leaks[i];
            var k = T * L.Speed;
            var x = (L.X + 0.05 * Math.Sin(k * 1.3 + L.Phase)) * W; var y = (L.Y + 0.05 * Math.Cos(k + L.Phase)) * H;
            var rot = L.Rot + 0.08 * Math.Sin(k + i);
            var hue = L.Hue + 25 * Math.Sin(T * 0.08 + i);
            var a = (0.3 + 0.42 * intensity) * (i < 3 ? 1 : 0.75);
            // the first beam is the accent: the modpack's colour, or the style's own
            var c0 = i == 0 ? Accent : Hsl(hue, 0.95, 0.72);
            var c1 = i == 0 ? Accent : Hsl(hue + 20, 0.95, 0.62);
            beams[i] = (x, y, Math.Cos(-rot), Math.Sin(-rot), L.Rx, L.Ry, c0, c1, a);
        }
        var o = 0;
        for (var py = 0; py < _lh; py++)
        {
            var y = (py + 0.5) * sy - 4;
            for (var px = 0; px < _lw; px++)
            {
                var x = (px + 0.5) * sx - 4;
                double r = 7, g = 6, b = 12;
                foreach (var bm in beams)
                {
                    var dx = x - bm.X; var dy = y - bm.Y;
                    var lx = (dx * bm.Cos - dy * bm.Sin) / bm.Rx; var ly = (dx * bm.Sin + dy * bm.Cos) / bm.Ry;
                    var d = Math.Sqrt(lx * lx + ly * ly);
                    if (d >= 1) continue;
                    // the radial gradient: full at the centre, 45 % of it at 0.45, nothing at the edge
                    double w; Color c;
                    if (d < 0.45) { var f = d / 0.45; w = bm.A * (1 - 0.55 * f); c = Lerp(bm.C0, bm.C1, f); }
                    else { var f = (d - 0.45) / 0.55; w = bm.A * 0.45 * (1 - f); c = bm.C1; }
                    r += c.R * w; g += c.G * w; b += c.B * w;
                }
                _pixels[o++] = (byte)Math.Min(255, b); _pixels[o++] = (byte)Math.Min(255, g); _pixels[o++] = (byte)Math.Min(255, r); _pixels[o++] = 255;
            }
        }
    }

    private static Color Lerp(Color a, Color b, double t) => Color.FromRgb((byte)(a.R + (b.R - a.R) * t), (byte)(a.G + (b.G - a.G) * t), (byte)(a.B + (b.B - a.B) * t));

    // ---- the constellation of the modpack ------------------------------------------------------------------------------------

    private string _constKey = "";
    private Point[] _constStars = [];
    private FormattedText? _constName, _constLine;
    private static readonly Pen ConstPen = MakePen(Color.FromArgb(70, 230, 214, 255), 1);
    private static readonly SolidColorBrush ConstLabel = Frozen(Color.FromArgb(200, 246, 241, 255));
    private static readonly SolidColorBrush ConstSub = Frozen(Color.FromArgb(150, 189, 179, 214));
    private static readonly SolidColorBrush StarOff = Frozen(Color.FromArgb(90, 246, 241, 255));

    private static Pen MakePen(Color c, double w) { var p = new Pen(Frozen(c), w); p.Freeze(); return p; }

    /// <summary>
    /// Seven stars placed from the modpack's id, in the open part of the window (never under the interface's text), joined by fine lines
    /// and named after the modpack. While it downloads its stars light up with the progress.
    /// </summary>
    private void DrawConstellation(DrawingContext dc, Launcher l, bool busy, double progress)
    {
        var pack = l.Selected;
        if (pack == null) return;
        var sub = busy ? $"{l.Game.Text.TrimEnd('.')}  {l.Game.Percent} %"
            : l.Game.Running ? "jugando ahora"
            : (pack.Mods > 0 ? $"{pack.Mods} mods  ·  " : "") + $"Minecraft {pack.MinecraftVersion}" + (l.Status is { Online: true, Players: { } pl } ? $"  ·  {pl.Online} en línea" : "");
        var key = $"{pack.Id}|{W:0}|{H:0}|{sub}";
        if (key != _constKey)
        {
            var sameStars = _constKey.StartsWith(pack.Id + "|" + $"{W:0}|{H:0}|", StringComparison.Ordinal);
            _constKey = key;
            if (!sameStars) _constStars = PlaceConstellation(pack.Id);
            var dpi = VisualTreeHelper.GetDpi(this).PixelsPerDip;
            var face = new Typeface(new FontFamily("Bahnschrift, Segoe UI Variable Display, Segoe UI"), FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal);
            var light = new Typeface(new FontFamily("Bahnschrift, Segoe UI Variable Text, Segoe UI"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
            _constName = new FormattedText(pack.Name.ToUpperInvariant(), CultureInfo.GetCultureInfo("es-ES"), FlowDirection.LeftToRight, face, 12, ConstLabel, dpi);
            _constLine = new FormattedText(sub, CultureInfo.GetCultureInfo("es-ES"), FlowDirection.LeftToRight, light, 11, ConstSub, dpi);
        }
        if (_constStars.Length == 0) return;
        var drift = new Vector(Math.Sin(T * 0.11) * 6, Math.Cos(T * 0.09) * 4);
        var fade = Math.Clamp((Reveal - 0.6) / 0.4, 0, 1);
        if (fade <= 0) return;
        dc.PushOpacity(fade);
        for (var i = 1; i < _constStars.Length; i++) dc.DrawLine(ConstPen, _constStars[i - 1] + drift, _constStars[i] + drift);
        var lit = busy ? (int)Math.Round(progress * _constStars.Length) : _constStars.Length;
        for (var i = 0; i < _constStars.Length; i++)
        {
            var p = _constStars[i] + drift;
            var on = i < lit;
            var tw = 0.75 + 0.25 * Math.Sin(T * 1.7 + i * 1.3);
            var hue = HueIndex(i * 47 + T * 20);
            dc.DrawEllipse(on ? _dot[hue, Level(tw)] : StarOff, null, p, on ? 2.4 : 1.6, on ? 2.4 : 1.6);
            if (on && i % 3 == 0) Glint(dc, p.X, p.Y, 5 * tw, 0.6 * tw);
        }
        var anchor = _constStars.OrderByDescending(s => s.Y).First() + drift + new Vector(-40, 16);
        if (_constName != null) dc.DrawText(_constName, anchor);
        if (_constLine != null) dc.DrawText(_constLine, anchor + new Vector(0, 17));
        dc.Pop();
    }

    private Point[] PlaceConstellation(string id)
    {
        // the open part of the window: to the right of and away from the interface's text, top half
        var seed = id.Aggregate(17, (h, c) => h * 31 + c);
        var rnd = new Random(seed);
        var box = new Rect(W * 0.66, H * 0.12, Math.Max(120, W * 0.26), Math.Max(90, H * 0.3));
        var points = new List<Point>();
        for (var tries = 0; points.Count < 7 && tries < 200; tries++)
        {
            var p = new Point(box.X + rnd.NextDouble() * box.Width, box.Y + rnd.NextDouble() * box.Height);
            if (QuietAt(p.X, p.Y, 30) > 0.2) continue;
            if (points.Any(q => (q - p).Length < 40)) continue;
            points.Add(p);
        }
        // joined in the order a finger would trace them: left to right
        return points.OrderBy(p => p.X).ToArray();
    }
}
