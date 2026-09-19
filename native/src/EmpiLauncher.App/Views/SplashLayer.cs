using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using EmpiLauncher.App.Services;
using EmpiLauncher.App.Themes;

namespace EmpiLauncher.App.Views;

/// <summary>The Publisher's halftone art (the cloud and the glitch stripes), decoded at the size it is drawn and never kept around.</summary>
internal static class Art
{
    private static BitmapImage Load(string name, int pixelWidth)
    {
        var image = new BitmapImage();
        image.BeginInit();
        image.UriSource = new Uri($"pack://application:,,,/Assets/Art/{name}");
        image.DecodePixelWidth = pixelWidth;
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.EndInit();
        image.Freeze();
        return image;
    }

    public static BitmapImage Cloud(int pixelWidth) => Load("cloud.png", pixelWidth);
    public static BitmapImage Tear(int pixelWidth) => Load("tear.png", pixelWidth);
}

/// <summary>
/// The launcher's logo, the way it arrives and the way it leaves. It is the dot-matrix E of the Publisher (seventeen paper dots, one
/// row slipped sideways, and one dot in the accent) over the halftone clouds, and it speaks the tool's own language for "something
/// changed": a glitch.
///
/// OPENING (about 1.2 s, while the engine is starting anyway): opaque bands cover the window; the dots of the E pop in out of order,
/// the accent dot lands with a little overshoot and sends a ring outward, the wordmark tears in with the stripes of tear.png flashing
/// across it, and the clouds drift behind. Then the bands slide away in alternating directions, staggered, uncovering the launcher,
/// whose own screens arrive at that moment (see WhenRevealing) and whose dot field sends a pink ring from the lit dot.
/// CLOSING (about 0.55 s): the same bands slide in and the mark flashes; then the window really closes.
///
/// It is a rare moment (once per session), so it is allowed to be showy, and it stays honest: a click or a key skips it, it never
/// plays when Windows animations are off, it can be switched off in Ajustes > Launcher (NativeSettings.Splash), it is a handful of
/// elements (no per-frame work at all), and it lets go of its pictures when it is done.
/// </summary>
internal sealed class SplashLayer : Grid
{
    private static readonly (double X, double Y)[] Dots = [(2, 2), (6, 2), (10, 2), (14, 2), (18, 2), (2, 6), (2, 10), (2, 14), (6, 14), (10, 14), (14, 14), (2, 18), (2, 22), (2, 26), (6, 26), (10, 26), (14, 26)];
    private const double K = 6, R = 1.6;          // the mark is drawn on a 20 x 28 grid, K pixels a unit; the dots are R units wide
    private const int Bands = 12;
    public const int IntroMs = 1150, CoverMs = 560;
    private static readonly Color Pink = Color.FromRgb(0xff, 0x3d, 0x8b);

    // ---- when it plays ----

    /// <summary>Animations on in Windows, not switched off in Ajustes, and not turned off for a test (EMPI_SPLASH=off).</summary>
    public static bool Wanted => Motion.Enabled && NativeSettings.Splash && Environment.GetEnvironmentVariable("EMPI_SPLASH") != "off";

    /// <summary>True from the moment the opening starts until it uncovers the launcher.</summary>
    public static bool Playing { get; private set; }
    private static readonly List<Action> Waiting = [];

    /// <summary>Runs <paramref name="action"/> when the launcher is uncovered (at once if nothing is covering it): screens that arrive with the opening wait for it.</summary>
    public static void WhenRevealing(Action action)
    {
        if (Playing) Waiting.Add(action); else action();
    }

    private static void ReleaseWaiting()
    {
        Playing = false;
        var pending = Waiting.ToArray();
        Waiting.Clear();
        foreach (var action in pending) action();
    }

    // ---- what it is made of ----

    private readonly TranslateTransform[] _shift = new TranslateTransform[Bands];
    private readonly Grid _art = new() { IsHitTestVisible = false };
    private readonly Canvas _mark;
    private readonly Ellipse[] _dots;
    private readonly Ellipse _lit, _ring;
    private readonly TextBlock _word;
    private readonly Image _cloudA, _cloudB, _tear;
    private readonly TranslateTransform _cloudAShift = new(), _cloudBShift = new(), _tearShift = new();

