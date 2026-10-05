using System.Text.RegularExpressions;
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
using System.Diagnostics;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// Where a style shows what happened to Jugar (maintenance, coming soon, retired, back again): a layer over the whole window, above the
/// view and below dialogs, that the interface never touches. Effects are short scripts (AccessScripts, ExplorerAccess) that place things on
/// it and move them with this layer's own animation clock, which behaves like the web's animations the preview was made with: an easing
/// for the whole run, keyframes in between, the first frame held during a delay and the last one kept after the end, loops that go on.
/// A new state, or leaving the home screen, cancels whatever was running and clears the layer.
/// </summary>
internal sealed class AccessStage : Canvas
{
    public static AccessStage? Instance { get; private set; }

    private readonly ParticleLayer _particles = new();
    private readonly List<Tween> _tweens = [];
    private readonly List<DispatcherTimer> _timers = [];
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private bool _ticking;
    private CancellationTokenSource _run = new();

    public AccessStage()
    {
        IsHitTestVisible = false;
        Instance = this;
        Children.Add(_particles);
        _particles.ZIndex = 60;
        SizeChanged += (_, e) => { _particles.Width = e.NewSize.Width; _particles.Height = e.NewSize.Height; };
        _frameTimer.Tick += (_, _) => OnFrame(null, EventArgs.Empty);
        Loaded += (_, _) =>
        {
            if (TopLevel.GetTopLevel(this) is Window w)
            {
                w.Activated += (_, _) => Wake();
                w.PropertyChanged += (_, e) => { if (e.Property == Window.WindowStateProperty) Wake(); };
            }
        };
    }

    public double Now => _clock.Elapsed.TotalMilliseconds;

    /// <summary>Starts a new run: whatever was running stops and the layer is emptied. The token ends with the next run.</summary>
    public CancellationToken Begin()
    {
        Clear();
        return _run.Token;
    }

    /// <summary>Stops the run and empties the layer.</summary>
    public void Clear()
    {
        _run.Cancel();
        _run = new CancellationTokenSource();
        _tweens.Clear();
        foreach (var t in _timers) t.Stop();
        _timers.Clear();
        _particles.Clear();
        for (var i = Children.Count - 1; i >= 0; i--) if (!ReferenceEquals(Children[i], _particles)) Children.RemoveAt(i);
    }

    // ---- the clock ------------------------------------------------------------------------------------------------------------

    private sealed class Tween
    {
        public double Start, Delay, Duration;
        public int Iterations;              // 0: for ever
        public Func<double, double> Ease = t => t;
        public Action<double> Apply = _ => { };
        public CancellationToken Run;
    }

    /// <summary>Runs <paramref name="apply"/> with the eased progress 0..1 over <paramref name="ms"/>, after <paramref name="delay"/> (holding 0 meanwhile).</summary>
    public void Animate(CancellationToken run, double ms, double delay, Func<double, double>? ease, Action<double> apply, int iterations = 1, bool instant = false)
    {
        if (run.IsCancellationRequested) return;
        ease ??= Ease.Out;
        if (instant && iterations != 0) { apply(ease(1)); return; }
        var t = new Tween { Start = Now, Delay = instant ? 0 : delay, Duration = Math.Max(1, ms), Iterations = iterations, Ease = ease, Apply = apply, Run = run };
        apply(ease(0));
        _tweens.Add(t);
        Wake();
    }

