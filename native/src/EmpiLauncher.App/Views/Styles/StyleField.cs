using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// What every drawn style background shares with the base one (LivingField): it moves only while the FieldGovernor allows it and draws a
/// still frame otherwise; it follows the pointer, answers clicks, knows where the interface keeps its text (LivingField.Quiet) and which
/// is the main action (LivingField.NextAction); it takes the player's intensity (the whole layer's opacity) and the accent; it watches its
/// own frame cost and gives up moving if the machine cannot afford it. A style only says how it looks: Render, drawn at the frame rate
/// it asks for, with the time already advanced.
///
/// Two drawings, so a frame only costs what changes: RenderBase (what moves slowly or not at all) is kept as a texture and redrawn only when
/// the style asks for it (InvalidateBase); Render (what twinkles, travels or answers the pointer) is recorded again every frame on top of it.
/// Neither goes through layout: each is a DrawingVisual that is simply re-recorded.
/// </summary>
internal abstract class StyleField : FrameworkElement, StyleHost.ILayer
{
    private readonly DispatcherTimer _frame = new(DispatcherPriority.Render);
    private readonly DispatcherTimer _gate = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private double _lastRender, _lastQuiet = -9, _cost;
    private int _slow;
    private long _movedAt = long.MinValue;

    /// <summary>Seconds of the style's own time: it only runs while the style may move.</summary>
    protected double T { get; private set; } = 20;
    /// <summary>How much of the style is there (0 to 1): its arrival or departure is drawn from this.</summary>
    protected double Reveal { get; private set; } = 1;
    protected bool Running { get; private set; }
    protected double W => ActualWidth;
    protected double H => ActualHeight;

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

    /// <summary>Frame interval while nothing happens, and while the player moves or clicks.</summary>
    protected virtual double AmbientMs => 66;
    protected virtual double InteractiveMs => 33;
    public abstract double ArriveSeconds { get; }
    public virtual double Ease(double raw) => raw * raw * (3 - 2 * raw);
    public FrameworkElement View => this;

    private readonly DrawingVisual _base = new() { CacheMode = new BitmapCache(1) };
    private readonly DrawingVisual _live = new();
    private bool _baseDirty = true;

    protected StyleField()
    {
        IsHitTestVisible = false;
        RenderOptions.SetBitmapScalingMode(this, BitmapScalingMode.Linear);
        AddVisualChild(_base);
        AddVisualChild(_live);
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        _gate.Tick += (_, _) => Gate();
        _frame.Tick += (_, _) => DrawFrame();
        SizeChanged += (_, _) => { Resized(); _baseDirty = true; DrawFrame(); };
    }

    protected override int VisualChildrenCount => 2;
    protected override Visual GetVisualChild(int index) => index == 0 ? _base : _live;

    /// <summary>What changes every frame, over the base.</summary>
    protected abstract void Render(DrawingContext dc, double dt);
    /// <summary>What changes slowly: kept as a texture until InvalidateBase.</summary>
    protected virtual void RenderBase(DrawingContext dc) { }
    protected void InvalidateBase() => _baseDirty = true;
    /// <summary>Cuts the base drawing too (a style arriving shows its sky only behind its own front).</summary>
    protected void ClipBase(Geometry? clip) { if (!ReferenceEquals(_base.Clip, clip)) _base.Clip = clip; }
    protected virtual void Resized() { }
    /// <summary>The machine could not keep up: draw less (fewer particles...). Return false when there is nothing left to drop.</summary>
    protected virtual bool Thin() => false;

    public void SetReveal(double progress)
    {
        Reveal = progress;
        if (!Running) DrawFrame();
    }

    public void Burst(Point point, bool accent) => AddClick(point, accent, 1);

    protected void AddClick(Point p, bool accent, double strength)
    {
        Clicks.Add(new Click { X = p.X, Y = p.Y, T0 = T, Accent = accent, Strength = strength, Weight = strength });
        // clicks never vanish: past seven live ones, the oldest fades out over 0.4 s instead of being dropped
        var live = Clicks.Where(c => double.IsNaN(c.FadeAt)).ToList();
        if (live.Count > 7) live[0].FadeAt = T;
        _movedAt = _clock.ElapsedMilliseconds;
    }

