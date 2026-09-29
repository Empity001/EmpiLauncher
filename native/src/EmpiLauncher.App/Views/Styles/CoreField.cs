using System.Windows;
using System.Windows.Media;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// CORE: an object made of rings, drawn in fine light lines on near-black, turning slowly beside the modpack. It never stays the same
/// shape: a slinky becomes a sphere, the sphere breaks into dots, then a blob, a torus, a contour map, a disc that melts like a reflection
/// in water and swells into a tunnel of dots coming toward you; the tunnel falls into a well, lines pour out of it and bend around it, and
/// the well gives the slinky back. The lines carry a faint red and cyan fringe, like a lens. It leans toward the pointer; a click sends
/// contour ripples out that make it pulse when they reach it.
///
/// What is real: four callouts pinned to it with leader lines (Minecraft, loader, mods, version), and while a download runs, a thin arc
/// around it that fills with the download. It arrives as a circle opening from the object outward.
///
/// Cost: the ground is the base; a frame is the rings as polylines sorted into seven shades of depth (a few offset strokes of the
/// nearest for the fringe). The tunnel and the lines are the same rings, so every change of shape is a morph and never a fade. Eight
/// frames a second while nothing happens (it turns slowly).
/// </summary>
internal sealed class CoreField : StyleField
{
    public override double ArriveSeconds => 1.9;
    public override double Ease(double p) => p < 0.5 ? 4 * p * p * p : 1 - Math.Pow(-2 * p + 2, 3) / 2;
    protected override double AmbientMs => 125;
    protected override double InteractiveMs => 33;

    private static readonly Color Ground = Color.FromRgb(5, 5, 6);
    private static readonly Color Light = Color.FromRgb(241, 237, 224);
    private static readonly Color Red = Color.FromRgb(255, 70, 60);
    private static readonly Color Cyan = Color.FromRgb(60, 200, 255);
    private const string Mono = "Cascadia Mono, Consolas";

    private const int N = 24, M = 44, Par = 10;   // few enough strokes that WPF's render thread (which tessellates every one) stays light
    private const double Hold = 6.5, Morph = 3.2, Cycle = Hold + Morph;
    private static readonly string[] Scenes = ["slinky", "sphere", "dotted", "blob", "torus", "topo", "disc", "tunnel", "lines"];

    private static double Smooth(double x) { x = Math.Clamp(x, 0, 1); return x * x * (3 - 2 * x); }

    // object forms, for ring i: centre x, y, z, radius, turn around X, turn around Y, wobble, camera distance, swing, dots
    private static bool Form(string name, int i, double u, double s, double t, Span<double> p)
    {
        switch (name)
        {
            case "slinky": Set(p, s * 0.82 + 0.12, 0, 0, 0.42, 0, Math.PI / 2, 0, 1.3, 0.3, 0); return true;
            case "sphere": Set(p, 0, 0, 0, 1, 0.32 * Math.Sin(u * Math.PI), u * Math.PI, 0, 3, 1, 0); return true;
            case "dotted": Set(p, 0, 0, 0, 1, 0.32 * Math.Sin(u * Math.PI), u * Math.PI, 0, 3, 1, 1); return true;
            case "blob":
                Set(p, 0.06 * Math.Sin(s * 3 + t * 0.4), s * 1.02, 0, Math.Max(0.03, Math.Sqrt(Math.Max(0, 1 - s * s)) * (1 + 0.13 * Math.Sin(s * 4.2 + t * 0.5))),
                    Math.PI / 2 + 0.12 * Math.Sin(s * 2 + t * 0.3), 0, 0.07, 3, 1, 0);
                return true;
            case "torus": { var a = (double)i / N * Math.Tau; Set(p, 0.72 * Math.Cos(a), 0, 0.72 * Math.Sin(a), 0.34, 0, -a, 0, 3, 1, 0); return true; }
            case "topo": Set(p, 0.12 * (1 - u), 0.05 * (1 - u), 0, 0.06 + 0.98 * u, 0, 0, 0.1 * u, 3, 1, 0); return true;
            case "disc": Set(p, 0, 0, 0, 0.04 + 0.96 * u, 0, 0, 0, 3, 0, 0); return true;
            default: return false;
        }
    }
    private static void Set(Span<double> p, params double[] v) { for (var i = 0; i < Par; i++) p[i] = v[i]; }