    /// <summary>Calls <paramref name="tick"/> every <paramref name="ms"/> for as long as the run lasts (a countdown, a flicker).</summary>
    public void Every(CancellationToken run, double ms, Action tick)
    {
        if (run.IsCancellationRequested) return;
        tick();
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(ms) };
        timer.Tick += (_, _) => { if (run.IsCancellationRequested) { timer.Stop(); return; } tick(); };
        timer.Start();
        _timers.Add(timer);
    }

    public ParticleLayer Particles => _particles;

    /// <summary>Starts ticking again when there is something to move and the window is there to see it.</summary>
    internal void Wake()
    {
        if (_ticking || _tweens.Count == 0 && !_particles.Alive) return;
        if (TopLevel.GetTopLevel(this) is Window w && (w.WindowState == WindowState.Minimized || !w.IsVisible)) return;
        _ticking = true;
        _frameTimer.Start();
    }

    private readonly DispatcherTimer _frameTimer = new(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(16) };
    private double _lastFrame;

    private void OnFrame(object? sender, EventArgs e)
    {
        var now = Now;
        var dt = Math.Min(0.05, _lastFrame > 0 ? (now - _lastFrame) / 1000 : 0.016);
        _lastFrame = now;
        for (var i = _tweens.Count - 1; i >= 0; i--)
        {
            var t = _tweens[i];
            if (t.Run.IsCancellationRequested) { _tweens.RemoveAt(i); continue; }
            var local = now - t.Start - t.Delay;
            if (local < 0) continue;
            var p = local / t.Duration;
            if (t.Iterations != 0 && p >= t.Iterations) { t.Apply(t.Ease(1)); _tweens.RemoveAt(i); continue; }
            t.Apply(t.Ease(p - Math.Floor(p)));
        }
        _particles.Step(dt);
        // a minimised or hidden window stops the clock (the loops pick up where they are when it comes back)
        var window = TopLevel.GetTopLevel(this) as Window;
        if (_tweens.Count == 0 && !_particles.Alive || window is { WindowState: WindowState.Minimized } || window is { IsVisible: false })
        {
            _frameTimer.Stop();
            _ticking = false;
            _lastFrame = 0;
        }
    }
}

/// <summary>Easing curves: CSS's cubic-bezier, and the ones the effects use.</summary>
internal static class Ease
{
    public static readonly Func<double, double> Linear = t => t;
    public static readonly Func<double, double> Out = Bezier(0.23, 1, 0.32, 1);
    public static readonly Func<double, double> InOut = Bezier(0.42, 0, 0.58, 1);
    public static readonly Func<double, double> CssEase = Bezier(0.25, 0.1, 0.25, 1);
    public static readonly Func<double, double> CssOut = Bezier(0, 0, 0.58, 1);

    /// <summary>A CSS cubic-bezier(x1, y1, x2, y2).</summary>
    public static Func<double, double> Bezier(double x1, double y1, double x2, double y2)
    {
        double X(double s) => ((1 - 3 * x2 + 3 * x1) * s + (3 * x2 - 6 * x1)) * s * s + 3 * x1 * s;
        double Y(double s) => ((1 - 3 * y2 + 3 * y1) * s + (3 * y2 - 6 * y1)) * s * s + 3 * y1 * s;
        double Dx(double s) => 3 * (1 - 3 * x2 + 3 * x1) * s * s + 2 * (3 * x2 - 6 * x1) * s + 3 * x1;
        return t =>
        {
            if (t <= 0) return 0;
            if (t >= 1) return 1;
            var s = t;
            for (var i = 0; i < 6; i++) { var d = Dx(s); if (Math.Abs(d) < 1e-6) break; s -= (X(s) - t) / d; }
            s = Math.Clamp(s, 0, 1);
            if (Math.Abs(X(s) - t) > 1e-3)
            {
                double lo = 0, hi = 1; s = t;
                for (var i = 0; i < 20; i++) { var x = X(s); if (Math.Abs(x - t) < 1e-5) break; if (x < t) lo = s; else hi = s; s = (lo + hi) / 2; }
            }
            return Y(s);
        };
    }

    /// <summary>CSS steps(n): jumps at the end of each step.</summary>
    public static Func<double, double> Steps(int n) => t => t >= 1 ? 1 : Math.Floor(t * n) / n;
}