    // ---- wiring (the same as LivingField) ---------------------------------------------------------------------------------

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
        _gate.Stop(); _frame.Stop();
        Running = false;
    }

    private void OnWindowEvent(object? sender, EventArgs e) => Gate();
    private void OnVisible(object sender, DependencyPropertyChangedEventArgs e) => Gate();

    private void Gate()
    {
        var wanted = Math.Clamp(Launcher.Instance.Prefs.DotOpacity ?? 1, 0.1, 1);
        if (Math.Abs(Opacity - wanted) > 0.001) Opacity = wanted;
        SyncAccent();
        FieldGovernor.Evaluate(Window.GetWindow(this));
        if (FieldGovernor.Allowed && !Running)
        {
            Running = true;
            _lastRender = _clock.Elapsed.TotalSeconds;
            _frame.Interval = TimeSpan.FromMilliseconds(AmbientMs);
            _frame.Start();
        }
        else if (!FieldGovernor.Allowed && Running)
        {
            Running = false;
            _frame.Stop();
            PointerAmp = _pointerWant = 0; Clicks.Clear();
        }
        DrawFrame();
    }

    private bool SyncAccent()
    {
        if (Application.Current.Resources["AccentBrush"] is SolidColorBrush brush && brush.Color != Accent) { Accent = brush.Color; AccentChanged(); return true; }
        return false;
    }

    protected virtual void AccentChanged() { }

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (!Running) return;
        Pointer = e.GetPosition(this);
        _pointerWant = 1;
        _movedAt = _clock.ElapsedMilliseconds;
    }

    private void OnMouseLeave(object sender, MouseEventArgs e) => _pointerWant = 0;

    private void OnMouseDown(object sender, MouseButtonEventArgs e)
    {
        if (!Running) return;
        var target = e.OriginalSource as DependencyObject;
        var accent = false;
        while (target != null)
        {
            if (ReferenceEquals(target, LivingField.NextAction) || target is Button b && ReferenceEquals(b.Style, Application.Current.TryFindResource("PrimaryButton"))) { accent = true; break; }
            if (target is ButtonBase) break;
            target = target is Visual ? VisualTreeHelper.GetParent(target) : LogicalTreeHelper.GetParent(target);
        }
        AddClick(e.GetPosition(this), accent, 1);
    }

    // ---- a frame --------------------------------------------------------------------------------------------------------------

    private void DrawFrame()
    {
        if (W < 50 || H < 50 || !IsLoaded) return;
        var started = Stopwatch.GetTimestamp();
        var now = _clock.Elapsed.TotalSeconds;
        var dt = Running ? Math.Min(0.1, now - _lastRender) : 0;
        _lastRender = now;
        T += dt;

        PointerAmp += (_pointerWant - PointerAmp) * Math.Min(1, dt * 7);
        for (var i = Clicks.Count - 1; i >= 0; i--)
        {
            var c = Clicks[i];
            if (T - c.T0 > 5 || !double.IsNaN(c.FadeAt) && T - c.FadeAt > 0.4) { Clicks.RemoveAt(i); continue; }
            c.Weight = c.Strength * (double.IsNaN(c.FadeAt) ? 1 : Math.Max(0, 1 - (T - c.FadeAt) / 0.4));
        }
        if (now - _lastQuiet > 0.5 || !Running) { _lastQuiet = now; MeasureQuiet(); }
        FollowNext(dt);

        using (var dc = _live.RenderOpen()) Render(dc, dt);
        if (_baseDirty) { _baseDirty = false; using var bc = _base.RenderOpen(); RenderBase(bc); }

        // fast while the player is interacting or the style is arriving, gentle otherwise
        if (Running)
        {
            var interacting = _clock.ElapsedMilliseconds - _movedAt < 1500 || Clicks.Count > 0 || Reveal < 1;
            var wanted = TimeSpan.FromMilliseconds(interacting ? InteractiveMs : AmbientMs);
            if (_frame.Interval != wanted) _frame.Interval = wanted;
            var ms = (Stopwatch.GetTimestamp() - started) * 1000.0 / Stopwatch.Frequency;
            _cost = _cost * 0.9 + ms * 0.1;
            _slow = _cost > 9 ? _slow + 1 : Math.Max(0, _slow - 1);
            if (_slow > 90) { _slow = 0; _cost = 0; if (!Thin()) FieldGovernor.Yield("el equipo iba justo y lo dejé quieto"); }
        }
    }

    private string _quietSig = "";

    private void MeasureQuiet()
    {
        Quiet.Clear();
        foreach (var el in LivingField.Quiet)
        {
            if (!el.IsVisible || el.ActualWidth <= 0) continue;
            try { Quiet.Add(el.TransformToVisual(this).TransformBounds(new Rect(0, 0, el.ActualWidth, el.ActualHeight))); } catch (InvalidOperationException) { }
        }
        // where the text is decides what the base draws faintly: it is drawn again when that moves
        var sig = string.Join('|', Quiet.Select(r => $"{(int)r.Left},{(int)r.Top},{(int)r.Right},{(int)r.Bottom}"));
        if (sig != _quietSig) { _quietSig = sig; InvalidateBase(); }
    }

    private void FollowNext(double dt)
    {
        var el = LivingField.NextAction;
        var shown = el is { IsVisible: true, IsHitTestVisible: true } && !Launcher.Instance.Game.Busy;
        if (shown)
        {
            try { Next = el!.TransformToVisual(this).TransformBounds(new Rect(0, 0, el.ActualWidth, el.ActualHeight)); } catch (InvalidOperationException) { shown = false; }
        }
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

    protected static SolidColorBrush Frozen(Color c) { var b = new SolidColorBrush(c); b.Freeze(); return b; }
}
