using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Linux.Services;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// The launcher's logo, the way it arrives and the way it leaves: the dot-matrix E of the Publisher (seventeen paper dots, one row slipped sideways
/// and one dot in the accent) over the halftone clouds, speaking the tool's own language for "something changed": a glitch.
///
/// OPENING (about 1.2 s, while the engine starts anyway): opaque bands cover the window; the dots of the E pop in out of order, the accent dot lands
/// with a little overshoot and sends a ring outward, the wordmark tears in with the stripes of tear.png flashing across it, the clouds drift behind.
/// Then the bands slide away in alternating directions, staggered, uncovering the launcher. CLOSING (about 0.55 s): the same bands slide in and the
/// mark flashes; then the window really closes. It is a rare moment (once per session), a click or a key skips it, it can be switched off in
/// Ajustes > Launcher, and it is drawn from the clock alone (a few dozen shapes, no per-frame allocation worth the name).
/// </summary>
internal sealed class SplashLayer : Control
{
    private static readonly (double X, double Y)[] Dots =
    [
        (2, 2), (6, 2), (10, 2), (14, 2), (18, 2), (2, 6), (2, 10), (2, 14), (6, 14), (10, 14), (14, 14), (2, 18), (2, 22), (2, 26), (6, 26), (10, 26), (14, 26)
    ];
    private const double K = 6, R = 1.6;     // the mark is drawn on a 20 x 28 grid, K pixels a unit; the dots are R units wide
    private const int Bands = 12;
    public const int IntroMs = 1150, CoverMs = 560;
    private static readonly Color Pink = Color.FromRgb(0xff, 0x3d, 0x8b);

    /// <summary>Not switched off in Ajustes and not turned off for a test (EMPI_SPLASH=off).</summary>
    public static bool Wanted => NativeSettings.Splash && Environment.GetEnvironmentVariable("EMPI_SPLASH") != "off";

    private readonly bool _cover;
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private readonly DispatcherTimer _timer = new(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(16) };
    private readonly TaskCompletionSource _skip = new();
    private Bitmap? _cloudA, _cloudB, _tear;
    private FormattedText? _word;
    private bool _uncovered;

    private SplashLayer(bool cover)
    {
        _cover = cover;
        _cloudA = Ui.Art("cloud.png", 640); _cloudB = Ui.Art("cloud.png", 420); _tear = Ui.Art("tear.png", 960);
        Focusable = true;
        _timer.Tick += (_, _) => InvalidateVisual();
        PointerPressed += (_, _) => _skip.TrySetResult();
        KeyDown += (_, _) => _skip.TrySetResult();
    }

    private double Ms => _clock.Elapsed.TotalMilliseconds;

    private static double Ease(double t) { t = Math.Clamp(t, 0, 1); return 1 - Math.Pow(1 - t, 3); }
    private static double InOut(double t) { t = Math.Clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.Pow(-2 * t + 2, 3) / 2; }
    private static double Frac(double t, double from, double ms) => Math.Clamp((t - from) / ms, 0, 1);

    // ---- opening ----------------------------------------------------------------------------------------------------------

    public static async Task OpenAsync(Panel host, Action? uncovering = null)
    {
        var layer = new SplashLayer(cover: false) { ZIndex = 100 };
        try
        {
            Grid.SetRowSpan(layer, 2);
            host.Children.Add(layer);
            layer._timer.Start();
            layer.Focus();
            // the mark plays; a click or a key skips to the uncovering
            await Task.WhenAny(Task.Delay(IntroMs), layer._skip.Task);
            layer._uncovered = true;
            layer._uncoverAt = layer.Ms;
            uncovering?.Invoke();
            layer.IsHitTestVisible = false;
            await Task.Delay(520);
        }
        catch (Exception ex) { App.Log("splash", ex); }
        finally
        {
            layer._timer.Stop();
            host.Children.Remove(layer);
            layer._cloudA = layer._cloudB = layer._tear = null;
        }
    }

    // ---- closing ----------------------------------------------------------------------------------------------------------

    /// <summary>Covers the window with the mark and the bands; completes when it is time to really close it. The layer stays: the window is going away.</summary>
    public static async Task CoverAsync(Panel host)
    {
        var layer = new SplashLayer(cover: true) { ZIndex = 100 };
        Grid.SetRowSpan(layer, 2);
        host.Children.Add(layer);
        layer._timer.Start();
        await Task.Delay(CoverMs);
    }

    private double _uncoverAt;

