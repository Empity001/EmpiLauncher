using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The living halftone ground: a port of the Publisher's field (tools/publisher/public/life.js) to WPF.
///
/// ONE hex lattice of dots covers the window and every effect is a tone added to the same dots, so nothing looks like a separate plane:
///   - slow interference waves and two plates that swell at the free corners (bottom-left, top-right);
///   - the pointer lifts the dots around it;
///   - every click sends a ring of waves outward (accent-coloured on the main action);
///   - the control under the pointer is contoured: the dots around its outline light up;
///   - the next action (Jugar, Iniciar sesión) glows in the modpack's accent and pulses.
/// Dot size is the tone. Dots stay faint behind text ("quiet" zones the views register).
///
/// Cost, because this shares a machine with a game: two layers. The faint base dots are one static drawing that is never re-recorded;
/// only the dots that differ from it are redrawn each frame (12 fps for the ambient motion, 24 while the player is interacting).
/// It measures its own frame cost and thins the lattice, and in the end stops, if the machine cannot afford it. The FieldGovernor
/// decides whether it may move at all; when it may not, the still frame is drawn once.
/// </summary>
internal sealed class LivingField : Grid
{
    private const double StillTime = 7.3;
    private const double AmbientMs = 125, InteractiveMs = 41;

    // A click ripple lives as long as it takes to cross the window (see NewRipple), between these limits, in seconds.
    private const double RippleMinLife = 1.6, RippleMaxLife = 4.4, RipplePxPerSecond = 650, RippleBand = 26;

