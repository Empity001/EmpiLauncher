using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using static EmpiLauncher.App.Views.Access.Scene;

namespace EmpiLauncher.App.Views.Access;

/// <summary>
/// Each style's way of telling that Jugar is in maintenance ("maint"), coming soon ("soon"), retired, and that it came back ("back"), as
/// the approved preview showed them, with the state's real dates. Every script starts from Jugar as it is (for "back", from the retired
/// pose) and ends posed; with Scene.Instant it lands on that pose at once. Explorer's are in ExplorerAccess; the base style keeps its
/// seal and its glass (HomeView).
/// </summary>
internal static class AccessScripts
{
    public static Func<Scene, Task>? For(string style, string state) => (style, state) switch
    {
        ("celestial", "maint") => CelestialMaint, ("celestial", "soon") => CelestialSoon, ("celestial", "retired") => CelestialRetired, ("celestial", "back") => CelestialBack,
        ("oleaje", "maint") => OleajeMaint, ("oleaje", "soon") => OleajeSoon, ("oleaje", "retired") => OleajeRetired, ("oleaje", "back") => OleajeBack,
        ("termico", "maint") => TermicoMaint, ("termico", "soon") => TermicoSoon, ("termico", "retired") => TermicoRetired, ("termico", "back") => TermicoBack,
        ("core", "maint") => CoreMaint, ("core", "soon") => CoreSoon, ("core", "retired") => CoreRetired, ("core", "back") => CoreBack,
        ("shell", "maint") => ShellMaint, ("shell", "soon") => ShellSoon, ("shell", "retired") => ShellRetired, ("shell", "back") => ShellBack,
        ("minimal", "maint") => MinimalMaint, ("minimal", "soon") => MinimalSoon, ("minimal", "retired") => MinimalRetired, ("minimal", "back") => MinimalBack,
        ("remember", "maint") => RememberMaint, ("remember", "soon") => RememberSoon, ("remember", "retired") => RememberRetired, ("remember", "back") => RememberBack,
        ("punk", "maint") => PunkMaint, ("punk", "soon") => PunkSoon, ("punk", "retired") => PunkRetired, ("punk", "back") => PunkBack,
        ("words", "maint") => WordsMaint, ("words", "soon") => WordsSoon, ("words", "retired") => WordsRetired, ("words", "back") => WordsBack,
        ("explorer", _) => ExplorerAccess.For(state),
        _ => null
    };

    // ---- Celestial: a holographic night sky ------------------------------------------------------------------------------------

    private static readonly string[] Foil = ["#ffd6f2", "#c9f3ff", "#e6d3ff", "#fff6c9", "#ffffff"];
    private static Color FoilColor() => C(Pick(Foil));

    private static LinearGradientBrush FoilBrush()
    {
        var b = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
        b.GradientStops.Add(new GradientStop(C("#ffd6f2"), 0)); b.GradientStops.Add(new GradientStop(C("#c9f3ff"), 0.5)); b.GradientStops.Add(new GradientStop(C("#fff6c9"), 1));
        return b;
    }

    private static async Task CelestialMaint(Scene s)
    {
        // an eclipse: a dark moon crosses Play and its foil corona is left burning round it
        var moonFill = new RadialGradientBrush { GradientOrigin = new Point(0.38, 0.36), Center = new Point(0.38, 0.36), RadiusX = 0.62, RadiusY = 0.62 };
        moonFill.GradientStops.Add(new GradientStop(C("#2a2140"), 0)); moonFill.GradientStops.Add(new GradientStop(C("#0c0914"), 0.62)); moonFill.GradientStops.Add(new GradientStop(C("#07060c"), 1));
        var moon = s.Add(new Ellipse { Width = 96, Height = 96, Fill = moonFill }, s.P.X - 110, s.Cy - 48, 20);
        var ease = Ease.Bezier(0.45, 0, 0.2, 1);
        s.Anim(1500, t => Canvas.SetLeft(moon, Lerp(s.P.X - 110, s.Cx - 48, t)), 0, ease);
        var box = s.Play();
        s.Anim(1300, t => { box.Dark.Opacity = 0.55 * t; box.Grey = 0.3 * t; }, 200);
        await s.Sleep(1350);
        var ring = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
        foreach (var (hex, at) in new[] { ("#ffd6f2", 0.0), ("#c9f3ff", 0.33), ("#e6d3ff", 0.66), ("#fff6c9", 1.0) }) ring.GradientStops.Add(new GradientStop(C(hex), at));
        var corona = s.Add(new Ellipse { Width = 110, Height = 110, Stroke = ring, StrokeThickness = 7, Effect = new BlurEffect { Radius = 3 } }, s.Cx - 55, s.Cy - 55, 19);
        var cx = Xf.Of(corona);
        s.Anim(700, t => { corona.Opacity = t; cx.S = Lerp(0.8, 1, t); });
        s.Anim(14000, t => cx.R = 360 * t, 700, Ease.Linear, 0);
        var until = s.Say.Clock(s.Say.Until);
        var label = Text(Spaced(until.Length > 0 ? $"MANTENIMIENTO · vuelve {until}" : "MANTENIMIENTO", 2), "Segoe UI", 10.5, FoilBrush(), FontWeights.SemiBold);
        s.AddCentered(label, s.Cx, s.Cy - 68, 21);   // above the corona
        s.FadeIn(label, 700); s.Unblur(label, 4, 700);
        s.Every(900, () => s.Burst(2, _ => { var a = Rnd(0, 6.3); return new ParticleLayer.Particle { X = s.Cx + Math.Cos(a) * Rnd(52, 66), Y = s.Cy + Math.Sin(a) * Rnd(52, 66), Life = Rnd(0.6, 1.2), Size = Rnd(2.5, 5), Shape = "star", Color = FoilColor(), FadeIn = true }; }));
    }

