using System.Diagnostics;
using Avalonia;
using Avalonia.Media;
using Avalonia.Threading;

namespace EmpiLauncher.Linux.Views;

// WPF's animation vocabulary on top of one small tween engine, so the effects written for it (the seal and the glass of Jugar, the style's own
// states) read the same here: BeginAnimation(property, animation), DoubleAnimation, key frames, FillBehavior, BeginTime.

internal enum FillBehavior { HoldEnd, Stop }

internal enum EasingMode { EaseIn, EaseOut, EaseInOut }

internal interface IEasingFunction { double Ease(double t); }

internal sealed class PowerEase : IEasingFunction
{
    public double Power { get; set; } = 2;
    public EasingMode EasingMode { get; set; } = EasingMode.EaseIn;
    public double Ease(double t)
    {
        t = Math.Clamp(t, 0, 1);
        return EasingMode switch
        {
            EasingMode.EaseIn => Math.Pow(t, Power),
            EasingMode.EaseOut => 1 - Math.Pow(1 - t, Power),
            _ => t < 0.5 ? Math.Pow(2 * t, Power) / 2 : 1 - Math.Pow(2 * (1 - t), Power) / 2
        };
    }
}

/// <summary>A CSS-style cubic Bezier curve (the two curves the interface moves on).</summary>
internal sealed class BezierEase(double x1, double y1, double x2, double y2) : IEasingFunction
{
    public double Ease(double t)
    {
        t = Math.Clamp(t, 0, 1);
        if (t is 0 or 1) return t;
        // solve x(s) = t for the curve parameter s (Newton, with bisection as the safety net), then read y(s)
        double Cx(double s) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
        double Cy(double s) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
        double lo = 0, hi = 1, s0 = t;
        for (var i = 0; i < 24; i++)
        {
            var x = Cx(s0);
            if (Math.Abs(x - t) < 1e-5) break;
            if (x < t) lo = s0; else hi = s0;
            s0 = (lo + hi) / 2;
        }
        return Cy(s0);
    }
}

internal sealed class KeySpline(double x1, double y1, double x2, double y2) : IEasingFunction
{
    private readonly BezierEase _ease = new(x1, y1, x2, y2);
    public double Ease(double t) => _ease.Ease(t);
}

internal readonly record struct Duration(TimeSpan TimeSpan)
{
    public static implicit operator Duration(TimeSpan t) => new(t);
}

internal readonly record struct KeyTime(TimeSpan Time)
{
    public static KeyTime FromTimeSpan(TimeSpan t) => new(t);
}

internal abstract class Animation
{
    public TimeSpan? BeginTime { get; set; }
    public FillBehavior FillBehavior { get; set; } = FillBehavior.HoldEnd;
    public IEasingFunction? EasingFunction { get; set; }
    public bool AutoReverse { get; set; }
    public Action? Completed { get; set; }
    /// <summary>How long it runs, delay not included.</summary>
    public abstract double TotalMs { get; }
    /// <summary>The value at <paramref name="ms"/> (0..TotalMs); <paramref name="start"/> is what the property held when it began.</summary>
    public abstract object Value(double ms, object start);
}

internal sealed class DoubleAnimation : Animation
{
    public double? From { get; set; }
    public double? To { get; set; }
    public Duration Duration { get; set; }
    public DoubleAnimation() { }
    public DoubleAnimation(double to, Duration duration) { To = to; Duration = duration; }
    public DoubleAnimation(double from, double to, Duration duration) { From = from; To = to; Duration = duration; }
    public override double TotalMs => Duration.TimeSpan.TotalMilliseconds * (AutoReverse ? 2 : 1);

    public override object Value(double ms, object start)
    {
        var begin = From ?? (start is double d ? d : 0);
        var end = To ?? (start is double e ? e : begin);
        var one = Math.Max(1e-6, Duration.TimeSpan.TotalMilliseconds);
        var p = ms / one;
        if (AutoReverse && p > 1) p = 2 - p;
        p = Math.Clamp(p, 0, 1);
        if (EasingFunction != null) p = EasingFunction.Ease(p);
        return begin + (end - begin) * p;
    }
}

internal sealed class ColorAnimation : Animation
{
    public Color? From { get; set; }
    public Color? To { get; set; }
    public Duration Duration { get; set; }
    public ColorAnimation() { }
    public ColorAnimation(Color to, Duration duration) { To = to; Duration = duration; }
    public ColorAnimation(Color from, Color to, Duration duration) { From = from; To = to; Duration = duration; }
    public override double TotalMs => Duration.TimeSpan.TotalMilliseconds;

    public override object Value(double ms, object start)
    {
        var begin = From ?? (start is Color c ? c : Colors.Transparent);
        var end = To ?? begin;
        var p = Math.Clamp(ms / Math.Max(1e-6, Duration.TimeSpan.TotalMilliseconds), 0, 1);
        if (EasingFunction != null) p = EasingFunction.Ease(p);
        byte L(byte a, byte b) => (byte)Math.Round(a + (b - a) * p);
        return Color.FromArgb(L(begin.A, end.A), L(begin.R, end.R), L(begin.G, end.G), L(begin.B, end.B));
    }
}

internal abstract class DoubleKeyFrame
{
    public KeyTime KeyTime { get; }
    public double Value { get; }
    protected DoubleKeyFrame(double value, KeyTime time) { Value = value; KeyTime = time; }
    public abstract double At(double from, double fromMs, double ms);
}

internal sealed class DiscreteDoubleKeyFrame(double value, KeyTime time) : DoubleKeyFrame(value, time)
{
    public override double At(double from, double fromMs, double ms) => ms >= KeyTime.Time.TotalMilliseconds ? Value : from;
}

