using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// What every drawn style background shares with the base one (LivingField): it moves only while the FieldGovernor allows it and draws a still
/// frame otherwise; it follows the pointer, answers clicks, knows where the interface keeps its text (LivingField.Quiet) and which is the main
/// action (LivingField.NextAction); it takes the player's intensity (the whole layer's opacity) and the accent; it watches its own frame cost
/// and gives up moving if the machine cannot afford it. A style only says how it looks: RenderLive, drawn at the frame rate it asks for, with
/// the time already advanced.
///
/// Two drawings, so a frame only costs what changes: RenderBase (what moves slowly or not at all) is kept as a texture and drawn again only
/// when the style asks for it (InvalidateBase); RenderLive (what twinkles, travels or answers the pointer) is drawn every frame on top of it.
/// </summary>
internal abstract class StyleField : Control, StyleHost.ILayer
{
    private readonly FrameClock _frame;
    private (double Idle, double Active) _rate = (15, 30);
    private double _budget = 60;
    private readonly DispatcherTimer _gate = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private double _lastRender, _lastQuiet = -9, _cost, _dt;
    private int _slow;
    private long _movedAt = long.MinValue;
    private Window? _window;

    /// <summary>Seconds of the style's own time: it only runs while the style may move.</summary>
    protected double T { get; private set; } = 20;
    /// <summary>How much of the style is there (0 to 1): its arrival or departure is drawn from this.</summary>
    protected double Reveal { get; private set; } = 1;
    protected bool Running { get; private set; }
    protected double W => Bounds.Width;
    protected double H => Bounds.Height;

    protected Point Pointer = new(-999, -999);
    protected double PointerAmp;
    private double _pointerWant;

    /// <summary>A click: where, when (in T), how strong, whether it was on the main action. Fading ones are on their way out.</summary>
    protected sealed class Click
    {
        public double X, Y, T0, Strength = 1, FadeAt = double.NaN;
        public bool Accent;
        public double Weight;
    }
    protected readonly List<Click> Clicks = [];

    protected Color Accent { get; private set; } = Color.FromRgb(0xff, 0x3d, 0x8b);
    protected Rect? Next { get; private set; }
    protected double NextAmp { get; private set; }
    protected List<Rect> Quiet { get; } = [];

    /// <summary>The style's own quiet pace (ms between frames while nothing happens): it only counts while performance mode saves (FieldGovernor.Rate).</summary>
    protected virtual double AmbientMs => 66;
    public abstract double ArriveSeconds { get; }
    public virtual double Ease(double raw) => raw * raw * (3 - 2 * raw);
    public Control View => this;

    private RenderTargetBitmap? _baseBitmap;
    private bool _baseDirty = true;
    private Geometry? _baseClip;
    private double _baseDx, _baseDy, _baseOpacity = 1;

    protected StyleField()
    {
        IsHitTestVisible = false;
        AttachedToVisualTree += OnAttached;
        DetachedFromVisualTree += OnDetached;
        _gate.Tick += (_, _) => Gate();
        _frame = new FrameClock(Step);
        SizeChanged += (_, _) => { Resized(); _baseDirty = true; Step(); };
    }

    /// <summary>What changes every frame, over the base.</summary>
    protected abstract void RenderLive(Dc dc, double dt);
    /// <summary>What changes slowly: kept as a texture until InvalidateBase.</summary>
    protected virtual void RenderBase(Dc dc) { }
    protected void InvalidateBase() => _baseDirty = true;
    /// <summary>Cuts the base drawing too (a style arriving shows its sky only behind its own front).</summary>
    protected void ClipBase(Geometry? clip) => _baseClip = clip;
    /// <summary>Shifts the base drawing without drawing it again (a parallax of the whole picture).</summary>
    protected void MoveBase(double dx, double dy) { _baseDx = dx; _baseDy = dy; }
    /// <summary>Fades the base drawing (a style arriving by fading in brings its ground in with it).</summary>
    protected void FadeBase(double opacity) => _baseOpacity = opacity;
    protected virtual void Resized() { }
    /// <summary>The machine could not keep up: draw less (fewer particles...). Return false when there is nothing left to drop.</summary>
    protected virtual bool Thin() => false;