    private static async Task CelestialSoon(Scene s)
    {
        // a constellation draws Play's outline star by star
        var box = s.Play();
        s.Anim(600, t => box.Opacity = Lerp(1, 0.16, t));
        double w = s.P.Width, h = s.P.Height;
        var pts = new[] { (0.012, 0.19), (0.28, 0.04), (0.62, 0.15), (0.99, 0.08), (0.994, 0.88), (0.71, 0.98), (0.36, 0.85), (0.006, 0.94) }.Select(p => new Point(p.Item1 * w, p.Item2 * h)).ToArray();
        var data = "M" + string.Join(" L", pts.Select(p => $"{p.X:0.#},{p.Y:0.#}")) + " Z";
        var line = PathOf(data, null, Br("#e6d3ff", 0.7), 0.9);
        s.Add(line, s.P.X, s.P.Y, 20);
        s.DrawOn(line, line.Data, 1600, 250);
        for (var i = 0; i < pts.Length; i++)
        {
            var star = s.Add(new Ellipse { Width = 4.8, Height = 4.8, Fill = Brushes.White, Opacity = 0 }, s.P.X + pts[i].X - 2.4, s.P.Y + pts[i].Y - 2.4, 21);
            s.FadeIn(star, 300, 150 + i * 170);
            var at = pts[i];
            s.Burst(1, _ => new ParticleLayer.Particle { X = s.P.X + at.X, Y = s.P.Y + at.Y, Life = 0.9, Size = 6, Shape = "star", Color = FoilColor(), FadeIn = true });
        }
        await s.Sleep(1500);
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock { Text = Spaced("PRÓXIMAMENTE", 2), FontFamily = new FontFamily("Segoe UI"), FontSize = 14, FontWeight = FontWeights.Bold, Foreground = Br("#f6f1ff"), HorizontalAlignment = HorizontalAlignment.Center });
        var when = s.Say.From is { } f ? $"{s.Say.Short(f)} · {s.Say.Clock(f)}" : "MUY PRONTO";
        stack.Children.Add(new TextBlock { Text = Spaced(when), FontFamily = Mono, FontSize = 10, Foreground = Br("#f6f1ff", 0.7), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 2, 0, 0) });
        s.AddCentered(stack, s.Cx, s.Cy, 22);
        s.FadeIn(stack, 800); s.Unblur(stack, 6, 800);
    }

    private static async Task CelestialRetired(Scene s)
    {
        // a supernova: Play flashes white and blows out into foil stardust; a dotted outline stays
        var box = s.Play();
        s.Anim(700, t => { box.Light.Opacity = KeysAt(t, (0, 0), (0.6, 0.75), (1, 0.85)); box.Opacity = KeysAt(t, (0, 1), (0.6, 1), (1, 0)); });
        await s.Sleep(560);
        var ring = s.Add(new Ellipse { Width = 20, Height = 20, Stroke = Brushes.White, StrokeThickness = 1.5 }, s.Cx - 10, s.Cy - 10, 20);
        var rx = Xf.Of(ring);
        s.Anim(1200, t => { rx.S = Lerp(1, 24, t); ring.Opacity = 1 - t; }, 0, Ease.Bezier(0.1, 0.8, 0.2, 1));
        s.Burst(160, _ => { var a = Rnd(0, 6.3); var v = Rnd(30, 250); return new ParticleLayer.Particle { X = s.Cx + Rnd(-s.P.Width / 2, s.P.Width / 2), Y = s.Cy + Rnd(-8, 8), Vx = Math.Cos(a) * v, Vy = Math.Sin(a) * v * 0.5 - 20, Drag = 0.965, G = -10, Life = Rnd(1.8, 3.4), Size = Rnd(0.7, 1.8), Color = FoilColor() }; });
        s.Burst(26, _ => { var a = Rnd(0, 6.3); var v = Rnd(40, 160); return new ParticleLayer.Particle { X = s.Cx, Y = s.Cy, Vx = Math.Cos(a) * v, Vy = Math.Sin(a) * v * 0.5, Drag = 0.96, Life = Rnd(1.4, 2.4), Size = Rnd(3, 6), Shape = "star", Color = FoilColor() }; });
        await s.Sleep(1500);
        var outline = s.Add(new Rectangle { Width = s.P.Width, Height = s.P.Height, RadiusX = s.Radius.TopLeft, RadiusY = s.Radius.TopLeft, Stroke = Br("#e6d3ff", 0.4), StrokeThickness = 1, StrokeDashArray = [4, 3] }, s.P.X, s.P.Y, 20);
        s.FadeIn(outline, 900);
        var label = Text(Spaced("RETIRADO", 3), "Segoe UI", 11, Br("#f6f1ff", 0.55), FontWeights.SemiBold);
        s.AddCentered(label, s.Cx, s.Cy, 21);
        s.FadeIn(label, 900, 200);
    }

    private static async Task CelestialBack(Scene s)
    {
        // shooting stars come in from the corner and make Play again; a foil sheen passes
        var box = s.Play();
        box.Opacity = 0;
        for (var i = 0; i < 26; i++)
        {
            double tx = s.P.X + Rnd(10, s.P.Width - 10), ty = s.P.Y + Rnd(6, s.P.Height - 6);
            s.Burst(1, _ => new ParticleLayer.Particle { Sx = s.W + Rnd(0, 200), Sy = Rnd(-200, 80), Tx = tx, Ty = ty, Life = Rnd(0.7, 1.3), Size = 1.6, Color = FoilColor(), FadeIn = true });
        }
        s.Burst(90, _ => { double tx = s.P.X + Rnd(0, s.P.Width), ty = s.P.Y + Rnd(0, s.P.Height); return new ParticleLayer.Particle { Sx = tx + Rnd(-260, 260), Sy = ty + Rnd(-200, 80), Tx = tx, Ty = ty, Life = Rnd(1, 1.4), Size = Rnd(0.6, 1.6), Color = FoilColor(), FadeIn = true }; });
        await s.Sleep(1150);
        s.Anim(700, t => { box.Opacity = t; box.Light.Opacity = 0.8 * (1 - t); });
        var sheenBrush = new LinearGradientBrush { StartPoint = new Point(0, 0.3), EndPoint = new Point(1, 0.7) };
        sheenBrush.GradientStops.Add(new GradientStop(Colors.Transparent, 0.3)); sheenBrush.GradientStops.Add(new GradientStop(Color.FromArgb(215, 255, 255, 255), 0.5)); sheenBrush.GradientStops.Add(new GradientStop(Colors.Transparent, 0.7));
        var sheen = new Border { Width = s.P.Width, Height = s.P.Height, Background = sheenBrush };
        var holder = s.Add(new Border { Width = s.P.Width, Height = s.P.Height, CornerRadius = s.Radius, ClipToBounds = true, Child = sheen, Clip = new RectangleGeometry(new Rect(0, 0, s.P.Width, s.P.Height), s.Radius.TopLeft, s.Radius.TopLeft) }, s.P.X, s.P.Y, 20);
        var sx = Xf.Of(sheen);
        s.Anim(1100, t => sx.X = Lerp(-s.P.Width, s.P.Width, t), 300, Ease.InOut);
        await s.Sleep(1400);
        s.RestorePlay(); s.Remove(holder);
    }

    // ---- Oleaje: the bottom of a pool at night -----------------------------------------------------------------------------

    private static readonly Color Pale = C("#dcecff");

    private static Border GlassPill(string text) => new()
    {
        Background = Br("#060c1a", 0.72), BorderBrush = Br("#c8e1ff", 0.28), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(999), Padding = new Thickness(16, 6, 16, 6),
        Child = Text(Spaced(text), "Segoe UI Light, Segoe UI", 13, Br("#e8f0fb"))
    };

    private static Polyline Foam(double width, double amp = 5)
    {
        var line = new Polyline { Stroke = Br(Pale, 0.6), StrokeThickness = 1.4 };
        for (var x = -10.0; x <= width + 10; x += 12) line.Points.Add(new Point(x, amp * Math.Sin(x * 0.012) + amp * 0.5 * Math.Sin(x * 0.037)));
        return line;
    }

    private static async Task OleajeMaint(Scene s)
    {
        // low tide: a line of foam falls to Play and rocks there; a glass pill says why
        var box = s.Play();
        s.Anim(1400, t => { box.Dark.Opacity = 0.45 * t; box.Grey = 0.4 * t; box.Blur = 0.6 * t; });
        var foam = s.Add(Foam(s.W), 0, s.P.Y - 190, 20);
        var fx = Xf.Of(foam);
        s.Anim(1800, t => fx.Y = 214 * t, 0, Ease.Bezier(0.45, 0, 0.3, 1));
        s.Anim(3000, t => fx.X = -24 * Math.Sin(t * Math.PI), 1800, Ease.InOut, 0);
        await s.Sleep(1700);
        s.Wave(s.Cx, s.Cy);
        var until = s.Say.Clock(s.Say.Until);
        var pill = GlassPill(until.Length > 0 ? $"bajomar · en mantenimiento · vuelve {until}" : "bajomar · en mantenimiento");
        s.AddCentered(pill, s.Cx, s.P.Y - 28, 22);
        var px = Xf.Of(pill);
        s.Anim(800, t => { pill.Opacity = t; px.Y = 18 * (1 - t); });
        s.Anim(3200, t => px.R = -1.5 * Math.Cos(t * Math.Tau), 800, Ease.Linear, 0);
    }

    private static async Task OleajeSoon(Scene s)
    {
        // a glass pill floats in with the date and settles on the water, rippling it
        var box = s.Play();
        s.Anim(900, t => { box.Dark.Opacity = 0.5 * t; box.Grey = 0.4 * t; });
        var pill = GlassPill(s.Say.From is { } f ? $"llega {s.Say.Sentence(f)}" : "llega muy pronto");
        pill.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        var target = s.Cx - pill.DesiredSize.Width / 2;
        s.Add(pill, s.W + 20, s.P.Y - 46, 22);
        var px = Xf.Of(pill);
        s.Anim(2400, t => { Canvas.SetLeft(pill, KeysAt(t, (0, s.W + 20), (0.82, target - 7), (1, target))); px.R = KeysAt(t, (0, 5), (0.82, -2), (1, 0)); }, 0, Ease.Bezier(0.2, 0.7, 0.3, 1));
        for (var i = 0; i < 3; i++) { await s.Sleep(750); s.Wave(s.Cx - 20 + i * 20, s.P.Y - 30); }
    }

    /// <summary>Play sunk by <paramref name="depth"/> px below its own bottom edge (the part under the edge is cut away).</summary>
    private static void Sink(Scene s, PlayBox box, double depth)
    {
        box.T.Y = depth;
        box.Clip = new RectangleGeometry(new Rect(0, 0, s.P.Width, Math.Max(0, s.P.Height - depth)));
    }

    private static ParticleLayer.Particle Bubble(Scene s, double vy0, double vy1, double life0, double life1, double dy0, double dy1) => new()
    {
        X = s.Cx + Rnd(-s.P.Width / 2.4, s.P.Width / 2.4), Y = s.P.Bottom + Rnd(dy0, dy1), Vx = Rnd(-8, 8), Vy = Rnd(vy0, vy1), Drag = 1, G = -26,
        Life = Rnd(life0, life1), Size = Rnd(1.5, 4.5), Shape = "ring", Color = Color.FromArgb(217, 220, 236, 255)
    };

    private static async Task OleajeRetired(Scene s)
    {
        // Play sinks into the water through its own place, ripples spread, bubbles rise
        s.Wave(s.Cx, s.Cy);
        var box = s.Play();
        s.Anim(2000, t => { Sink(s, box, (s.P.Height + 6) * t); box.Blur = 3 * t; }, 0, Ease.Bezier(0.5, 0, 0.8, 0.6));
        await s.Sleep(400);
        s.Wave(s.Cx - 60, s.Cy); s.Wave(s.Cx + 70, s.Cy);
        s.Burst(55, _ => Bubble(s, -80, -34, 1.4, 2.8, -6, 10));
        await s.Sleep(1700);
        var w = Text(Spaced("retirado", 4), "Segoe UI Light, Segoe UI", 15, Br("#e8f0fb", 0.5));
        s.AddCentered(w, s.Cx, s.Cy, 21);
        s.FadeIn(w, 900);
    }

    private static async Task OleajeBack(Scene s)
    {
        // it comes back up out of the water, bubbles first, rippling the surface as it breaks through
        var box = s.Play();
        Sink(s, box, s.P.Height + 6);
        s.Burst(55, _ => Bubble(s, -120, -60, 0.9, 1.7, 0, 20));
        await s.Sleep(450);
        s.Anim(1300, t => { Sink(s, box, (s.P.Height + 6) * (1 - t)); box.Blur = 0; }, 0, Ease.Bezier(0.2, 0.8, 0.3, 1));
        await s.Sleep(1000);
        s.Wave(s.Cx, s.Cy); await s.Sleep(250); s.Wave(s.Cx - 90, s.Cy); s.Wave(s.Cx + 90, s.Cy);
        await s.Sleep(300);
        s.RestorePlay();
    }

    // ---- Térmico: a thermal camera (the state's words go into the camera's own readout, TermicoField.Note) ------------------------

    private sealed record Cam(Canvas El, TextBlock Temp);

    private static Cam CamBox(Scene s)
    {
        double w = s.P.Width + 28, h = s.P.Height + 24;
        var c = new Canvas { Width = w, Height = h };
        c.Children.Add(new Rectangle { Width = w, Height = h, Stroke = Br("#ffffff", 0.55), StrokeThickness = 1 });
        foreach (var (cx, cy, sx, sy) in new[] { (0.0, 0.0, 1, 1), (w, 0.0, -1, 1), (0.0, h, 1, -1), (w, h, -1, -1) })
            c.Children.Add(PathOf($"M{cx + sx * 14},{cy} L{cx},{cy} L{cx},{cy + sy * 14}", null, Br("#ffffff", 0.9), 2));
        var temp = Text("", "Cascadia Mono, Consolas", 13, Brushes.White, FontWeights.SemiBold);
        Canvas.SetLeft(temp, 4); Canvas.SetTop(temp, -20);
        c.Children.Add(temp);
        s.Add(c, s.P.X - 14, s.P.Y - 12, 22);
        var x = Xf.Of(c);
        s.Anim(360, t => { x.S = Lerp(1.25, 1, t); c.Opacity = t; }, 0, Ease.Bezier(0.2, 1.3, 0.4, 1));
        return new Cam(c, temp);
    }

    private static Task TermicoMaint(Scene s)
    {
        // it cools down: the box locks on Play, the reading falls, the heat drains to cold and frost grows
        Styles.TermicoField.Note = s.Say.Until is { } u ? $"MANTENIMIENTO {s.Say.Clock(u)}" : "MANTENIMIENTO";
        var cam = CamBox(s);
        var v = s.Instant ? 12.4 : 36.8;
        s.Every(60, () => { v = Math.Max(12.4, v - 0.5); cam.Temp.Text = $"{v:0.0}°"; });
        var box = s.Play();
        box.Tint.Background = Br("#3a7bd8");
        s.Anim(2200, t => { box.Tint.Opacity = 0.45 * t; box.Grey = 0.45 * t; box.Dark.Opacity = 0.15 * t; });
        var frost = new Grid { Width = s.P.Width, Height = s.P.Height, Opacity = 0 };
        foreach (var (ox, oy, r, a) in new[] { (0.0, 0.0, 0.34, 0.75), (1.0, 1.0, 0.36, 0.7), (1.0, 0.0, 0.22, 0.35) })
        {
            var g = new RadialGradientBrush { Center = new Point(ox, oy), GradientOrigin = new Point(ox, oy), RadiusX = r, RadiusY = r * 3.2 };
            g.GradientStops.Add(new GradientStop(C("#e1f2ff", a), 0)); g.GradientStops.Add(new GradientStop(Colors.Transparent, 1));
            frost.Children.Add(new Border { Background = g, CornerRadius = s.Radius });
        }
        s.Add(frost, s.P.X, s.P.Y, 21);
        s.Anim(2200, t => frost.Opacity = t, 500);
        return Task.CompletedTask;
    }

    private static Task TermicoSoon(Scene s)
    {
        // warming up: the box locks on, a strip of the camera's own scale fills toward the date
        Styles.TermicoField.Note = s.Say.From is { } f ? $"SALE EL {s.Say.Short(f)}" : "SALE PRONTO";
        var cam = CamBox(s);
        var box = s.Play();
        s.Anim(700, t => { box.Grey = 0.9 * t; box.Dark.Opacity = 0.6 * t; });
        var fill = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
        foreach (var (hex, at) in new[] { ("#020306", 0.0), ("#051a13", 0.22), ("#6b40e6", 0.42), ("#ff54a8", 0.58), ("#ff8f4d", 0.72), ("#ffd1a8", 0.86), ("#fff8eb", 1.0) }) fill.GradientStops.Add(new GradientStop(C(hex), at));
        var full = s.P.Width - 60;
        var inner = new Rectangle { Height = 6, Width = 0, Fill = fill, HorizontalAlignment = HorizontalAlignment.Left };
        var bar = new Border { Width = full, Height = 8, BorderBrush = Br("#ffffff", 0.55), BorderThickness = new Thickness(1), Child = inner };
        s.Add(bar, s.P.X + 30, s.Cy - 4, 22);
        s.Anim(2400, t => inner.Width = (full - 2) * 0.64 * t, 300, Ease.Bezier(0.3, 0.7, 0.4, 1));
        var v = s.Instant ? 29.6 : 18;
        s.Every(80, () => { v = Math.Min(29.6, v + 0.25); cam.Temp.Text = $"{v:0.0}°"; });
        return Task.CompletedTask;
    }

    private static async Task TermicoRetired(Scene s)
    {
        // it burns out: white hot, a hot ring through the picture, embers rise, it chars; the reading goes blank
        Styles.TermicoField.Note = "RETIRADO";
        var cam = CamBox(s);
        var v = s.Instant ? 99.9 : 36.8;
        s.Every(50, () => { v = Math.Min(99.9, v + 3.1); cam.Temp.Text = v >= 99.9 ? "--.-°" : $"{v:0.0}°"; });
        s.Wave(s.Cx, s.Cy);
        var box = s.Play();
        s.Anim(1900, t => { box.Light.Opacity = KeysAt(t, (0, 0), (0.35, 0.7), (1, 0)); box.Dark.Opacity = KeysAt(t, (0, 0), (0.35, 0), (1, 0.86)); box.Grey = KeysAt(t, (0, 0), (0.35, 0.7), (1, 1)); });
        await s.Sleep(650);
        string[] embers = ["#ff8a3d", "#ff4f9a", "#fff3e0"];
        s.Burst(90, _ => new ParticleLayer.Particle { X = Rnd(s.P.X, s.P.Right), Y = Rnd(s.P.Y, s.P.Bottom), Vx = Rnd(-18, 18), Vy = Rnd(-110, -30), G = -18, Life = Rnd(1.2, 2.6), Size = Rnd(1, 2.3), Shape = "glow", Color = C(Pick(embers)) });
        double w = s.P.Width, h = s.P.Height;
        var crack = PathOf($"M{w * 0.07},{h * 0.58} L{w * 0.27},{h * 0.35} L{w * 0.44},{h * 0.65} L{w * 0.63},{h * 0.27} L{w * 0.79},{h * 0.6} L{w * 0.94},{h * 0.38}", null, Br("#ff8a3d"), 2);
        crack.Effect = new DropShadowEffect { Color = C("#ff4f9a"), BlurRadius = 10, ShadowDepth = 0, Opacity = 1 };
        s.Add(crack, s.P.X, s.P.Y, 21);
        s.Anim(2600, t => crack.Opacity = Lerp(1, 0.25, t), 300);
    }

    private static async Task TermicoBack(Scene s)
    {
        // it heats up again: a hot ring from the middle, the reading climbs, the gradient comes back
        Styles.TermicoField.Note = "OTRA VEZ DISPONIBLE";
        var box = s.Play();
        box.Dark.Opacity = 0.86; box.Grey = 1;
        var cam = CamBox(s);
        var v = 14.0;
        s.Every(60, () => { v = Math.Min(36.8, v + 0.6); cam.Temp.Text = $"{v:0.0}°"; });
        await s.Sleep(300);
        s.Wave(s.Cx, s.Cy);
        s.Anim(1500, t => { box.Dark.Opacity = KeysAt(t, (0, 0.86), (0.6, 0), (1, 0)); box.Grey = KeysAt(t, (0, 1), (0.6, 0), (1, 0)); box.Light.Opacity = KeysAt(t, (0, 0), (0.6, 0.5), (1, 0)); });
        s.Burst(40, _ => new ParticleLayer.Particle { X = Rnd(s.P.X, s.P.Right), Y = s.P.Bottom, Vx = Rnd(-10, 10), Vy = Rnd(-80, -40), G = -10, Life = Rnd(0.8, 1.4), Size = Rnd(1, 2), Shape = "glow", Color = C("#ff8a3d") });
        await s.Sleep(2200);
        s.FadeOut(cam.El, 500);
        await s.Sleep(500);
        Styles.TermicoField.Note = null;
        s.RestorePlay();
    }

    // ---- Core: fine light lines with a red and a cyan fringe, notes pinned with leader lines -----------------------------------

    private static readonly Color Light = C("#f1ede0");

    /// <summary>An ellipse drawn three times: a red and a cyan copy a pixel to each side, and the light one.</summary>
    private static Canvas FringeEllipse(double w, double h, double cx, double cy, double rx, double ry)
    {
        var c = new Canvas { Width = w, Height = h };
        foreach (var (dx, color) in new[] { (-1.2, Color.FromArgb(89, 255, 70, 60)), (1.2, Color.FromArgb(89, 60, 200, 255)), (0.0, Light) })
        {
            var e = new Ellipse { Width = rx * 2, Height = ry * 2, Stroke = new SolidColorBrush(color), StrokeThickness = 1 };
            Canvas.SetLeft(e, cx - rx + dx); Canvas.SetTop(e, cy - ry);
            c.Children.Add(e);
        }
        return c;
    }

    private static TextBlock Callout(Scene s, string key, string value, double lx, double ly, double ex, double ey)
    {
        var line = s.Add(new Line { X1 = lx, Y1 = ly, X2 = ex, Y2 = ey, Stroke = Br(Light, 0.45), StrokeThickness = 1 }, 0, 0, 23);
        var dot = s.Add(new Ellipse { Width = 5, Height = 5, Fill = new SolidColorBrush(s.Accent) }, ex - 2.5, ey - 2.5, 23);
        var v = new TextBlock { Text = value, FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 11, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(s.Accent), HorizontalAlignment = HorizontalAlignment.Right };
        var note = new StackPanel { Children = { new TextBlock { Text = key, FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 11, Foreground = Br(Light, 0.75), HorizontalAlignment = HorizontalAlignment.Right }, v } };
        note.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        s.Add(note, lx - 4 - Math.Max(90, note.DesiredSize.Width), ly - 36, 23);
        note.MinWidth = Math.Max(90, note.DesiredSize.Width);
        foreach (var el in new UIElement[] { line, dot, note }) s.FadeIn(el, 500);
        return v;
    }

    private static List<Canvas> CoreRings(Scene s, int n, Func<int, (double Rx, double Ry)> size)
    {
        double w = s.P.Width + 40, h = 92, cx = s.P.Width / 2 + 20, cy = 46;
        var rings = new List<Canvas>();
        for (var i = 0; i < n; i++)
        {
            var (rx, ry) = size(i);
            var ring = FringeEllipse(w, h, cx, cy, rx, ry);
            s.Add(ring, s.P.X - 20, s.P.Y - 20, 20);
            rings.Add(ring);
        }
        return rings;
    }

    private static async Task CoreMaint(Scene s)
    {
        // calibrating: three wire rings close round Play and keep turning; a note pinned to it counts down
        var box = s.Play();
        s.Anim(700, t => box.Opacity = Lerp(1, 0.35, t));
        var rings = CoreRings(s, 3, i => (s.P.Width / 2 + 14 + i * 12, 36 + i * 7));
        for (var i = 0; i < rings.Count; i++)
        {
            var ring = rings[i]; var x = Xf.Of(ring); var k = i;
            ring.Opacity = 0;
            s.Anim(900, t => ring.Opacity = t, k * 160);
            s.Anim(5200 + k * 1300, t => { var c = (1 - Math.Cos(t * Math.Tau)) / 2; x.R = Lerp(-6 + k * 4, 6 - k * 4, c); x.Scale.ScaleY = Lerp(1, 0.35, c); }, 900, Ease.Linear, 0);
        }
        await s.Sleep(800);
        var v = Callout(s, "MANTENIMIENTO", "", s.P.X - 40, s.P.Y - 34, s.P.X + 18, s.P.Y + 6);
        s.Every(1000, () => v.Text = s.Say.Until is { } u ? AccessWords.Countdown(AccessWords.SecondsTo(u)) : "SIN HORA");
    }

    private static async Task CoreSoon(Scene s)
    {
        // Play drawn as a wireframe, edge by edge, with its crosshair; the note gives the date
        s.HidePlay();
        double w = s.P.Width, h = s.P.Height;
        var wire = new Canvas { Width = w, Height = h };
        var rects = new List<Rectangle>();
        foreach (var (dx, color) in new[] { (-1.2, Color.FromArgb(89, 255, 70, 60)), (1.2, Color.FromArgb(89, 60, 200, 255)), (0.0, Light) })
        {
            var r = new Rectangle { Width = w - 2, Height = h - 2, Stroke = new SolidColorBrush(color), StrokeThickness = 1 };
            Canvas.SetLeft(r, 1 + dx); Canvas.SetTop(r, 1);
            wire.Children.Add(r); rects.Add(r);
        }
        foreach (var (x1, y1, x2, y2) in new[] { (w / 2, -16.0, w / 2, h + 16), (-16.0, h / 2, w + 16, h / 2) })
            wire.Children.Add(new Line { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Stroke = new SolidColorBrush(s.Accent), StrokeThickness = 1, StrokeDashArray = [3, 3], Opacity = 0.7 });
        s.Add(wire, s.P.X, s.P.Y, 20);
        var geo = new RectangleGeometry(new Rect(0, 0, w - 2, h - 2));
        foreach (var r in rects) s.DrawOn(r, geo, 1700);
        await s.Sleep(900);
        Callout(s, "SALE", s.Say.From is { } f ? $"{f:dd.MM} · {f:HH:mm}" : "PRONTO", s.P.X - 40, s.P.Y - 34, s.P.X + 4, s.P.Y + 4);
        var label = Text(Spaced("JUGAR", 4), "Cascadia Mono, Consolas", 14, Br(Light, 0.35), FontWeights.SemiBold);
        s.AddCentered(label, s.Cx, s.Cy, 21);
        s.FadeIn(label, 800, 700);
    }

    private static async Task CoreRetired(Scene s)
    {
        // implosion: Play comes apart into rings that turn inward to one point, which stays lit
        s.HidePlay();
        var rings = CoreRings(s, 9, i => (s.P.Width / 2 - i * 6, 26 - i));
        for (var i = 0; i < rings.Count; i++)
        {
            var x = Xf.Of(rings[i]); var k = i;
            s.Anim(1900, t => { x.R = (220 + k * 30) * t; x.S = Lerp(1, 0.015, t); }, k * 70, Ease.Bezier(0.6, 0, 0.4, 1));
        }
        await s.Sleep(2000);
        foreach (var r in rings) s.Remove(r);
        var dot = s.Add(new Ellipse { Width = 6, Height = 6, Fill = new SolidColorBrush(s.Accent), Effect = new DropShadowEffect { Color = s.Accent, BlurRadius = 14, ShadowDepth = 0 } }, s.Cx - 3, s.Cy - 3, 21);
        var dx = Xf.Of(dot);
        s.Anim(1200, t => { dx.S = Lerp(2, 1, t); dot.Opacity = Lerp(1, 0.7, t); });
        Callout(s, "RETIRADO", "sin señal", s.P.X - 40, s.P.Y - 34, s.Cx - 4, s.Cy - 2);
    }

    private static async Task CoreBack(Scene s)
    {
        // the rings open out of the point and settle into Play's outline, and Play is there again
        s.HidePlay();
        var rings = CoreRings(s, 9, i => (s.P.Width / 2 - i * 6, 26 - i));
        for (var i = 0; i < rings.Count; i++)
        {
            var x = Xf.Of(rings[i]); var k = i;
            s.Anim(1700, t => { x.R = (-220 - k * 30) * (1 - t); x.S = Lerp(0.015, 1, t); }, k * 60, Ease.Bezier(0.2, 0.8, 0.3, 1));
        }
        await s.Sleep(1600);
        foreach (var r in rings) s.FadeOut(r, 700);
        var box = s.Play(); box.Visibility = Visibility.Visible; box.Opacity = 0;
        s.Anim(700, t => box.Opacity = t);
        await s.Sleep(750);
        s.RestorePlay();
    }

    // ---- Shell: a terminal ----------------------------------------------------------------------------------------------------

    private static readonly Color ShellInk = C("#d9d4c7"), ShellDim = C("#77736a"), ShellBg = C("#1b1916");

    private static TextBlock ShellPanel(Scene s, string title, double y)
    {
        var head = new DockPanel { Margin = new Thickness(8, 3, 8, 3) };
        var dot = new TextBlock { Text = "●", Foreground = new SolidColorBrush(s.Accent), FontSize = 10 };
        DockPanel.SetDock(dot, Dock.Right);
        head.Children.Add(dot);
        head.Children.Add(new TextBlock { Text = Spaced(title), FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 10, Foreground = new SolidColorBrush(ShellDim) });
        var pre = new TextBlock { FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 11, LineHeight = 17, Foreground = new SolidColorBrush(ShellInk), Margin = new Thickness(8, 6, 8, 6), TextWrapping = TextWrapping.NoWrap };
        var panel = new Border
        {
            Width = s.P.Width, Background = new SolidColorBrush(Color.FromArgb(240, 13, 12, 11)), BorderBrush = new SolidColorBrush(Color.FromArgb(77, 217, 212, 199)), BorderThickness = new Thickness(1),
            Child = new StackPanel { Children = { new Border { BorderBrush = new SolidColorBrush(Color.FromArgb(51, 217, 212, 199)), BorderThickness = new Thickness(0, 0, 0, 1), Child = head }, pre } }
        };
        s.Add(panel, s.P.X, y, 22);
        s.FadeIn(panel, 200);
        return pre;
    }

    private static async Task Type(Scene s, TextBlock pre, IEnumerable<string> lines, double speed = 18)
    {
        foreach (var line in lines)
        {
            if (s.Instant) pre.Text += line;
            else foreach (var ch in line) { pre.Text += ch; await s.Sleep(speed); }
            pre.Text += "\n";
            await s.Sleep(160);
        }
        pre.Text = pre.Text.TrimEnd('\n');
    }

    private static TextBlock ShellFace(Scene s, string text, Color bg, Color ink, Color edge)
    {
        var t = FaceText(text, Display, 17, new SolidColorBrush(ink), FontWeights.Black);
        s.Face(new SolidColorBrush(bg), new SolidColorBrush(edge), 1, new CornerRadius(4), t);
        return t;
    }

    private static async Task ShellMaint(Scene s)
    {
        var pre = ShellPanel(s, "PROCESO", s.P.Y - 104);
        await Type(s, pre, [$"$ systemctl stop empi@{s.Say.PackId}", "[ OK ] detenido: mantenimiento", s.Say.Until is { } u ? $"vuelve {s.Say.Sentence(u)}" : "vuelve pronto"]);
        var face = ShellFace(s, "", ShellBg, s.Accent, s.Accent);
        s.Every(1000, () => face.Text = s.Say.Until is { } until ? $"MANT {AccessWords.Countdown(AccessWords.SecondsTo(until))}" : "MANTENIMIENTO");
    }

    private static async Task ShellSoon(Scene s)
    {
        var pre = ShellPanel(s, "CRON", s.P.Y - 104);
        var cron = s.Say.From is { } f ? $"{f.Minute} {f.Hour} {f.Day} {f.Month} *" : "* * * * *";
        await Type(s, pre, ["$ crontab -l", $"{cron}  empi abrir {s.Say.PackId}", "[ .. ] en cola"]);
        var face = ShellFace(s, "", ShellBg, s.Accent, s.Accent);
        var date = s.Say.From is { } d ? $"{d.Day}-{s.Say.Short(d).Split(' ')[^1]}" : "PRONTO";
        var on = true;
        s.Every(520, () => { face.Text = $"EN COLA {date}{(on ? "_" : " ")}"; on = !on; });
    }

    private static async Task ShellRetired(Scene s)
    {
        // it crashes: the label corrupts, is deleted character by character, the process exits
        var face = ShellFace(s, "JUGAR_", s.Accent, C("#140905"), s.Accent);
        var border = (Border)face.Parent;
        const string glitch = "░▒▓█<>/\\#%$";
        for (var i = 0; i < 9 && !s.Instant; i++)
        {
            face.Text = new string("JUGAR_".Select(c => Scene.Rng.NextDouble() < 0.5 ? glitch[Scene.Rng.Next(glitch.Length)] : c).ToArray());
            Xf.Of(face).X = Rnd(-3, 3);
            await s.Sleep(70);
        }
        Xf.Of(face).X = 0;
        border.Background = new SolidColorBrush(ShellBg); face.Foreground = new SolidColorBrush(s.Accent);
        const string crash = "SEGFAULT (CORE DUMPED)";
        if (!s.Instant)
        {
            face.Text = crash; await s.Sleep(700);
            for (var i = crash.Length; i >= 0; i--) { face.Text = crash[..i] + "█"; await s.Sleep(28); }
        }
        face.Foreground = new SolidColorBrush(ShellDim); border.BorderBrush = Br("#3d3934"); face.Text = "EXIT 137";
        var pre = ShellPanel(s, "LOG", s.P.Y - 82);
        await Type(s, pre, [$"[FAIL] {s.Say.PackId}: retirado", "       ya no se puede jugar"], 12);
    }

    private static async Task ShellBack(Scene s)
    {
        var face = ShellFace(s, "EXIT 137", ShellBg, ShellDim, C("#3d3934"));
        await s.Sleep(400);
        var pre = ShellPanel(s, "BUILD", s.P.Y - 82);
        for (var i = 0; i <= 16; i++)
        {
            pre.Text = $"$ empi abrir {s.Say.PackId}\n[{new string('█', i)}{new string('·', 16 - i)}] {Math.Round(i / 16.0 * 100)}%";
            face.Text = $"{Math.Round(i / 16.0 * 100)}%"; face.Foreground = new SolidColorBrush(ShellInk);
            await s.Sleep(90);
        }
        s.Remove((UIElement)face.Parent);
        var box = s.Play(); box.Visibility = Visibility.Visible;
        s.Anim(450, t => box.Light.Opacity = 0.6 * (1 - t));
        pre.Text += "\n[ OK ] listo";
        await s.Sleep(1200);
        s.RestorePlay();
    }

    // ---- Minimal: dark, clean, calm ---------------------------------------------------------------------------------------------

    private static readonly Color MinDark = C("#0c0c0d"), MinPanel = C("#141416"), MinEdge = C("#3f3f46"), MinMuted = C("#a1a1aa");

    private sealed record MinFace(Border Box, TextBlock Text);

    private static MinFace MinimalFace(Scene s, Color bg, Color ink, string text, Color? edge = null)
    {
        var t = FaceText(text, new FontFamily("Segoe UI"), 16, new SolidColorBrush(ink), FontWeights.SemiBold);
        var b = s.Face(new SolidColorBrush(bg), edge is { } e ? new SolidColorBrush(e) : null, edge != null ? 1 : 0, new CornerRadius(12), t);
        return new MinFace(b, t);
    }

    private static void MinimalDrain(Scene s, MinFace f, double ms, Color toBg, Color toInk, Color toEdge)
    {
        var bg = (SolidColorBrush)f.Box.Background; var ink = (SolidColorBrush)f.Text.Foreground;
        var edge = new SolidColorBrush(Colors.Transparent); f.Box.BorderBrush = edge; f.Box.BorderThickness = new Thickness(1);
        var bg0 = bg.Color; var ink0 = ink.Color;
        s.Anim(ms, t => { bg.Color = Mix(bg0, toBg, t); ink.Color = Mix(ink0, toInk, t); edge.Color = Mix(Colors.Transparent, toEdge, t); });
    }

    private static async Task MinimalMaint(Scene s)
    {
        // quiet: the colour drains out of Play to an outline, a thin ring turns, and the time says it plainly
        var f = MinimalFace(s, s.Accent, MinDark, "Jugar");
        MinimalDrain(s, f, 800, MinPanel, MinMuted, MinEdge);
        await s.Sleep(500);
        var spin = new Grid { Width = 16, Height = 16, Margin = new Thickness(0, 0, 10, 0) };
        spin.Children.Add(new Ellipse { Stroke = new SolidColorBrush(MinEdge), StrokeThickness = 2 });
        spin.Children.Add(new Path { Data = Geo("M8,1 A7,7 0 0 1 15,8"), Stroke = new SolidColorBrush(s.Accent), StrokeThickness = 2, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round });
        var sx = Xf.Of(spin);
        s.Anim(1500, t => sx.R = 360 * t, 0, Ease.Linear, 0);
        var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        row.Children.Add(spin);
        row.Children.Add(new TextBlock { Text = s.Say.Until is { } u ? $"En pausa · vuelve {s.Say.Sentence(u)}" : "En pausa · vuelve pronto", FontFamily = new FontFamily("Segoe UI"), FontSize = 15, FontWeight = FontWeights.SemiBold, Foreground = new SolidColorBrush(MinMuted), VerticalAlignment = VerticalAlignment.Center });
        f.Box.Child = row;
    }

    private static async Task MinimalSoon(Scene s)
    {
        // a countdown, big and calm
        var f = MinimalFace(s, s.Accent, MinDark, "Jugar");
        MinimalDrain(s, f, 700, MinPanel, C("#f4f4f5"), MinEdge);
        await s.Sleep(400);
        var line = new TextBlock { FontFamily = new FontFamily("Segoe UI"), FontSize = 21, FontWeight = FontWeights.SemiBold, Foreground = Br("#f4f4f5"), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        Typography.SetNumeralAlignment(line, FontNumeralAlignment.Tabular);
        f.Box.Child = line;
        void Unit(string n, string u) { line.Inlines.Add(new Run(n)); line.Inlines.Add(new Run(u) { FontSize = 12, Foreground = Br("#71717a") }); line.Inlines.Add(new Run(" ") { FontSize = 12 }); }
        s.Every(1000, () =>
        {
            var left = AccessWords.SecondsTo(s.Say.From);
            line.Inlines.Clear();
            if (s.Say.From == null) { line.Inlines.Add(new Run("Muy pronto")); return; }
            Unit($"{left / 86400}", "d"); Unit($"{left % 86400 / 3600}", "h"); Unit($"{left % 3600 / 60}", "m"); Unit($"{left % 60:00}", "s");
        });
    }

    private static async Task MinimalRetired(Scene s)
    {
        // archived: a line strikes the word, the button empties to a hairline and says so
        var f = MinimalFace(s, s.Accent, MinDark, "Jugar");
        var strike = s.Add(new Rectangle { Height = 2, Width = 0, Fill = new SolidColorBrush(MinDark) }, s.Cx - 34, s.Cy, 13);
        s.Anim(450, t => strike.Width = 68 * t, 0, Ease.Bezier(0.6, 0, 0.3, 1));
        await s.Sleep(650);
        s.Remove(strike);
        MinimalDrain(s, f, 800, Colors.Transparent, C("#52525b"), C("#27272a"));
        f.Text.Inlines.Clear();
        f.Text.Inlines.Add(new Run("Jugar") { TextDecorations = TextDecorations.Strikethrough });
        f.Text.Inlines.Add(new Run("  ·  Archivado"));
    }

    private static async Task MinimalBack(Scene s)
    {
        var f = MinimalFace(s, Colors.Transparent, C("#52525b"), "", C("#27272a"));
        f.Text.Inlines.Add(new Run("Jugar") { TextDecorations = TextDecorations.Strikethrough });
        f.Text.Inlines.Add(new Run("  ·  Archivado"));
        await s.Sleep(450);
        f.Text.Text = "Jugar";
        var fill = MinimalFace(s, s.Accent, MinDark, "Jugar");
        var clip = new RectangleGeometry(new Rect(0, 0, 0, s.P.Height), 12, 12);
        fill.Box.Clip = clip;
        s.Anim(900, t => clip.Rect = new Rect(0, 0, s.P.Width * t, s.P.Height), 0, Ease.Bezier(0.6, 0, 0.3, 1));
        await s.Sleep(950);
        s.Remove(f.Box); s.Remove(fill.Box);
        s.RestorePlay();
    }

    // ---- Remember: a child's crayon drawing -------------------------------------------------------------------------------------

    private static readonly Color Ink = C("#2b2620");
    private const string Hand = "Ink Free, Segoe Print, Comic Sans MS";

    private static DrawingBrush Hatch(Color color)
    {
        var g = new DrawingGroup();
        g.Children.Add(new GeometryDrawing(new SolidColorBrush(Color.FromArgb(140, color.R, color.G, color.B)), null, new RectangleGeometry(new Rect(0, 0, 7, 7))));
        g.Children.Add(new GeometryDrawing(null, new Pen(new SolidColorBrush(color), 4), new LineGeometry(new Point(0, 0), new Point(0, 7))));
        return new DrawingBrush(g) { TileMode = TileMode.Tile, Viewport = new Rect(0, 0, 7, 7), ViewportUnits = BrushMappingMode.Absolute, Transform = new RotateTransform(-55) };
    }

    private static TextBlock HandText(string text, double size, Color ink, bool bold = false) => Text(text, Hand, size, new SolidColorBrush(ink), bold ? FontWeights.Bold : FontWeights.Normal);

    private static async Task RememberMaint(Scene s)
    {
        // a sign drawn in crayon and taped over Play: closed for works, with a traffic cone
        var c = new Canvas { Width = 380, Height = 100 };
        var sign = PathOf("M18,22 L362,14 L366,84 L14,88 Z", Hatch(C("#f2c94c")), new SolidColorBrush(Ink), 2.5);
        c.Children.Add(sign);
        var cone = new Canvas { Opacity = 0 };
        cone.Children.Add(PathOf("M40,80 L55,34 L70,80 Z", Br("#f07a3a"), new SolidColorBrush(Ink), 2));
        cone.Children.Add(PathOf("M45,66 L65,66 M49,52 L61,52", null, Br("#fffaf0"), 4));
        cone.Children.Add(new Path { Data = Geo("M34,82 L76,82"), Stroke = new SolidColorBrush(Ink), StrokeThickness = 3, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round });
        c.Children.Add(cone);
        var title = HandText("cerrado por obras", 25, Ink, true); title.Opacity = 0;
        var when = s.Say.Until is { } u ? $"vuelve {(u.Date == DateTime.Now.Date ? "hoy" : u.Date == DateTime.Now.Date.AddDays(1) ? "mañana" : s.Say.DayInWords(u))} a las {(u.Hour % 12 == 0 ? 12 : u.Hour % 12)}{(u.Minute > 0 ? " y pico" : "")}" : "vuelve pronto";
        var sub = HandText(when, 15, C("#5a4a3a")); sub.Opacity = 0;
        foreach (var (t, y) in new[] { (title, 50.0), (sub, 72.0) }) { t.Measure(new Size(999, 999)); Canvas.SetLeft(t, 205 - t.DesiredSize.Width / 2); Canvas.SetTop(t, y - t.DesiredSize.Height * 0.78); c.Children.Add(t); }
        var tape = new Rectangle { Width = 80, Height = 18, Fill = new SolidColorBrush(Color.FromArgb(217, 235, 225, 190)), Opacity = 0, RenderTransform = new RotateTransform(-4, 40, 9) };
        Canvas.SetLeft(tape, 160); Canvas.SetTop(tape, 4);
        c.Children.Add(tape);
        s.Add(c, s.P.X - 20, s.P.Y - 26, 20);
        s.DrawOn(sign, sign.Data, 1000);
        await s.Sleep(600);
        var i = 0;
        foreach (UIElement el in new UIElement[] { cone, title, sub, tape }) s.FadeIn(el, 300, i++ * 260);
        s.Every(166, () => sign.RenderTransform = new TranslateTransform(Rnd(-0.6, 0.6), Rnd(-0.6, 0.6)));
    }

    private static Task RememberSoon(Scene s)
    {
        // a calendar page drawn by a child, the day circled in red crayon
        var c = new Canvas { Width = 380, Height = 100 };
        c.Children.Add(PathOf("M20,12 L360,16 L356,86 L24,82 Z", Br("#fffaf0"), new SolidColorBrush(Ink), 2.5));
        var month = HandText($"{(s.Say.From is { } m ? s.Say.Month(m) : "pronto")} · ¡sale pronto!", 15, C("#5a4a3a"));
        month.Measure(new Size(999, 999)); Canvas.SetLeft(month, 190 - month.DesiredSize.Width / 2); Canvas.SetTop(month, 32 - month.DesiredSize.Height * 0.78);
        c.Children.Add(month);
        var day = s.Say.From?.Day ?? 12;
        var first = s.Say.From is { } f ? f.AddDays(-3) : DateTimeOffset.Now;
        for (var i = 0; i < 7; i++)
        {
            var n = HandText($"{(s.Say.From != null ? first.AddDays(i).Day : day - 3 + i)}", 22, Ink);
            n.Measure(new Size(999, 999)); Canvas.SetLeft(n, 54 + i * 44); Canvas.SetTop(n, 66 - n.DesiredSize.Height * 0.78);
            c.Children.Add(n);
        }
        var circle = new Path { Data = Geo("M170,50 C200,38 216,60 200,76 C184,88 160,76 166,58 C170,48 190,44 204,52"), Stroke = new SolidColorBrush(s.Accent), StrokeThickness = 3.5, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
        c.Children.Add(circle);
        s.Add(c, s.P.X - 20, s.P.Y - 30, 20);
        var x = Xf.Of(c);
        s.Anim(500, t => { c.Opacity = t; x.R = Lerp(-3, 1, t); });
        s.DrawOn(circle, circle.Data, 800, 700, Ease.InOut);
        return Task.CompletedTask;
    }

    private static async Task RememberRetired(Scene s)
    {
        // rubbed out: an eraser goes back and forth over Play, crumbs fall, only a ghost stays
        var rubber = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 0) };
        rubber.GradientStops.Add(new GradientStop(C("#f2a6b0"), 0.6)); rubber.GradientStops.Add(new GradientStop(C("#3d6fd1"), 0.6));
        var eraser = s.Add(new Border { Width = 52, Height = 26, Background = rubber, BorderBrush = new SolidColorBrush(Ink), BorderThickness = new Thickness(2), CornerRadius = new CornerRadius(4), RenderTransform = new RotateTransform(-18, 26, 13) }, s.P.X, s.Cy - 13, 22);
        s.Anim(1900, t => Canvas.SetLeft(eraser, Keys(t, s.P.X + 10, s.P.Right - 60, s.P.X + 30, s.P.Right - 90, s.P.X + 60, s.P.Right - 50)), 0, Ease.InOut);
        var box = s.Play();
        s.Anim(1900, t => { box.Opacity = Lerp(1, 0.12, t); box.Blur = t; });
        for (var i = 0; i < 6; i++)
        {
            await s.Sleep(290);
            s.Burst(8, _ => new ParticleLayer.Particle { X = Rnd(s.P.X, s.P.Right), Y = s.Cy + 12, Vx = Rnd(-30, 30), Vy = Rnd(-40, 0), G = 520, Life = 1.2, Size = Rnd(1.6, 3.2), Shape = "square", Rot = Rnd(0, 3), Vr = Rnd(-4, 4), Color = C("#f2a6b0") });
        }
        await s.Sleep(200);
        s.FadeOut(eraser, 300);
        var gone = HandText("ya no está…", 19, C("#6f6457"), true);
        gone.RenderTransform = new RotateTransform(-4);
        s.AddCentered(gone, s.Cx, s.Cy, 21);
        s.FadeIn(gone, 500);
    }

    private static async Task RememberBack(Scene s)
    {
        // coloured in again, with big crayon zigzags
        var box = s.Play();
        box.Opacity = 0.12; box.Blur = 1;
        await s.Sleep(300);
        var w = s.P.Width; var h = s.P.Height;
        var zig = string.Join(" ", Enumerable.Range(0, 24).Select(i => $"{(i == 0 ? "M" : "L")}{6 + i * (w - 12) / 23:0.#},{(i % 2 == 1 ? h - 4 : 4)}"));
        var crayon = new Path { Data = Geo(zig), Stroke = new SolidColorBrush(s.Accent), StrokeThickness = 16, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, StrokeLineJoin = PenLineJoin.Round };
        s.Add(crayon, s.P.X, s.P.Y, 20);
        s.DrawOn(crayon, crayon.Data, 1300);
        await s.Sleep(1200);
        s.Anim(300, t => { box.Opacity = Lerp(0.12, 1, t); box.Blur = 1 - t; });
        s.FadeOut(crayon, 400);
        await s.Sleep(450);
        s.RestorePlay();
    }

    // ---- Punk: a photocopied zine ---------------------------------------------------------------------------------------------

    private static readonly Color PkInk = C("#141214"), PkPaper = C("#f1ece2");

    private static WrapPanel Ransom(Scene s, string word, double size, int seed)
    {
        var rng = new Random(seed);
        string[] fonts = ["Impact", "Georgia", "Courier New", "Arial Black", "Ink Free", "Times New Roman", "Segoe UI Black"];
        (Color Bg, Color Fg)[] fills = [(PkPaper, PkInk), (PkInk, Colors.White), (s.Accent, PkInk), (Colors.White, PkInk), (C("#d8d2c4"), PkInk)];
        var row = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var ch in word)
        {
            if (ch == ' ') { row.Children.Add(new Border { Width = 12 }); continue; }
            var (bg, fg) = fills[rng.Next(fills.Length)];
            row.Children.Add(new Border
            {
                Background = new SolidColorBrush(bg), Padding = new Thickness(5, 0, 5, 0), Margin = new Thickness(1, 0, 1, 0),
                BorderBrush = bg == s.Accent ? new SolidColorBrush(PkInk) : null, BorderThickness = new Thickness(bg == s.Accent ? 1.5 : 0),
                RenderTransform = new RotateTransform(rng.NextDouble() * 14 - 7), RenderTransformOrigin = new Point(0.5, 0.5),
                Effect = new DropShadowEffect { ShadowDepth = 3, Direction = 315, BlurRadius = 0, Opacity = 0.35 },
                Child = new TextBlock { Text = ch.ToString(), FontFamily = new FontFamily(fonts[rng.Next(fonts.Length)]), FontSize = size * (0.85 + rng.NextDouble() * 0.4), FontWeight = rng.Next(2) == 0 ? FontWeights.Normal : FontWeights.Bold, Foreground = new SolidColorBrush(fg) }
            });
        }
        return row;
    }

    private static Border Tape(Scene s, double w, double h, double rot, byte alpha = 204)
        => new() { Width = w, Height = h, Background = new SolidColorBrush(Color.FromArgb(alpha, 220, 215, 200)), RenderTransform = new RotateTransform(rot), RenderTransformOrigin = new Point(0.5, 0.5) };

    private static async Task PunkMaint(Scene s)
    {
        // caution tape slapped across Play, twice, and a strip saying when
        void Strip(double rot, double dy)
        {
            var stripes = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(24, 24), MappingMode = BrushMappingMode.Absolute, SpreadMethod = GradientSpreadMethod.Repeat };
            foreach (var (c, at) in new[] { ("#f5c518", 0.0), ("#f5c518", 0.58), ("#141214", 0.58), ("#141214", 0.82), ("#f5c518", 0.82), ("#f5c518", 1.0) }) stripes.GradientStops.Add(new GradientStop(C(c), at));
            var label = new TextBlock { Text = string.Concat(Enumerable.Repeat("EN OBRAS · ", 8)), FontFamily = new FontFamily("Impact"), FontSize = 13, Foreground = new SolidColorBrush(PkInk), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 0) };
            var tape = new Border { Width = s.P.Width + 60, Height = 22, Background = stripes, ClipToBounds = true, Child = label, Effect = new DropShadowEffect { ShadowDepth = 3, Direction = 300, BlurRadius = 0, Opacity = 0.25 } };
            s.Add(tape, s.P.X - 30, s.Cy - 11 + dy, 22);
            var x = Xf.Of(tape);
            x.R = rot;
            s.Anim(150, t => { x.S = Lerp(1.3, 1, t); tape.Opacity = t; }, 0, Ease.Bezier(0.3, 1.6, 0.5, 1));
        }
        s.Play().Grey = 0.3;
        Strip(-6, -6); await s.Sleep(240); Strip(5, 8);
        await s.Sleep(320);
        var when = s.Say.Until is { } u ? $"VUELVE {s.Say.Sentence(u).ToUpperInvariant()}" : "VUELVE PRONTO";
        var note = new Border { Background = new SolidColorBrush(PkInk), Padding = new Thickness(7, 2, 7, 2), Child = new TextBlock { Text = when, FontFamily = new FontFamily("Courier New"), FontSize = 12, FontWeight = FontWeights.Bold, Foreground = Brushes.White } };
        note.Measure(new Size(999, 999));
        s.Add(note, s.P.Right - note.DesiredSize.Width - 10, s.P.Y - 22, 23);
        var nx = Xf.Of(note); nx.R = -3;
        s.Anim(140, t => { note.Opacity = t; nx.S = Lerp(1.3, 1, t); });
    }

    private static async Task PunkSoon(Scene s)
    {
        // a gig poster made of ransom letters, wheat-pasted over Play, with the date typed on it
        var body = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
        var letters = Ransom(s, "PRÓXIMAMENTE", 24, 7); letters.HorizontalAlignment = HorizontalAlignment.Center;
        body.Children.Add(letters);
        body.Children.Add(new TextBlock { Text = $"{s.Say.Poster(s.Say.From)} · ENTRADA LIBRE", FontFamily = new FontFamily("Courier New"), FontSize = 12, FontWeight = FontWeights.Bold, Foreground = new SolidColorBrush(PkInk), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 4, 0, 0) });
        var poster = new Border { Background = new SolidColorBrush(PkPaper), Padding = new Thickness(14, 8, 14, 8), Child = body, Effect = new DropShadowEffect { ShadowDepth = 4, Direction = 305, BlurRadius = 0, Opacity = 0.25 } };
        s.AddCentered(poster, s.Cx, s.Cy, 22);
        var x = Xf.Of(poster);
        s.Anim(240, t => { x.S = Lerp(1.6, 1, t); poster.Opacity = t; x.R = Lerp(10, -3, t); }, 0, Ease.Bezier(0.3, 1.6, 0.5, 1));
        await s.Sleep(260);
        var tape = Tape(s, 72, 20, -6, 191);
        s.Add(tape, s.Cx - 36, s.Cy - 46, 23);
        s.FadeIn(tape, 100);
    }

    /// <summary>Spray paint: a blot of dots, its middle, and three drips that run down (all of it stays).</summary>
    private static void Splat(Scene s, double x, double y, Color color)
    {
        var rng = new Random(11);
        var c = new Canvas();
        var ink = new SolidColorBrush(color);
        for (var i = 0; i < 90; i++)
        {
            var a = rng.NextDouble() * 6.3; var d = Math.Pow(rng.NextDouble(), 2) * 46; var r = 1 + rng.NextDouble() * 3;
            var dot = new Ellipse { Width = r * 2, Height = r * 2, Fill = ink };
            Canvas.SetLeft(dot, x + Math.Cos(a) * d - r); Canvas.SetTop(dot, y + Math.Sin(a) * d - r);
            c.Children.Add(dot);
        }
        var blot = new Ellipse { Width = 32, Height = 32, Fill = ink }; Canvas.SetLeft(blot, x - 16); Canvas.SetTop(blot, y - 16); c.Children.Add(blot);
        s.Add(c, 0, 0, 21);
        s.FadeIn(c, 200);
        for (var k = 0; k < 3; k++)
        {
            var dx = x + rng.NextDouble() * 24 - 12; var len = 40 + rng.NextDouble() * 45;
            var drip = new Line { X1 = dx, Y1 = y + 8, X2 = dx, Y2 = y + 8, Stroke = ink, StrokeThickness = 4.4, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
            var end = new Ellipse { Width = 6.6, Height = 6.6, Fill = ink };
            s.Add(drip, 0, 0, 21); s.Add(end, dx - 3.3, y + 5, 21);
            s.Anim(1600, t => { drip.Y2 = y + 8 + len * t; Canvas.SetTop(end, y + 5 + len * t); }, 150, Ease.CssOut);
        }
    }

    private static async Task PunkRetired(Scene s)
    {
        // torn in two: the halves fall apart, the wall gets a sprayed X that drips and RIP in cut-out letters
        var box = s.Play();
        var shot = box.Picture.Source;
        box.Visibility = Visibility.Hidden;
        double w = s.P.Width, h = s.P.Height;
        Image Half(bool left) => new()
        {
            Source = shot, Width = w, Height = h, Stretch = Stretch.Fill,
            Clip = Geo(left ? $"M0,0 L{w * 0.52},0 L{w * 0.45},{h * 0.38} L{w * 0.51},{h * 0.66} L{w * 0.46},{h} L0,{h} Z" : $"M{w * 0.52},0 L{w},0 L{w},{h} L{w * 0.46},{h} L{w * 0.51},{h * 0.66} L{w * 0.45},{h * 0.38} Z")
        };
        var l = s.Add(Half(true), s.P.X, s.P.Y, 20); var r = s.Add(Half(false), s.P.X, s.P.Y, 20);
        var lx = Xf.Of(l); var rx = Xf.Of(r);
        var fall = Ease.Bezier(0.5, 0, 0.8, 0.5);
        s.Anim(1100, t => { lx.X = -24 * t; lx.Y = 70 * t; lx.R = -16 * t; l.Opacity = 1 - t; }, 250, fall);
        s.Anim(1100, t => { rx.X = 30 * t; rx.Y = 80 * t; rx.R = 20 * t; r.Opacity = 1 - t; }, 310, fall);
        await s.Sleep(900);
        Splat(s, s.Cx - 60, s.Cy - 6, s.Accent);
        var x = Text("✕", "Impact", 70, new SolidColorBrush(PkInk));
        x.RenderTransform = new RotateTransform(-8);
        s.AddCentered(x, s.Cx - 60, s.Cy - 6, 22);
        s.FadeIn(x, 300, 0, 0.85); s.Unblur(x, 6, 300);
        await s.Sleep(300);
        var rip = Ransom(s, "RIP", 30, 3);
        s.AddCentered(rip, s.Cx + 50, s.Cy, 23);
        var rp = Xf.Of(rip);
        s.Anim(220, t => { rip.Opacity = t; rp.S = Lerp(1.5, 1, t); }, 0, Ease.Bezier(0.3, 1.6, 0.5, 1));
    }

    private static async Task PunkBack(Scene s)
    {
        // put back together with tape, bouncing into place
        var box = s.Play();
        box.Opacity = 0;
        await s.Sleep(250);
        s.Anim(320, t => { box.Opacity = t; box.T.Y = 34 * (1 - t); box.T.R = 6 * (1 - t); }, 0, Ease.Bezier(0.3, 1.5, 0.5, 1));
        await s.Sleep(420);
        var tapes = new List<Border>();
        foreach (var (dx, rot) in new[] { (-50.0, -12.0), (40.0, 10.0) })
        {
            var t = Tape(s, 72, 22, rot);
            s.Add(t, s.Cx + dx - 36, s.P.Y - 6, 22);
            var tx = Xf.Of(t); tx.R = rot;
            s.Anim(140, k => { t.Opacity = k; tx.S = Lerp(1.4, 1, k); });
            tapes.Add(t);
            await s.Sleep(200);
        }
        await s.Sleep(1800);
        foreach (var t in tapes) s.FadeOut(t, 400);
        await s.Sleep(420);
        s.RestorePlay();
    }

    // ---- Words: blackout poetry ------------------------------------------------------------------------------------------------

    private static readonly Color WInk = C("#15120f"), WPaper = C("#ece3cf");
    private const string Serif = "Sitka Text, Palatino Linotype, Georgia";

    private sealed record WordsLine(Border Face, List<(TextBlock Word, bool Kept)> Words);

    private static WordsLine Line(Scene s, params (string Text, bool Kept)[] words)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        var list = new List<(TextBlock, bool)>();
        foreach (var (text, kept) in words)
        {
            var t = new TextBlock { Text = text, FontFamily = new FontFamily(Serif), FontSize = 16, FontStyle = FontStyles.Italic, Foreground = new SolidColorBrush(WInk), Margin = new Thickness(3, 0, 3, 0) };
            row.Children.Add(t); list.Add((t, kept));
        }
        var face = s.Face(new SolidColorBrush(WPaper), new SolidColorBrush(WInk), 1, null, row);
        face.UpdateLayout();
        return new WordsLine(face, list);
    }

    private static Rect Where(Scene s, FrameworkElement el) => el.TransformToVisual(s.Stage).TransformBounds(new Rect(0, 0, el.ActualWidth, el.ActualHeight));

    private static void Marker(Scene s, Rect r, double delay)
    {
        var m = new Grid { Width = r.Width + 8, Height = Math.Max(4, r.Height - 3), Background = new SolidColorBrush(WInk) };
        m.Children.Add(new Border { Height = 1, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness((r.Width + 8) * 0.12, (r.Height - 3) * 0.32, (r.Width + 8) * 0.3, 0), Background = new SolidColorBrush(Color.FromArgb(89, 92, 84, 74)) });
        m.Children.Add(new Border { Height = 1, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness((r.Width + 8) * 0.3, (r.Height - 3) * 0.64, (r.Width + 8) * 0.1, 0), Background = new SolidColorBrush(Color.FromArgb(77, 92, 84, 74)) });
        s.Add(m, r.X - 4, r.Y + 2, 14);
        var x = Xf.Of(m, 0, 0.5);
        s.Anim(280, t => x.Scale.ScaleX = t, delay, Ease.Bezier(0.6, 0, 0.3, 1));
    }

    private static void LoopAround(Scene s, Rect r, double delay)
    {
        double w = r.Width + 18, h = r.Height + 12;
        var loop = new Path { Data = Geo($"M{w * 0.6:0.#},2 C{w + 4:0.#},1 {w + 6:0.#},{h - 2:0.#} {w / 2:0.#},{h - 1:0.#} C-4,{h:0.#} -6,3 {w * 0.45:0.#},3 C{w * 0.6:0.#},2 {w * 0.7:0.#},5 {w * 0.75:0.#},8"), Stroke = new SolidColorBrush(s.Accent), StrokeThickness = 1.6 };
        s.Add(loop, r.X - 9, r.Y - 6, 15);
        s.DrawOn(loop, loop.Data, 650, delay, Ease.Out);
    }

    private static async Task Blackout(Scene s, params (string, bool)[] words)
    {
        var line = Line(s, words);
        await s.Sleep(500);
        var i = 0;
        foreach (var (word, kept) in line.Words) if (!kept) Marker(s, Where(s, word), i++ * 180);
        await s.Sleep(i * 180 + 300);
        var j = 0;
        foreach (var (word, kept) in line.Words) if (kept) LoopAround(s, Where(s, word), j++ * 350);
    }

    private static Task WordsMaint(Scene s) => Blackout(s, ("el", false), ("modpack", false), ("vuelve", true), (s.Say.Until is { } u ? s.Say.HourInWords(u) + "," : "más tarde,", false), ("pronto.", true));

    private static Task WordsSoon(Scene s) => Blackout(s, ("todavía no abre;", true), ("llega", false), ($"{s.Say.DayInWords(s.Say.From)}.", true));

    private static async Task WordsRetired(Scene s)
    {
        // struck through by the pen, then the marker takes the whole line; only "fin." is left, circled
        var line = Line(s, ("Jugar", false), ("aquí", false), ("se", false), ("acabó.", false), ("fin.", true));
        var strike = s.Add(new Rectangle { Height = 2, Width = 0, Fill = new SolidColorBrush(s.Accent) }, s.P.X + 20, s.Cy, 16);
        s.Anim(450, t => strike.Width = (s.P.Width - 40) * t);
        await s.Sleep(650);
        s.Remove(strike);
        var i = 0;
        foreach (var (word, kept) in line.Words) if (!kept) Marker(s, Where(s, word), i++ * 170);
        await s.Sleep(i * 170 + 300);
        LoopAround(s, Where(s, line.Words[^1].Word), 0);
    }

    private static async Task WordsBack(Scene s)
    {
        // the ink lifts off the line, right to left, and Jugar is there again
        var line = Line(s, ("fin.", true));
        var clip = new RectangleGeometry(new Rect(0, 0, s.P.Width, s.P.Height));
        var cover = s.Add(new Border { Width = s.P.Width, Height = s.P.Height, Background = new SolidColorBrush(WInk), CornerRadius = new CornerRadius(3), Clip = clip }, s.P.X, s.P.Y, 13);
        await s.Sleep(450);
        s.Remove(line.Face);
        s.RestorePlay();
        s.Anim(1000, t => clip.Rect = new Rect(s.P.Width * t, 0, s.P.Width * (1 - t), s.P.Height), 0, Ease.Bezier(0.6, 0, 0.3, 1));
        await s.Sleep(1050);
        s.Remove(cover);
    }
}