internal sealed class LinearDoubleKeyFrame(double value, KeyTime time) : DoubleKeyFrame(value, time)
{
    public override double At(double from, double fromMs, double ms)
    {
        var span = Math.Max(1e-6, KeyTime.Time.TotalMilliseconds - fromMs);
        return from + (Value - from) * Math.Clamp((ms - fromMs) / span, 0, 1);
    }
}

internal sealed class EasingDoubleKeyFrame : DoubleKeyFrame
{
    private readonly IEasingFunction? _ease;
    public EasingDoubleKeyFrame(double value, KeyTime time, IEasingFunction? ease = null) : base(value, time) { _ease = ease; }
    public override double At(double from, double fromMs, double ms)
    {
        var span = Math.Max(1e-6, KeyTime.Time.TotalMilliseconds - fromMs);
        var p = Math.Clamp((ms - fromMs) / span, 0, 1);
        if (_ease != null) p = _ease.Ease(p);
        return from + (Value - from) * p;
    }
}

internal sealed class SplineDoubleKeyFrame : DoubleKeyFrame
{
    private readonly KeySpline _spline;
    public SplineDoubleKeyFrame(double value, KeyTime time, KeySpline spline) : base(value, time) { _spline = spline; }
    public override double At(double from, double fromMs, double ms)
    {
        var span = Math.Max(1e-6, KeyTime.Time.TotalMilliseconds - fromMs);
        return from + (Value - from) * _spline.Ease(Math.Clamp((ms - fromMs) / span, 0, 1));
    }
}

internal sealed class DoubleAnimationUsingKeyFrames : Animation
{
    public List<DoubleKeyFrame> KeyFrames { get; init; } = [];
    public override double TotalMs => KeyFrames.Count == 0 ? 0 : KeyFrames.Max(k => k.KeyTime.Time.TotalMilliseconds);

    public override object Value(double ms, object start)
    {
        var frames = KeyFrames.OrderBy(k => k.KeyTime.Time).ToList();
        var value = start is double d ? d : 0;
        var at = 0.0;
        foreach (var frame in frames)
        {
            var time = frame.KeyTime.Time.TotalMilliseconds;
            if (ms < time) return frame.At(value, at, ms);
            value = frame.At(value, at, time);
            at = time;
        }
        return value;
    }
}

/// <summary>The one clock every animation runs on: a 16 ms timer that only exists while something is moving.</summary>
internal static class Tweens
{
    private sealed class Running
    {
        public required AvaloniaObject Target; public required AvaloniaProperty Property; public required Animation Animation;
        public object? Base; public object? Start; public double BeganAt; public bool Captured;
    }

    private static readonly List<Running> Active = [];
    private static readonly Stopwatch Clock = Stopwatch.StartNew();
    private static readonly DispatcherTimer Timer = new(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(16) };
    private static bool _wired;

    public static void Begin(AvaloniaObject target, AvaloniaProperty property, Animation? animation)
    {
        // A flicker (an animation that gives the value back when it ends) starting over one that was bringing something in (fade in, rise) must
        // give back the value that one was heading to, not the one it started from: WPF keeps that value as the property's own; here it is put in first.
        if (animation is { FillBehavior: FillBehavior.Stop })
            foreach (var old in Active.Where(r => ReferenceEquals(r.Target, target) && r.Property == property && r.Animation.FillBehavior == FillBehavior.HoldEnd).ToList())
            {
                try { target.SetValue(property, old.Animation.Value(old.Animation.TotalMs, old.Captured ? old.Start! : target.GetValue(property))); } catch (Exception) { /* a value of another kind: leave it */ }
            }
        Active.RemoveAll(r => ReferenceEquals(r.Target, target) && r.Property == property);
        if (animation == null) return;
        var run = new Running { Target = target, Property = property, Animation = animation, BeganAt = Clock.Elapsed.TotalMilliseconds + (animation.BeginTime?.TotalMilliseconds ?? 0) };
        Active.Add(run);
        if (!_wired) { _wired = true; Timer.Tick += (_, _) => Step(); }
        if (!Timer.IsEnabled) Timer.Start();
        if (animation.BeginTime is null or { TotalMilliseconds: <= 0 }) Apply(run, Clock.Elapsed.TotalMilliseconds);
    }

    private static void Step()
    {
        var now = Clock.Elapsed.TotalMilliseconds;
        foreach (var run in Active.ToList()) Apply(run, now);
        if (Active.Count == 0) Timer.Stop();
    }

    private static void Apply(Running run, double now)
    {
        var ms = now - run.BeganAt;
        if (ms < 0) return;
        if (!run.Captured) { run.Captured = true; run.Start = run.Target.GetValue(run.Property); run.Base = run.Start; }
        var total = run.Animation.TotalMs;
        var done = ms >= total;
        try
        {
            if (!done || run.Animation.FillBehavior == FillBehavior.HoldEnd) run.Target.SetValue(run.Property, run.Animation.Value(Math.Min(ms, total), run.Start!));
            else run.Target.SetValue(run.Property, run.Base);
        }
        catch (Exception) { done = true; }
        if (!done) return;
        Active.Remove(run);
        run.Animation.Completed?.Invoke();
    }
}

internal static class AnimationExt
{
    /// <summary>WPF's BeginAnimation(property, animation): null stops whatever was moving the property (it keeps the value it has).</summary>
    public static void BeginAnimation(this AvaloniaObject target, AvaloniaProperty property, Animation? animation) => Tweens.Begin(target, property, animation);
}