    public void SetReveal(double progress)
    {
        Reveal = progress;
        if (!Running) Step();
    }

    public void Burst(Point point, bool accent) => AddClick(point, accent, 1);

    /// <summary>A left click on the background at that point (the style may take it: Press).</summary>
    public void Tap(Point point) { if (!Press(point)) AddClick(point, false, 1); }

    protected void AddClick(Point p, bool accent, double strength)
    {
        Clicks.Add(new Click { X = p.X, Y = p.Y, T0 = T, Accent = accent, Strength = strength, Weight = strength });
        // clicks never vanish: past seven live ones, the oldest fades out over 0.4 s instead of being dropped
        var live = Clicks.Where(c => double.IsNaN(c.FadeAt)).ToList();
        if (live.Count > 7) live[0].FadeAt = T;
        _movedAt = _clock.ElapsedMilliseconds;
    }

    // ---- wiring (the same as LivingField) ---------------------------------------------------------------------------------

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
        _gate.Stop(); _frame.Stop();
        Running = false;
    }

    private void OnWindowEvent(object? sender, EventArgs e) => Gate();
    private void OnWindowProperty(object? sender, AvaloniaPropertyChangedEventArgs e) { if (e.Property == Window.WindowStateProperty || e.Property == IsVisibleProperty) Gate(); }

    /// <summary>The player's intensity (Ajustes > Fondo), 0.1 to 1: the whole layer fades by default.</summary>
    protected virtual void ApplyIntensity(double intensity) { if (Math.Abs(Opacity - intensity) > 0.001) Opacity = intensity; }

    private void Gate()
    {
        ApplyIntensity(Math.Clamp(Services.Launcher.Instance.Prefs.DotOpacity ?? 1, 0.1, 1));
        SyncAccent();
        FieldGovernor.Evaluate(_window);
        var rate = FieldGovernor.Rate(1000 / AmbientMs);
        if (rate != _rate) { _rate = rate; _budget = 60; }
        if (FieldGovernor.Allowed && !Running)
        {
            Running = true;
            _lastRender = _clock.Elapsed.TotalSeconds;
            _frame.Fps = _rate.Idle;
            _frame.Start();
        }
        else if (!FieldGovernor.Allowed && Running)
        {
            Running = false;
            _frame.Stop();
            PointerAmp = _pointerWant = 0; Clicks.Clear();
        }
        Step();
    }

    private bool SyncAccent()
    {
        if (Pal.Accent.Color != Accent) { Accent = Pal.Accent.Color; AccentChanged(); return true; }
        return false;
    }

    protected virtual void AccentChanged() { }

    private void OnPointerMoved(object? sender, PointerEventArgs e)
    {
        if (!Running) return;
        Pointer = e.GetPosition(this);
        _pointerWant = 1;
        _movedAt = _clock.ElapsedMilliseconds;
    }

    private void OnPointerExited(object? sender, PointerEventArgs e) => _pointerWant = 0;

    private void OnPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (!Running) return;
        var target = e.Source as Visual;
        var accent = false; var control = false;
        while (target != null)
        {
            if (ReferenceEquals(target, LivingField.NextAction) || target is Button b && b.Background == Pal.Accent) { accent = true; control = true; break; }
            if (target is Button or TextBox or Slider or ToggleSwitch or ComboBox or ScrollBar) { control = true; break; }
            target = target.GetVisualParent();
        }
        var at = e.GetPosition(this);
        // a click that lands on the background's own drawing (and not on the interface over it) may be the style's to answer
        if (!control && e.GetCurrentPoint(this).Properties.IsLeftButtonPressed && !Quiet.Any(r => r.Contains(at)) && Press(at)) return;
        AddClick(at, accent, 1);
    }

    /// <summary>A left click on the background, where no control of the interface is: a style whose drawing has things to press takes it and returns true.</summary>
    protected virtual bool Press(Point at) => false;

    // ---- a frame --------------------------------------------------------------------------------------------------------------

    /// <summary>Advances the style's own time and state, then asks for the picture; Render draws it.</summary>
    private void Step()
    {
        if (W < 50 || H < 50 || _window == null) return;
        var started = Stopwatch.GetTimestamp();
        var now = _clock.Elapsed.TotalSeconds;
        _dt = Running ? Math.Min(0.25, now - _lastRender) : 0;   // a slow rate (5 FPS) still keeps time
        _lastRender = now;
        T += _dt;

        PointerAmp += (_pointerWant - PointerAmp) * Math.Min(1, _dt * 7);
        for (var i = Clicks.Count - 1; i >= 0; i--)
        {
            var c = Clicks[i];
            if (T - c.T0 > 5 || !double.IsNaN(c.FadeAt) && T - c.FadeAt > 0.4) { Clicks.RemoveAt(i); continue; }
            c.Weight = c.Strength * (double.IsNaN(c.FadeAt) ? 1 : Math.Max(0, 1 - (T - c.FadeAt) / 0.4));
        }
        if (now - _lastQuiet > 0.5 || !Running) { _lastQuiet = now; MeasureQuiet(); }
        FollowNext(_dt);

        InvalidateVisual();

        if (Running)
        {
            var interacting = _clock.ElapsedMilliseconds - _movedAt < 1500 || Clicks.Count > 0 || Reveal < 1;
            _frame.Fps = Math.Min(interacting ? _rate.Active : _rate.Idle, Math.Max(_rate.Idle, _budget));
            var ms = (Stopwatch.GetTimestamp() - started) * 1000.0 / Stopwatch.Frequency;
            _cost = _cost * 0.9 + ms * 0.1;
            _slow = _cost > 9 ? _slow + 1 : Math.Max(0, _slow - 1);
            if (_slow > 90) { _slow = 0; _cost = 0; Afford(); }
        }
    }

    private bool _paintFailed;

    public override void Render(DrawingContext context)
    {
        if (W < 50 || H < 50) return;
        var dc = new Dc(context);
        try
        {
            // the base, kept as a texture
            var size = new PixelSize(Math.Max(1, (int)Math.Ceiling(W)), Math.Max(1, (int)Math.Ceiling(H)));
            if (_baseBitmap == null || _baseBitmap.PixelSize != size) { _baseBitmap?.Dispose(); _baseBitmap = new RenderTargetBitmap(size, new Vector(96, 96)); _baseDirty = true; }
            if (_baseDirty)
            {
                _baseDirty = false;
                using var bc = _baseBitmap.CreateDrawingContext();
                var bdc = new Dc(bc);
                try { RenderBase(bdc); } finally { bdc.PopAll(); }
            }
            if (_baseOpacity > 0.001)
            {
                if (_baseClip != null) dc.PushClip(_baseClip);
                dc.PushOpacity(_baseOpacity);
                dc.PushTransform(Tr.Translate(_baseDx, _baseDy));
                dc.DrawImage(_baseBitmap, new Rect(0, 0, size.Width, size.Height));
                dc.Pop(); dc.Pop();
                if (_baseClip != null) dc.Pop();
            }
            RenderLive(dc, _dt);
        }
        // a background is decoration: whatever goes wrong while it paints, the launcher stays up (logged once, the frame is simply left as it is)
        catch (Exception ex) when (ex is not OutOfMemoryException) { if (!_paintFailed) { _paintFailed = true; App.Log($"background {GetType().Name}", ex); } }
        finally { dc.PopAll(); }
    }

    private void Afford()
    {
        if (FieldGovernor.PerfMode == "off") return;
        if (_budget > _rate.Idle + 0.5) { _budget = Math.Max(_rate.Idle, Math.Min(_budget, _rate.Active) * 0.75); return; }
        if (!Thin()) FieldGovernor.Yield("tu compu iba justita y lo dejé quieto para que descanse");
    }

    private string _quietSig = "";

    private void MeasureQuiet()
    {
        Quiet.Clear();
        foreach (var el in LivingField.Quiet)
        {
            if (!el.IsVisible || el.Bounds.Width <= 0) continue;
            if (el.TranslatePoint(new Point(0, 0), this) is { } origin) Quiet.Add(new Rect(origin, el.Bounds.Size));
        }
        // where the text is decides what the base draws faintly: it is drawn again when that moves
        var sig = string.Join('|', Quiet.Select(r => $"{(int)r.Left},{(int)r.Top},{(int)r.Right},{(int)r.Bottom}"));
        if (sig != _quietSig) { _quietSig = sig; InvalidateBase(); }
    }

    private void FollowNext(double dt)
    {
        var el = LivingField.NextAction;
        var shown = el is { IsVisible: true, IsHitTestVisible: true } && !Services.Launcher.Instance.Game.Busy;
        if (shown && el!.TranslatePoint(new Point(0, 0), this) is { } origin) Next = new Rect(origin, el.Bounds.Size); else shown = false;
        NextAmp += ((shown ? 1 : 0) - NextAmp) * Math.Min(1, dt * 6);
        if (!Running) NextAmp = shown ? 1 : 0;
    }

    /// <summary>How much a point lies under the interface's text (0 in the open, 1 inside), feathered over <paramref name="feather"/> px.</summary>
    protected double QuietAt(double x, double y, double feather = 60)
    {
        double q = 0;
        foreach (var r in Quiet)
        {
            var dx = Math.Max(Math.Max(r.Left - 20 - x, 0), x - (r.Right + 20));
            var dy = Math.Max(Math.Max(r.Top - 20 - y, 0), y - (r.Bottom + 20));
            q = Math.Max(q, 1 - Math.Min(1, Math.Sqrt(dx * dx + dy * dy) / feather));
        }
        return q;
    }

    // ---- colours --------------------------------------------------------------------------------------------------------------

    /// <summary>HSL (h in degrees, s and l 0..1) to a colour.</summary>
    protected static Color Hsl(double h, double s, double l, byte a = 255)
    {
        h = ((h % 360) + 360) % 360 / 360;
        double Hue(double p, double q, double t)
        {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1.0 / 6) return p + (q - p) * 6 * t;
            if (t < 0.5) return q;
            if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6;
            return p;
        }
        var q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p2 = 2 * l - q2;
        return Color.FromArgb(a, (byte)Math.Round(Hue(p2, q2, h + 1.0 / 3) * 255), (byte)Math.Round(Hue(p2, q2, h) * 255), (byte)Math.Round(Hue(p2, q2, h - 1.0 / 3) * 255));
    }

    protected static SolidColorBrush Frozen(Color c) => new(c);

    private readonly Dictionary<Color, SolidColorBrush> _brushes = [];
    private readonly Dictionary<(Color, double), Pen> _pens = [];

    /// <summary>A brush of that colour, made once (with Alpha's 32 steps a style draws from a few hundred brushes, not thousands a second).</summary>
    protected SolidColorBrush B(Color c)
    {
        if (_brushes.TryGetValue(c, out var b)) return b;
        if (_brushes.Count > 2000) _brushes.Clear();
        return _brushes[c] = Frozen(c);
    }

    /// <summary>A pen of that colour and width, made once.</summary>
    protected Pen P(Color c, double width)
    {
        if (_pens.TryGetValue((c, width), out var p)) return p;
        if (_pens.Count > 2000) _pens.Clear();
        return _pens[(c, width)] = new Pen(B(c), width);
    }

    private readonly Dictionary<string, FormattedText> _texts = [];

    /// <summary>A line of text, shaped once and kept (styles show the same few words frame after frame). Colour and size are part of it.</summary>
    protected FormattedText Text(string text, string family, double size, Color color, FontWeight? weight = null, FontStyle? style = null)
    {
        size = Math.Max(1, double.IsFinite(size) ? size : 1);   // a size of zero or less (no room left on a screen) is a word too small to see, never a crash
        var w = weight ?? FontWeight.Normal; var st = style ?? FontStyle.Normal;
        var key = $"{text}\u0001{family}\u0001{size:0.#}\u0001{color}\u0001{w}\u0001{st}";
        if (_texts.TryGetValue(key, out var shaped)) return shaped;
        if (_texts.Count > 600) _texts.Clear();
        shaped = new FormattedText(text, System.Globalization.CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
            new Typeface(FontMap.Resolve(family, FontMap.Kind.Body), st, w), size, Frozen(color));
        return _texts[key] = shaped;
    }

    /// <summary>A colour with another opacity (0..1), in 32 steps so the brushes and texts made from it can be kept.</summary>
    protected static Color Alpha(Color c, double a) => Color.FromArgb((byte)(Math.Round(Math.Clamp(a, 0, 1) * 31) / 31 * 255), c.R, c.G, c.B);
}
