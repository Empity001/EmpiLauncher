using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using EmpiLauncher.Ipc;
using EmpiLauncher.Linux.Services;
using ST = EmpiLauncher.Linux.Styles.StyleTheme;
using Path = Avalonia.Controls.Shapes.Path;
using Visual = Avalonia.Visual;
using System.Globalization;
using EmpiLauncher.Ipc;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// What an effect script works with: where Jugar is, the style's colour, the real dates and hours of the state, a picture of Jugar to move
/// around, and the small tools to place things and move them (the same ideas the preview was written with, so a script reads the same).
/// When <see cref="Instant"/> is on, the script lands on its last pose at once: no waiting, no flying particles, only what stays.
/// </summary>
internal sealed class Scene
{
    public readonly AccessStage Stage;
    public readonly CancellationToken Run;
    public readonly bool Instant;
    public readonly Rect P;
    public readonly Color Accent;
    public readonly AccessWords Say;
    private readonly Control _realPlay;
    private readonly CornerRadius _radius;
    private PlayBox? _box;
    public static readonly Random Rng = new();

    public Scene(AccessStage stage, CancellationToken run, bool instant, Rect play, Color accent, AccessWords say, Control realPlay, CornerRadius radius)
    {
        Stage = stage; Run = run; Instant = instant; P = play; Accent = accent; Say = say; _realPlay = realPlay; _radius = radius;
    }

    public double W => Stage.Bounds.Width;
    public double H => Stage.Bounds.Height;
    public double Cx => P.X + P.Width / 2;
    public double Cy => P.Y + P.Height / 2;
    public CornerRadius Radius => _radius;

    // ---- time -----------------------------------------------------------------------------------------------------------------

    public Task Sleep(double ms)
    {
        Run.ThrowIfCancellationRequested();
        return Instant || ms <= 0 ? Task.CompletedTask : Task.Delay(TimeSpan.FromMilliseconds(ms), Run);
    }

    /// <summary>A tween: <paramref name="apply"/> gets the eased progress 0..1. <paramref name="iterations"/> 0 is for ever (a loop that stays in the pose).</summary>
    public void Anim(double ms, Action<double> apply, double delay = 0, Func<double, double>? ease = null, int iterations = 1)
    {
        Run.ThrowIfCancellationRequested();
        Stage.Animate(Run, ms, delay, ease, apply, iterations, Instant);
    }

    public void Every(double ms, Action tick) { Run.ThrowIfCancellationRequested(); Stage.Every(Run, ms, tick); }

    public void Burst(int n, Func<int, ParticleLayer.Particle> make)
    {
        if (Instant || Run.IsCancellationRequested) return;
        Stage.Particles.Add(Enumerable.Range(0, n).Select(make).ToList());
    }

    /// <summary>A ripple in the background itself (Oleaje's water, Térmico's heat): a click there, as if the player made it.</summary>
    public void Wave(double x, double y)
    {
        if (Instant) return;
        if (MainWindow.Instance is { } main && Stage.TranslatePoint(new Point(x, y), main.Field) is { } at) main.Field.Burst(at, false);
    }

    // ---- values -----------------------------------------------------------------------------------------------------------------

    public static double Rnd(double a, double b) => a + Rng.NextDouble() * (b - a);
    public static T Pick<T>(IReadOnlyList<T> items) => items[Rng.Next(items.Count)];
    public static double Lerp(double a, double b, double t) => a + (b - a) * t;

    /// <summary>A value at <paramref name="t"/> (0..1) along evenly spaced keyframes.</summary>
    public static double Keys(double t, params double[] v)
    {
        if (v.Length == 1) return v[0];
        var x = Math.Clamp(t, 0, 1) * (v.Length - 1); var i = Math.Min(v.Length - 2, (int)Math.Floor(x));
        return Lerp(v[i], v[i + 1], x - i);
    }

    /// <summary>A value at <paramref name="t"/> along keyframes placed at their own offsets.</summary>
    public static double KeysAt(double t, params (double At, double V)[] k)
    {
        if (t <= k[0].At) return k[0].V;
        for (var i = 1; i < k.Length; i++) if (t <= k[i].At) return Lerp(k[i - 1].V, k[i].V, (t - k[i - 1].At) / Math.Max(1e-6, k[i].At - k[i - 1].At));
        return k[^1].V;
    }

    public static Color C(string hex, double alpha = 1)
    {
        var c = Color.Parse(hex);
        return Color.FromArgb((byte)Math.Round(c.A * Math.Clamp(alpha, 0, 1)), c.R, c.G, c.B);
    }

    public static SolidColorBrush Br(string hex, double alpha = 1) => new(C(hex, alpha));
    public static SolidColorBrush Br(Color c, double alpha = 1) => new(Color.FromArgb((byte)Math.Round(c.A * alpha), c.R, c.G, c.B));
    public static Color Mix(Color a, Color b, double t) => Color.FromArgb((byte)Lerp(a.A, b.A, t), (byte)Lerp(a.R, b.R, t), (byte)Lerp(a.G, b.G, t), (byte)Lerp(a.B, b.B, t));

