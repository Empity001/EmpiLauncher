using Avalonia;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using EmpiLauncher.Linux.Services;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// OLEAJE: the bottom of a pool at night, seen from above (the water is Styles/Shaders/oleaje.hlsl, on the graphics card). Light
/// caustics drift over deep blue, brightest to the right of the modpack's text; a click drops a ripple; it arrives as the tide coming in.
///
/// What is real, drawn over the water: the modpack's name, huge and faint, sunk at the bottom right like letters on the pool floor, and
/// while a download runs, the tide itself: a line of foam that climbs the window with the download, with how far it has got.
/// </summary>
internal sealed class OleajeField : ShaderField
{
    public override double ArriveSeconds => 2.1;
    public override double Ease(double p) => p < 0.5 ? 4 * p * p * p : 1 - Math.Pow(-2 * p + 2, 3) / 2;

    private static readonly Color Pale = Color.FromRgb(220, 236, 255);
    private const string Face = "Segoe UI Light, Segoe UI";

    public OleajeField() : base(Shaders.Oleaje) { }

    protected override void RenderLive(Dc dc, double dt)
    {
        Feed(dc, T + 20);
        var l = Services.Launcher.Instance;
        if (l.Selected is { } pack)
        {
            // the name on the pool floor
            var size = Math.Clamp(W * 0.15, 90, 190);
            var ghost = Text(pack.Name, Face, size, Alpha(Pale, 0.07));
            ghost.MaxTextWidth = Math.Max(200, W * 0.7); ghost.TextAlignment = TextAlignment.Right;
            dc.DrawText(ghost, new Point(W - 40 - ghost.MaxTextWidth, H - 90 - ghost.Height));
        }
        var game = l.Game;
        if (game.Busy)
        {
            // the tide of the download: foam climbing with it
            var share = Math.Clamp(game.Percent / 100.0, 0, 1);
            var y0 = H - 20 - (H - 90) * share;
            var foam = new StreamGeometry();
            using (var g = foam.OpenW())
                for (var x = -10.0; x <= W + 10; x += 12)
                {
                    var y = y0 + 5 * Math.Sin(x * 0.012 + T * 1.4) + 2.5 * Math.Sin(x * 0.037 - T * 3.3);
                    if (x < -9) g.BeginFigure(new Point(x, y), false, false); else g.LineTo(new Point(x, y), true, true);
                }
            dc.DrawGeometry(null, P(Alpha(Pale, 0.55), 1.4), foam);
            var label = Text($"marea {game.Percent}%", Face, 13, Alpha(Pale, 0.8));
            dc.DrawText(label, new Point(W - 24 - label.Width, y0 - 26));
        }
    }
}
