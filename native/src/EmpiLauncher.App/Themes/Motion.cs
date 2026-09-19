using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace EmpiLauncher.App.Themes;

/// <summary>
/// CSS's cubic-bezier(x1, y1, x2, y2) as a WPF easing function, so the launcher speaks the same curves as the Publisher and the design
/// notes. The four numbers are dependency properties on purpose: animations are cloned and frozen, and only those survive it.
/// </summary>
public sealed class BezierEase : EasingFunctionBase
{
    public static readonly DependencyProperty X1Property = DependencyProperty.Register(nameof(X1), typeof(double), typeof(BezierEase), new PropertyMetadata(0.0));
    public static readonly DependencyProperty Y1Property = DependencyProperty.Register(nameof(Y1), typeof(double), typeof(BezierEase), new PropertyMetadata(0.0));
    public static readonly DependencyProperty X2Property = DependencyProperty.Register(nameof(X2), typeof(double), typeof(BezierEase), new PropertyMetadata(1.0));
    public static readonly DependencyProperty Y2Property = DependencyProperty.Register(nameof(Y2), typeof(double), typeof(BezierEase), new PropertyMetadata(1.0));

    public double X1 { get => (double)GetValue(X1Property); set => SetValue(X1Property, value); }
    public double Y1 { get => (double)GetValue(Y1Property); set => SetValue(Y1Property, value); }
    public double X2 { get => (double)GetValue(X2Property); set => SetValue(X2Property, value); }
    public double Y2 { get => (double)GetValue(Y2Property); set => SetValue(Y2Property, value); }

    // The base class defaults to EaseOut, which would mirror the curve (1 - f(1 - t)); this class is the whole curve as written.
    public BezierEase() => EasingMode = EasingMode.EaseIn;

    protected override Freezable CreateInstanceCore() => new BezierEase();

    protected override double EaseInCore(double t)
    {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        double x1 = X1, y1 = Y1, x2 = X2, y2 = Y2;

        // find the curve parameter whose x is t: Newton's method first (fast), bisection if it stalls
        var s = t;
        for (var i = 0; i < 8; i++)
        {
            var error = At(s, x1, x2) - t;
            if (Math.Abs(error) < 1e-5) return At(s, y1, y2);
            var slope = Slope(s, x1, x2);
            if (Math.Abs(slope) < 1e-6) break;
            s -= error / slope;
        }
        double lo = 0, hi = 1;
        s = t;
        for (var i = 0; i < 32; i++)
        {
            var x = At(s, x1, x2);
            if (Math.Abs(x - t) < 1e-5) break;
            if (x < t) lo = s; else hi = s;
            s = (lo + hi) / 2;
        }
        return At(s, y1, y2);
    }

    private static double At(double s, double a, double b) { var u = 1 - s; return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s; }
    private static double Slope(double s, double a, double b) { var u = 1 - s; return 3 * u * u * a + 6 * u * s * (b - a) + 3 * s * s * (1 - b); }
}

/// <summary>
/// How things move. One vocabulary for the whole interface, so it all feels like the same hand:
///   - only transform and opacity animate (nothing that reflows the layout);
///   - things that enter or leave use a strong ease-out (starts fast, so the response is felt at once), things that travel across the
///     screen use a strong ease-in-out;
///   - a press is 100 ms, a hover 140 ms, a tab or a switch about 200 ms, a panel arriving 240 ms; nothing goes over 300 ms;
///   - animations are To-only wherever they can be, so a change of mind halfway (leaving a button that is still lifting) continues from
///     where it is instead of jumping;
///   - the Windows "show animations" switch is the reduced-motion switch: without it nothing moves (no lift, no travel, no stagger) and
///     what remains is a short fade, which is enough to see that something changed.
/// The styles in Controls.xaml take their durations and distances from here (x:Static), so they follow the same switch.
/// </summary>
public static class Motion
{
    /// <summary>False when the player turned animations off in Windows.</summary>
    public static bool Enabled => SystemParameters.ClientAreaAnimation;

    public static readonly BezierEase Out = Frozen(0.23, 1, 0.32, 1);
    public static readonly BezierEase InOut = Frozen(0.77, 0, 0.175, 1);

    private static BezierEase Frozen(double x1, double y1, double x2, double y2)
    {
        var ease = new BezierEase { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2 };
        ease.Freeze();
        return ease;
    }

    private static Duration Ms(double ms) => new(TimeSpan.FromMilliseconds(ms));

    // ---- for the styles (x:Static) ----
    public static Duration Hover => Ms(140);
    public static Duration PressIn => Ms(100);
    public static Duration PressOut => Ms(160);
    public static Duration Tab => Ms(180);
    /// <summary>A switch has to move to say what it is now: with animations off it changes at once.</summary>
    public static Duration Toggle => Ms(Enabled ? 200 : 0);
    public static double LiftY => Enabled ? -1 : 0;
    public static double PressScale => Enabled ? 0.97 : 1;
    public static double TilePressScale => Enabled ? 0.985 : 1;
    public static double CardShiftX => Enabled ? 4 : 0;

    // ---- for the code ----

    /// <summary>
    /// Runs one number from <paramref name="from"/> to <paramref name="to"/>. While a delay is pending the property already shows
    /// <paramref name="from"/> (a staggered element must not flash before its turn), and once it ends the value is really the end value
    /// and the animation lets go of the property, so later changes to it are not overruled.
    /// </summary>
    public static void Animate(DependencyObject target, DependencyProperty property, double from, double to, double ms, double delayMs = 0, IEasingFunction? ease = null, Action? done = null)
    {
        var animatable = (IAnimatable)target;
        animatable.ApplyAnimationClock(property, null);
        if (ms <= 0)
        {
            target.SetValue(property, to);
            done?.Invoke();
            return;
        }
        target.SetValue(property, from);
        var animation = new DoubleAnimation(from, to, Ms(ms)) { BeginTime = TimeSpan.FromMilliseconds(delayMs), EasingFunction = ease ?? Out, FillBehavior = FillBehavior.HoldEnd };
        var clock = animation.CreateClock();
        clock.Completed += (_, _) =>
        {
            target.SetValue(property, to);
            animatable.ApplyAnimationClock(property, null);
            done?.Invoke();
        };
        animatable.ApplyAnimationClock(property, clock);
    }

