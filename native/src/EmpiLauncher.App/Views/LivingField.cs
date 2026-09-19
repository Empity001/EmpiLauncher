using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views;

/// <summary>
/// The living halftone field, drawn over the window's faint dot grid. Two feathered plates (bottom-left, top-right) swell and shrink
/// slowly, and the dots around the mouse pointer rise toward it in the modpack's accent colour and settle again when it stops.
///
/// It draws a still frame by default and moves only while the <see cref="FieldGovernor"/> allows it. Cost is kept low on purpose:
/// the waves run at 6 frames a second, the pointer effect at 30 but only while the mouse is actually moving (and for a moment after),
/// and it only touches the ~250 dots within reach of the pointer. Settings > Acerca shows whether it is moving and, if not, why.
/// </summary>
internal sealed class LivingField : FrameworkElement
{
    // 6 frames a second and a coarse grid for the waves: measured (docs/native/MEASUREMENTS.md), 8 fps at 17 px cost ~4 % of a core.
    private const double Cell = 22, MaxRadius = 6.6, Feather = 150, WaveFrameMs = 167, PointerFrameMs = 33;
    private const double Reach = 170, PointerMaxRadius = 8.5, PointerLinger = 1200;

    private static readonly Brush[] PaperLevels = MakeLevels(Color.FromRgb(0xf1, 0xef, 0xe8), 10, 12);
    private Brush[] _accentLevels = MakeLevels(Color.FromRgb(0xff, 0x3d, 0x8b), 40, 24);
    private Color _accentFor = Color.FromRgb(0xff, 0x3d, 0x8b);

    private readonly DispatcherTimer _gate = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _waves = new() { Interval = TimeSpan.FromMilliseconds(WaveFrameMs) };
    private readonly DispatcherTimer _pointerFrames = new() { Interval = TimeSpan.FromMilliseconds(PointerFrameMs) };
    private double _t;
    private Point _pointer;
    private long _pointerAt = long.MinValue;