/// <summary>
/// Sparks, dust, embers, crumbs, bubbles and spray: particles that fly (or travel to a target) and fade, drawn on one visual. Only ticks
/// while there are some.
/// </summary>
internal sealed class ParticleLayer : Control
{
    public sealed class Particle
    {
        public double X, Y, Vx, Vy, G, Drag = 0.99, Life = 1.5, Age, Size = 2, Rot, Vr, Alpha = 1;
        public double? Sx, Sy, Tx, Ty, Ox, Oy;   // travelling from S to T (instead of flying); a drip's origin
        public bool FadeIn;
        public Color Color = Colors.White;
        public string Shape = "dot";
    }

    private readonly List<Particle> _all = [];
    public ParticleLayer() { IsHitTestVisible = false; }

    public bool Alive => _all.Count > 0;

    public void Add(IEnumerable<Particle> particles)
    {
        _all.AddRange(particles);
        (Parent as AccessStage)?.Wake();
    }

    public void Clear()
    {
        _all.Clear();
        InvalidateVisual();
    }

    private static readonly Dictionary<(Color, byte), SolidColorBrush> Brushes = [];
    private static SolidColorBrush B(Color c, double a)
    {
        var alpha = (byte)Math.Round(Math.Clamp(a, 0, 1) * 31) ;
        if (Brushes.TryGetValue((c, alpha), out var b)) return b;
        if (Brushes.Count > 3000) Brushes.Clear();
        b = new SolidColorBrush(Color.FromArgb((byte)(c.A * alpha / 31), c.R, c.G, c.B));
        return Brushes[(c, alpha)] = b;
    }

    public void Step(double dt)
    {
        for (var i = _all.Count - 1; i >= 0; i--) if ((_all[i].Age += dt) >= _all[i].Life) _all.RemoveAt(i);
        _dt = dt;
        InvalidateVisual();
    }

    private double _dt;

    public override void Render(DrawingContext context)
    {
        var dc = new Dc(context);
        var dt = _dt;
        try
        {
        foreach (var p in _all)
        {
            if (p.Tx is { } tx && p.Ty is { } ty && p.Sx is { } sx && p.Sy is { } sy)
            {
                var k = Math.Min(1, p.Age / p.Life); var e = 1 - Math.Pow(1 - k, 3);
                p.X = sx + (tx - sx) * e; p.Y = sy + (ty - sy) * e;
            }
            else { p.Vx *= p.Drag; p.Vy = p.Vy * p.Drag + p.G * dt; p.X += p.Vx * dt; p.Y += p.Vy * dt; }
            p.Rot += p.Vr * dt;
            var fade = p.FadeIn ? Math.Min(1, p.Age / 0.25) : 1 - Math.Max(0, (p.Age - p.Life * 0.6) / (p.Life * 0.4));
            var a = Math.Max(0, fade) * p.Alpha;
            if (a <= 0.01) continue;
            var s = p.Size;
            dc.PushTransform(Tr.Translate(p.X, p.Y));
            if (p.Rot != 0) dc.PushTransform(Tr.Rotate(p.Rot * 180 / Math.PI));
            switch (p.Shape)
            {
                case "ring": dc.DrawEllipse(null, new Pen(B(p.Color, a), 1.2), new Point(), s, s); break;
                case "square": dc.DrawRectangle(B(p.Color, a), null, new Rect(-s / 2, -s / 2, s, s)); break;
                case "glow":
                    var glow = Gr.Radial(Color.FromArgb((byte)(255 * a), p.Color.R, p.Color.G, p.Color.B), Color.FromArgb(0, p.Color.R, p.Color.G, p.Color.B));
                    dc.DrawEllipse(glow, null, new Point(), s * 3, s * 3); break;
                case "star":
                    var star = new StreamGeometry();
                    using (var g = star.OpenW())
                        for (var k = 0; k < 8; k++)
                        {
                            var an = k / 8.0 * Math.Tau; var r = k % 2 == 1 ? s * 0.28 : s;
                            var pt = new Point(Math.Cos(an) * r, Math.Sin(an) * r);
                            if (k == 0) g.BeginFigure(pt, true, true); else g.LineTo(pt, false, false);
                        }
                    dc.DrawGeometry(B(p.Color, a), null, star); break;
                case "drip":
                    if (p.Ox is { } ox && p.Oy is { } oy) dc.DrawLine(new Pen(B(p.Color, a), s * 2) { LineCap = PenLineCap.Round }, new Point(ox - p.X, oy - p.Y), new Point());
                    dc.DrawEllipse(B(p.Color, a), null, new Point(), s * 1.5, s * 1.5); break;
                case "shard":
                    var shard = new StreamGeometry();
                    using (var g = shard.OpenW()) { g.BeginFigure(new Point(-s, -s * 0.4), true, true); g.PolyLineTo([new Point(s * 0.8, -s * 0.7), new Point(s * 0.3, s)], true, false); }
                    dc.DrawGeometry(B(p.Color, a), new Pen(B(Colors.White, 0.7 * a), 0.7), shard); break;
                default: dc.DrawEllipse(B(p.Color, a), null, new Point(), s, s); break;
            }
            if (p.Rot != 0) dc.Pop();
            dc.Pop();
        }
        }
        finally { dc.PopAll(); }
    }
}

