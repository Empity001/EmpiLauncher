using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views;

/// <summary>
/// Two feathered halftone plates (bottom-left and top-right, like the classic launcher's) whose dots swell and shrink slowly.
/// It draws a still frame by default and moves only while the <see cref="FieldGovernor"/> allows it, at 8 frames a second:
/// halftone reads as motion at that rate and it costs a fraction of a 60 fps loop.
/// </summary>
internal sealed class LivingField : FrameworkElement
{
    // 6 frames a second and a coarser grid: measured (docs/native/MEASUREMENTS.md), the first version at 8 fps and 17 px cost ~4 % of a core.
    private const double Spacing = 22, MaxRadius = 6.6, Feather = 150, FrameMs = 167;

    private static readonly Brush[] Levels = MakeLevels();
    private readonly DispatcherTimer _gate = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _frame = new() { Interval = TimeSpan.FromMilliseconds(FrameMs) };
    private double _t;

    public LivingField()
    {
        IsHitTestVisible = false;
        RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);   // dots are large and soft anyway; anti-aliasing every one costs more than it shows
        Loaded += (_, _) =>
        {
            // React at once to what changes the answer, instead of waiting for the next 2 s check.
            Launcher.Instance.GameChanged += Gate;
            if (Window.GetWindow(this) is { } window) { window.Activated += OnWindowEvent; window.Deactivated += OnWindowEvent; window.StateChanged += OnWindowEvent; window.IsVisibleChanged += OnVisible; }
            Gate();
            _gate.Start();
        };
        Unloaded += (_, _) =>
        {
            Launcher.Instance.GameChanged -= Gate;
            if (Window.GetWindow(this) is { } window) { window.Activated -= OnWindowEvent; window.Deactivated -= OnWindowEvent; window.StateChanged -= OnWindowEvent; window.IsVisibleChanged -= OnVisible; }
            _gate.Stop(); _frame.Stop();
        };
        _gate.Tick += (_, _) => Gate();
        _frame.Tick += (_, _) => { _t += FrameMs / 1000.0; InvalidateVisual(); };
        SizeChanged += (_, _) => InvalidateVisual();
    }

    /// <summary>True while it is actually moving; the About tab shows this and why not.</summary>
    public bool Moving => _frame.IsEnabled;

    private void OnWindowEvent(object? sender, EventArgs e) => Gate();
    private void OnVisible(object sender, DependencyPropertyChangedEventArgs e) => Gate();

    private void Gate()
    {
        FieldGovernor.Evaluate(Window.GetWindow(this));
        if (FieldGovernor.Allowed && !_frame.IsEnabled) _frame.Start();
        else if (!FieldGovernor.Allowed && _frame.IsEnabled) { _frame.Stop(); _t = 0; InvalidateVisual(); }   // back to the still frame
    }

    private static Brush[] MakeLevels()
    {
        var levels = new Brush[8];
        for (var i = 0; i < levels.Length; i++)
        {
            var brush = new SolidColorBrush(Color.FromArgb((byte)(10 + i * 12), 0xf1, 0xef, 0xe8));
            brush.Freeze();
            levels[i] = brush;
        }
        return levels;
    }

    protected override void OnRender(DrawingContext dc)
    {
        double w = ActualWidth, h = ActualHeight;
        if (w < 200 || h < 200) return;
        // bottom-left plate and a shorter one at the top-right
        DrawPlate(dc, 0, h - Math.Min(500, h * 0.56), 340, Math.Min(500, h * 0.56), fadeTop: true, fadeRight: true);
        DrawPlate(dc, w - 320, 40, 320, 120, fadeTop: false, fadeRight: false, fadeLeft: true, fadeBottom: true);
    }

    private void DrawPlate(DrawingContext dc, double x0, double y0, double width, double height, bool fadeTop = false, bool fadeRight = false, bool fadeLeft = false, bool fadeBottom = false)
    {
        var cols = (int)(width / Spacing);
        var rows = (int)(height / Spacing);
        for (var r = 0; r < rows; r++)
        {
            var y = y0 + r * Spacing + Spacing / 2;
            var fy = fadeTop ? Math.Min(1, (y - y0) / Feather) : fadeBottom ? Math.Min(1, (y0 + height - y) / Feather) : 1;
            for (var c = 0; c < cols; c++)
            {
                var x = x0 + c * Spacing + Spacing / 2;
                var fx = fadeRight ? Math.Min(1, (x0 + width - x) / (Feather * 1.4)) : fadeLeft ? Math.Min(1, (x - x0) / (Feather * 1.4)) : 1;
                var edge = fx * fy;
                if (edge <= 0.03) continue;
                // two slow crossing waves; at t = 0 this is the still frame
                var wave = 0.5 + 0.5 * Math.Sin(c * 0.42 + _t * 0.9) * Math.Cos(r * 0.35 - _t * 0.6);
                var radius = MaxRadius * (0.12 + 0.88 * wave) * (0.35 + 0.65 * edge);
                if (radius < 0.6) continue;
                var level = Math.Clamp((int)(wave * edge * Levels.Length), 0, Levels.Length - 1);
                dc.DrawEllipse(Levels[level], null, new Point(x, y), radius, radius);
            }
        }
    }
}
