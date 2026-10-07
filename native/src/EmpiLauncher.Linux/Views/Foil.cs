using Avalonia;
using Avalonia.Media;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// Celestial's holographic foil on the title and the main action. It holds still, and every ten seconds a sheen passes over it in 2.4 s (the bands
/// slide one width along). Between sheens nothing ticks, so the interface is not drawn again for it.
/// </summary>
internal static class Foil
{
    private static readonly string[] Text = ["#ffffff", "#ffd6f2", "#c9f3ff", "#e6d3ff", "#fff6c9", "#ffffff"];
    private static readonly string[] Fill = ["#ffd6f2", "#c9f3ff", "#e6d3ff", "#fff6c9", "#ffd6f2"];
    private static readonly DispatcherTimer Every = new() { Interval = TimeSpan.FromSeconds(10) };
    private static readonly DispatcherTimer Frames = new(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(33) };
    private static readonly List<LinearGradientBrush> Live = [];
    private static long _from;
    private static bool _wired, _on, _moving = true;

    private static LinearGradientBrush Holo(string[] colors)
    {
        var brush = new LinearGradientBrush { StartPoint = Rp.Rel(0, 0.2), EndPoint = Rp.Rel(1, 0.8), SpreadMethod = GradientSpreadMethod.Repeat };
        for (var i = 0; i < colors.Length; i++) brush.GradientStops.Add(new GradientStop(Color.Parse(colors[i]), (double)i / (colors.Length - 1)));
        return brush;
    }

    /// <summary>Puts the foil on (Celestial) or takes it off (any other style).</summary>
    public static void Set(bool on)
    {
        _on = on;
        Live.Clear();
        if (!_wired)
        {
            _wired = true;
            Every.Tick += (_, _) => { if (_on && _moving && Motion.Enabled) { _from = Environment.TickCount64; Frames.Start(); } };
            Frames.Tick += (_, _) => Step();
        }
        if (!on) { Every.Stop(); Frames.Stop(); Pal.TitleInk = Pal.Title; Pal.HoloFill = new SolidColorBrush(Color.Parse("#ffd6f2")); return; }
        var text = Holo(Text); var fill = Holo(Fill);
        Live.Add(text); Live.Add(fill);
        Pal.TitleInk = text; Pal.HoloFill = fill;
        if (_moving && Motion.Enabled) Every.Start();
    }

    public static void SetMoving(bool moving)
    {
        _moving = moving;
        if (!_on) return;
        if (moving && Motion.Enabled) Every.Start(); else { Every.Stop(); Frames.Stop(); Reset(); }
    }

    private static void Step()
    {
        var t = Math.Clamp((Environment.TickCount64 - _from) / 2400.0, 0, 1);
        var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.Pow(-2 * t + 2, 3) / 2;   // in-out, the launcher's travel curve
        Shift(-eased);
        if (t >= 1) { Frames.Stop(); Reset(); }
    }

    private static void Reset() => Shift(0);

    private static void Shift(double x)
    {
        foreach (var brush in Live) { brush.StartPoint = Rp.Rel(x, 0.2); brush.EndPoint = Rp.Rel(1 + x, 0.8); }
    }
}