    public override void Render(DrawingContext dc)
    {
        var w = Bounds.Width; var h = Bounds.Height;
        if (w < 50 || h < 50) return;
        var t = Ms;
        // the opening starts covered; the cover starts clear. `slide` is how far the bands have slid in (cover) or out (opening): 0 covered, 1 gone
        double Slide(int i)
        {
            if (_cover) return 1 - Ease(Frac(t, i * 5 % Bands * 10, 240));
            return _uncovered ? InOut(Frac(t - _uncoverAt, i * 5 % Bands * 12, 300)) : 0;
        }
        var band = h / Bands;
        // the art lives under the bands in the opening (they are opaque until they leave) and over them in the cover
        var artFade = _cover ? 1 : _uncovered ? 1 - Frac(t - _uncoverAt, 0, 200) : 1;
        var start = _cover ? 120.0 : 0.0;

        // the bands
        for (var i = 0; i < Bands; i++)
        {
            var s = Slide(i);
            if (s >= 0.999) continue;
            var dir = i % 2 == 0 ? -1 : 1;
            dc.DrawRectangle(Pal.Well, null, new Rect(dir * s * (w + 40), i * band - 1, w, band + 2));
        }

        if (artFade <= 0.01) return;
        using (dc.PushOpacity(artFade))
        {
            // the clouds drift behind
            if (_cloudA != null)
            {
                var a = Math.Clamp((t - start) / 700, 0, 1) * (_cover ? 0.45 : 0.55);
                using (dc.PushOpacity(a)) dc.DrawImage(_cloudA, new Rect(-40 + (-90 + 130 * Math.Clamp((t - start) / 2600, 0, 1)), h - 30 - _cloudA.Size.Height * 640 / _cloudA.Size.Width * 0 - _cloudA.Size.Height, 640, 640 * _cloudA.Size.Height / _cloudA.Size.Width));
            }
            if (_cloudB != null)
            {
                var a = Math.Clamp((t - start - 150) / 700, 0, 1) * (_cover ? 0.25 : 0.30);
                var cw = 420.0; var chh = cw * _cloudB.Size.Height / _cloudB.Size.Width;
                using (dc.PushOpacity(a))
                using (dc.PushTransform(Matrix.CreateTranslation(-(w - 30 - cw / 2), 0) * Matrix.CreateScale(-1, 1) * Matrix.CreateTranslation(w - 30 - cw / 2, 0)))
                    dc.DrawImage(_cloudB, new Rect(w - cw + 30 + 60 - 100 * Math.Clamp((t - start) / 2600, 0, 1), 70, cw, chh));
            }

            // the mark and the wordmark, centred
            var markW = 20 * K; var markH = 28 * K;
            var ox = (w - markW) / 2; var oy = (h - (markH + 26 + 36)) / 2;
            var glitchAt = _cover ? 300.0 : 620.0;
            var g = t - glitchAt;
            double jitter = 0;
            if (g >= 0 && g < 250) jitter = Math.Sin(g * 0.35) * 10 * (1 - g / 250);
            for (var i = 0; i < Dots.Length; i++)
            {
                var delay = (_cover ? 140 : 90) + (i * 7 % 17) * (_cover ? 6 : 26);
                var p = Ease(Frac(t, delay, _cover ? 120 : 180));
                if (p <= 0) continue;
                var r = R * K * (0.2 + 0.8 * p);
                using (dc.PushOpacity(Math.Min(1, p * 1.25)))
                    dc.DrawEllipse(Pal.Paper, null, new Point(ox + Dots[i].X * K + jitter, oy + Dots[i].Y * K), r, r);
            }
            // the accent dot lands a little too big and settles: 0 to 160 % in 110 ms, then back to 100 %
            var landAt = _cover ? 270.0 : 580.0;
            var lt = t - landAt;
            if (lt > 0)
            {
                var scale = lt < 110 ? 1.6 * Ease(lt / 110) : lt < 270 ? 1.6 - 0.6 * Ease((lt - 110) / 160) : 1.0;
                var cx = ox + 18 * K + jitter; var cy = oy + 26 * K; var rr = R * K * scale;
                dc.DrawEllipse(new SolidColorBrush(Pal.Accent.Color), null, new Point(cx, cy), rr, rr);
                // a ring leaves the accent dot with the glitch
                var rg = t - glitchAt;
                if (rg > 0 && rg < 750)
                {
                    var q = Ease(rg / 750);
                    var ringR = R * K * (1 + 5 * q);
                    using (dc.PushOpacity(0.9 * (1 - q))) dc.DrawEllipse(null, new Pen(new SolidColorBrush(Pal.Accent.Color), 2), new Point(cx, cy), ringR, ringR);
                }
            }
            // the wordmark tears in
            if (g >= 0)
            {
                _word ??= new FormattedText("EMPI LAUNCHER", System.Globalization.CultureInfo.InvariantCulture, FlowDirection.LeftToRight, new Typeface(Pal.Display, FontStyle.Normal, FontWeight.Bold), 26, Pal.Paper);
                using (dc.PushOpacity(Math.Min(1, g / 120.0)))
                    dc.DrawText(_word, new Point((w - _word.Width) / 2 + jitter * 0.6, oy + markH + 26));
            }
            // the stripes of tear.png flash across the middle
            if (_tear != null && g >= 0 && g < 260)
            {
                (double At, double Alpha, double X)[] frames = [(0, 0, 0), (30, 0.85, -24), (80, 0, 0), (120, 0.6, 30), (170, 0, 0), (210, 0.4, -12), (250, 0, 0)];
                var k = frames.LastOrDefault(f => f.At <= g);
                if (k.Alpha > 0)
                    using (dc.PushOpacity(k.Alpha)) dc.DrawImage(_tear, new Rect(k.X, (h - 130) / 2, w, 130));
            }
        }
    }
}
