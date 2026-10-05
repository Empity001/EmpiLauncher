using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The living halftone ground (the base style): a port of the Windows launcher's field, itself a port of the Publisher's (tools/publisher/public/life.js).
///
/// ONE hex lattice of dots covers the window and every effect is a tone added to the same dots, so nothing looks like a separate plane:
/// slow interference waves and two plates that swell at the free corners; the pointer lifts the dots around it; every click sends a ring of waves
/// outward (accent-coloured on the main action); the control under the pointer is contoured; the next action (Jugar, Iniciar sesión) glows in the
/// accent and pulses. Dot size is the tone. Dots stay faint behind text ("quiet" zones the views register).
///
/// Cost: two layers. The faint base dots are one static drawing kept as a texture; only the dots that differ from it are redrawn each frame. It measures
/// its own frame cost and thins the lattice, and in the end stops, if the machine cannot afford it. The FieldGovernor decides whether it may move at all.
/// </summary>
internal sealed class LivingField : Panel, StyleHost.ILayer
{
    public Control View => this;
    public double ArriveSeconds => 1.5;
    public double Ease(double raw) => raw * raw * (3 - 2 * raw);

    private bool _arrivalRing;

    /// <summary>
    /// Coming back: the dots are printed again from the bottom-left plate toward the top-right one, a soft diagonal edge sweeping over what was
    /// there, and the plate sends one ring out as it starts.
    /// </summary>
    public void SetReveal(double progress)
    {
        if (progress >= 1) { OpacityMask = null; _arrivalRing = false; return; }
        if (!_arrivalRing && progress > 0.01) { _arrivalRing = true; Burst(new Point(Bounds.Width * 0.08, Bounds.Height * 0.9), accent: true); }
        var edge = progress * 1.35 - 0.2;
        OpacityMask = new LinearGradientBrush
        {
            StartPoint = new RelativePoint(0, 1, RelativeUnit.Relative), EndPoint = new RelativePoint(1, 0, RelativeUnit.Relative),
            GradientStops =
            {
                new GradientStop(Colors.Black, 0), new GradientStop(Colors.Black, Math.Clamp(edge, 0, 1)),
                new GradientStop(Colors.Transparent, Math.Clamp(edge + 0.18, 0, 1))
            }
        };
    }

    private const double StillTime = 7.3;
    private const double AmbientMs = 125;
    private const double RippleMinLife = 1.6, RippleMaxLife = 4.4, RipplePxPerSecond = 650, RippleBand = 26;

    /// <summary>A layer that paints through a callback. The base one is cached as a texture, so it costs one blit per frame, not 4,000 dots.</summary>
    private sealed class Layer : Control
    {
        public Action<DrawingContext>? Painter { get; set; }
        private readonly bool _cached;
        private RenderTargetBitmap? _bitmap;
        private bool _dirty = true;

        public Layer(bool cached) { IsHitTestVisible = false; _cached = cached; }
        public void Redraw() { _dirty = true; InvalidateVisual(); }

        public override void Render(DrawingContext context)
        {
            if (Painter == null) return;
            if (!_cached) { Painter(context); return; }
            var size = new PixelSize(Math.Max(1, (int)Math.Ceiling(Bounds.Width)), Math.Max(1, (int)Math.Ceiling(Bounds.Height)));
            if (_bitmap == null || _bitmap.PixelSize != size) { _bitmap?.Dispose(); _bitmap = new RenderTargetBitmap(size, new Vector(96, 96)); _dirty = true; }
            if (_dirty)
            {
                _dirty = false;
                using var dc = _bitmap.CreateDrawingContext();
                Painter(dc);
            }
            context.DrawImage(_bitmap, new Rect(0, 0, size.Width, size.Height));
        }
    }

    /// <summary>The main action of the screen (Jugar / Iniciar sesión): it glows. Views set and clear it.</summary>
    public static Control? NextAction { get; set; }
    /// <summary>Areas where text lives: dots stay faint there so nothing is ever hard to read.</summary>
    public static readonly List<Control> Quiet = [];
    /// <summary>Panels that hide the background completely (the rail, the dock).</summary>
    public static readonly List<Control> Covers = [];

    private readonly Layer _baseLayer = new(cached: true), _liveLayer = new(cached: false);
    private readonly DispatcherTimer _gate = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly FrameClock _frame;
    private (double Idle, double Active) _rate = (15, 30);
    private double _budget = 60;
    private readonly DispatcherTimer _quietTimer = new() { Interval = TimeSpan.FromMilliseconds(700) };
    private readonly Stopwatch _clock = Stopwatch.StartNew();

