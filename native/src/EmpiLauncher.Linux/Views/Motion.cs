using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Media;

namespace EmpiLauncher.Linux.Views;

/// <summary>
/// How things move. One vocabulary for the whole interface, so it all feels like the same hand: only transform and opacity animate; things that enter
/// or leave use a strong ease-out, things that travel across the screen a strong ease-in-out; a press is 100 ms, a hover 140 ms, a panel 240 ms;
/// nothing goes over 300 ms. Animations are To-only where they can be, so a change of mind halfway continues from where it is.
/// </summary>
internal static class Motion
{
    public static bool Enabled => Environment.GetEnvironmentVariable("EMPI_MOTION") != "off";

    public static readonly IEasingFunction Out = new BezierEase(0.23, 1, 0.32, 1);
    public static readonly IEasingFunction InOut = new BezierEase(0.77, 0, 0.175, 1);
    /// <summary>Constant speed, for things that drift (a cloud) rather than answer.</summary>
    public static readonly IEasingFunction Linear = new PowerEase { Power = 1, EasingMode = EasingMode.EaseIn };

    private static Duration Ms(double ms) => new(TimeSpan.FromMilliseconds(ms));

    public static IEnumerable<Visual> ChildrenOf(Panel panel) => panel.Children.Cast<Visual>().ToList();

    /// <summary>Runs one number from <paramref name="from"/> to <paramref name="to"/>; while a delay is pending the property already shows <paramref name="from"/>.</summary>
    public static void Animate(AvaloniaObject target, AvaloniaProperty property, double from, double to, double ms, double delayMs = 0, IEasingFunction? ease = null, Action? done = null)
    {
        target.BeginAnimation(property, null);
        if (ms <= 0) { target.SetValue(property, to); done?.Invoke(); return; }
        target.SetValue(property, from);
        target.BeginAnimation(property, new DoubleAnimation(from, to, Ms(ms)) { BeginTime = TimeSpan.FromMilliseconds(delayMs), EasingFunction = ease ?? Out, Completed = done });
    }

    private static TranslateTransform Shift(Visual element)
    {
        if (element.RenderTransform is TranslateTransform existing) return existing;
        var shift = new TranslateTransform();
        element.RenderTransform = shift;
        return shift;
    }

    private static ScaleTransform Scale(Visual element, RelativePoint origin)
    {
        element.RenderTransformOrigin = origin;
        if (element.RenderTransform is ScaleTransform existing) return existing;
        var scale = new ScaleTransform();
        element.RenderTransform = scale;
        return scale;
    }

    /// <summary>Arrives: fades in while settling a few pixels up into place.</summary>
    public static void Rise(Visual element, double delayMs = 0, double ms = 240, double distance = 10)
    {
        if (!Enabled) { Animate(element, Visual.OpacityProperty, 0, 1, 120, 0); return; }
        Animate(element, Visual.OpacityProperty, 0, 1, ms, delayMs);
        Animate(Shift(element), TranslateTransform.YProperty, distance, 0, ms, delayMs);
    }

    /// <summary>Several elements arriving one after the other (about 45 ms apart, never more than ~360 ms in total).</summary>
    public static void Reveal(IEnumerable<Visual> elements, double stepMs = 45, double firstDelayMs = 0, double ms = 240, double distance = 10)
    {
        var index = 0;
        foreach (var element in elements) { Rise(element, Enabled ? firstDelayMs + Math.Min(index * stepMs, 360) : 0, ms, distance); index++; }
    }

    /// <summary>A panel that is not attached to anything: grows from a little smaller while it fades in.</summary>
    public static void Pop(Visual element, RelativePoint origin, double ms = 220, double from = 0.96, bool fade = true)
    {
        if (!Enabled) { if (fade) Animate(element, Visual.OpacityProperty, 0, 1, 120, 0); return; }
        var scale = Scale(element, origin);
        if (fade) Animate(element, Visual.OpacityProperty, 0, 1, ms, 0);
        Animate(scale, ScaleTransform.ScaleXProperty, from, 1, ms, 0);
        Animate(scale, ScaleTransform.ScaleYProperty, from, 1, ms, 0);
    }

    public static void Pop(Visual element, Point origin, double ms = 220, double from = 0.96, bool fade = true) => Pop(element, new RelativePoint(origin.X, origin.Y, RelativeUnit.Relative), ms, from, fade);

    /// <summary>Goes away: a quick fade, then <paramref name="done"/>.</summary>
    public static void Leave(Visual element, Action done, double ms = 140, double distance = 0)
    {
        Animate(element, Visual.OpacityProperty, 1, 0, Enabled ? ms : 80, 0, Out, () => { element.Opacity = 1; done(); });
        if (Enabled && distance != 0) Animate(Shift(element), TranslateTransform.YProperty, 0, distance, ms, 0, Out, () => Shift(element).Y = 0);
    }

    /// <summary>The tear: the same 260 ms glitch the Publisher plays when something changes (a few sideways jumps and a flicker, in steps).</summary>
    public static void Tear(Visual element)
    {
        if (!Enabled) return;
        var shift = Shift(element);
        (double At, double X, double Alpha)[] frames = [(0, 0, 1), (39, -3, 0.55), (78, 4, 1), (117, -2, 0.7), (156, 2, 1), (208, -1, 0.85), (260, 0, 1)];
        var x = new DoubleAnimationUsingKeyFrames { FillBehavior = FillBehavior.Stop };
        var alpha = new DoubleAnimationUsingKeyFrames { FillBehavior = FillBehavior.Stop };
        foreach (var (at, dx, a) in frames)
        {
            x.KeyFrames.Add(new DiscreteDoubleKeyFrame(dx, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(at))));
            alpha.KeyFrames.Add(new DiscreteDoubleKeyFrame(a, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(at))));
        }
        shift.BeginAnimation(TranslateTransform.XProperty, x);
        element.BeginAnimation(Visual.OpacityProperty, alpha);
    }

    /// <summary>Slides a number to its new value instead of jumping there.</summary>
    public static void Follow(AvaloniaObject target, AvaloniaProperty property, double to, double ms = 260)
    {
        if (!Enabled || ms <= 0) { target.BeginAnimation(property, null); target.SetValue(property, to); return; }
        target.BeginAnimation(property, new DoubleAnimation { To = to, Duration = Ms(ms), EasingFunction = Out });
    }

    /// <summary>Puts a number at a value at once, letting go of any animation that was moving it.</summary>
    public static void Snap(AvaloniaObject target, AvaloniaProperty property, double value)
    {
        target.BeginAnimation(property, null);
        target.SetValue(property, value);
    }

    /// <summary>Takes a brush to another colour over 180 ms. The brush must be one of the element's own, not a shared resource.</summary>
    public static void Tint(SolidColorBrush brush, Color to, double ms = 180)
    {
        if (!Enabled || ms <= 0) { brush.BeginAnimation(SolidColorBrush.ColorProperty, null); brush.Color = to; return; }
        brush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation { To = to, Duration = Ms(ms), EasingFunction = Out });
    }

    /// <summary>Runs <paramref name="action"/> once the element has been laid out.</summary>
    public static void WhenLoaded(Control element, Action action)
    {
        if (element.IsLoaded) { action(); return; }
        EventHandler<Avalonia.Interactivity.RoutedEventArgs>? handler = null;
        handler = (_, _) => { element.Loaded -= handler; action(); };
        element.Loaded += handler;
    }
}