/// <summary>
/// Jugar, as the effects handle it: a picture of the real button (taken when the effect starts) that can move, be clipped, blur, go dark,
/// flash or turn grey, while the real one stays hidden underneath. Put back (Restore) when the button is there again.
/// </summary>
internal sealed class PlayBox : Grid
{
    public readonly Image Picture = new() { Stretch = Stretch.Fill, IsHitTestVisible = false };
    private readonly Image _grey = new() { Stretch = Stretch.Fill, Opacity = 0 };
    public readonly Border Dark = new() { Background = Brushes.Black, Opacity = 0 };
    public readonly Border Light = new() { Background = Brushes.White, Opacity = 0 };
    public readonly Border Tint = new() { Opacity = 0 };
    public readonly Xf T;

    public PlayBox(Bitmap? shot, CornerRadius radius)
    {
        IsHitTestVisible = false;
        Picture.Source = shot;
        if (shot != null)
        {
            _grey.Source = Px.Grey(shot);
        }
        foreach (var b in new[] { Dark, Light, Tint }) b.CornerRadius = radius;
        Children.Add(Picture); Children.Add(_grey); Children.Add(Tint); Children.Add(Dark); Children.Add(Light);
        T = Xf.Of(this);
    }

    /// <summary>How grey it is (0 the button's colours, 1 greyscale).</summary>
    public double Grey { get => _grey.Opacity; set => _grey.Opacity = value; }

    /// <summary>A blur over the whole box (0: none).</summary>
    public double Blur
    {
        get => Effect is BlurEffect b ? b.Radius : 0;
        set { if (value < 0.05) Effect = null; else if (Effect is BlurEffect b) b.Radius = value; else Effect = new BlurEffect { Radius = value }; }
    }
}

/// <summary>An element's own move, scale and turn (in that order of application: scale and turn about its origin, then move).</summary>
internal sealed class Xf
{
    public readonly ScaleTransform Scale = new();
    public readonly RotateTransform Rotate = new();
    public readonly TranslateTransform Move = new();
    private static readonly System.Runtime.CompilerServices.ConditionalWeakTable<Control, Xf> All = new();

    public static Xf Of(Control el, double ox = 0.5, double oy = 0.5)
    {
        if (All.TryGetValue(el, out var xf)) return xf;
        xf = new Xf();
        el.RenderTransformOrigin = Rp.Rel(ox, oy);
        el.RenderTransform = new TransformGroup { Children = { xf.Scale, xf.Rotate, xf.Move } };
        All.Add(el, xf);
        return xf;
    }

    public double S { set { Scale.ScaleX = value; Scale.ScaleY = value; } }
    public double R { set => Rotate.Angle = value; }
    public double X { set => Move.X = value; }
    public double Y { set => Move.Y = value; }
}