    // ---- placing ----------------------------------------------------------------------------------------------------------------

    public T Add<T>(T el, double x, double y, int z = 10) where T : Control
    {
        Run.ThrowIfCancellationRequested();
        Canvas.SetLeft(el, x); Canvas.SetTop(el, y); el.ZIndex = z;
        Stage.Children.Add(el);
        return el;
    }

    /// <summary>Places an element with its middle at (x, y) (it is measured first).</summary>
    public T AddCentered<T>(T el, double x, double y, int z = 10) where T : Control
    {
        el.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        return Add(el, x - el.DesiredSize.Width / 2, y - el.DesiredSize.Height / 2, z);
    }

    public void Remove(Control el) => Stage.Children.Remove(el);

    public static void Move(Control el, double x, double y) { Canvas.SetLeft(el, x); Canvas.SetTop(el, y); }

    public void FadeIn(Control el, double ms, double delay = 0, double to = 1) { el.Opacity = 0; Anim(ms, t => el.Opacity = t * to, delay); }
    public void FadeOut(Control el, double ms, double delay = 0) { var from = el.Opacity; Anim(ms, t => el.Opacity = from * (1 - t), delay); }

    /// <summary>A soft blur going away (things coming into focus).</summary>
    public void Unblur(Control el, double from, double ms, double delay = 0)
    {
        var blur = new BlurEffect { Radius = from };
        el.Effect = blur;
        Anim(ms, t => { blur.Radius = from * (1 - t); if (t >= 1) el.Effect = null; }, delay);
    }

    // ---- words ------------------------------------------------------------------------------------------------------------------

    public static TextBlock Text(string text, string family, double size, IBrush ink, FontWeight? weight = null, FontStyle? style = null)
        => new() { Text = text, FontFamily = new FontFamily(family), FontSize = size, Foreground = ink, FontWeight = weight ?? FontWeight.Normal, FontStyle = style ?? FontStyle.Normal, IsHitTestVisible = false, TextWrapping = TextWrapping.NoWrap };

    /// <summary>Letters spaced apart (CSS letter-spacing, which WPF does not have): thin spaces between them.</summary>
    public static string Spaced(string text, int thin = 1) => string.Join(new string(' ', thin), text.EnumerateRunes().Select(r => r.ToString()));

    public static FontFamily Display => Pal.Display;
    public static FontFamily Mono => Pal.Mono;

    // ---- shapes -----------------------------------------------------------------------------------------------------------------

    public static Geometry Geo(string data) { var g = Geometry.Parse(data); g.Freeze(); return g; }

    public static double LengthOf(Geometry g)
    {
        return g.ContourLength;
    }

    /// <summary>A stroke that draws itself from its start to its end (CSS's dash-offset trick).</summary>
    public void DrawOn(Shape shape, Geometry geometry, double ms, double delay = 0, Func<double, double>? ease = null)
    {
        var th = Math.Max(0.1, shape.StrokeThickness);
        var len = Math.Max(1, LengthOf(geometry)) / th + 2;
        shape.StrokeDashArray = [len, len];
        Anim(ms, t => shape.StrokeDashOffset = len * (1 - t), delay, ease ?? Ease.Linear);
    }

    public static Path PathOf(string data, IBrush? fill, IBrush? stroke, double thickness = 1)
        => new() { Data = Geo(data), Fill = fill, Stroke = stroke, StrokeThickness = thickness, StrokeJoin = PenLineJoin.Round, IsHitTestVisible = false };

    // ---- Jugar ------------------------------------------------------------------------------------------------------------------

    /// <summary>The picture of Jugar at its place (made on first use; the real button is hidden behind it).</summary>
    public PlayBox Play()
    {
        if (_box != null) return _box;
        Bitmap? shot = null;
        try
        {
            // the real button, painted as it is now into a bitmap the effect can move around
            var was = _realPlay.Opacity; _realPlay.Opacity = 1;
            var rtb = new RenderTargetBitmap(new PixelSize(Math.Max(1, (int)Math.Ceiling(P.Width)), Math.Max(1, (int)Math.Ceiling(P.Height))), new Vector(96, 96));
            rtb.Render(_realPlay);
            shot = rtb;
            _realPlay.Opacity = was;
        }
        catch (Exception) { /* no picture: the effects still run, over an empty place */ }
        _box = new PlayBox(shot, _radius) { Width = P.Width, Height = P.Height };
        Add(_box, P.X, P.Y, 5);
        HideReal(true);
        return _box;
    }

    /// <summary>The picture of Jugar gone (the effect draws its own face instead), the real one still hidden.</summary>
    public void HidePlay() { Play().IsVisible = false; }

