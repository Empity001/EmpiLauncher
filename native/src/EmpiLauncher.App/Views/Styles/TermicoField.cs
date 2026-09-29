using System.Windows;
using System.Windows.Media;
using EmpiLauncher.App.Services;

namespace EmpiLauncher.App.Views.Styles;

/// <summary>
/// TÉRMICO: a thermal camera (the picture is Styles/Shaders/termico.hlsl, on the graphics card): folding heat, cold black through teal and
/// the accent's violet to pink, orange and white-hot, strongest to the right of the modpack's text. A click is a hot spot spreading as a
/// ring; it arrives by heating up from the light outward, with a burning edge.
///
/// What is real, drawn over the picture as the camera's own marks: a measuring box that wanders over the hot area and reads a temperature
/// (it rises while the modpack downloads), a readout with the modpack's mods, Minecraft and version, and the camera's colour scale.
/// </summary>
internal sealed class TermicoField : ShaderField
{
    public override double ArriveSeconds => 2.2;
    public override double Ease(double raw) => raw * raw * (3 - 2 * raw);

    private static readonly Color Mark = Color.FromArgb(140, 255, 255, 255);
    private const string Mono = "Cascadia Mono, Consolas";
    private static readonly LinearGradientBrush Scale = ScaleBrush();

    private static LinearGradientBrush ScaleBrush()
    {
        var bar = new LinearGradientBrush { StartPoint = new Point(0, 1), EndPoint = new Point(0, 0) };
        foreach (var (hex, at) in new[] { ("#020306", 0.0), ("#051a13", 0.25), ("#6b40e6", 0.42), ("#ff54a8", 0.58), ("#ff8f4d", 0.7), ("#ffd1a8", 0.82), ("#fff8eb", 1.0) })
            bar.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString(hex), at));
        bar.Freeze();
        return bar;
    }

    public TermicoField() : base("termico", NoiseBrush()) { }

    protected override void Render(DrawingContext dc, double dt)
    {
        Feed(T + 20);
        var l = Launcher.Instance;
        var game = l.Game;
        var light = Light();
        var pen = P(Mark, 1);

        // the measuring box, wandering over the hot area
        double bx = Math.Clamp(light.X * W - 60 + Math.Sin(T * 0.23) * 110, 10, W - 130), by = Math.Clamp(light.Y * H - 46 + Math.Sin(T * 0.31 + 1) * 80, 60, H - 150);
        var box = new Rect(bx, by, 120, 92);
        dc.DrawRectangle(null, pen, box);
        var tick = P(Color.FromArgb(220, 255, 255, 255), 2);
        foreach (var (cx, cy, sx, sy) in new[] { (box.Left, box.Top, 1, 1), (box.Right, box.Top, -1, 1), (box.Left, box.Bottom, 1, -1), (box.Right, box.Bottom, -1, -1) })
        {
            dc.DrawLine(tick, new Point(cx, cy), new Point(cx + sx * 12, cy));
            dc.DrawLine(tick, new Point(cx, cy), new Point(cx, cy + sy * 12));
        }
        dc.DrawLine(pen, new Point(box.Left + box.Width / 2 - 6, box.Top + box.Height / 2), new Point(box.Left + box.Width / 2 + 6, box.Top + box.Height / 2));
        dc.DrawLine(pen, new Point(box.Left + box.Width / 2, box.Top + box.Height / 2 - 6), new Point(box.Left + box.Width / 2, box.Top + box.Height / 2 + 6));
        var temp = 36.2 + Math.Sin(T * 0.7) * 1.4 + (game.Busy ? Math.Clamp(game.Percent, 0, 100) / 100.0 * 6 : 0);
        var reading = Text($"{temp:0.0}°", Mono, 13, Colors.White, FontWeights.SemiBold);
        dc.DrawText(reading, new Point(box.Left + 4, box.Top - reading.Height - 3));

        // the readout
        if (l.Selected is { } pack)
        {
            string[] lines = [$"MODS {pack.Mods}", $"MC {pack.MinecraftVersion}", $"v{pack.Version}", game.Busy ? $"DESCARGA {game.Percent}%" : "ε 0.95"];
            var y = H - 150.0;
            foreach (var line in lines) { var t = Text(line, Mono, 11, Mark); dc.DrawText(t, new Point(W - 58 - t.Width, y)); y += 16; }
        }

        // the colour scale, on the right edge
        var scale = new Rect(W - 34, 70, 8, Math.Max(60, H - 260));
        dc.DrawRectangle(Scale, pen, scale);
        var hot = Text("41°", Mono, 10, Mark); var cold = Text("18°", Mono, 10, Mark);
        dc.DrawText(hot, new Point(scale.Left - hot.Width - 4, scale.Top - 2));
        dc.DrawText(cold, new Point(scale.Left - cold.Width - 4, scale.Bottom - cold.Height + 2));
    }
}