    private double _pitch = 24, _w, _h;
    private float[] _gx = [], _gy = [], _gp = [], _gq = [], _rBase = [];
    private int _n;
    private string _quietSig = "";

    private double _t = StillTime, _last;
    private bool _running;
    private readonly Pointer _ptr = new(), _hot = new(), _next = new();
    private Control? _hotElement;
    private long _movedAt = long.MinValue;
    private readonly List<Ripple> _ripples = [];
    private double _cost; private int _slow;

    // dot colours: opaque, so a bigger dot always fully covers the smaller base dot under it
    private const int MixSteps = 16;
    private readonly IBrush[] _mix = new IBrush[MixSteps + 1];
    private Color _dotColor = Color.FromRgb(0x64, 0x63, 0x5f), _accentFor = Color.FromRgb(0xff, 0x3d, 0x8b);
    private IBrush _paperDot = new SolidColorBrush(Color.FromRgb(0x64, 0x63, 0x5f));

    private sealed class Pointer { public double X = -999, Y = -999, W, H, Amp, Want; }
    private readonly record struct Ripple(double X, double Y, double T0, bool Accent, double Life, double Reach, double Phase);

    private readonly double[] _rR = new double[4], _rW = new double[4], _rA = new double[4];

    public LivingField()
    {
        IsHitTestVisible = false;
        _baseLayer.Painter = PaintBase;
        _liveLayer.Painter = PaintLive;
        Children.Add(_baseLayer);
        Children.Add(_liveLayer);
        AttachedToVisualTree += OnAttached;
        DetachedFromVisualTree += OnDetached;
        _gate.Tick += (_, _) => Gate();
        _frame = new FrameClock(Frame);
        _quietTimer.Tick += (_, _) => MeasureQuiet();
        SizeChanged += (_, _) => Rebuild();
    }

    // ---- wiring -------------------------------------------------------------------------------------------------------

    private Window? _window;