    private SplashLayer()
    {
        var well = (Brush)Application.Current.FindResource("WellBrush");
        var paper = (Brush)Application.Current.FindResource("PaperBrush");
        var pink = new SolidColorBrush(Pink);
        pink.Freeze();

        // opaque bands, a little overlapped so no seam shows between them
        var bands = new Grid();
        for (var i = 0; i < Bands; i++)
        {
            bands.RowDefinitions.Add(new RowDefinition());
            _shift[i] = new TranslateTransform();
            var band = new Border { Background = well, Margin = new Thickness(0, -1, 0, -1), RenderTransform = _shift[i] };
            SetRow(band, i);
            bands.Children.Add(band);
        }
        Children.Add(bands);

        _cloudA = new Image { Source = Art.Cloud(640), Width = 640, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(-40, 0, 0, 30), Opacity = 0, RenderTransform = _cloudAShift, IsHitTestVisible = false };
        _cloudB = new Image
        {
            Source = Art.Cloud(420), Width = 420, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 70, -30, 0), Opacity = 0, IsHitTestVisible = false,
            RenderTransformOrigin = new Point(0.5, 0.5), RenderTransform = new TransformGroup { Children = { new ScaleTransform(-1, 1), _cloudBShift } }
        };
        _art.Children.Add(_cloudA);
        _art.Children.Add(_cloudB);

        _tear = new Image { Source = Art.Tear(960), Stretch = Stretch.Fill, Height = 130, VerticalAlignment = VerticalAlignment.Center, Opacity = 0, RenderTransform = _tearShift, IsHitTestVisible = false };
        _art.Children.Add(_tear);

        _mark = new Canvas { Width = 20 * K, Height = 28 * K, HorizontalAlignment = HorizontalAlignment.Center };
        _dots = Dots.Select(d => Dot(d.X, d.Y, paper)).ToArray();
        foreach (var dot in _dots) _mark.Children.Add(dot);
        _lit = Dot(18, 26, pink);
        _ring = Dot(18, 26, Brushes.Transparent);
        _ring.Stroke = pink; _ring.StrokeThickness = 2;
        _mark.Children.Add(_ring);
        _mark.Children.Add(_lit);