    private static TranslateTransform Shift(UIElement element)
    {
        if (element.RenderTransform is TranslateTransform { IsFrozen: false } existing) return existing;
        var shift = new TranslateTransform();
        element.RenderTransform = shift;
        return shift;
    }

    private static ScaleTransform Scale(UIElement element, Point origin)
    {
        element.RenderTransformOrigin = origin;
        if (element.RenderTransform is ScaleTransform { IsFrozen: false } existing) return existing;
        var scale = new ScaleTransform();
        element.RenderTransform = scale;
        return scale;
    }

    /// <summary>Arrives: fades in while settling a few pixels up into place. Without animations it only fades, briefly.</summary>
    public static void Rise(UIElement element, double delayMs = 0, double ms = 240, double distance = 10)
    {
        if (!Enabled) { Animate(element, UIElement.OpacityProperty, 0, 1, 120, 0); return; }
        Animate(element, UIElement.OpacityProperty, 0, 1, ms, delayMs);
        Animate(Shift(element), TranslateTransform.YProperty, distance, 0, ms, delayMs);
    }

    /// <summary>Several elements arriving one after the other (about 45 ms apart, never more than ~360 ms in total).</summary>
    public static void Reveal(IEnumerable<UIElement> elements, double stepMs = 45, double firstDelayMs = 0, double ms = 240, double distance = 10)
    {
        var index = 0;
        foreach (var element in elements)
        {
            Rise(element, Enabled ? firstDelayMs + Math.Min(index * stepMs, 360) : 0, ms, distance);
            index++;
        }
    }

    /// <summary>A panel that is not attached to anything (a dialog): grows from a little smaller while it fades in. Modals grow from their centre.</summary>
    public static void Pop(UIElement element, Point origin, double ms = 220, double from = 0.96, bool fade = true)
    {
        if (!Enabled) { if (fade) Animate(element, UIElement.OpacityProperty, 0, 1, 120, 0); return; }
        var scale = Scale(element, origin);
        if (fade) Animate(element, UIElement.OpacityProperty, 0, 1, ms, 0);
        Animate(scale, ScaleTransform.ScaleXProperty, from, 1, ms, 0);
        Animate(scale, ScaleTransform.ScaleYProperty, from, 1, ms, 0);
    }

    /// <summary>Goes away: a quick fade (leaving is faster than arriving, the player has already moved on), then <paramref name="done"/>.</summary>
    public static void Leave(UIElement element, Action done, double ms = 140, double distance = 0)
    {
        Animate(element, UIElement.OpacityProperty, 1, 0, Enabled ? ms : 80, 0, Out, () => { element.Opacity = 1; done(); });
        if (Enabled && distance != 0) Animate(Shift(element), TranslateTransform.YProperty, 0, distance, ms, 0, Out, () => Shift(element).Y = 0);
    }

    /// <summary>
    /// The tear: the same 260 ms glitch the Publisher plays when something changes (a few sideways jumps and a flicker, in steps, not
    /// smooth). Used sparingly, on a title, to say "this is a different thing now".
    /// </summary>
    public static void Tear(UIElement element)
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
        element.BeginAnimation(UIElement.OpacityProperty, alpha);
    }

    /// <summary>Slides a number (a progress fill or bar) to its new value instead of jumping there. Continues from where it is.</summary>
    public static void Follow(DependencyObject target, DependencyProperty property, double to, double ms = 260)
    {
        var animatable = (IAnimatable)target;
        if (!Enabled || ms <= 0) { animatable.ApplyAnimationClock(property, null); target.SetValue(property, to); return; }
        var animation = new DoubleAnimation { To = to, Duration = Ms(ms), EasingFunction = Out };
        animatable.ApplyAnimationClock(property, animation.CreateClock(), HandoffBehavior.SnapshotAndReplace);
    }

    /// <summary>Puts a number at a value at once, letting go of any animation that was moving it.</summary>
    public static void Snap(DependencyObject target, DependencyProperty property, double value)
    {
        ((IAnimatable)target).ApplyAnimationClock(property, null);
        target.SetValue(property, value);
    }

    /// <summary>Takes a brush to another colour over 180 ms (a selected card turning paper-white). The brush must be one of the element's own, not a shared resource.</summary>
    public static void Tint(SolidColorBrush brush, Color to, double ms = 180)
    {
        if (brush.IsFrozen) return;
        if (!Enabled || ms <= 0) { brush.BeginAnimation(SolidColorBrush.ColorProperty, null); brush.Color = to; return; }
        brush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation { To = to, Duration = Ms(ms), EasingFunction = Out });
    }

    /// <summary>Runs <paramref name="action"/> once the element has been laid out (it may not have a size yet when it is first shown).</summary>
    public static void WhenLoaded(FrameworkElement element, Action action)
    {
        if (element.IsLoaded) { action(); return; }
        RoutedEventHandler? handler = null;
        handler = (_, _) => { element.Loaded -= handler; action(); };
        element.Loaded += handler;
    }

    /// <summary>The direct children of a panel, as elements (for Reveal).</summary>
    public static IEnumerable<UIElement> ChildrenOf(Panel panel) => panel.Children.Cast<UIElement>().ToList();
}