    /// <summary>A layer that paints through a callback. The base one is cached as a texture, so it costs one blit per frame, not 4,000 dots.</summary>
    private sealed class Layer : FrameworkElement
    {
        public Action<DrawingContext>? Painter { get; set; }
        public Layer(bool cached)
        {
            IsHitTestVisible = false;
            RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);
            if (cached) CacheMode = new BitmapCache(1.0);
        }
        protected override void OnRender(DrawingContext dc) => Painter?.Invoke(dc);
    }

    /// <summary>The main action of the screen (Jugar / Iniciar sesión): it glows. Views set and clear it.</summary>
    public static FrameworkElement? NextAction { get; set; }
    /// <summary>Areas where text lives: dots stay faint there so nothing is ever hard to read.</summary>
    public static readonly List<FrameworkElement> Quiet = [];

    private readonly Layer _baseLayer = new(cached: true), _liveLayer = new(cached: false);
    private readonly DispatcherTimer _gate = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _frame = new() { Interval = TimeSpan.FromMilliseconds(AmbientMs) };
    private readonly DispatcherTimer _quietTimer = new() { Interval = TimeSpan.FromMilliseconds(700) };
    private readonly Stopwatch _clock = Stopwatch.StartNew();

    // the lattice: worked out once per size, not per frame
    private double _pitch = 24, _w, _h;
    private float[] _gx = [], _gy = [], _gp = [], _gq = [], _rBase = [];
    private int _n;
    private string _quietSig = "";

    // time and interaction state
    private double _t = StillTime, _last;
    private bool _running;
    private readonly Pointer _ptr = new(), _hot = new(), _next = new();
    private FrameworkElement? _hotElement;
    private long _movedAt = long.MinValue;
    private readonly List<Ripple> _ripples = [];
    private double _cost; private int _slow;

    // dot colours: opaque, so a bigger dot always fully covers the smaller base dot under it
    // The dots' own colour (the player's choice, grey by default) and the modpack's accent. Where an effect in one meets an effect in the other
    // the dot is drawn in a blend of the two: _mix[0] is the dot colour, _mix[MixSteps] the accent, and the steps between are the transition.
    private const int MixSteps = 16;
    private readonly Brush[] _mix = new Brush[MixSteps + 1];
    private Color _dotColor = Color.FromRgb(0x64, 0x63, 0x5f), _accentFor = Color.FromRgb(0xff, 0x3d, 0x8b);
    private Brush _paperDot = Solid(0x64, 0x63, 0x5f);

    private sealed class Pointer { public double X = -999, Y = -999, W, H, Amp, Want; }
    /// <summary>One click. Reach is how far its ring has to travel to leave the window (the farthest corner); Life is how long that takes.</summary>
    private readonly record struct Ripple(double X, double Y, double T0, bool Accent, double Life, double Reach, double Phase);

    // per frame, per live ripple: radius of the ring, its width and its strength (see UpdateRipples)
    private readonly double[] _rR = new double[4], _rW = new double[4], _rA = new double[4];

    public LivingField()
    {
        IsHitTestVisible = false;
        _baseLayer.Painter = PaintBase;
        _liveLayer.Painter = PaintLive;
        Children.Add(_baseLayer);
        Children.Add(_liveLayer);
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        _gate.Tick += (_, _) => Gate();
        _frame.Tick += (_, _) => Frame();
        _quietTimer.Tick += (_, _) => MeasureQuiet();
        SizeChanged += (_, _) => Rebuild();
    }

    private static Brush Solid(byte r, byte g, byte b) { var brush = new SolidColorBrush(Color.FromRgb(r, g, b)); brush.Freeze(); return brush; }

    // ---- wiring -------------------------------------------------------------------------------------------------------

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        Launcher.Instance.GameChanged += Gate;
        Launcher.Instance.PrefsChanged += Gate;
        if (Window.GetWindow(this) is { } window)
        {
            window.Activated += OnWindowEvent; window.Deactivated += OnWindowEvent; window.StateChanged += OnWindowEvent;
            window.IsVisibleChanged += OnVisible;
            window.PreviewMouseMove += OnMouseMove; window.PreviewMouseDown += OnMouseDown; window.MouseLeave += OnMouseLeave;
        }
        Rebuild();
        Gate();
        _gate.Start();
    }

    private void OnUnloaded(object? sender, RoutedEventArgs e)
    {
        Launcher.Instance.GameChanged -= Gate;
        Launcher.Instance.PrefsChanged -= Gate;
        if (Window.GetWindow(this) is { } window)
        {
            window.Activated -= OnWindowEvent; window.Deactivated -= OnWindowEvent; window.StateChanged -= OnWindowEvent;
            window.IsVisibleChanged -= OnVisible;
            window.PreviewMouseMove -= OnMouseMove; window.PreviewMouseDown -= OnMouseDown; window.MouseLeave -= OnMouseLeave;
        }
        _gate.Stop(); _frame.Stop(); _quietTimer.Stop();
    }

    private void OnWindowEvent(object? sender, EventArgs e) => Gate();
    private void OnVisible(object sender, DependencyPropertyChangedEventArgs e) => Gate();

    /// <summary>True while it is actually moving; Ajustes > Acerca shows this and why not.</summary>
    public bool Moving => _running;

    /// <summary>
    /// How visible the field is, the player's choice (Ajustes > Launcher). The two layers are faded together as one group, not dot by dot:
    /// a bigger live dot has to keep hiding the base dot under it, which translucent brushes would not do.
    /// </summary>
    private void ApplyOpacity()
    {
        var wanted = Math.Clamp(Launcher.Instance.Prefs.DotOpacity ?? 1, 0.1, 1);
        if (Math.Abs(Opacity - wanted) > 0.001) Opacity = wanted;
    }

    private void Gate()
    {
        ApplyOpacity();
        if (SyncColors()) DrawLive();   // a colour changed in Ajustes: show it even if the field is standing still
        FieldGovernor.Evaluate(Window.GetWindow(this));
        if (FieldGovernor.Allowed && !_running)
        {
            _running = true; _last = _clock.Elapsed.TotalSeconds; _t = StillTime;
            _frame.Start(); _quietTimer.Start();
        }
        else if (!FieldGovernor.Allowed && _running)
        {
            _running = false;
            _frame.Stop(); _quietTimer.Stop();
            _ptr.Amp = _hot.Amp = _next.Amp = 0; _ptr.Want = 0; _hotElement = null; _ripples.Clear();
            _t = StillTime;
            DrawLive();   // back to the still frame
        }
    }

    // ---- lattice -----------------------------------------------------------------------------------------------------

    private void Rebuild()
    {
        _w = ActualWidth; _h = ActualHeight;
        if (_w < 200 || _h < 200) return;
        var rowH = _pitch * 0.866;
        var cols = (int)Math.Ceiling((_w + _pitch) / _pitch) + 1;
        var rows = (int)Math.Ceiling((_h + _pitch) / rowH) + 1;
        var cap = cols * rows;
        _gx = new float[cap]; _gy = new float[cap]; _gp = new float[cap]; _gq = new float[cap]; _rBase = new float[cap]; _mark = new int[cap];
        _rowH = rowH;
        var rowStart = new List<int>(); var rowCount = new List<int>(); var plates = new List<int>();
        _n = 0;
        for (var row = 0; row < rows; row++)
        {
            var y = rowH * 0.5 + row * rowH;
            if (y >= _h + _pitch) break;
            var off = (row & 1) != 0 ? _pitch / 2 : 0;
            rowStart.Add(_n);
            for (var x = off; x < _w + _pitch; x += _pitch)
            {
                _gx[_n] = (float)x; _gy[_n] = (float)y;
                // where the two plates are: an ellipse at the bottom-left and a shorter one at the top-right
                _gp[_n] = (float)Math.Max(1 - Hyp(x / (_w * 0.3), (_h - y) / (_h * 0.6)), 1 - Hyp((_w - x) / (_w * 0.3), y / (_h * 0.32)));
                if (_gp[_n] > -0.12f) plates.Add(_n);   // the plate edge undulates by up to 0.12, so these can gain a plate tone
                _n++;
            }
            rowCount.Add(_n - rowStart[^1]);
        }
        _rowStart = rowStart.ToArray(); _rowCount = rowCount.ToArray(); _plateIdx = plates.ToArray(); _stamp = 0;
        _quietSig = "";
        MeasureQuiet(force: true);
        DrawBase();
        DrawLive();
    }

    private static double Hyp(double a, double b) => Math.Sqrt(a * a + b * b);

    /// <summary>How much of each dot lies under a block of text (0 in the open, 1 inside, feathered at the edge).</summary>
    private void MeasureQuiet(bool force = false)
    {
        var boxes = new List<Rect>();
        foreach (var el in Quiet)
        {
            if (!el.IsVisible || el.ActualWidth <= 0) continue;
            try { boxes.Add(el.TransformToVisual(this).TransformBounds(new Rect(0, 0, el.ActualWidth, el.ActualHeight))); } catch (InvalidOperationException) { }
        }
        var sig = string.Join('|', boxes.Select(b => $"{(int)b.Left},{(int)b.Top},{(int)b.Right},{(int)b.Bottom}"));
        if (sig == _quietSig && !force) return;
        _quietSig = sig;
        for (var i = 0; i < _n; i++)
        {
            double q = 0;
            foreach (var b in boxes)
            {
                var dx = Math.Max(Math.Max(b.Left - 8 - _gx[i], 0), _gx[i] - (b.Right + 8));
                var dy = Math.Max(Math.Max(b.Top - 8 - _gy[i], 0), _gy[i] - (b.Bottom + 8));
                var inside = 1 - Math.Min(1, Hyp(dx, dy) / 30);
                if (inside > q) q = inside;
            }
            _gq[i] = (float)q;
        }
        if (!force) { DrawBase(); DrawLive(); }
    }

    private double Radius(double tone) => _pitch * 0.53 * Math.Sqrt(tone > 1 ? 1 : tone);

    /// <summary>The faint base dots: one static layer (cached as a texture), redrawn only when the size or the quiet zones change.</summary>
    private void DrawBase()
    {
        // radii first (the live layer compares against them), then ask for a repaint of the cached layer
        for (var i = 0; i < _n; i++)
            _rBase[i] = (float)Radius((0.012 + 0.03 * 0.25) * (1 - 0.5 * _gq[i]));
        _baseLayer.InvalidateVisual();
    }

    private void PaintBase(DrawingContext dc)
    {
        for (var i = 0; i < _n; i++)
        {
            // the smallest tone the waves ever give (wave = 0.25): every live dot is at least this big, so it always covers its base dot
            var r = _rBase[i];
            if (r >= 0.75) dc.DrawEllipse(_paperDot, null, new Point(_gx[i], _gy[i]), r, r);
        }
    }

    // ---- input -------------------------------------------------------------------------------------------------------

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (!_running) return;
        var p = e.GetPosition(this);
        _ptr.X = p.X; _ptr.Y = p.Y; _ptr.Want = 1;
        _movedAt = _clock.ElapsedMilliseconds;
        _hotElement = FindHot(e.OriginalSource as DependencyObject);
    }

    private void OnMouseLeave(object sender, MouseEventArgs e) { _ptr.Want = 0; _hotElement = null; }

    private void OnMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (!_running) return;
        var p = e.GetPosition(this);
        var target = FindHot(e.OriginalSource as DependencyObject);
        var accent = target != null && (ReferenceEquals(target, NextAction) || target is Button b && ReferenceEquals(b.Style, Application.Current.TryFindResource("PrimaryButton")));
        // The ring has to be able to leave the window: its reach is the distance to the farthest corner, and its life follows from it.
        var reach = Math.Max(Math.Max(Hyp(p.X, p.Y), Hyp(_w - p.X, p.Y)), Math.Max(Hyp(p.X, _h - p.Y), Hyp(_w - p.X, _h - p.Y))) + 3 * RippleBand;
        var life = Math.Clamp(1.2 + reach / RipplePxPerSecond, RippleMinLife, RippleMaxLife);
        _ripples.Add(new Ripple(p.X, p.Y, _t, accent, life, reach, (p.X * 0.013 + p.Y * 0.007) % (Math.PI * 2)));
        if (_ripples.Count > 4) _ripples.RemoveAt(0);
        _movedAt = _clock.ElapsedMilliseconds;
    }

    /// <summary>
    /// Where each live ripple is right now. The ring starts fast and slows down like water (exponential ease-out, arriving at the
    /// far corner as its life ends), spreads and weakens as it grows, and only in its last quarter does it fade, so it is never cut
    /// off while it is still crossing the window.
    /// </summary>
    private void UpdateRipples()
    {
        for (var k = 0; k < _ripples.Count; k++)
        {
            var rp = _ripples[k];
            var age = Math.Min(_t - rp.T0, rp.Life);
            var tau = rp.Life / 2.6;
            var radius = rp.Reach * 1.08 * (1 - Math.Exp(-age / tau));
            var spread = 1 / Math.Sqrt(1 + radius / 240);
            var fadeStart = rp.Life * 0.72;
            var fade = age <= fadeStart ? 1 : 0.5 + 0.5 * Math.Cos(Math.PI * (age - fadeStart) / (rp.Life - fadeStart));
            _rR[k] = radius;
            _rW[k] = RippleBand + 0.028 * radius;
            _rA[k] = 0.62 * spread * fade;
        }
    }

    /// <summary>The control under the pointer, if it is one the player can act on (or a card): that is what gets contoured.</summary>
    private static object? _moduleStyle, _tileStyle;

    private static FrameworkElement? FindHot(DependencyObject? d)
    {
        var module = _moduleStyle ??= Application.Current.TryFindResource("Module");
        var tile = _tileStyle ??= Application.Current.TryFindResource("Tile");
        while (d != null)
        {
            if (d is ButtonBase or TextBox or Slider or Selector) return (FrameworkElement)d;
            if (d is Border b && (ReferenceEquals(b.Style, module) || ReferenceEquals(b.Style, tile))) return b;
            d = d is Visual or System.Windows.Media.Media3D.Visual3D ? VisualTreeHelper.GetParent(d) : LogicalTreeHelper.GetParent(d);
        }
        return null;
    }

    // ---- frames ------------------------------------------------------------------------------------------------------

    private void Frame()
    {
        var started = Stopwatch.GetTimestamp();
        var now = _clock.Elapsed.TotalSeconds;
        _t += Math.Min(0.1, now - _last);
        _last = now;

        _ptr.Amp += (_ptr.Want - _ptr.Amp) * 0.12;
        Ease(_hot, _hotElement);
        Ease(_next, NextAction is { IsVisible: true, IsHitTestVisible: true } && !Launcher.Instance.Game.Busy ? NextAction : null);
        _ripples.RemoveAll(r => _t - r.T0 > r.Life);

        // fast while the player is interacting (moving, clicking, a control being contoured), gentle otherwise
        var interacting = _clock.ElapsedMilliseconds - _movedAt < 1500 || _ripples.Count > 0 || _hot.Amp > 0.03;
        var wanted = TimeSpan.FromMilliseconds(interacting ? InteractiveMs : AmbientMs);
        if (_frame.Interval != wanted) _frame.Interval = wanted;

        DrawLive();

        // frame cost: thin the field out, and in the end stop, if this machine cannot afford it
        var ms = (Stopwatch.GetTimestamp() - started) * 1000.0 / Stopwatch.Frequency;
        _cost = _cost * 0.9 + ms * 0.1;
        _slow = _cost > 9 ? _slow + 1 : Math.Max(0, _slow - 1);
        if (_slow > 90) { _slow = 0; _cost = 0; Degrade(); }
    }

    private void Degrade()
    {
        if (_pitch < 36) { _pitch += 6; Rebuild(); }
        else FieldGovernor.Yield("el equipo iba justo y lo dejé quieto");
    }

    /// <summary>Follows the target element: eases toward its rectangle and its presence, fades when there is none.</summary>
    private void Ease(Pointer s, FrameworkElement? el)
    {
        if (el is { IsVisible: true })
        {
            Rect r;
            try { r = el.TransformToVisual(this).TransformBounds(new Rect(0, 0, el.ActualWidth, el.ActualHeight)); } catch (InvalidOperationException) { s.Amp *= 0.86; return; }
            if (s.Amp < 0.02) { s.X = r.Left; s.Y = r.Top; s.W = r.Width; s.H = r.Height; }
            else { s.X += (r.Left - s.X) * 0.3; s.Y += (r.Top - s.Y) * 0.3; s.W += (r.Width - s.W) * 0.3; s.H += (r.Height - s.H) * 0.3; }
            s.Amp += (1 - s.Amp) * 0.12;
        }
        else
        {
            s.Amp *= 0.86;
            if (s.Amp < 0.01) s.Amp = 0;
        }
    }

    /// <summary>Picks up the modpack's accent and the player's dot colour when either changed; returns whether anything did.</summary>
    private bool SyncColors()
    {
        var changed = false;
        if (Application.Current.Resources["AccentBrush"] is SolidColorBrush brush && brush.Color != _accentFor) { _accentFor = brush.Color; changed = true; }
        var wanted = ParseDot(Launcher.Instance.Prefs.DotColor);
        if (wanted != _dotColor) { _dotColor = wanted; _paperDot = Solid(wanted.R, wanted.G, wanted.B); _baseLayer.InvalidateVisual(); changed = true; }
        if (changed || _mix[0] == null)
            for (var k = 0; k <= MixSteps; k++)
            {
                var t = (double)k / MixSteps;
                _mix[k] = Solid((byte)Math.Round(_dotColor.R + (_accentFor.R - _dotColor.R) * t), (byte)Math.Round(_dotColor.G + (_accentFor.G - _dotColor.G) * t), (byte)Math.Round(_dotColor.B + (_accentFor.B - _dotColor.B) * t));
            }
        return changed;
    }

    private static Color ParseDot(string? hex)
    {
        try { if (hex is { Length: 7 } && hex[0] == '#') return (Color)ColorConverter.ConvertFromString(hex); } catch (FormatException) { }
        return Color.FromRgb(0x64, 0x63, 0x5f);
    }

    private void DrawLive() => _liveLayer.InvalidateVisual();

    // per-frame constants and the dot marks, so a dot reached by two effects is worked out once
    private double _ph, _w1, _w2, _w3, _warp;
    private bool _doPtr, _doHot, _doNext;
    private DrawingContext? _dc;
    private int _stamp;
    private int[] _mark = [], _rowStart = [], _rowCount = [];
    private int[] _plateIdx = [];
    private double _rowH;

    /// <summary>
    /// Works out only the dots something is acting on: the two plates, the neighbourhood of the pointer, of the contoured control and of
    /// the next action, and everything while a click ripple is alive. The rest of the lattice stays as the base layer shows it, so an
    /// idle frame is a few hundred dots instead of four thousand.
    /// </summary>
    private void PaintLive(DrawingContext dc)
    {
        if (_n == 0) return;
        SyncColors();
        _dc = dc; _stamp++;
        _ph = _t; _w1 = _ph * 0.55; _w2 = _ph * 0.42; _w3 = _ph * 0.7; _warp = _ph * 0.6;
        _doPtr = _ptr.Amp > 0.01; _doHot = _hot.Amp > 0.02; _doNext = _next.Amp > 0.02;

        foreach (var i in _plateIdx) Dot(i);
        if (_doPtr) InRect(_ptr.X - 156, _ptr.Y - 156, _ptr.X + 156, _ptr.Y + 156);
        if (_doHot) InRect(_hot.X - 58, _hot.Y - 58, _hot.X + _hot.W + 58, _hot.Y + _hot.H + 58);
        if (_ripples.Count > 0) RippleDots();
        if (_doNext) InRect(_next.X - 90, _next.Y - 90, _next.X + _next.W + 90, _next.Y + _next.H + 90);
        _dc = null;
    }

    /// <summary>Only the dots a ring is over (its band, its wake and a margin for its wobble), not the whole lattice: a long ripple stays cheap.</summary>
    private void RippleDots()
    {
        UpdateRipples();
        for (var i = 0; i < _n; i++)
        {
            double x = _gx[i], y = _gy[i];
            for (var k = 0; k < _ripples.Count; k++)
            {
                var d = Hyp(x - _ripples[k].X, y - _ripples[k].Y);
                var edge = (d - _rR[k]) / _rW[k];
                var slack = 0.06 * _rR[k] / _rW[k];   // the ring's outline wobbles by a few percent of its radius
                if (edge > -6 - slack && edge < 3 + slack) { Dot(i); break; }
            }
        }
    }

    /// <summary>The lattice rows and columns inside a rectangle, found by arithmetic, not by scanning every dot.</summary>
    private void InRect(double x0, double y0, double x1, double y1)
    {
        var r0 = Math.Max(0, (int)Math.Floor((y0 - _rowH * 0.5) / _rowH));
        var r1 = Math.Min(_rowStart.Length - 1, (int)Math.Ceiling((y1 - _rowH * 0.5) / _rowH));
        for (var r = r0; r <= r1; r++)
        {
            var off = (r & 1) != 0 ? _pitch / 2 : 0;
            var c0 = Math.Max(0, (int)Math.Ceiling((x0 - off) / _pitch));
            var c1 = Math.Min(_rowCount[r] - 1, (int)Math.Floor((x1 - off) / _pitch));
            for (var c = c0; c <= c1; c++) Dot(_rowStart[r] + c);
        }
    }

    private void Dot(int i)
    {
        if (_mark[i] == _stamp) return;
        _mark[i] = _stamp;
        double x = _gx[i], y = _gy[i], q = _gq[i];
        var wave = 0.5 + 0.25 * (Math.Sin(x * 0.0105 + _w1) * Math.Cos(y * 0.0125 - _w2) + Math.Sin((x + y) * 0.008 - _w3));

        // the two plates, their edges undulating
        var plate = _gp[i] + 0.12 * Math.Sin(_warp + y * 0.01 + x * 0.006);
        plate = plate <= 0 ? 0 : plate > 1 ? 1 : plate;
        plate = plate * plate * (3 - 2 * plate);

        var tone = (0.012 + 0.03 * wave) * (1 - 0.5 * q) + plate * (0.24 + 0.4 * wave) * (1 - 0.86 * q);

        if (_doPtr)
        {
            double dx = x - _ptr.X, dy = y - _ptr.Y, d2 = dx * dx + dy * dy;
            if (d2 < 24000) tone += Math.Exp(-d2 / 6500) * 0.36 * _ptr.Amp * (1 - 0.6 * q);
        }

        double glow = 0;
        for (var k = 0; k < _ripples.Count; k++)
        {
            var rp = _ripples[k];
            double dx = x - rp.X, dy = y - rp.Y;
            // a slightly uneven outline, drifting as it goes, so the wave reads as water and not as a drawn circle
            var wobble = 1 + 0.035 * Math.Sin(3 * Math.Atan2(dy, dx) + rp.Phase + (_t - rp.T0) * 1.4);
            var ring = (Hyp(dx, dy) - _rR[k] * wobble) / _rW[k];
            if (ring > -6 && ring < 3)
            {
                // sharp leading edge, soft wake behind it
                var shape = ring >= 0 ? Math.Exp(-ring * ring * 1.6) : Math.Exp(-ring * ring * 0.28);
                var v = shape * _rA[k] * (1 - 0.5 * q);
                if (rp.Accent) glow += v; else tone += v;
            }
        }

        if (_doHot)
        {
            var dx = Math.Max(Math.Max(_hot.X - x, 0), x - (_hot.X + _hot.W));
            var dy = Math.Max(Math.Max(_hot.Y - y, 0), y - (_hot.Y + _hot.H));
            var d = Hyp(dx, dy);
            if (d < 58) tone += Math.Pow(1 - d / 58, 2) * _hot.Amp * (0.4 + 0.6 * (0.5 + 0.5 * Math.Sin(x * 0.11 + _ph * 3) * Math.Cos(y * 0.11 - _ph * 2))) * 0.5;
        }
        if (_doNext)
        {
            var dx = Math.Max(Math.Max(_next.X - x, 0), x - (_next.X + _next.W));
            var dy = Math.Max(Math.Max(_next.Y - y, 0), y - (_next.Y + _next.H));
            var d = Hyp(dx, dy);
            if (d < 90) glow += Math.Pow(1 - d / 90, 2) * _next.Amp * (0.45 + 0.55 * Math.Sin(d * 0.09 - _ph * 4.2)) * 0.6;
        }

        // Where an accent effect and a dot-colour effect overlap, the dot takes a colour in between (more accent the more the accent
        // contributes) and is a little bigger than either alone: the two waves visibly meet and melt into each other.
        var value = glow > 0.02 ? Math.Max(glow, tone) + 0.35 * Math.Min(glow, tone) : tone;
        if (value <= 0.02) return;
        var r = Radius(value);
        if (r < 0.75 || r <= _rBase[i] + 0.35) return;   // the base layer already shows this dot
        var share = glow > 0.02 ? glow / (glow + tone) : 0;
        _dc!.DrawEllipse(_mix[(int)Math.Round(share * MixSteps)], null, new Point(x, y), r, r);
    }
}