    private void OnAttached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        Services.Launcher.Instance.GameChanged += Gate;
        Services.Launcher.Instance.PrefsChanged += Gate;
        _window = TopLevel.GetTopLevel(this) as Window;
        if (_window != null)
        {
            _window.Activated += OnWindowEvent; _window.Deactivated += OnWindowEvent;
            _window.PropertyChanged += OnWindowProperty;
            _window.AddHandler(InputElement.PointerMovedEvent, OnPointerMoved, RoutingStrategies.Tunnel, handledEventsToo: true);
            _window.AddHandler(InputElement.PointerPressedEvent, OnPointerPressed, RoutingStrategies.Tunnel, handledEventsToo: true);
            _window.AddHandler(InputElement.PointerExitedEvent, OnPointerExited, RoutingStrategies.Tunnel, handledEventsToo: true);
        }
        Rebuild();
        Gate();
        _gate.Start();
    }

    private void OnDetached(object? sender, VisualTreeAttachmentEventArgs e)
    {
        Services.Launcher.Instance.GameChanged -= Gate;
        Services.Launcher.Instance.PrefsChanged -= Gate;
        if (_window != null)
        {
            _window.Activated -= OnWindowEvent; _window.Deactivated -= OnWindowEvent;
            _window.PropertyChanged -= OnWindowProperty;
            _window.RemoveHandler(InputElement.PointerMovedEvent, OnPointerMoved);
            _window.RemoveHandler(InputElement.PointerPressedEvent, OnPointerPressed);
            _window.RemoveHandler(InputElement.PointerExitedEvent, OnPointerExited);
            _window = null;
        }
        _gate.Stop(); _frame.Stop(); _quietTimer.Stop();
        _running = false;
    }

    private void OnWindowEvent(object? sender, EventArgs e) => Gate();
    private void OnWindowProperty(object? sender, AvaloniaPropertyChangedEventArgs e) { if (e.Property == Window.WindowStateProperty || e.Property == IsVisibleProperty) Gate(); }

    public bool Moving => _running;

    private void ApplyOpacity()
    {
        var wanted = Math.Clamp(Services.Launcher.Instance.Prefs.DotOpacity ?? 1, 0.1, 1);
        if (Math.Abs(Opacity - wanted) > 0.001) Opacity = wanted;
    }

    private void Gate()
    {
        ApplyOpacity();
        if (SyncColors()) DrawLive();
        FieldGovernor.Evaluate(_window);
        var rate = FieldGovernor.Rate(1000 / AmbientMs);
        if (rate != _rate) { _rate = rate; _budget = 60; }
        if (FieldGovernor.Allowed && !_running)
        {
            _running = true; _last = _clock.Elapsed.TotalSeconds; _t = StillTime;
            _frame.Fps = _rate.Idle; _frame.Start(); _quietTimer.Start();
        }
        else if (!FieldGovernor.Allowed && _running)
        {
            _running = false;
            _frame.Stop(); _quietTimer.Stop();
            _ptr.Amp = _hot.Amp = _next.Amp = 0; _ptr.Want = 0; _hotElement = null; _ripples.Clear();
            _t = StillTime;
            DrawLive();
        }
    }

    // ---- lattice -----------------------------------------------------------------------------------------------------

    private void Rebuild()
    {
        _w = Bounds.Width; _h = Bounds.Height;
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
                if (_gp[_n] > -0.12f) plates.Add(_n);
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

    private Rect? BoundsOf(Control el)
    {
        if (!el.IsVisible || el.Bounds.Width <= 0) return null;
        var origin = el.TranslatePoint(new Point(0, 0), this);
        return origin is { } p ? new Rect(p, el.Bounds.Size) : null;
    }

    /// <summary>How much of each dot lies under a block of text (0 in the open, 1 inside, feathered at the edge).</summary>
    private void MeasureQuiet(bool force = false)
    {
        var boxes = Quiet.Select(BoundsOf).Where(r => r != null).Select(r => r!.Value).ToList();
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

    private void DrawBase()
    {
        for (var i = 0; i < _n; i++) _rBase[i] = (float)Radius((0.012 + 0.03 * 0.25) * (1 - 0.5 * _gq[i]));
        _baseLayer.Redraw();
    }

    private void PaintBase(DrawingContext dc)
    {
        for (var i = 0; i < _n; i++)
        {
            var r = _rBase[i];
            if (r >= 0.75) dc.DrawEllipse(_paperDot, null, new Point(_gx[i], _gy[i]), r, r);
        }
    }

    // ---- input -------------------------------------------------------------------------------------------------------

    private void OnPointerMoved(object? sender, PointerEventArgs e)
    {
        if (!_running) return;
        var p = e.GetPosition(this);
        _ptr.X = p.X; _ptr.Y = p.Y; _ptr.Want = 1;
        _movedAt = _clock.ElapsedMilliseconds;
        _hotElement = FindHot(e.Source as Visual);
    }

    private void OnPointerExited(object? sender, PointerEventArgs e) { _ptr.Want = 0; _hotElement = null; }

    private void OnPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (!_running) return;
        var p = e.GetPosition(this);
        var target = FindHot(e.Source as Visual);
        var accent = target != null && (ReferenceEquals(target, NextAction) || target is Button b && b.Background == Pal.Accent);
        AddRipple(p, accent);
    }

    /// <summary>A ring from a point, as if it were clicked there.</summary>
    public void Burst(Point p, bool accent)
    {
        if (_running) AddRipple(p, accent);
    }

    private void AddRipple(Point p, bool accent)
    {
        var reach = Math.Max(Math.Max(Hyp(p.X, p.Y), Hyp(_w - p.X, p.Y)), Math.Max(Hyp(p.X, _h - p.Y), Hyp(_w - p.X, _h - p.Y))) + 3 * RippleBand;
        var life = Math.Clamp(1.2 + reach / RipplePxPerSecond, RippleMinLife, RippleMaxLife);
        _ripples.Add(new Ripple(p.X, p.Y, _t, accent, life, reach, (p.X * 0.013 + p.Y * 0.007) % (Math.PI * 2)));
        if (_ripples.Count > 4) _ripples.RemoveAt(0);
        _movedAt = _clock.ElapsedMilliseconds;
    }

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

    /// <summary>The control under the pointer, if it is one the player can act on (or a module or a card): that is what gets contoured.</summary>
    private static Control? FindHot(Visual? d)
    {
        while (d != null)
        {
            if (d is Button or TextBox or Slider or ToggleSwitch or ComboBox) return (Control)d;
            if (d is Border b && (b.Classes.Contains("module") || b.Classes.Contains("tile"))) return b;
            d = d.GetVisualParent();
        }
        return null;
    }

    // ---- frames ------------------------------------------------------------------------------------------------------

    private void Frame()
    {
        var started = Stopwatch.GetTimestamp();
        var now = _clock.Elapsed.TotalSeconds;
        _t += Math.Min(0.25, now - _last);
        _last = now;

        _ptr.Amp += (_ptr.Want - _ptr.Amp) * 0.12;
        Follow(_hot, _hotElement);
        Follow(_next, NextAction is { IsVisible: true, IsHitTestVisible: true } && !Services.Launcher.Instance.Game.Busy ? NextAction : null);
        _ripples.RemoveAll(r => _t - r.T0 > r.Life);

        var interacting = _clock.ElapsedMilliseconds - _movedAt < 1500 || _ripples.Count > 0 || _hot.Amp > 0.03;
        _frame.Fps = Math.Min(interacting ? _rate.Active : _rate.Idle, Math.Max(_rate.Idle, _budget));

        DrawLive();

        var ms = (Stopwatch.GetTimestamp() - started) * 1000.0 / Stopwatch.Frequency;
        _cost = _cost * 0.9 + ms * 0.1;
        _slow = _cost > 9 ? _slow + 1 : Math.Max(0, _slow - 1);
        if (_slow > 90) { _slow = 0; _cost = 0; Degrade(); }
    }

    private void Degrade()
    {
        if (FieldGovernor.PerfMode == "off") return;
        if (_budget > _rate.Idle + 0.5) { _budget = Math.Max(_rate.Idle, Math.Min(_budget, _rate.Active) * 0.75); return; }
        if (_pitch < 36) { _pitch += 6; Rebuild(); }
        else FieldGovernor.Yield("tu compu iba justita y lo dejé quieto para que descanse");
    }

    private void Follow(Pointer s, Control? el)
    {
        if (el is { IsVisible: true } && BoundsOf(el) is { } r)
        {
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
        if (Pal.Accent.Color != _accentFor) { _accentFor = Pal.Accent.Color; changed = true; }
        var wanted = ParseDot(Services.Launcher.Instance.Prefs.DotColor);
        if (wanted != _dotColor) { _dotColor = wanted; _paperDot = new SolidColorBrush(wanted); _baseLayer.Redraw(); changed = true; }
        if (changed || _mix[0] == null)
            for (var k = 0; k <= MixSteps; k++)
            {
                var t = (double)k / MixSteps;
                _mix[k] = new SolidColorBrush(Color.FromRgb((byte)Math.Round(_dotColor.R + (_accentFor.R - _dotColor.R) * t), (byte)Math.Round(_dotColor.G + (_accentFor.G - _dotColor.G) * t), (byte)Math.Round(_dotColor.B + (_accentFor.B - _dotColor.B) * t)));
            }
        return changed;
    }

    private static Color ParseDot(string? hex) => hex is { Length: 7 } && hex[0] == '#' && Color.TryParse(hex, out var c) ? c : Color.FromRgb(0x64, 0x63, 0x5f);

    private void DrawLive() => _liveLayer.InvalidateVisual();

    private double _ph, _w1, _w2, _w3, _warp;
    private bool _doPtr, _doHot, _doNext;
    private DrawingContext? _dc;
    private int _stamp;
    private int[] _mark = [], _rowStart = [], _rowCount = [];
    private int[] _plateIdx = [];
    private double _rowH;

    /// <summary>
    /// Works out only the dots something is acting on: the two plates, the neighbourhood of the pointer, of the contoured control and of the next
    /// action, and the ones a click ring is over. The rest of the lattice stays as the base layer shows it.
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
                var slack = 0.06 * _rR[k] / _rW[k];
                if (edge > -6 - slack && edge < 3 + slack) { Dot(i); break; }
            }
        }
    }

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
            var wobble = 1 + 0.035 * Math.Sin(3 * Math.Atan2(dy, dx) + rp.Phase + (_t - rp.T0) * 1.4);
            var ring = (Hyp(dx, dy) - _rR[k] * wobble) / _rW[k];
            if (ring > -6 && ring < 3)
            {
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

        var value = glow > 0.02 ? Math.Max(glow, tone) + 0.35 * Math.Min(glow, tone) : tone;
        if (value <= 0.02) return;
        var r = Radius(value);
        if (r < 0.75 || r <= _rBase[i] + 0.35) return;
        var share = glow > 0.02 ? glow / (glow + tone) : 0;
        _dc!.DrawEllipse(_mix[(int)Math.Round(share * MixSteps)], null, new Point(x, y), r, r);
    }
}