    public void HideReal(bool hide) => _realPlay.Opacity = hide ? 0 : 1;

    /// <summary>Jugar is itself again: the real button shows, the picture goes.</summary>
    public void RestorePlay()
    {
        HideReal(false);
        if (_box != null) { Remove(_box); _box = null; }
    }

    /// <summary>A copy of Jugar's shape at its place, to write something else in it (the picture of Jugar is hidden).</summary>
    public Border Face(IBrush background, IBrush? border = null, double borderThickness = 0, CornerRadius? radius = null, Control? child = null, int z = 12)
    {
        HidePlay();
        var face = new Border
        {
            Width = P.Width, Height = P.Height, Background = background, BorderBrush = border, BorderThickness = new Thickness(borderThickness),
            CornerRadius = radius ?? _radius, Child = child, IsHitTestVisible = false, ClipToBounds = true
        };
        return Add(face, P.X, P.Y, z);
    }

    /// <summary>A line of text centred in a face.</summary>
    public static TextBlock FaceText(string text, FontFamily family, double size, IBrush ink, FontWeight? weight = null)
        => new() { Text = text, FontFamily = family, FontSize = size, Foreground = ink, FontWeight = weight ?? FontWeight.Normal, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.NoWrap };
}

/// <summary>
/// What the state says, from the real data: when it comes back or opens, in the few forms the styles use (a sentence, a clock, a date on a
/// poster, words in a book, a countdown).
/// </summary>
internal sealed class AccessWords
{
    public readonly DateTimeOffset? Until, From;
    public readonly string PackId, PackName;

    public AccessWords(AccessInfo access, string? packId, string? packName)
    {
        Until = DateTimeOffset.TryParse(access.Until, out var u) ? u.ToLocalTime() : null;
        From = DateTimeOffset.TryParse(access.From, out var f) ? f.ToLocalTime() : null;
        PackId = (packId ?? "modpack").ToLowerInvariant();
        PackName = packName ?? "este modpack";
    }

    public DateTimeOffset? When => Until ?? From;

    /// <summary>"hoy a las 18:20", "mañana a las 18:20", "el 12 de octubre a las 18:20"; empty without a date.</summary>
    public string Sentence(DateTimeOffset? at)
    {
        if (at is not { } t) return "";
        var days = (t.Date - DateTime.Now.Date).Days;
        return days switch
        {
            0 => $"hoy a las {t:HH:mm}",
            1 => $"mañana a las {t:HH:mm}",
            _ => $"el {t.Day} de {Spanish.Month(t.Month)} a las {t:HH:mm}"
        };
    }

    public string Clock(DateTimeOffset? at) => at is { } t ? t.ToString("HH:mm") : "";
    /// <summary>"12 OCT".</summary>
    public string Short(DateTimeOffset? at) => at is { } t ? $"{t.Day} {Spanish.ShortMonth(t.Month).ToUpperInvariant()}" : "";
    /// <summary>"12.OCT".</summary>
    public string Poster(DateTimeOffset? at) => at is { } t ? $"{t.Day}.{Spanish.ShortMonth(t.Month).ToUpperInvariant()}" : "PRONTO";
    public string Month(DateTimeOffset? at) => at is { } t ? Spanish.Month(t.Month) : "";

    /// <summary>Seconds from now to that moment (0 once it has passed).</summary>
    public static long SecondsTo(DateTimeOffset? at) => at is { } t ? Math.Max(0, (long)(t - DateTimeOffset.Now).TotalSeconds) : 0;

    public static string Countdown(long s) => $"{s / 3600:00}:{s % 3600 / 60:00}:{s % 60:00}";

    // ---- in words, for the book page ----------------------------------------------------------------------------------------------

    private static readonly string[] Units = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
    private static readonly string[] Tens = ["", "", "", "treinta", "cuarenta", "cincuenta"];

    public static string Number(int n) => n < 30 ? Units[n] : n % 10 == 0 ? Tens[n / 10] : $"{Tens[n / 10]} y {Units[n % 10]}";

    /// <summary>"el doce de octubre", or "hoy" / "mañana".</summary>
    public string DayInWords(DateTimeOffset? at)
    {
        if (at is not { } t) return "pronto";
        var days = (t.Date - DateTime.Now.Date).Days;
        return days == 0 ? "hoy" : days == 1 ? "mañana" : $"el {Number(t.Day)} de {Spanish.Month(t.Month)}";
    }

    /// <summary>"a las seis y veinte", "a la una y media".</summary>
    public string HourInWords(DateTimeOffset? at)
    {
        if (at is not { } t) return "más tarde";
        var h = t.Hour % 12; if (h == 0) h = 12;
        var m = t.Minute;
        var hour = h == 1 ? "a la una" : $"a las {Number(h)}";
        return m switch { 0 => hour, 15 => hour + " y cuarto", 30 => hour + " y media", _ => $"{hour} y {Number(m)}" };
    }
}