    public LivingField()
    {
        IsHitTestVisible = false;
        RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);   // dots are large and soft anyway; anti-aliasing every one costs more than it shows
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        _gate.Tick += (_, _) => Gate();
        _waves.Tick += (_, _) => { _t += WaveFrameMs / 1000.0; if (!PointerActive) InvalidateVisual(); };
        _pointerFrames.Tick += (_, _) =>
        {
            if (PointerActive) InvalidateVisual();
            else { _pointerFrames.Stop(); InvalidateVisual(); }   // the pointer settled: one last frame without it
        };
        SizeChanged += (_, _) => InvalidateVisual();
    }

    private bool PointerActive => Environment.TickCount64 - _pointerAt < PointerLinger;

    private void OnLoaded(object? sender, RoutedEventArgs e)
    {
        // React at once to what changes the answer, instead of waiting for the next 2 s check.
        Launcher.Instance.GameChanged += Gate;
        Launcher.Instance.PrefsChanged += Gate;
        if (Window.GetWindow(this) is { } window)
        {
            window.Activated += OnWindowEvent; window.Deactivated += OnWindowEvent; window.StateChanged += OnWindowEvent;
            window.IsVisibleChanged += OnVisible; window.PreviewMouseMove += OnMouse;
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
            window.IsVisibleChanged -= OnVisible; window.PreviewMouseMove -= OnMouse;
        }
        _gate.Stop(); _waves.Stop(); _pointerFrames.Stop();
    }

    private void OnWindowEvent(object? sender, EventArgs e) => Gate();
    private void OnVisible(object sender, DependencyPropertyChangedEventArgs e) => Gate();

    private void OnMouse(object sender, MouseEventArgs e)
    {
        if (!_waves.IsEnabled) return;   // the governor said no: the pointer does nothing either
        _pointer = e.GetPosition(this);
        _pointerAt = Environment.TickCount64;
        if (!_pointerFrames.IsEnabled) _pointerFrames.Start();
    }

    /// <summary>True while it is actually moving; the About tab shows this and why not.</summary>
    public bool Moving => _waves.IsEnabled;

    private void Gate()
    {
        FieldGovernor.Evaluate(Window.GetWindow(this));
        if (FieldGovernor.Allowed && !_waves.IsEnabled) _waves.Start();
        else if (!FieldGovernor.Allowed && _waves.IsEnabled)
        {
            _waves.Stop(); _pointerFrames.Stop(); _t = 0; _pointerAt = long.MinValue;
            InvalidateVisual();   // back to the still frame
        }
    }

    private static Brush[] MakeLevels(Color color, int baseAlpha, int step)
    {
        var levels = new Brush[8];
        for (var i = 0; i < levels.Length; i++)
        {
            var brush = new SolidColorBrush(Color.FromArgb((byte)Math.Min(255, baseAlpha + i * step), color.R, color.G, color.B));
            brush.Freeze();
            levels[i] = brush;
        }
        return levels;
    }

    /// <summary>The pointer dots use the modpack's accent; rebuild the shades only when it actually changed.</summary>
    private void SyncAccent()
    {
        if (Application.Current.Resources["AccentBrush"] is not SolidColorBrush brush || brush.Color == _accentFor) return;
        _accentFor = brush.Color;
        _accentLevels = MakeLevels(_accentFor, 40, 24);
    }

    protected override void OnRender(DrawingContext dc)
    {
        double w = ActualWidth, h = ActualHeight;
        if (w < 200 || h < 200) return;
        // bottom-left plate and a shorter one at the top-right
        DrawPlate(dc, 0, h - Math.Min(500, h * 0.56), 340, Math.Min(500, h * 0.56), fadeTop: true, fadeRight: true);
        DrawPlate(dc, w - 320, 40, 320, 120, fadeTop: false, fadeRight: false, fadeLeft: true, fadeBottom: true);
        if (PointerActive) DrawPointer(dc, w, h);
    }

    private void DrawPlate(DrawingContext dc, double x0, double y0, double width, double height, bool fadeTop = false, bool fadeRight = false, bool fadeLeft = false, bool fadeBottom = false)
    {
        var cols = (int)(width / Cell);
        var rows = (int)(height / Cell);
        for (var r = 0; r < rows; r++)
        {
            var y = y0 + r * Cell + Cell / 2;
            var fy = fadeTop ? Math.Min(1, (y - y0) / Feather) : fadeBottom ? Math.Min(1, (y0 + height - y) / Feather) : 1;
            for (var c = 0; c < cols; c++)
            {
                var x = x0 + c * Cell + Cell / 2;
                var fx = fadeRight ? Math.Min(1, (x0 + width - x) / (Feather * 1.4)) : fadeLeft ? Math.Min(1, (x - x0) / (Feather * 1.4)) : 1;
                var edge = fx * fy;
                if (edge <= 0.03) continue;
                // two slow crossing waves; at t = 0 this is the still frame
                var wave = 0.5 + 0.5 * Math.Sin(c * 0.42 + _t * 0.9) * Math.Cos(r * 0.35 - _t * 0.6);
                var radius = MaxRadius * (0.12 + 0.88 * wave) * (0.35 + 0.65 * edge);
                if (radius < 0.6) continue;
                var level = Math.Clamp((int)(wave * edge * PaperLevels.Length), 0, PaperLevels.Length - 1);
                dc.DrawEllipse(PaperLevels[level], null, new Point(x, y), radius, radius);
            }
        }
    }

    /// <summary>The grid dots within reach of the pointer swell toward it, strongest at the centre, in the accent colour.</summary>
    private void DrawPointer(DrawingContext dc, double w, double h)
    {
        SyncAccent();
        // fades out as the pointer settles, so the dots ease back instead of vanishing
        var age = Environment.TickCount64 - _pointerAt;
        var life = age < PointerLinger * 0.5 ? 1.0 : Math.Max(0, 1 - (age - PointerLinger * 0.5) / (PointerLinger * 0.5));

        var c0 = Math.Max(0, (int)((_pointer.X - Reach) / Cell)); var c1 = Math.Min((int)(w / Cell), (int)((_pointer.X + Reach) / Cell) + 1);
        var r0 = Math.Max(0, (int)((_pointer.Y - Reach) / Cell)); var r1 = Math.Min((int)(h / Cell), (int)((_pointer.Y + Reach) / Cell) + 1);
        for (var r = r0; r <= r1; r++)
        {
            var y = r * Cell + Cell / 2;
            for (var c = c0; c <= c1; c++)
            {
                var x = c * Cell + Cell / 2;
                var dx = x - _pointer.X; var dy = y - _pointer.Y;
                var distance = Math.Sqrt(dx * dx + dy * dy);
                if (distance >= Reach) continue;
                var pull = Math.Pow(1 - distance / Reach, 1.6) * life;
                var radius = 1.3 + (PointerMaxRadius - 1.3) * pull;
                if (radius < 1.6) continue;
                // the dot leans a little toward the pointer, as if drawn to it
                var lean = pull * 5.0 / Math.Max(distance, 1);
                var level = Math.Clamp((int)(pull * _accentLevels.Length), 0, _accentLevels.Length - 1);
                dc.DrawEllipse(_accentLevels[level], null, new Point(x - dx * lean * 0.5, y - dy * lean * 0.5), radius, radius);
            }
        }
    }
}