        _word = new TextBlock { Text = "EMPI LAUNCHER", Style = (Style)Application.Current.FindResource("DisplayText"), FontSize = 26, Margin = new Thickness(0, 26, 0, 0), HorizontalAlignment = HorizontalAlignment.Center, Visibility = Visibility.Hidden };
        var center = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center, IsHitTestVisible = false };
        center.Children.Add(_mark);
        center.Children.Add(_word);
        _art.Children.Add(center);
        Children.Add(_art);
    }

    /// <summary>One dot of the mark: invisible and at zero size until its turn.</summary>
    private static Ellipse Dot(double x, double y, Brush fill)
    {
        var dot = new Ellipse { Width = 2 * R * K, Height = 2 * R * K, Fill = fill, Opacity = 0, RenderTransformOrigin = new Point(0.5, 0.5), RenderTransform = new ScaleTransform(0, 0) };
        Canvas.SetLeft(dot, (x - R) * K);
        Canvas.SetTop(dot, (y - R) * K);
        return dot;
    }

    private static void Pop(Ellipse dot, double delayMs, double ms = 180)
    {
        var scale = (ScaleTransform)dot.RenderTransform;
        Motion.Animate(dot, OpacityProperty, 0, 1, ms * 0.8, delayMs);
        Motion.Animate(scale, ScaleTransform.ScaleXProperty, 0.2, 1, ms, delayMs);
        Motion.Animate(scale, ScaleTransform.ScaleYProperty, 0.2, 1, ms, delayMs);
    }

    /// <summary>The accent dot lands a little too big and settles: 0 to 160 % in 110 ms, then back to 100 %.</summary>
    private void Land(double delayMs)
    {
        Motion.Animate(_lit, OpacityProperty, 0, 1, 60, delayMs);
        var scale = (ScaleTransform)_lit.RenderTransform;
        foreach (var property in new[] { ScaleTransform.ScaleXProperty, ScaleTransform.ScaleYProperty })
        {
            var spring = new KeySpline(0.23, 1, 0.32, 1);
            var animation = new DoubleAnimationUsingKeyFrames { BeginTime = TimeSpan.FromMilliseconds(delayMs), FillBehavior = FillBehavior.HoldEnd };
            animation.KeyFrames.Add(new SplineDoubleKeyFrame(1.6, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(110)), spring));
            animation.KeyFrames.Add(new SplineDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(270)), spring));
            scale.BeginAnimation(property, animation);
        }
    }

    private void Clouds(double opacityA, double opacityB, double delayMs, double driftMs)
    {
        Motion.Animate(_cloudA, OpacityProperty, 0, opacityA, 700, delayMs);
        Motion.Animate(_cloudAShift, TranslateTransform.XProperty, -90, 40, driftMs, delayMs, Motion.Linear);
        Motion.Animate(_cloudB, OpacityProperty, 0, opacityB, 700, delayMs + 150);
        Motion.Animate(_cloudBShift, TranslateTransform.XProperty, 60, -40, driftMs, delayMs, Motion.Linear);
    }

    /// <summary>The glitch: the wordmark tears in, the mark jumps sideways, the stripes of tear.png flash across the middle, a ring leaves the accent dot.</summary>
    private void Glitch()
    {
        _word.Visibility = Visibility.Visible;
        Motion.Tear(_word);
        Motion.Tear(_mark);

        (double At, double Alpha, double X)[] frames = [(0, 0, 0), (30, 0.85, -24), (80, 0, 0), (120, 0.6, 30), (170, 0, 0), (210, 0.4, -12), (250, 0, 0)];
        var alpha = new DoubleAnimationUsingKeyFrames { FillBehavior = FillBehavior.Stop };
        var slide = new DoubleAnimationUsingKeyFrames { FillBehavior = FillBehavior.Stop };
        foreach (var (at, a, x) in frames)
        {
            var time = KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(at));
            alpha.KeyFrames.Add(new DiscreteDoubleKeyFrame(a, time));
            slide.KeyFrames.Add(new DiscreteDoubleKeyFrame(x, time));
        }
        _tear.BeginAnimation(OpacityProperty, alpha);
        _tearShift.BeginAnimation(TranslateTransform.XProperty, slide);

        var ringScale = (ScaleTransform)_ring.RenderTransform;
        Motion.Animate(ringScale, ScaleTransform.ScaleXProperty, 1, 6, 750, 0, Motion.Out);
        Motion.Animate(ringScale, ScaleTransform.ScaleYProperty, 1, 6, 750, 0, Motion.Out);
        Motion.Animate(_ring, OpacityProperty, 0.9, 0, 750, 0, Motion.Out);
    }

    /// <summary>Where the accent dot is, in the coordinates of <paramref name="host"/> (the dot field sends its ring from there).</summary>
    private Point LitPoint(UIElement host)
    {
        try { return _lit.TranslatePoint(new Point(_lit.Width / 2, _lit.Height / 2), host); }
        catch (InvalidOperationException) { return new Point(ActualWidth / 2, ActualHeight / 2); }
    }

    private void Release()
    {
        _cloudA.Source = _cloudB.Source = _tear.Source = null;
    }

    // ---- the opening ----

    public static async Task OpenAsync(Panel host, Action<Point>? lit = null)
    {
        Playing = true;
        var layer = new SplashLayer();
        try
        {
            host.Children.Add(layer);
            layer.UpdateLayout();
            layer.Focusable = true;
            layer.Focus();
            var skip = new TaskCompletionSource();
            layer.MouseDown += (_, _) => skip.TrySetResult();
            layer.KeyDown += (_, _) => skip.TrySetResult();

            // dots out of order (a fixed order, so it is always the same logo), the accent dot last, the clouds drifting behind
            for (var i = 0; i < layer._dots.Length; i++) Pop(layer._dots[i], 90 + (i * 7 % 17) * 26);
            layer.Land(580);
            layer.Clouds(0.55, 0.30, 0, 2600);

            if (await Task.WhenAny(Task.Delay(620), skip.Task) != skip.Task) layer.Glitch();
            await Task.WhenAny(Task.Delay(IntroMs - 620), skip.Task);

            // uncover: the screens behind arrive now, the field sends its ring, the art fades and the bands leave
            layer.IsHitTestVisible = false;
            ReleaseWaiting();
            lit?.Invoke(layer.LitPoint(host));
            Motion.Animate(layer._art, OpacityProperty, 1, 0, 200, 0);
            var width = layer.ActualWidth + 40;
            for (var i = 0; i < Bands; i++)
                Motion.Animate(layer._shift[i], TranslateTransform.XProperty, 0, (i % 2 == 0 ? -1 : 1) * width, 300, i * 5 % Bands * 12, Motion.InOut);
            await Task.Delay(520);
        }
        catch (Exception) { /* an opening that fails is no opening: the launcher is there anyway */ }
        finally
        {
            ReleaseWaiting();
            host.Children.Remove(layer);
            layer.Release();
        }
    }

    // ---- the closing ----

    /// <summary>Covers the window with the mark and the bands; completes when it is time to really close it. The layer stays: the window is going away.</summary>
    public static async Task CoverAsync(Panel host)
    {
        var layer = new SplashLayer();
        host.Children.Add(layer);
        layer.UpdateLayout();
        var width = layer.ActualWidth + 40;
        for (var i = 0; i < Bands; i++)
            Motion.Animate(layer._shift[i], TranslateTransform.XProperty, (i % 2 == 0 ? -1 : 1) * width, 0, 240, i * 5 % Bands * 10, Motion.Out);
        for (var i = 0; i < layer._dots.Length; i++) Pop(layer._dots[i], 140 + (i * 7 % 17) * 6, 120);
        layer.Land(270);
        layer.Clouds(0.45, 0.25, 120, 1200);
        await Task.Delay(300);
        layer.Glitch();
        await Task.Delay(CoverMs - 300);
    }
}