    private readonly double[] _par = new double[N * Par];
    private readonly double[] _px = new double[N * (M + 1)], _py = new double[N * (M + 1)], _pz = new double[N * (M + 1)];
    private double _tiltX, _tiltY;
#if EMPI_RELEASE
    private const double _startAt = 0;
#else
    // development builds only: EMPI_CORE_AT=<seconds> starts the cycle there (to look at, or measure, one form at a time)
    private static readonly double _startAt = double.TryParse(Environment.GetEnvironmentVariable("EMPI_CORE_AT"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var at) ? at - 20 : 0;
#endif

    // ---- where it sits: in the room right of the modpack's text ----------------------------------------------------------------

    private double _cx, _cy, _size;

    private void Place()
    {
        var text = Quiet.Where(r => r.Left > W * 0.18 && r.Width > 4 && r.Height > 4).ToList();
        var right = text.Count > 0 ? text.Max(r => r.Right) : W * 0.55;
        var free = Math.Max(120, W - right);
        _size = Math.Clamp(free * 0.42, 80, 185);
        _cx = Math.Min(W - _size * 0.9, right + free / 2);
        _cy = H * 0.42;
    }

    // ---- base: the ground and the accent's glow at the core ---------------------------------------------------------------------

    protected override void AccentChanged() => InvalidateBase();

    protected override void RenderBase(DrawingContext dc)
    {
        Place();
        dc.DrawRectangle(B(Ground), null, new Rect(-10, -10, W + 20, H + 20));
        var glow = new RadialGradientBrush(Color.FromArgb(24, Accent.R, Accent.G, Accent.B), Color.FromArgb(0, Accent.R, Accent.G, Accent.B))
        { MappingMode = BrushMappingMode.Absolute, Center = new Point(_cx, _cy), GradientOrigin = new Point(_cx, _cy), RadiusX = _size * 2, RadiusY = _size * 2 };
        glow.Freeze();
        dc.DrawRectangle(glow, null, new Rect(0, 0, W, H));
    }

    // ---- a frame ----------------------------------------------------------------------------------------------------------------

    // every scene is the same N rings of M+1 points on the screen, each point with a depth: so any shape can turn into any other
    private readonly double[] _ax = new double[N * (M + 1)], _ay = new double[N * (M + 1)], _az = new double[N * (M + 1)];
    private readonly double[] _bx = new double[N * (M + 1)], _by = new double[N * (M + 1)], _bz = new double[N * (M + 1)];

    private static bool IsForm(string scene) => scene is not ("tunnel" or "lines");
    private static double DotsOf(string scene) => scene is "dotted" or "tunnel" ? 1 : 0;

    protected override void Render(DrawingContext dc, double dt)
    {
        var before = (_cx, _cy, _size);
        Place();
        if (before != (_cx, _cy, _size)) InvalidateBase();
        var t = T + _startAt;

        // clicks: ripples that make the object pulse when they reach it
        double pulse = 0;
        foreach (var c in Clicks)
        {
            var age = T - c.T0; var arrive = Math.Sqrt((c.X - _cx) * (c.X - _cx) + (c.Y - _cy) * (c.Y - _cy)) / 320; var a = age - arrive;
            pulse += c.Weight * 0.1 * Math.Exp(-a * a * 16);
        }
        _tiltX += ((Pointer.Y - _cy) / H * 0.7 * PointerAmp - _tiltX) * Math.Min(1, dt * 3);
        _tiltY += ((Pointer.X - _cx) / W * 0.9 * PointerAmp - _tiltY) * Math.Min(1, dt * 3);

        // where in the cycle: scene A, the next one B, and how far the change between them has gone
        var k = t / Cycle; var ai = (int)Math.Floor(k) % Scenes.Length; string A = Scenes[ai], Bn = Scenes[(ai + 1) % Scenes.Length];
        var local = (k - Math.Floor(k)) * Cycle; var raw = Math.Clamp((local - Hold) / Morph, 0, 1);
        var melt = A == "disc" ? Smooth((local - 1.2) / 4.3) * (1 - Smooth(raw)) : 0;
        if (IsForm(A) && IsForm(Bn))
        {
            // between two objects: the rings' own parameters turn into the next ones, in three dimensions
            SetForms(A, Bn, Smooth(raw), t);
            Project(t, melt, pulse, _px, _py, _pz);
        }
        else
        {
            // to or from the tunnel or the lines: every point of every ring travels to its place in the next shape, in a wave that runs
            // ring after ring and along each ring, so the disc opens into the tunnel, the tunnel unrolls into lines, the lines coil into
            // the slinky: nothing fades, every stroke becomes the next one
            Scene(A, t, melt, pulse, _ax, _ay, _az);
            if (raw > 0) Scene(Bn, t, 0, pulse, _bx, _by, _bz);
            for (var i = 0; i < N; i++)
                for (var m = 0; m <= M; m++)
                {
                    var n = i * (M + 1) + m;
                    var w = raw > 0 ? Smooth(raw * 1.6 - (double)i / N * 0.35 - (double)m / M * 0.25) : 0;
                    _px[n] = _ax[n] + (_bx[n] - _ax[n]) * w; _py[n] = _ay[n] + (_by[n] - _ay[n]) * w; _pz[n] = _az[n] + (_bz[n] - _az[n]) * w;
                }
        }
        var dots = DotsOf(A) + (DotsOf(Bn) - DotsOf(A)) * Smooth(raw);
        var drawOn = Reveal < 1 ? Reveal : 1;

        // arriving: a circle opens from the core outward
        var arriving = Reveal < 1; var maxR = Math.Sqrt(W * W + H * H) + 80; var R = Reveal * maxR;
        if (arriving)
        {
            var clip = Wobbly(_cx, _cy, R, 0.025, 5, T * 2);
            ClipBase(clip); dc.PushClip(clip);
        }
        else ClipBase(null);

        if (!IsForm(A) || raw > 0 && !IsForm(Bn)) Veil(dc);
        DrawRings(dc, drawOn, dots);
        Callouts(dc, 1);
        Progress(dc);

        // contour ripples from clicks
        foreach (var c in Clicks)
        {
            var age = T - c.T0; var f = c.Weight * (1 - age / 3);
            if (age > 3 || f <= 0) continue;
            for (var q = 0; q < 5; q++)
            {
                var rr = age * 320 - q * 16;
                if (rr <= 2) continue;
                var a = f * (1 - q / 5.0) * 0.55;
                dc.DrawGeometry(null, P(Alpha(q == 0 ? Accent : Light, q == 0 ? a : a * 0.7), 1), Wobbly(c.X, c.Y, rr, 0.035, 5, age * 3 + q));
            }
        }

        if (arriving)
        {
            dc.Pop();
            for (var q = 0; q < 6; q++)
                dc.DrawGeometry(null, P(Alpha(q == 0 ? Accent : Light, q == 0 ? 0.7 : 0.5 * (1 - q / 6.0)), 1), Wobbly(_cx, _cy, R + 8 + q * 11, 0.025, 5, T * 2 + q * 0.4));
        }
    }

    private static StreamGeometry Wobbly(double cx, double cy, double r, double amount, int lobes, double phase)
    {
        var g = new StreamGeometry();
        using (var s = g.Open())
            for (var q = 0; q <= 96; q++)
            {
                var a = q / 96.0 * Math.Tau; var rr = Math.Max(0, r * (1 + amount * Math.Sin(a * lobes + phase)));
                var p = new Point(cx + Math.Cos(a) * rr, cy + Math.Sin(a) * rr);
                if (q == 0) s.BeginFigure(p, true, true); else s.LineTo(p, true, true);
            }
        g.Freeze();
        return g;
    }

    private void SetForms(string fa, string fb, double w, double t)
    {
        Span<double> pa = stackalloc double[Par], pb = stackalloc double[Par];
        for (var i = 0; i < N; i++)
        {
            var u = (double)i / (N - 1); var sv = u * 2 - 1;
            Form(fa, i, u, sv, t, pa); Form(fb, i, u, sv, t, pb);
            for (var j = 0; j < Par; j++) _par[i * Par + j] = pa[j] + (pb[j] - pa[j]) * w;
        }
    }

    /// <summary>One scene's points: an object (its rings projected), the tunnel or the lines.</summary>
    private void Scene(string scene, double t, double melt, double pulse, double[] x, double[] y, double[] z)
    {
        if (IsForm(scene)) { SetForms(scene, scene, 0, t); Project(t, melt, pulse, x, y, z); }
        else if (scene == "tunnel") Tunnel(t, x, y, z);
        else Lines(x, y, z);
    }

    /// <summary>The object's rings in three dimensions, turned, seen through a camera; the depth kept for the shading.</summary>
    private void Project(double t, double melt, double pulse, double[] px, double[] py, double[] pz)
    {
        double cam = _par[7], swing = _par[8];
        var yaw = swing * (0.62 * Math.Sin(t * 0.11) + 0.28 * Math.Sin(t * 0.047)) + _tiltY * swing;
        var pitch = swing * (0.32 + 0.12 * Math.Sin(t * 0.21)) + _tiltX;
        double cyw = Math.Cos(yaw), syw = Math.Sin(yaw), cp = Math.Cos(pitch), sp = Math.Sin(pitch);
        var scale = _size * (1 + 0.025 * Math.Sin(t * 0.9) + pulse);
        for (var i = 0; i < N; i++)
        {
            var b = i * Par;
            double cx = _par[b], cy = _par[b + 1], cz = _par[b + 2], r = _par[b + 3], ax = _par[b + 4], ay = _par[b + 5], wob = _par[b + 6] + pulse * 1.4;
            double cax = Math.Cos(ax), sax = Math.Sin(ax), cay = Math.Cos(ay), say = Math.Sin(ay);
            for (var m = 0; m <= M; m++)
            {
                var th = (double)m / M * Math.Tau;
                var rr = r * (1 + wob * (0.6 * Math.Sin(3 * th + i * 0.9 + t * 0.9) + 0.4 * Math.Sin(5 * th - t * 0.7 + i * 0.4)));
                double lx = rr * Math.Cos(th), ly0 = rr * Math.Sin(th);
                double ly = ly0 * cax, lz = ly0 * sax;
                double x = lx * cay + lz * say + cx, y = ly + cy, z = -lx * say + lz * cay + cz;
                double x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
                double y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
                var kk = cam / Math.Max(0.3, cam - z2);
                double X = _cx + x1 * kk * scale, Y = _cy - y2 * kk * scale;
                // the melt: below the middle the rings sag and ripple like a reflection in water
                if (melt > 0)
                {
                    var d = (Y - _cy) / scale;
                    if (d > 0) { Y += melt * scale * (0.2 * d + 0.07 * Math.Sin(X * 0.045 + t * 3 + d * 7) * d); X += melt * scale * 0.025 * Math.Sin(Y * 0.08 + t * 2.4) * d; }
                }
                var n = i * (M + 1) + m;
                px[n] = X; py[n] = Y; pz[n] = z2;
            }
        }
    }

    /// <summary>
    /// The tunnel: the rings as circles spaced wider and wider, drifting outward toward you (the far, small ones dim, the near ones bright),
    /// the inner ones leaning toward the pointer. Its clock starts when the disc starts to open, so the rings keep who they are all the
    /// way from the disc to the lines.
    /// </summary>
    private void Tunnel(double t, double[] x, double[] y, double[] z)
    {
        var loop = Scenes.Length * Cycle;
        var since = ((t % loop) + loop) % loop - (Array.IndexOf(Scenes, "disc") * Cycle + Hold);
        if (since < 0) since += loop;
        var lean = new Vector((Pointer.X - _cx) * 0.14 * PointerAmp, (Pointer.Y - _cy) * 0.14 * PointerAmp);
        for (var i = 0; i < N; i++)
        {
            var ii = i + since * 0.1;
            var r = 18 * Math.Exp(0.155 * ii);   // from a pinhole out past the corners of the window
            var pull = 1 / (1 + r / 160);
            double cx = _cx + lean.X * pull, cy = _cy + lean.Y * pull;
            var depth = -1 + 2 * Smooth((r - 20) / 520);
            for (var m = 0; m <= M; m++)
            {
                var th = (double)m / M * Math.Tau + ii * 0.37;
                var n = i * (M + 1) + m;
                x[n] = cx + Math.Cos(th) * r; y[n] = cy + Math.Sin(th) * r; z[n] = depth;
            }
        }
    }

    /// <summary>Lines across the window, closer toward the top, pulled down into a well at the core and pushed aside by the pointer.</summary>
    private void Lines(double[] x, double[] y, double[] z)
    {
        for (var i = 0; i < N; i++)
        {
            var phi = 4 + i * (40.0 / (N - 1));
            var baseY = (Math.Pow(phi / 46, 4.0 / 3) - 0.02) * H;
            var depth = -0.8 + 1.6 * i / (N - 1);
            for (var m = 0; m <= M; m++)
            {
                var xx = -20 + (W + 40) * m / M;
                var yy = baseY;
                for (var it = 0; it < 4; it++)
                {
                    var dw = Math.Sqrt((xx - _cx) * (xx - _cx) + (yy - _cy) * (yy - _cy));
                    var dp = Math.Sqrt((xx - Pointer.X) * (xx - Pointer.X) + (yy - Pointer.Y) * (yy - Pointer.Y));
                    var target = phi - 5.5 * Math.Exp(-dw / 150) + PointerAmp * 2.2 * Math.Exp(-dp / 110);
                    yy = (Math.Pow(Math.Max(0, target) / 46, 4.0 / 3) - 0.02) * H * 0.5 + yy * 0.5;
                }
                var n = i * (M + 1) + m;
                x[n] = xx; y[n] = yy; z[n] = depth;
            }
        }
    }

    private const int Shades = 7;

    /// <summary>
    /// The rings, shaded by depth: each stroke goes into one of seven shades from far (faint, thin) to near (bright, a little heavier),
    /// so the object reads as a volume that turns, with no line where "front" stops and "back" starts. The nearest shades carry the
    /// lens's red and cyan fringe. In the dotted forms every short stroke shrinks toward its start until it is a small filled square.
    /// </summary>
    private void DrawRings(DrawingContext dc, double drawOn, double dots)
    {
        var lw = 1.1 + 1.3 * dots;
        var shrink = dots > 0.001 ? 0.01 + 99.99 * Math.Pow(1 - dots, 3) : double.PositiveInfinity;
        var dotted = !double.IsInfinity(shrink);
        var geometries = new StreamGeometry[Shades];
        var contexts = new StreamGeometryContext[Shades];
        for (var s = 0; s < Shades; s++) { geometries[s] = new StreamGeometry(); contexts[s] = geometries[s].Open(); }
        for (var i = 0; i < N; i++)
        {
            var upto = (int)Math.Floor(Math.Clamp(drawOn * 1.7 - (double)i / N * 0.7, 0, 1) * M);
            var last = -1;
            for (var m = 0; m < upto; m++)
            {
                var n = i * (M + 1) + m;
                var shade = Math.Clamp((int)(Smooth((_pz[n] + _pz[n + 1]) / 2 / 1.8 + 0.5) * Shades), 0, Shades - 1);
                var s = contexts[shade];
                var a = new Point(_px[n], _py[n]); var b = new Point(_px[n + 1], _py[n + 1]);
                if (!dotted)
                {
                    // the stroke continues in the same figure while it stays in the same shade; a new shade starts where the last ended
                    if (shade != last) { s.BeginFigure(a, false, false); last = shade; }
                    s.LineTo(b, true, true);
                    continue;
                }
                var along = b - a; var length = along.Length;
                if (shrink >= 1.5 && length > 0.01) { s.BeginFigure(a, false, false); s.LineTo(a + along * Math.Min(1, shrink / length), true, true); }
                else
                {
                    var half = lw * (0.45 + 0.25 * shade / (Shades - 1.0));
                    Dot(s, a, half);
                    // long segments (the big rings of the tunnel) get more dots between their ends, so a ring stays a ring of dots
                    var extra = (int)Math.Min(4, length / 26);
                    for (var q = 1; q <= extra; q++) Dot(s, a + along * (q / (extra + 1.0)), half);
                }
            }
        }
        for (var s = 0; s < Shades; s++) { contexts[s].Close(); geometries[s].Freeze(); }
        for (var s = 0; s < Shades; s++)
        {
            var near = s / (Shades - 1.0);
            var a = 0.12 + 0.78 * near * near;
            var width = lw * (0.75 + 0.4 * near);
            if (near > 0.6)
            {
                var fringe = 0.3 * (near - 0.6) / 0.4;
                dc.PushTransform(new TranslateTransform(-1.2, 0)); Stroke(dc, geometries[s], Red, fringe, width, dotted); dc.Pop();
                dc.PushTransform(new TranslateTransform(1.2, 0)); Stroke(dc, geometries[s], Cyan, fringe, width, dotted); dc.Pop();
            }
            Stroke(dc, geometries[s], Light, a, width, dotted);
        }
    }

    private static void Dot(StreamGeometryContext s, Point p, double half)
    {
        s.BeginFigure(new Point(p.X - half, p.Y - half), true, true);
        s.PolyLineTo([new Point(p.X + half, p.Y - half), new Point(p.X + half, p.Y + half), new Point(p.X - half, p.Y + half)], false, false);
    }

    private void Stroke(DrawingContext dc, Geometry g, Color c, double a, double width, bool dotted) =>
        dc.DrawGeometry(dotted ? B(Alpha(c, a)) : null, P(Alpha(c, a), width), g);

    /// <summary>The tunnel and the lines cover the whole window: behind the modpack's text they are dimmed, so it reads.</summary>
    private void Veil(DrawingContext dc)
    {
        var text = Quiet.Where(r => r.Width > 4 && r.Height > 4).ToList();
        if (text.Count == 0) return;
        var box = new Rect(new Point(text.Min(r => r.Left), text.Min(r => r.Top)), new Point(text.Max(r => r.Right), text.Max(r => r.Bottom)));
        for (var i = 3; i >= 0; i--)
        {
            var r = box; r.Inflate(12 + i * 14, 12 + i * 14);
            dc.DrawRoundedRectangle(B(Alpha(Ground, 0.22)), null, r, 18 + i * 14, 18 + i * 14);
        }
    }

    /// <summary>Four notes pinned to the object with leader lines: what the modpack really is.</summary>
    private void Callouts(DrawingContext dc, double alpha)
    {
        var pack = Launcher.Instance.Selected;
        if (pack == null || alpha < 0.02) return;
        var k = _size / 185;
        (double Dx, double Dy, string Key, string Value)[] notes =
        [
            (-160, -210, "MINECRAFT", pack.MinecraftVersion),
            (150, -230, "LOADER", string.IsNullOrWhiteSpace(pack.Loader) ? "vanilla" : pack.Loader),
            (150, 230, "MODS", pack.Mods > 0 ? pack.Mods.ToString() : "0"),
            (-170, 225, "VERSIÓN", "v" + pack.Version)
        ];
        var lead = P(Alpha(Light, 0.45 * alpha), 1);
        for (var i = 0; i < notes.Length; i++)
        {
            var (dx, dy, key, value) = notes[i];
            var f = Math.Sin(T * 0.5 + i) * 4;
            double lx = _cx + dx * k + f, ly = _cy + dy * k + Math.Sin(T * 0.5 + i + 2) * 4;
            double ex = _cx + dx * k * 0.55, ey = _cy + dy * k * 0.55;
            var top = Text(key, Mono, 11, Alpha(Light, 0.75 * alpha));
            var under = Text(value, Mono, 11, Alpha(Accent, alpha), FontWeights.SemiBold);
            var w = Math.Max(top.Width, under.Width);
            var tx = Math.Clamp(dx < 0 ? lx - w : lx, 8, W - 8 - w);
            var ty = dy < 0 ? ly - 30 : ly + 2;
            dc.DrawLine(lead, new Point(lx, dy < 0 ? ly : ly), new Point(ex, ey));
            dc.DrawEllipse(B(Alpha(Accent, alpha)), null, new Point(ex, ey), 2.5, 2.5);
            dc.DrawText(top, new Point(tx, ty));
            dc.DrawText(under, new Point(tx, ty + 15));
        }
    }

    /// <summary>While a download runs: a thin arc around the object that fills with it.</summary>
    private void Progress(DrawingContext dc)
    {
        var game = Launcher.Instance.Game;
        if (!game.Busy) return;
        var r = _size * 1.32;
        dc.DrawEllipse(null, P(Alpha(Light, 0.12), 1), new Point(_cx, _cy), r, r);
        var share = Math.Clamp(game.Percent / 100.0, 0.002, 0.999);
        var a = share * Math.Tau - Math.PI / 2;
        var arc = new StreamGeometry();
        using (var s = arc.Open())
        {
            s.BeginFigure(new Point(_cx, _cy - r), false, false);
            s.ArcTo(new Point(_cx + Math.Cos(a) * r, _cy + Math.Sin(a) * r), new Size(r, r), 0, share > 0.5, SweepDirection.Clockwise, true, false);
        }
        arc.Freeze();
        dc.DrawGeometry(null, P(Accent, 2), arc);
        var label = Text($"{game.Percent}%", Mono, 11, Accent, FontWeights.SemiBold);
        dc.DrawText(label, new Point(_cx + Math.Cos(a) * (r + 12) - label.Width / 2, _cy + Math.Sin(a) * (r + 12) - label.Height / 2));
    }
}
